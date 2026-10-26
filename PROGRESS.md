# Magic Mirror — current handoff, 2026-10-26

Delivered the MusicLoop follow-up and Neo label change. **VIDEO LOOP** now labels
the top-row third key in the live **Magic Mirror copy 1** profile; its target and
the other six assignments are preserved. Recovery profile regenerated.

MusicLoop accepts audio **up to 100 MB (100,000,000 bytes)** and skips larger
files as abnormal before downloading. Ready tracks loop while remaining files
prepare, then completed tracks join at a boundary. Mode commands acknowledge
promptly; Console shows preparing/downloading/playback/error status. Repeated
MUSIC LOOP is idempotent. STOP and mode changes cancel preparation and playback.
Shared `AI_Stuff/AI_Avatar/Common/MusicLoop` remains **empty** for the owner.

[Plan, self-review, journey, results and limits](docs/testing/music-loop-downloads-2026-10-26.md) ·
[metadata checks/builds](docs/testing/music-loop-download-checks-2026-10-26.json) ·
[full failed attempts](docs/testing/music-loop-download-failures-2026-10-26.txt) ·
[operator instructions](deploy/macos/stream-deck.md).

## Current evidence and runtime

- **284 distinct focused tests pass** across ten files; TypeScript, build,
  fingerprint, script syntax and native signing checks pass. No model/dependency
  or operator settings changes.
- Real isolated Electron journey **29/29, exit 0**, 22 captures. Inspected pending,
  downloading and abnormal warning UI. Cached tracks played 34 times during a
  50-second preparation delay; completed track joined. A 46-second no-ready wait,
  cancel/no-late-restart and shutdown with playback plus pending preparation pass.
- Native exactly-100-MB WAV copy/cache/restart/playback passes on the three-output
  route. Existing 22 MB Drive WAV copied; source was already local. No cold network
  hydration, physical keypress or human acoustic acceptance claim.
- Current source `9a025a0d0762d2a3`, output `5c9e4bb1a4561946`, built
  **2026-10-26 15:40:28 Taipei**. Canonical build and current controls deployed.
  Normal app was opened during work, then stopped for QA and restored afterward:
  LaunchAgent running, Console Raven version 21, Conversation, Asleep with wake
  listening, all modules normal. No music player/preparer remains. Jabra final
  reset/read-back **70.077%**; other output levels/mutes restored.
- Both owned QA roots cleaned (**207 files / 129651594 bytes**) after preserving
  metadata and full failures; 20 scratch files removed. Production MusicLoop is
  empty; no operator config/draft was published.
- Failed development attempts are retained: outdated unit expectations, two QA
  type errors, a correct normal-Electron ownership block, and the QA client's old
  success-reason expectation. All affected final checks passed.

## Next action / scope

Owner adds music of 100 MB or less. STOP then MUSIC LOOP refreshes files/retries
downloads. Re-establish venue board ADB transport and verify physical buttons,
TV standby/mouse and acoustic output together. Existing TV standby/mouse failure,
output hotplug and inter-device latency remain unresolved/unmeasured.

The **LLM-led full-catalog media selection redesign** remains deferred in
[TODO](TODO.md), with [research and acceptance plan](docs/testing/llm-media-catalog-design-2026-10-25.md).
MusicLoop does not establish conversational search or human name/ASR acceptance;
prior voice-quality provider QA remains **not green**. Preserve Raven character.

[Previous MusicLoop delivery/handoff](docs/archive/progress-before-music-loop-downloads-2026-10-26.md)
links the initial native player/button evidence and earlier media/name work.
[DECISIONS](DECISIONS.md) owns rulings. No phase promotion.
