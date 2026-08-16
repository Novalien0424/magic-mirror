# CLAUDE.md — 魔鏡 (Magic Mirror) AI Avatar

## Project Goal

A single-venue prototype running on one Mac mini M4: a fixed-persona "magic
mirror" that converses naturally in Traditional Chinese (OpenAI Realtime,
speech-to-speech, barge-in), shows a semi-realistic Live2D avatar with
audio-driven lip sync, recognizes returning guests (face proposes a candidate,
verbal confirmation authorizes), remembers per-guest facts in SQLite, and
triggers Lighting/Fog/Music scenes only on exact spoken spells. Built as one
Electron modular monolith across Phases 0–7. It is a long-lived, easily
modifiable prototype — never a platform.

## Harness Rule: Orchestrator / Worker Split

**This main session is the ORCHESTRATOR and REVIEWER only. Research,
implementation, and test work are dispatched to Opus subagents via the Agent
tool with `model: "opus"`.**

- **Research** → dispatch Opus (`general-purpose`) with a scoped question;
  require primary-source URLs and verified-vs-unverified marking.
- **Implementation** → dispatch Opus with exactly one work unit (format below);
  the prompt must name the Phase, PRD story ID, files expected to change, and
  the invariants that apply.
- **Tests** → dispatch Opus to write and run tests; it must return command
  output as evidence, not claims.
- **Orchestrator owns:** reading docs/state, slicing work into units, writing
  dispatch prompts, reviewing every returned diff against the PRD story and
  `mm-invariants`, running the verification gate, updating `PROGRESS.md` /
  `DECISIONS.md`, and phase go/no-go decisions.
- Parallelize only independent units; dependent units run sequentially.
  One Phase in flight at a time (WIP=1 at phase level).
- Review is not a rubber stamp: read the diff, check invariants, check that a
  failure-path test exists, reject and re-dispatch with specific feedback when
  it falls short.

## Source of Truth (read in this order)

- `docs/Magic_Mirror_PRD_v0.3.md` — product decisions, 17 Must user stories, NFRs.
- `docs/Magic_Mirror_Tech_Spec_v0.3.md` — architecture, 7-state lifecycle,
  module contracts, the 11 fixed architecture decisions (§18).
- `docs/Magic_Mirror_Implementation_Plan_v0.3.md` — Phase 0–7 scope, per-phase
  independent demos (P0-D1…P7-D7), exit criteria, traceability matrix.
- `docs/Magic_Mirror_Stack_Adversarial_Review_2026-08-16.md` — rationale for
  the applied v0.3.1 amendments, contract-test traps, and the one deferred
  latency mitigation; read before Phase 0/1/2/3/5/6 work.
- `PROGRESS.md` — current verified state, risks, next action (create at Phase 0;
  update every session that changes behavior).
- `DECISIONS.md` — new ADRs only; never re-litigate Tech Spec §18 decisions.

Docs are Traditional Chinese; code, identifiers, commits, and telemetry are
English. Guest-facing speech and personas are Traditional Chinese.

## Project Skills (invoke before working in the matching area)

| Skill | Use when |
|---|---|
| `mm-phase-workflow` | Slicing, dispatching, or executing any Phase work unit |
| `mm-invariants` | Always loaded into every implementation/test dispatch prompt |
| `mm-electron-foundation` | Electron main/renderer, lifecycle, SQLite, config, Keychain, workers (Phase 0) |
| `mm-realtime-voice` | OpenAI Agents SDK RealtimeSession, WebRTC, transcripts, memory-extractor models (Phases 1, 5, 6) |
| `mm-wake-word` | sherpa-onnx Chinese keyword spotting, mic handoff (Phase 2) |
| `mm-live2d-avatar` | Live2D rendering, lip sync, motions, Web Audio graph (Phase 3) |
| `mm-face-identity` | YuNet/SFace pipeline, enrollment, embedding rebuild (Phase 5) |

## Stack (fixed — do not re-litigate)

TypeScript + Electron + React, modular monolith. OpenAI Agents SDK
`RealtimeSession` over WebRTC (Realtime dialogue), Responses model with
Structured Outputs (memory extraction). SQLite is the only truth store.
sherpa-onnx wake worker; Python + OpenCV YuNet/SFace face worker; Live2D
avatar; typed Lighting/Fog/Music adapters each with a mock. All model IDs come
from versioned config (`active.json`/`draft.json`/`previous.json`) — never
source-code literals. Docs carry the mandatory floors (Electron 43.x,
sherpa-onnx ≥ 1.13.5, opencv-python + YuNet as a pinned pair, `node:sqlite`);
exact patch versions land in lockfiles at Phase start.

**Dev environment note:** development happens on this Windows workstation;
target runtime is macOS. Credentials use Electron `safeStorage` — Keychain on
macOS, DPAPI on Windows, one code path, no shim. Keep the genuinely
macOS-only integrations (LaunchAgent, TCC, AVFoundation, kiosk fullscreen)
behind platform guards/mocks so the app boots in dev mode on Windows; field
acceptance always runs on the Mac mini.

## Hard Invariants (violation = rejected review; numbering is canonical with
`mm-invariants` — always cite these numbers)

1. No transcript/audio persistence — final transcripts, extracted memory
   values, and private context never reach disk, logs, or telemetry.
2. Face proposes candidates; only verbal confirmation loads private memory.
3. Guest IDs are bound by Main; never accepted from model output, tools, or
   renderer IPC (public call names may cross to the model; identifiers not).
4. Profile switch = close old session → clean confirmation session →
   `updateAgent` in place.
5. Extraction jobs write only to `ownerProfileIdAtTurnStart`.
6. Control turns (confirm/name/switch/group/sleep/spell) never enter
   personal memory extraction.
7. Scenes trigger only on normalized exact full-transcript spell match, once
   per turn; LLM never emits hardware parameters.
8. One mic owner at a time (wake worker XOR renderer).
9. No silent failure: every fallback/drop/ignore produces a Console event
   with a reason.
10. Failures degrade, never gate: cloud failure → OfflineLoop; local core
    failure → Maintenance; never a black screen.
11. Model IDs come only from versioned config; configured model unavailable ≠
    substitute a fallback model.
12. Credentials live in the OS keystore via `safeStorage`, Main-only.

## Work Units (Implementation Plan §14)

Every implementation dispatch is one 0.5–2 day unit:

```text
Story / Phase:
User-visible outcome:
Files / modules expected to change:
Console control or telemetry to add:
Happy-path test:
Failure / fallback test:
Explicit non-goals:
Demo step affected:
```

Done requires: happy-path test + failure-path test passing with output shown,
a Console event or metric, and explicit confirmation that no transcript/audio
persistence was added.

## Verification Gate

- Static: type-check + lint clean.
- Tests: focused unit/integration tests for the changed module, run with
  output captured.
- Phase demos (P*-D*) are the acceptance evidence; record results in Console
  Phase Tests and `PROGRESS.md`.
- Exit criteria gate phase transitions only — they are not runtime gates.
- 100-cycle and 72-hour soak run in Phase 7 only, never per-commit.

## End of Session

Update `PROGRESS.md` (state, evidence, next action), record new ADRs in
`DECISIONS.md`, list unresolved defects and skipped checks, remove scratch
artifacts, and report dirty files (`git status --short --branch` once the repo
is initialized).
