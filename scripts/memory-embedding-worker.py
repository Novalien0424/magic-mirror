#!/usr/bin/env python3
"""Private Main-owned Qwen3 IPC worker. No downloads, network service, or diagnostics payloads."""
import os
import sys

# Keep a private protocol descriptor, then silence Python AND native-library output.
# The parent also discards stderr. Only emit() may write to the original stdout.
_protocol = os.fdopen(os.dup(1), "w", encoding="utf-8", buffering=1)
_null = os.open(os.devnull, os.O_WRONLY)
os.dup2(_null, 1)
os.dup2(_null, 2)
os.close(_null)
sys.stdout = open(os.devnull, "w")
sys.stderr = open(os.devnull, "w")

import argparse
import hashlib
import importlib.metadata
import json
import math
import pathlib
import platform
import re
import threading

MAX_FRAME_BYTES = 65_536
_output_lock = threading.Lock()


def emit(message):
    # These objects are built here, never forwarded from a model/library exception.
    encoded = json.dumps(message, separators=(",", ":"), allow_nan=False)
    if len(encoded.encode("utf-8")) > MAX_FRAME_BYTES:
        os._exit(1)
    try:
        with _output_lock:
            _protocol.write(encoded + "\n")
            _protocol.flush()
    except (BrokenPipeError, OSError):
        os._exit(0)


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate_field")
        result[key] = value
    return result


def read_json(path, limit=262_144):
    with path.open("rb") as source:
        data = source.read(limit + 1)
    if len(data) > limit:
        raise ValueError("oversize_config")
    return json.loads(data, object_pairs_hook=unique_object)


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


class StartupFailure(Exception):
    def __init__(self, reason):
        self.reason = reason


def load_runtime(args):
    if sys.platform != "darwin" or platform.machine() != "arm64":
        raise StartupFailure("runtime_unsupported")
    root = pathlib.Path(args.runtime_directory).resolve()
    manifest_path = pathlib.Path(args.manifest).resolve()
    try:
        manifest = read_json(manifest_path)
        identity = manifest["identity"]
        fingerprint = hashlib.sha256(json.dumps(identity, ensure_ascii=False, separators=(",", ":")).encode("utf-8")).hexdigest()
        version = "memory-embedding.v1:" + fingerprint
        receipt = read_json(root / "runtime.json")
        if (manifest["schemaVersion"] != 1 or version != args.version or receipt["version"] != version
                or receipt["workerSha256"] != sha256(pathlib.Path(__file__).resolve())
                or receipt["manifestSha256"] != sha256(manifest_path)
                or identity["runtime"]["platform"] != "darwin-arm64"
                or identity["model"]["repository"] != "Qwen/Qwen3-Embedding-0.6B"
                or identity["dimensions"] != 1024 or identity["precision"] != "bfloat16"
                or identity["quantization"] != "none" or identity["pooling"] != "last-non-padding-token"
                or identity["normalization"] != "l2-float32"
                or platform.python_version() != identity["runtime"]["python"]["version"]):
            raise ValueError("runtime_identity")
        for package in identity["runtime"]["packages"]:
            if importlib.metadata.version(package["name"]) != package["version"]:
                raise ValueError("package_version")
    except Exception:
        raise StartupFailure("runtime_invalid") from None
    model_path = root / "model"
    try:
        for asset in identity["model"]["files"]:
            if not re.fullmatch(r"[a-z_]+\.(json|safetensors)", asset["name"]):
                raise ValueError("model_path")
            path = model_path / asset["name"]
            if path.stat().st_size != asset["size"] or sha256(path) != asset["sha256"]:
                raise ValueError("model_hash")
        config = read_json(model_path / "config.json")
        tokenizer_config = read_json(model_path / "tokenizer_config.json")
        if config["hidden_size"] != identity["dimensions"] or tokenizer_config["add_bos_token"]:
            raise ValueError("model_config")
    except Exception:
        raise StartupFailure("model_invalid") from None

    # The publisher safetensors contain unprefixed backbone keys. Load directly
    # into official MLX-LM Qwen3Model, enforcing every key/shape without an LM
    # output head. One unpadded sequence needs no padding mask; attention is causal.
    import mlx.core as mx
    from mlx_lm.models.qwen3 import Qwen3Model, ModelArgs
    from tokenizers import Tokenizer

    model = Qwen3Model(ModelArgs.from_dict(config))
    model.load_weights(list(mx.load(str(model_path / "model.safetensors")).items()), strict=True)
    model.eval()
    mx.eval(model.parameters())
    tokenizer = Tokenizer.from_file(str(model_path / "tokenizer.json"))
    # Bound allocator caching and prime kernels using a public special token.
    mx.set_cache_limit(64 * 1024 * 1024)
    token = tokenizer.token_to_id("<|endoftext|>")
    if token is None:
        raise StartupFailure("model_invalid")
    mx.eval(model(mx.array([[token]], dtype=mx.int32))[:, -1, :])
    return identity, version, model, tokenizer, mx


def main():
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--runtime-directory", required=True)
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--version", required=True)
    args = parser.parse_args()
    try:
        identity, version, model, tokenizer, mx = load_runtime(args)
    except StartupFailure as error:
        emit({"type": "fatal", "reason": error.reason})
        return 1
    except Exception:
        emit({"type": "fatal", "reason": "startup_failed"})
        return 1

    lock = threading.Lock()
    active = None
    last_completed = None
    last_sequence = 0

    def compute(request, cancelled):
        nonlocal active, last_completed
        request_id = request["id"]
        try:
            if cancelled.is_set():
                response = {"type": "cancelled", "id": request_id}
            else:
                prefix = identity["queryPrefix"] if request["purpose"] == "query" else identity["documentPrefix"]
                # The pinned publisher tokenizer appends EOS through its template.
                tokens = tokenizer.encode(prefix + request["text"], add_special_tokens=True).ids
                request["text"] = ""
                if not tokens or len(tokens) > identity["maxTokens"]:
                    response = {"type": "error", "id": request_id, "reason": "input_too_long"}
                else:
                    # Pool only the final real token, then normalize in float32.
                    vector = model(mx.array([tokens], dtype=mx.int32))[:, -1, :].astype(mx.float32)
                    vector = vector / mx.sqrt(mx.sum(vector * vector, axis=-1, keepdims=True))
                    mx.eval(vector)
                    values = vector[0].tolist()
                    if (len(values) != identity["dimensions"] or not all(math.isfinite(v) for v in values)
                            or not math.isclose(math.hypot(*values), 1.0, abs_tol=1e-5)):
                        raise ValueError("invalid_vector")
                    response = {"type": "embedding", "id": request_id, "values": values}
        except Exception:
            response = {"type": "error", "id": request_id, "reason": "inference_failed"}
        finally:
            request["text"] = ""
        with lock:
            if cancelled.is_set():
                response = {"type": "cancelled", "id": request_id}
            active = None
            last_completed = request_id
            emit(response)

    emit({"type": "ready", "version": version, "dimensions": identity["dimensions"]})
    while True:
        line = sys.stdin.buffer.readline(MAX_FRAME_BYTES + 2)
        if not line:
            return 0
        if len(line) > MAX_FRAME_BYTES + 1 or not line.endswith(b"\n"):
            return 1
        try:
            request = json.loads(line.decode("utf-8"), object_pairs_hook=unique_object,
                                 parse_constant=lambda _: (_ for _ in ()).throw(ValueError("non_finite")))
            if not isinstance(request, dict) or not isinstance(request.get("id"), str):
                return 1
            request_id = request["id"]
            if not re.fullmatch(r"[1-9][0-9]{0,31}", request_id):
                return 1
            with lock:
                if request.get("type") == "cancel" and set(request) == {"type", "id"}:
                    if active is not None and active[0] == request_id:
                        active[1].set()
                    elif last_completed != request_id:
                        return 1
                    # A cancel can cross a completed reply. Main already reports
                    # cancellation and drains that reply; no unsolicited ack.
                    continue
                if (request.get("type") != "embed" or set(request) != {"type", "id", "purpose", "text"}
                        or active is not None or int(request_id) <= last_sequence):
                    return 1
                last_sequence = int(request_id)
                text = request["text"]
                if (request["purpose"] not in ("query", "document") or not isinstance(text, str) or not text.strip()
                        or len(text.encode("utf-8")) > identity["maxTextBytes"]
                        or any(ord(c) < 32 and c not in "\n\r\t" or ord(c) == 127 for c in text)):
                    emit({"type": "error", "id": request_id, "reason": "invalid_input"})
                    last_completed = request_id
                    text = ""
                    request = None
                    line = b""
                    continue
                cancelled = threading.Event()
                active = (request_id, cancelled)
                threading.Thread(target=compute, args=(request, cancelled), daemon=True).start()
                # Only the compute thread retains the current input, in RAM.
                text = ""
                request = None
                line = b""
        except Exception:
            return 1


if __name__ == "__main__":
    try:
        status = main()
    except Exception:
        status = 1
    # An orphaned parent/closed stdin must stop even an executing GPU job.
    os._exit(status)
