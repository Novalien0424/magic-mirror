---
name: mm-invariants
description: Use when implementing, reviewing, testing, or debugging any Magic Mirror behavior, especially transcript persistence, profile isolation, guest ID binding, silent failure, mic ownership, spell matching, or model fallback.
---

# Magic Mirror Hard Invariants

## Overview

These rules are distilled from the PRD/Tech Spec so a worker agent does not
need to re-read three documents mid-task. Violating any one of them fails
review, no matter how reasonable the shortcut looks under deadline. Doc
anchors are given so you can verify the source.

## Codex Worker Dispatch and Evidence Contract

Use the canonical dispatch envelope in `AGENTS.md`; do not duplicate its
model, effort, role, freshness, scope, or evidence fields here. Every
implementation, review, test, or debugging dispatch that touches Magic Mirror
behavior names the applicable invariant IDs in the prompt and reports those
IDs in metadata-only evidence. The default route is one bounded implementer,
focused RED/GREEN when behavior changes, one independent tester, and external
root acceptance. The root alone performs that external review; no review
worker or review role is created, and worker self-review remains capped at
three passes.

Diagnostics and worker evidence remain metadata-only: use IDs, enums, counts,
timings, statuses, reasons, hashes, paths, and exit codes. Never put raw
transcript text, audio, extracted memory values, private context, credentials,
images, embeddings, or prompts containing user content in evidence, logs,
telemetry, or reports. Workers read exact named paths quietly; repository-wide
discovery and source/skill body output are excluded unless a bounded evidence
request requires it. Testers place complete stdout/stderr and exit codes for
named validation commands in the final agent message.

## The Invariants

| # | Rule | Doc anchor |
|---|---|---|
| 1 | Final transcripts and conversation audio exist in RAM only. Never written to disk, DB, backups, telemetry, or debug logs - not even "temporarily for debugging". Same bar for extracted memory VALUE strings and injected private context: diagnostics carry keys, enums, IDs, and counts - never content (the fact itself lives only in `guest_memories`) | PRD Section 11.2, Spec Section 6.3 |
| 2 | Face recognition only proposes a candidate. Private memory loads only after explicit verbal confirmation | PRD US-ID-003, Spec Section 10 |
| 3 | `guestId`/`candidateProfileId` lives only in Electron Main. No tool schema, model output, or IPC payload from the renderer may carry or substitute a guest ID; guest-id-shaped fields in tool payloads are rejected and logged. Public call names ("Nova") MAY cross to the model - that's how it asks the question; identifiers may not. Pending candidate is cleared on denial, second ambiguous answer, owner switch, session close, or sleep. With multiple people the model never disambiguates candidates - the mirror asks who owns the conversation | Spec Section 10.1 |
| 4 | Profile scope change = close the session holding old-owner history -> clean Persona+Master-only confirmation session -> confirm -> `updateAgent` in that same clean session | Spec Section 7.4, Section 10.2 |
| 5 | Memory extraction jobs write only to `ownerProfileIdAtTurnStart`, snapshotted when the turn began - never re-read current owner at completion | PRD FR-MEM-03, Spec Section 11.1 |
| 6 | Control turns (identity confirm, name-giving, switch, group selection, sleep, spell) never enter personal memory extraction (`controlIntent !== 'none'` -> skip) | Spec Section 11.1 |
| 7 | Scenes trigger only on normalized exact full-transcript == spell. No substring, similarity, or LLM intent. One trigger per `turnId` - a scene that ran with partial adapter failure still consumed that turn's trigger. LLM never emits DMX/fog/hardware parameters - approved presets only | PRD US-SCENE-001, Spec Section 12 |
| 8 | Exactly one mic owner at a time: wake worker XOR renderer, with explicit release->acquire handshake. Handoff failure = local Maintenance, not cloud OfflineLoop | Spec Section 8.1 |
| 9 | No silent failure: every ignore/drop/fallback/degrade produces a visitor-visible state or a Console event with a `reason`. Event schema (metadata only): `{time, module, event, status, duration_ms?, error_code?, session_id?, scene_id?, reason?}`. Repeated identical errors may collapse into a counter on the same card - collapse, never discard. Catching an error is fine; swallowing it is not | Spec Section 6.3, Section 14.1 |
| 10 | Failures degrade, never gate: camera, extractor, or a single adapter failing must not block conversation or other adapters. Cloud failure -> OfflineLoop; local core failure -> Maintenance. A black screen is never acceptable | PRD Section 5.1, Spec Section 14 |
| 11 | Model IDs come only from versioned config (`active.json`). No source-code model literals, no silent fallback to a different model when the configured one fails - fail visibly instead. A single bounded retry of the SAME configured ID is a retry, not a fallback (allowed: max one per user action). All configured options exhausted -> OfflineLoop, not substitution | Impl Plan Section 5 Phase 0 Scope+Exit, Section 1 principle 3, Phase 1 Exit |
| 12 | API credentials live in the OS keystore via Electron `safeStorage` (Keychain on the target Mac; DPAPI on Windows dev machines - same API), read by Main only. Renderer gets short-lived Realtime credentials. Keys never appear in config, logs, telemetry, or exports | Spec Section 13.4 |

## Correct Moves for the Classic Shortcuts

Each of these was posed to an agent under demo-deadline pressure; these are the
resolutions that pass review:

- **"Log transcripts to debug extraction"** -> log content-free decision
  records instead: `{extractionId, guestIdAtTurnStart, guestIdAtWrite, model,
  decision, subject_key, confidence, latencyMs, errorCode}` + the RAM-only
  Console transcript panel (cleared on dormant/restart). Join bad DB rows back
  to decision records.
- **"Hardcode a fallback model so the demo survives"** -> validate the model ID
  at startup + Console "Test Connection"/Test Draft preflight. The ONLY
  sanctioned model changes are Publish of a tested Draft or Rollback Entire
  Config to Previous - one configured ID per role, no candidate lists, no
  auto-latest (Impl Plan Section 3.2). Runtime failure of the configured model ->
  OfflineLoop / visible degraded, never substitution (Phase 1 Exit).
- **"Let the model's tool return the guest ID"** -> tool returns only
  `{answer: 'yes'|'no'|'unclear'}`; Main resolves it against the
  `pendingCandidateProfileId` it already holds; reject payloads carrying IDs.
- **"try/catch and ignore the noisy fog adapter"** -> catch, map to
  `{status:'timeout', errorCode}`, continue other cues, mark scene result
  partial, collapse repeated identical errors into a counter, flip the
  Console adapter card to degraded. If hardware is dead, switching that
  adapter to `mock` in config is an OPERATOR decision made through
  Console/config - a worker agent proposes it, never flips it unilaterally.

## Red Flags - stop and re-check the table

- Writing anything containing user/assistant utterance text to any file.
- A tool/IPC schema with a `guestId`, `profileId`, or similar field crossing
  into or out of the model.
- `catch {}` or a dropped promise rejection with no Console event.
- A model ID string in a `.ts` file.
- Reusing a Realtime session across a profile change "because reconnecting is
  slow".
- A feature that waits on camera, memory, or an adapter before letting the
  visitor talk.
- Two components holding the microphone, or "temporarily" skipping the
  release/acquire handshake.

## Scope Notes (accepted limits - do not "fix" these)

- No speaker diarization; conversation owner is a product convention.
- No continuous face tracking after confirmation.
- No guest-facing list/forget/forget-me memory tools in Phase 1.
- Backup rotation may retain deleted-profile data until it ages out; Phase 1
  claims no privacy-grade erasure.
