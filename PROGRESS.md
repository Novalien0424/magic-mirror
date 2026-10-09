# Magic Mirror — Raven conversation and media QA, 2026-10-10

## Current delivery

The user authorized real Raven conversations with real APIs, in-scope repairs,
deployment, commit and push. [Review, reproduction and retained results](docs/testing/raven-conversation-qa-2026-10-09.md).
The suite uses published Raven, Cedar voice and imported Raven rig; synthesized
visitor audio travels through real WebRTC/ASR, production tools, IPC and players.
Dialogue/audio/private context stay in RAM; evidence contains bounded metadata.

Repaired alias lookup with extra wording, explicit ambiguity, source constraints,
negative-playback vs stop behavior, ignored-stop replies and a contradictory
camera silence result. Unspecified media remains local-first then YouTube;
explicit folder/vault stays local, explicit YouTube goes directly there. Once
is default and restores conversation; explicit loops enter Dormant with Realtime
mic release before local wake acquisition.

Repaired memory timeout diagnostics, input-item-bound confirmation, keyword
fallback after semantic timeout, control-turn learning exclusion and correction
cleanup. Main derives identity candidates from the spoken introduction and can
propose a unique existing whitespace variant. Exact labels win; ambiguous names
are not selected, records are not merged, and private facts remain locked until
the application question and a separate verbal confirmation.

**376 affected Node tests across 16 files pass**, including real SQLite/worker
integration, SDK tool behavior, memory ownership and boot/IPC. Node/web typechecks
and production builds pass. Self-audit preserved invariants 1–12 within these
boundaries. No dependencies, pinned model IDs, operator settings or phase status
changed. [Earlier delivery and runtime history](docs/archive/progress-before-raven-conversation-qa-2026-10-10.md).

## Live evidence and remaining limits

- Own/shared folders and Chinese filenames: exact real playback and natural end
  passed. Local alias, ambiguity clarification, selected piano, default once,
  return to conversation, negative and quoted requests pass runtime checks.
- Local-first YouTube fallback and explicit YouTube once/loop pass real playback
  checks. Loops cross a boundary in Dormant with local wake capture acquired.
- Bilingual empathy/correction and practical follow-up pass the integrated
  quality scenario. Spoken interruption, lip movement and the changed request
  pass. Camera image capture and correct shape/color/position answers pass after
  the speech-contract fix.
- Local conversation still produced one forbidden pre-playback preamble.
  Successful playback does not establish perfect conversation quality.
- The final two-visit run confirms the same scope, saves three records and
  completes all runtime checks. Eight of ten conversation turns pass quality;
  material recall is incomplete and commitment recall is flagged for an
  invented fact. The earlier whitespace-split scope failure remains in evidence.
- Automated acoustic wake trials received fresh but zero-signal PCM; sound
  delivery to the native microphone was not demonstrated. Exact synthetic spell
  recognition also failed. No fuzzy spell bypass, wake threshold or device
  preference change. The October 4 human wake pass is historical evidence.

This is functional landscape QA, not new portrait, physical camera/hardware,
far-field wake, packaging/signing/TCC or phase acceptance. Complete live
conversation-quality acceptance has not been established.

## Runtime and next action

Source commit `7f6b377` is deployed through the existing
`com.magicmirror.launchagent`, PID **50961**. Fresh startup evidence confirms Main
and both renderers Ready, Dormant, media index ready and wake worker listening.
All five operator settings hashes match the pre-QA baseline. The stamped build
matches current source and output. [Deployment metadata](.artifacts/raven-conversation-2026-10-09/deployment.json)
and [startup events](.artifacts/raven-conversation-2026-10-09/runtime-start-events.json).
No alternate restart owner or new packaging/signing chain was introduced.

The user has been asked whether to compare `gpt-realtime-2.1` with the pinned
`gpt-realtime-2.1-mini`; no model change is authorized or performed yet.
Next: resolve that choice for the remaining quality failures, and obtain actual
microphone/wake and exact-spell acceptance. Failed evidence remains intact.
