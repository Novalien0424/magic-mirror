# Magic Mirror — current handoff, 2026-10-23

Latest delivery on `field/macmini-deploy`: Mandarin pronunciation-tolerant local
media discovery. The owner's title「天使葛麗果女祭司版本」now finds the catalog
entry「天使葛利果女祭司版本」without renaming it or adding aliases. Literal
filenames/aliases rank first; homophones and common Mandarin sound confusions
use a separate pronunciation index. Tied versions remain choices; artist-only
clues remain weak. Spoken-command authorization and model IDs are unchanged.

Real QA exposed a second false-miss path: the model guessed `video` for a
title-only request and hid the music result. The tool now requests `all` for
unspecified type; on a filtered miss Main returns authorized cross-type title
candidates as `media_discovery_kind_mismatch`, and the adapter asks for
clarification. Neither approximate matching nor this fallback dispatches playback
or authorizes online search. No transcript/audio/private context retention.

## Current runtime

Normal canonical LaunchAgent is **running in Conversation mode**, ready for
music requests. Main/renderer/web server were ready at **21:25:12 Taipei**;
the normal Start button acknowledged mode success/TV awake at 21:25:14.
Tailnet HTTPS returned 200; own/shared indexes are ready and the actual priestess
track is available. Console:
**https://macmini-m6-33.tailf9113c.ts.net:8443/** (private; existing public Funnel
443 unchanged).

Final build **21:24:40 Taipei**: source `5f478d8945a9f010`, output
`3da92977c263790b`; verification passes. Production active/draft hashes match
task entry: Raven v21, Studio defaults and the unrelated saved draft are
preserved. Jabra is **70.08%**, unmuted, confirmed after both QA runs and after
normal startup. QA used requested 1% output, preserving input gain and other
outputs. The owner was invited to test the deployed song; result pending.

## Verification and limits

- Final focused test union **356/356**; after the type-filter fix, four affected
  files passed **290/290**. Node/web typechecks and build pass. Tests exercise
  homophones, tone/initial/final confusion, exact ranking, version ambiguity,
  wrong-version rejection, Main scope/privacy, cross-type clarification, adapter
  no-online behavior and unchanged command matching.
- Real provider run `2026-10-23T13-17-58-622Z`: **8/9 runtime steps**, exit 2.
  The priestess lookup actually used `media_discovery_phonetic`, played the
  correct fixture, clarified versions and played the chosen piano version.
  Quality judging flagged mechanism narration and weak naturalness/character.
- One provider retry `2026-10-23T13-21-17-189Z`: **7/9 runtime steps**, exit 2.
  The erroneous video filter caused the priestess miss; subsequent version
  lookup/piano playback passed runtime checks, but spoken quality also failed.
  This led to the deterministic Main/adapter repair above. The final type-filter
  repair has **unit/integration evidence only, no fresh provider or human pass**.
  No third provider retry: AGENTS limits external/flaky retries to one.
- Both runs used synthetic visitor audio through real WebRTC/ASR/tools/IPC and
  fixture playback, not the owner's physical voice or original music recording.
  Both Raven screenshots were inspected; portrait correct, no captions.

[Research, diagnosis, journey and QA](docs/testing/media-phonetics-2026-10-23.md) ·
[Full retained failure metadata](docs/testing/media-phonetic-failures-2026-10-23.txt) ·
[Previous name-microphone repair](docs/archive/progress-before-media-phonetics-2026-10-23.md).

## Cleanup and next action

Both exact owned QA runs were reviewed and deleted: **190 files / 44,197,831
bytes**, excluding markers. Eleven task scratch/helper files were removed.
Owner deliverables and Drive upload are untouched. No test settings were
published.

Listen for the owner's deployed music result; investigate fresh metadata if it
still fails. **Full voice quality acceptance remains open**; do not turn the
successful lookup/playback sample or passing unit tests into a claim of fully
green live QA. Prior human name acceptance, second-computer browser acceptance,
Arducam missing frames and deferred/no-op printing remain as previously recorded.
[TODO](TODO.md) owns unrelated acceptance and [DECISIONS](DECISIONS.md) owns
rulings. No phase promotion or added restart owner.
