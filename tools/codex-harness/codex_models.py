#!/usr/bin/env python3
"""Resolve local family aliases using the signed-in Codex catalog; no API keys."""
import json
import os
from pathlib import Path
import queue
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import tomllib

FAMILIES = ("astra", "sol", "terra")
ROOT = Path(__file__).resolve().parent


def codex_home():
    return Path(os.environ.get("CODEX_HOME", Path.home() / ".codex"))


def catalog(binary):
    """Read the public model metadata through the installed app-server protocol."""
    proc = subprocess.Popen(
        [binary, "app-server", "--stdio"], cwd=Path.home(),
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
        text=True,
    )
    messages = queue.Queue()

    def read():
        for line in proc.stdout:
            messages.put(line)
        messages.put(None)

    threading.Thread(target=read, daemon=True).start()

    def request(number, method, params):
        proc.stdin.write(json.dumps({"id": number, "method": method, "params": params}) + "\n")
        proc.stdin.flush()
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            try:
                line = messages.get(timeout=max(0.01, deadline - time.monotonic()))
            except queue.Empty:
                break
            if line is None:
                raise RuntimeError(f"app-server closed during {method}")
            reply = json.loads(line)
            if reply.get("id") != number:
                continue
            if "error" in reply:
                raise RuntimeError(f"{method} failed: RPC code {reply['error'].get('code')}")
            return reply["result"]
        raise RuntimeError(f"{method} timed out after 30 seconds")

    try:
        request(1, "initialize", {
            "clientInfo": {"name": "codex_family_aliases", "version": "1"},
            "capabilities": {"explicitGatewayOauth": True},
        })
        proc.stdin.write('{"method":"initialized"}\n')
        proc.stdin.flush()
        rows, cursor = [], None
        for number in range(2, 22):
            page = request(number, "model/list", {
                "includeHidden": False, "limit": 100, "cursor": cursor,
            })
            rows.extend(page["data"])
            cursor = page.get("nextCursor")
            if not cursor:
                return rows
        raise RuntimeError("model/list exceeded 20 pages")
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()
        proc.stdin.close()
        proc.stdout.close()


def resolve(rows):
    selected = {}
    for family in FAMILIES:
        candidates = []
        for row in rows:
            match = re.fullmatch(r"gpt-(\d+(?:\.\d+)*)-" + family, row.get("model", ""))
            if match and not row.get("hidden", False):
                candidates.append((tuple(map(int, match[1].split("."))), row))
        if not candidates:
            raise ValueError(f"No available stable {family} model; configuration unchanged")
        row = max(candidates, key=lambda item: item[0])[1]
        supported = {item["reasoningEffort"] for item in row["supportedReasoningEfforts"]}
        if "medium" not in supported:
            raise ValueError(f"{row['model']} does not support configured medium effort")
        if family == "terra" and "image" not in row.get("inputModalities", []):
            raise ValueError(f"{row['model']} does not advertise image input")
        selected[family] = row["model"]
    return selected


def set_values(content, section, values):
    """Edit only owned simple keys, preserving unrelated TOML and comments."""
    tomllib.loads(content)
    if content and not content.endswith("\n"):
        content += "\n"
    lines = content.splitlines(keepends=True)
    headers = [(i, line.split("#", 1)[0].strip()) for i, line in enumerate(lines)
               if line.lstrip().startswith("[")]
    if section:
        matches = [i for i, header in headers if header == f"[{section}]"]
        if not matches:
            content = content.rstrip() + f"\n\n[{section}]\n"
            return set_values(content, section, values)
        start = matches[0] + 1
    else:
        start = 0
    end = next((i for i, _ in headers if i >= start), len(lines))
    pending = dict(values)
    for i in range(start, end):
        for key in list(pending):
            if re.match(r"\s*" + re.escape(key) + r"\s*=", lines[i]):
                lines[i] = f"{key} = {json.dumps(pending.pop(key))}\n"
    lines[end:end] = [f"{key} = {json.dumps(value)}\n" for key, value in pending.items()]
    result = "".join(lines)
    tomllib.loads(result)
    return result


def atomic_write(path, content):
    if path.exists() and path.read_text() == content:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    mode = path.stat().st_mode & 0o777 if path.exists() else 0o600
    fd, temp = tempfile.mkstemp(dir=path.parent, prefix=".harness-")
    try:
        with os.fdopen(fd, "w") as stream:
            stream.write(content)
        os.chmod(temp, mode)
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def config_changes(home, models):
    changes = {}
    config = home / "config.toml"
    content = config.read_text() if config.exists() else ""
    content = set_values(content, "", {"model": models["astra"], "model_reasoning_effort": "medium"})
    content = set_values(content, "agents", {
        "default_subagent_model": models["sol"],
        "default_subagent_reasoning_effort": "medium",
    })
    changes[config] = content
    for family in FAMILIES:
        path = home / f"{family}.config.toml"
        content = path.read_text() if path.exists() else ""
        changes[path] = set_values(content, "", {
            "model": models[family], "model_reasoning_effort": "medium",
        })
    legacy = home / "nova-auto.config.toml"
    if legacy.exists():
        changes[legacy] = set_values(legacy.read_text(), "", {
            "model": models["astra"], "model_reasoning_effort": "medium",
        })
    for name, family in (("implementer", "sol"), ("computer_use", "terra")):
        template = (ROOT / "agents" / f"{name}.toml").read_text()
        changes[home / "agents" / f"{name}.toml"] = set_values(template, "", {
            "model": models[family], "model_reasoning_effort": "medium",
        })
    for text in changes.values():
        tomllib.loads(text)
    return changes


def refresh():
    binary = shutil.which("codex")
    if not binary:
        raise RuntimeError("codex is not on PATH")
    home = codex_home()
    home.mkdir(parents=True, exist_ok=True)
    # Serialize the hourly refresher and interactive aliases on macOS/Linux.
    import fcntl
    with (home / ".family-models.lock").open("w") as lock:
        deadline = time.monotonic() + 35
        while True:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                if time.monotonic() > deadline:
                    raise RuntimeError("Another model refresh has held the lock for 35 seconds")
                time.sleep(0.1)
        models = resolve(catalog(binary))
        changes = config_changes(home, models)
        for path, content in changes.items():
            atomic_write(path, content)
        atomic_write(home / "family-models.json", json.dumps({
            "checked_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "source": "codex app-server model/list",
            "models": models,
        }, indent=2) + "\n")
    return binary, models


def main():
    invoked = Path(sys.argv[0]).name
    family = invoked.removeprefix("codex-")
    if family not in FAMILIES and sys.argv[1:] != ["refresh"]:
        print("Usage: codex-models refresh | codex-{astra,sol,terra} [Codex arguments]", file=sys.stderr)
        return 2
    try:
        binary, models = refresh()
    except (OSError, ValueError, RuntimeError, KeyError) as error:
        print(f"Codex model refresh failed: {error}. No alias launch or model fallback.", file=sys.stderr)
        return 1
    if family not in FAMILIES:
        print(json.dumps(models, sort_keys=True))
        return 0
    args = sys.argv[1:]
    # An explicit model or profile remains the user's choice.
    explicit = any(arg in ("-m", "--model", "-p", "--profile") or
                   arg.startswith(("--model=", "--profile=")) for arg in args)
    defaults = [] if explicit else [
        "-c", f'model="{models[family]}"', "-c", 'model_reasoning_effort="medium"',
    ]
    print(f"{invoked}: catalog {models[family]} (explicit options take precedence)", file=sys.stderr)
    os.execv(binary, [binary, *defaults, *args])


if __name__ == "__main__":
    sys.exit(main())
