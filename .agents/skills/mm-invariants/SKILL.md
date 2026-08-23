---
name: mm-invariants
description: Use when implementing, reviewing, testing, or debugging any Magic Mirror behavior, especially transcript persistence, profile isolation, guest ID binding, silent failure, mic ownership, spell matching, or model fallback.
---

# Magic Mirror Hard Invariants

## Scope and acceptance

Use [AGENTS.md](../../../AGENTS.md) for canonical ownership, routing, privacy,
evidence, and invariant-reporting mechanics. Use
[.agents/H6_WORKER_PROTOCOL.md](../../H6_WORKER_PROTOCOL.md) for worker
read/output and envelope mechanics. This file is the product-behavior
contract: use it for every Magic Mirror implementation, review, test, or
debugging task. Violating an applicable invariant fails review.

At dispatch and acceptance, name only the IDs that apply using this contract.
External root acceptance checks the user-visible outcome, applicable IDs,
failure visibility, and the RAM-only privacy boundary. Worker self-review and
root acceptance remain separate gates; a correction keeps the same bounded
scope and requires a concrete root finding.

## Applicability and domain route

Name only canonical IDs applicable to the exact changed behavior; this cross-cutting contract touches IDs 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, and 12, and cross-cutting work names every applicable ID. After AGENTS.md, mm-phase-workflow, and mm-invariants, load only the matching domain route from AGENTS.md's ordered route.

## The 12 invariants

| # | Rule | Doc anchor |
|---|---|---|
| 1 | Final transcripts and conversation audio stay in RAM only: never disk, DB, backups, telemetry, or debug logs, even temporarily. Extracted memory VALUE strings and injected private context follow the same bar. Diagnostics carry keys, enums, IDs, and counts only; the fact itself lives only in guest_memories. | PRD Section 11.2, Spec Section 6.3 |
| 2 | Face recognition only proposes a candidate. Private memory loads only after explicit verbal confirmation. | PRD US-ID-003, Spec Section 10 |
| 3 | guestId and candidateProfileId stay only in Electron Main. No tool schema, model output, or renderer IPC payload may carry or substitute a guest ID; reject guest-id-shaped tool fields and log metadata. Public call names such as Nova may cross to the model, but identifiers may not. Clear the pending candidate on denial, a second ambiguous answer, owner switch, session close, or sleep. With multiple people, the model never disambiguates; the mirror asks who owns the conversation. | Spec Section 10.1 |
| 4 | A profile scope change closes the session holding old-owner history, opens a clean Persona+Master-only confirmation session, confirms, then calls updateAgent in that same clean session. | Spec Section 7.4, Section 10.2 |
| 5 | Memory extraction jobs write only to ownerProfileIdAtTurnStart, snapshotted when the turn began; never re-read current owner at completion. | PRD FR-MEM-03, Spec Section 11.1 |
| 6 | Control turns-identity confirmation, name-giving, switching, group selection, sleep, and spell-never enter personal-memory extraction. controlIntent != none means skip. | Spec Section 11.1 |
| 7 | Scenes trigger only when normalized exact full-transcript equals the spell: no substring, similarity, or LLM intent. One trigger per turnId; a scene that ran with partial adapter failure still consumes that turn's trigger. The LLM never emits DMX/fog/hardware parameters; approved presets alone control hardware. | PRD US-SCENE-001, Spec Section 12 |
| 8 | Exactly one mic owner exists at a time: wake worker XOR renderer, with explicit release -> acquire handshake. Handoff failure is local Maintenance, not cloud OfflineLoop. | Spec Section 8.1 |
| 9 | No silent failure: every ignore, drop, fallback, or degrade produces a visitor-visible state or a Console event with a reason. Metadata-only event schema: {time, module, event, status, duration_ms?, error_code?, session_id?, scene_id?, reason?}. Repeated identical errors may collapse into a counter on the same card; collapse, never discard. Catching an error is fine; swallowing it is not. | Spec Section 6.3, Section 14.1 |
| 10 | Failures degrade, never gate: camera, extractor, or one adapter failing must not block conversation or other adapters. Cloud failure -> OfflineLoop; local core failure -> Maintenance. A black screen is never acceptable. | PRD Section 5.1, Spec Section 14 |
| 11 | Model IDs come only from versioned config (active.json). No source-code model literals and no silent fallback to a different model when the configured one fails; fail visibly instead. One bounded retry of the same configured ID is allowed, at most once per user action; when configured options are exhausted, use OfflineLoop rather than substitution. | Impl Plan Section 5 Phase 0 Scope+Exit, Section 1 principle 3, Phase 1 Exit |
| 12 | API credentials live in the OS keystore through Electron safeStorage (Keychain on the target Mac; DPAPI on Windows development machines-the same API), read by Main only. Renderer gets short-lived Realtime credentials. Keys never appear in config, logs, telemetry, or exports. | Spec Section 13.4 |

## Privacy boundary

Diagnostics, worker evidence, logs, telemetry, reports, and Console events use
only IDs, enums, counts, timings, statuses, reasons, hashes, paths, and exit
codes. Never place raw transcript text, audio, extracted memory values, private
context, credentials, images, embeddings, or prompts containing user content
there. User content remains in RAM; the Console transcript panel is RAM-only
and clears on dormant/restart.

## Correction patterns for classic shortcuts

- **Debug extraction:** log a content-free decision record:
  extractionId, guestIdAtTurnStart, guestIdAtWrite, model, decision,
  subject_key, confidence, latencyMs, and errorCode. Join bad DB rows to those
  records; keep the transcript panel in RAM and clear it on dormant/restart.
- **Fallback model:** validate the configured model ID at startup and expose
  Console Test Connection/Test Draft preflight. The only sanctioned model
  changes are Publish of a tested Draft or Rollback Entire Config to Previous:
  one configured ID per role, no candidate lists, no auto-latest. Runtime failure
  of the configured model goes to OfflineLoop/visible degraded, never
  substitution.
- **Model-owned guest ID:** the tool returns only answer: yes, no, or unclear.
  Main resolves it against pendingCandidateProfileId and rejects payloads
  carrying IDs.
- **Noisy adapter:** catch and map the error to status: timeout and an
  errorCode, continue other cues, mark the scene partial, collapse repeated
  identical errors into a counter, and mark the Console adapter degraded. If
  hardware is dead, switching that adapter to mock is an operator decision in
  Console/config; a worker agent proposes it and never flips it unilaterally.

## Red flags - stop and re-check the contract

- Writing user or assistant utterance text to any file.
- A tool or IPC schema with guestId, profileId, or a similar field crossing into
  or out of the model.
- catch{} or a dropped promise rejection with no Console event.
- A model ID string in a .ts file.
- Reusing a Realtime session across a profile change because reconnecting is
  slow.
- Making a feature wait on camera, memory, or an adapter before letting the
  visitor talk.
- Two components holding the microphone, or skipping the release/acquire
  handshake even temporarily.

## Accepted scope limits

- No speaker diarization; conversation owner is a product convention.
- No continuous face tracking after confirmation.
- No guest-facing list, forget, or forget-me memory tools in Phase 1.
- Backup rotation may retain deleted-profile data until it ages out; Phase 1
  claims no privacy-grade erasure.

No worker may weaken, rename, or omit an applicable invariant. Product safety,
privacy, and runtime model IDs outrank convenience wording in a skill.
