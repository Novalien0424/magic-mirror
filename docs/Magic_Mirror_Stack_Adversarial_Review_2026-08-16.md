# Magic Mirror — Adversarial Review of Plan & Tech Stack

**Date:** 2026-08-16
**Reviewed against:** PRD v0.3, Tech Spec v0.3, Implementation Plan v0.3
**Status:** All A/B/C/D amendments applied to the three docs as v0.3.1 (2026-08-16). The latency mitigation in D (pre-minting the ephemeral key at wake detection) is deliberately NOT in the docs — it activates only if Phase 1 measurement misses NFR-02.
**Evidence base:** five primary-source research passes run 2026-08-16 against
current npm/PyPI registries, official OpenAI/Electron/Live2D/sherpa-onnx/OpenCV
docs, and shipped package type definitions. Findings below cite what was
verified; anything not re-verifiable at phase start goes through the contract
tests the spec already mandates.

## Verdict

**The architecture survives adversarial review. No stack component needs
replacing.** Every load-bearing assumption checked out: `gpt-realtime-2.1`
exists and is the SDK default; `gpt-live-transcribe` and `gpt-5.6-terra`
exist; `updateAgent()` works the way §7.4 needs; the privacy env vars exist
under exactly the names the spec lists; `node:sqlite` runs in current
Electron; Live2D licensing costs this prototype nothing; sherpa-onnx has
prebuilt darwin-arm64 Node bindings.

However, the review found **two places where the spec promises something the
chosen component cannot deliver, one silent hardware-specific landmine on the
exact target machine, and a set of implementation traps** that would each have
cost a debugging day or a failed field acceptance. Details below, ordered by
severity.

---

## A. Spec-vs-reality mismatches (spec text should change)

### A1. "Wake confidence" telemetry does not exist in sherpa-onnx — HIGH

PRD §11.1 persists "Wake confidence" and the Console Wake card (Spec §6.2,
Impl Plan Phase 2) displays per-detection confidence. **The sherpa-onnx
`KeywordSpotter` result surfaces no score** — `KeywordResult` JSON contains
only `keyword`, `timestamps[]`, `tokens[]`, `start_time`. The internal
trigger probability (mean per-token probability vs threshold) is not exposed
without patching C++.

**Change:** telemetry logs `{keyword, configured_threshold, boost,
num_trailing_blanks}` per detection instead of a per-event score. Threshold
tuning happens offline via the recorded-WAV corpus runner (binary-searching
per-keyword `#threshold`), which the Console already plans. Do not build UI
that implies a live confidence number.

### A2. Embedding records must version the (detector, recognizer) PAIR — MED

Spec §10.3 versions embeddings by recognition model ID. But `alignCrop` warps
from YuNet's 5 landmarks, so **changing the detector shifts crops and
perturbs embeddings even with an identical SFace model**. opencv_zoo now
ships two YuNet generations (`2023mar` fixed-shape for OpenCV 4.x,
`2026may` dynamic-shape for 5.x), so this is a live risk, not theoretical.

**Change:** embedding metadata records detector file + recognizer file +
both SHA-256s as one versioned pair; gallery invalidates on any mismatch.
Also note: SFace `2021dec` is still the *only* recognition model in
opencv_zoo (int8 variants are not embedding-compatible with fp32), so
US-ID-002's rebuild feature will in practice first be exercised by
detector/precision changes or a non-zoo provider — still worth building,
but P5-D7 test fixtures should model it that way.

---

## B. Landmines confirmed on the target hardware/stack

### B1. sherpa-onnx 1.13.4 KWS is silently broken on M4 — CRITICAL PIN

On SME-capable Apple Silicon — **which the Mac mini M4 is** — sherpa-onnx
1.13.4's KeywordSpotter **detects nothing, ever, with no error or log**
(k2-fsa/sherpa-onnx#3791: bundled onnxruntime 1.27.0 KleidiAI miscomputes
the zipformer frontend conv). Fixed in 1.13.5 (ORT 1.27.1), which also fixed
macOS release codesigning. Had this not been caught, Phase 2 would have
looked like "our wake model is bad" indefinitely.

**Action:** pin `sherpa-onnx-node >= 1.13.5` in the Phase 2 lockfile and add
a Phase 2 smoke assertion (known WAV → must detect) so any future version
bump re-proves the path.

### B2. macOS TCC silently denies mic/camera to spawned workers — HIGH

Both the wake worker and the Python face worker inherit permissions from the
**responsible ancestor app**, not their own binaries. If the packaged app's
Info.plist lacks `NSMicrophoneUsageDescription` /
`NSCameraUsageDescription`, macOS denies access **silently, with no dialog**
— indistinguishable from dead hardware (opencv-python additionally masks it
as `camera failed to properly initialize!`, issue #291, still open). In dev,
grants attach to Terminal/IDE, not Python/Node.

**Action:** Info.plist usage strings + `com.apple.security.device.*`
entitlements with hardened runtime are a Phase 0 packaging deliverable, not
a Phase 7 afterthought; the Console Audio/Camera cards should display TCC
authorization status explicitly so "permission" and "broken device" are
distinguishable at the venue. Never `fork()` without `exec()` (AVFoundation
Mach ports).

---

## C. Implementation traps to encode in contract tests (design already compatible)

1. **`RealtimeSession.close()` does not stop caller-supplied mic tracks.**
   The §8.1 mic handoff must explicitly `track.stop()` before the wake
   worker re-acquires, or the device stays busy. Add to the Phase 1/2
   contract tests.
2. **`audio_stopped` means generation-done, not speaker-done.** The real
   playback-completion signal on WebRTC is the raw `output_audio_buffer.stopped`
   transport event. The 300 s idle timer, Speaking→Listening transition, and
   safe rollover (§8.3) must key off that (spec's analyser fallback remains
   as backstop).
3. **No `reconnect()` exists.** §7.5 rollover = mint new `ek_` → new
   `RealtimeSession` on the same caller-owned MediaStream → rebuild context
   (`updateHistory` snapshot only for same-owner rollover; never across
   profile switch). Session cap confirmed at **60 minutes**.
4. **SDK defaults are hidden fallbacks.** Transcription defaults to
   `gpt-4o-mini-transcribe` and turn detection to `semantic_vad` unless set;
   `connect()` silently ignores a `config` argument (constructor-only). The
   P0 "no hidden model fallback" scan must extend to asserting the
   configured values actually reached the live session (P1-D5 covers this —
   keep it strict).
5. **Chromium analyser quirk vs §8.2's single playback path.** Web Audio
   `MediaStreamSource` goes silent in Chromium unless the stream is also
   attached to an `<audio>` element. Resolution consistent with the spec:
   the SDK's audio element IS the single playback path; the analyser taps
   the same stream; never route audible output through both.
6. **Realtime function tools execute in the renderer.** Confirms invariant
   #3's design: tools return enums (`yes/no/unclear`), Main resolves IDs;
   also Realtime rejects tool `outputSchema` — structured extraction stays
   on the Responses extractor, exactly as §11.4 planned.
7. **Live2D MotionSync Core is a proprietary non-npm binary** expecting a
   sibling-directory SDK layout — vendoring friction. Phase 3 exit should
   baseline on the RMS → `ParamMouthOpenY` path (sanctioned by Live2D docs,
   ~20 lines) with MotionSync as a layered enhancement, matching §9.1's
   "volume + available MotionSync info" wording. Physics evaluates at real
   FPS (Editor preview ≠ runtime); motion priority is advisory — the
   lifecycle code, not the motion manager, gates which motions start.
8. **opencv_zoo model downloads via `raw.githubusercontent.com` are Git-LFS
   pointers** (~131 bytes) that fail at `create()` with an opaque ONNX
   error. Fetch via `media.githubusercontent.com` or `git lfs pull`, and
   pin `opencv-python` explicitly — a bare install now brings OpenCV 5.0.

## D. Baseline recommendations (config/pin decisions, no architecture change)

| Area | Recommendation | Why |
|---|---|---|
| Electron | Pin `electron@43.x` now; schedule the 44 bump (ships 2026-08-25; 41 EOLs same day) | Support window + macOS-26 GPU fix included |
| SQLite | `node:sqlite` (works in Electron main since 36; zero native deps) over better-sqlite3; WAL via pragma; online `backup()` API for the Console button | Removes rebuild/notarization surface |
| Restart ownership | LaunchAgent `KeepAlive={SuccessfulExit=false}` owns app restarts; Main only recreates windows on `render-process-gone`; never `app.relaunch()` | The two mechanisms fight if combined |
| Secrets | `safeStorage` (Keychain on target, DPAPI on Windows dev); keytar is archived — banned | Spec §13.4 compliant, cross-dev-platform |
| Extractor model | Draft baseline `gpt-5.6-luna` ($0.20/$1.20 per 1M, Structured Outputs, `reasoning.effort:'none'`), keep `gpt-5.6-terra` as A/B candidate | ~10× cheaper than the PRD's terra baseline for a small-schema job; pure config change, PRD §9.5 already makes it swappable |
| Wake stack | `sherpa-onnx-node@≥1.13.5` + wenetspeech-3.3M int8 + `decibri` capture (`node-record-lpcm16` is dead); always `reset(stream)` after detection (official Node example omits it) | Verified maintained path on darwin-arm64 |
| Realtime latency | Measure NFR-02 (wake→Listening ≤1.5 s P95) honestly in Phase 1: it contains the `client_secrets` POST + WebRTC handshake. If it misses, mint the ephemeral key at wake-detection in parallel with the waking animation — still never during Dormant | Keeps the fix bounded and inside the wake path |

## E. What the review deliberately did not challenge

Hardware purchasing (PRD §16), persona/asset inputs (§15), and the
no-platform scope cuts (§5.2, Spec §19) — the last were *reinforced* by
research: nothing found suggests the thin MemoryService, exact spell
matcher, or modular monolith are under-built for a single venue.
