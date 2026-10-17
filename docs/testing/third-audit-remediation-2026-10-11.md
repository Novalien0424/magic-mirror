# Third audit remediation — 2026-10-11

Source: [third audit](third-audit-prompts-skills-persistence-2026-10-11.md).
The owner requested systematic fixes, including continued work with the TV off.
Existing operator edits and published v17 remain preserved. This ledger records
implemented fixes and observed evidence separately from unresolved acceptance.

## Work and evidence

| Audit area | State |
|---|---|
| N1 memory-reset ordering | Fixed before stale/command-owned return; both race cases pass |
| Language detection and one current hint | Audit sentence cases pass; delete the old hint on each qualifying turn, including open memory dialogue. Names/titles/greetings still do not switch |
| Media-library prompt | Trimmed/merged prompts discover media on demand, without an inline library dump; baseline retains its old nonempty list |
| Provenance hashes and judge version | Catalog/judge hashes and actual initial wire-prompt hashes; later private-context updates excluded. Judge v3 uses measured audio/tool ordering and separates workflow narration |
| Graceful stop, wake recovery, renderer/Main hang detection | Actual Mac L3/L6/L7 pass. Wake budget rearms after 10 healthy minutes. Standalone Mac Main-worker boundary kills a blocked Node event loop after 60 s |
| Camera reset/backoff | Implemented before this audit: bounded Main-owned resets, real USB recovery and six fresh snapshots pass; full regression 1,916 pass/1 skip |
| WebGL disposal/context loss, retryable audio stop | Per-context shader release, detached-canvas release, one context-loss recovery and retryable audio cleanup. Actual forced WebGL context-loss recovery passed |
| LaunchAgent timeout, markers and restart diagnostics | ExitTimeOut 20 deployed, preserving other installed settings; ISO timestamps preserve marker field order; continuous TV absence confirmation; YouTube partition clears after close |
| Agents SDK 0.20.0 regression | Exact package/lock upgrade; focused SDK regression 161 pass; full-suite pin contract updated |
| Tool ownership, outputs, reasons, cues and argument validation | Exact app stop 「停止播放」; stop tool retired; local-only code gate; no result speech/confirmation receipt; bounded failure reasons; slow memory/camera cues; missing strings filled before validation |
| QA command matcher, guest reason, N2/N3 | Shared exact key; distinct guest reason; async scene classification before language/learning; final-ASR timeout releases stale ownership without inventing replies or authorizing effects |
| Prompt budget and controlled provider comparisons | v17 trimmed: 684 prompt tokens, 604 tool tokens, 49 clauses (o200k), 7 tools. QA-only merged: 569/498 tokens, 39 clauses, 5 tools. Four provider arms executed; all failed overall quality, so no model/persona/merged-tool promotion |
| Skills, durable-ruling supersession, Electron ownership | Durable contradictions marked superseded; domain pointers corrected/consolidated; shared lease and already-running guards in runners/tests. Seven edited skills validate; zero broken relative links |
| Button helper and device-scoped mapping | Eight unit tests and six actual Mac helper checks pass; queued launchd actions, persistent debounce, one TERM, frozen-job unload, sound feedback, bounded log, kernel queue mutex, address-required mapping. Physical device/installation/pairing not performed |
| L8, soak and physical acceptance | Provider comparisons executed and failed quality. 24-hour sampler implemented; TV absent, physical button unavailable, T1–T5 not executed |

## Boundaries

Production model changes remain separately authorized only after their trial.
The merged media tool is a QA trial first. No hardware purchase is implied by
software remediation. Physical power cuts, an unavailable button and a 24-hour
soak cannot be represented by unit tests. Raw conversation content and camera
images remain transient; retained evidence is metadata only.

## Regression history

- Core controls/language: 156 passed. Persistence components: 63 passed.
- First full suite: 1,935 passed, 13 failed, 1 skipped. Failures exposed a
  missing JSON import attribute, old SDK/result expectations and marker-prefix
  compatibility. Repaired focused Electron/integration run: 76 passed.
- Second full suite: 1,959 passed, 2 failed, 1 skipped. Both remaining assertions
  required intentionally removed duplicate farewell prose; tool-definition and
  actual application farewell ownership remain checked. Repair: 107 passed.
- Tool/ownership suite: 145 passed; control/provenance suite: 121 passed;
  merged-media suite: 36 passed; observer/button suite: 135 passed.
- TypeScript projects and stamped build passed after those repairs.
- Third full suite: **1,962 passed, 1 skipped**, 182 passing files. Later field
  testing found and repaired a sandboxed-preload dependency problem introduced
  by Chinese media search; final integration regression follows below.
- Post-field full suite: **1,963 passed, 1 skipped**, 182 passing files,
  exit 0 (69.88 s), including Electron smoke and Phase 0 integration.
  Both TypeScript projects pass. Final build and source/output verification pass.
  An initial verification invocation omitted `--verify` and returned
  `qa_build_mode_invalid`; the correctly invoked verification passes.
- Final suite after the Mac kernel-lock repair: **1,964 passed, 1 skipped**,
  182 passing files, exit 0 (69.92 s). The added regression verifies refusal
  of a competing process and recovery after SIGKILL with stale metadata.
  The final build and source/output verification pass.
- Seven skill validators and the relative-link scan pass; scoped final diff
  review and `git diff --check` pass. No production model config or operator
  persona was changed.
- Metadata, complete failed test logs and provider evidence are archived with
  byte verification in [the evidence directory](../../.artifacts/third-audit-remediation-2026-10-11/).
  All eight completed marked provider runs were reviewed and cleaned only
  after that archival: eight successful deletions, no failures. The archive
  excludes images and user-data; visual findings are recorded here. Final
  runtime readback confirms v17 active/draft equality, exit 0, no app children,
  absent TV and the unchanged root board-ADB process.

The owner explicitly confirmed 「停止播放」 as the exact application-owned
media stop phrase. No additional English phrase was added.

## Actual Mac persistence evidence

`node scripts/run-field-persistence-qa.mjs` final run
`2026-10-11T09-26-50-707Z`: exit 0, four checks passed:

- Installed `ExitTimeOut=20`, preserved every other setting, fresh renderer
  readiness and native wake listening in 1.65 s.
- L6: first killed wake worker recovered within Main; second exhausted the
  budget and launchd restarted once, listening again in 9.48 s. The 10-second
  launchd throttle accounts for most of this intentionally rapid repeat test.
- L7: a real `SIGSTOP` renderer was killed/replaced and ready in 29.12 s;
  Main stayed alive.
- L3: two TERM signals, exit 0, unchanged launch count for 60 seconds, no
  Electron/camera children left.

Retained failures: `09-18-47-742Z` exposed a test observer expecting only
`wake_worker_listening`, while a valid recovery emits `wake_audio_recovered`.
That run also exposed OpenCC being externalized into sandboxed preload. Script
conversion now runs at Main's media-search boundary; preload validation stays
dependency-free. `09-21-20-720Z` then passed L6/L7 but reproduced the real L3
restart defect. The TERM listener is now re-armed after Electron `ready`.
Electron 44 installs its native POSIX signal handlers after loading Main;
the earlier top-level registration alone was insufficient. See the
[pinned Electron source](https://github.com/electron/electron/blob/v44.0.0/shell/browser/electron_browser_main_parts.cc).

The separate worker watchdog killed an actually blocked Mac Node event loop
with SIGKILL after 60,074 ms and emitted its fixed metadata marker. Its first
probe killed correctly but lost the marker because worker stdout forwarding
needed the hung Main thread; direct descriptor writing repaired that. This is
worker-boundary evidence, not a live Electron Main-hang/launchd acceptance test.

The actual CLI button helper passed six checks, then passed all six again in
30.29 s with the kernel-owned operation lease: start plus
duplicate press without a second instance, double stop with exit 0, ordered
stop→start, whole-Main `SIGSTOP` followed by forced job unload, bootstrap after
unload, and final clean stop. Sound playback processes ran; human audibility
was not measured. Eight unit tests cover normal and failed launchd transitions.
An initial live run exposed a PID-less gap after signal exit being mistaken
for a completed stop. The helper now bootouts unless it can confirm exit 0,
preventing KeepAlive from undoing the stop. Retained failed run:
`magic-mirror-third-button-qa.log`; repaired run: `…-button-qa-final.log`.
Final kernel-lock recheck: `magic-mirror-third-button-kernel-qa.log`.
This is helper/LaunchAgent evidence, not physical Flic/Karabiner acceptance.

## Provider evidence and boundaries

Initial judge-v2 samples are retained separately:

- `09-04-59-504Z`, trimmed mini/local-only: three runtime routes passed,
  quality 0/3. Its preamble diagnoses contradicted measured tool/audio ordering.
- `09-07-35-623Z`, baseline mini/local-only: two runtime routes passed, one
  attempted forbidden YouTube search was rejected by the application source
  gate; quality 0/3. No online search escaped that gate.
- `09-11-59-698Z`, trimmed mini/additional capabilities: 9/10 checks passed,
  including real WebGL context loss, own/shared folder playback, synthetic
  camera understanding, interruption/follow-up and microphone release.
  Chinese folder lookup missed despite matching final ASR. Added literal
  Simplified/Traditional title conversion and a regression that still rejects
  unrelated homophones; provider recheck follows below.

The recheck `09-36-14-817Z` also ends exit 2, **9/10 checks passed**. Own/shared
folder playback, real WebGL recovery, four camera judgments, three interruption
judgments and final release pass. Chinese folder lookup still misses: the
model's lookup query does not contain the requested title after script
normalization (`requestedTitleMatched=false`, zero candidates). Final ASR is
sound-alike-equivalent, which is not literal-title equality. No raw query or
transcript is retained. Script-equivalent lookup and preload integration are
fixed; this provider title-selection failure remains open. No screenshot was
produced in this capability mode.

The two available Raven screenshots were reviewed: correct Raven on black,
head and torso visible without UI leakage on the virtual landscape display.
The capability run has no screenshot. These are not portrait-TV acceptance.

Final v3 comparisons are not pooled with v2: criteria changed to use actual
audio-start/tool-call timing. The rate script groups exact prompt/tool/judge/
model provenance and reports Wilson 95% intervals. One three-turn sample per
arm cannot establish the requested 200-tool-turn rate. A fixed gold/holdout
campaign and production persona/model/merged-tool promotion remain gated on
passing qualification samples.

`node scripts/run-raven-audit-trials.mjs local_scope 1`, batch
`2026-10-11T09-28-39-758Z`: four sequential arms, exit 2, no infrastructure
cancellation. All **12/12 runtime routes passed**; quality is below acceptance:

| Arm / run | Quality turns passed | Preamble failures | Wrong-language failures | Tool turns |
|---|---:|---:|---:|---:|
| Baseline mini / `09-28-40-049Z` | 0/3 | 1/3 | 1/3 | 3 |
| Trimmed mini / `09-30-17-560Z` | 0/3 | 1/3 | 2/3 | 2 |
| Trimmed full / `09-32-08-322Z` | 2/3 | 0/3 | 1/3 | 3 |
| Merged mini / `09-34-01-110Z` | 1/3 | 1/3 | 0/3 | 2 |

No invented-fact or wrong-tool diagnostic was assigned in these samples;
that is not a pass on every grounding/relevance criterion. Wilson 95% intervals
at this sample size are broad: 0/3 failures → 0–56.1%; 1/3 → 6.1–79.2%;
2/3 → 20.8–93.9%. Exact counts/provenance are in the batch `rates.json`.
The four screenshots were reviewed: consistent Raven framing on black, with
the full-model capture caught mid-blink; no Console or desktop leakage.
The requested 200-tool-turn arms and held-out qualification set are **not
completed**. Expanding failed qualification samples would measure failure more
precisely without qualifying a production promotion.

## Deliberate limits and remaining acceptance

- Camera recovery uses two targeted USB resets, at least 30 s apart, then
  reports exhaustion; 30 s of fresh frames rearms it. This replaces the audit's
  suggested indefinitely increasing helper retries with a finite Main-owned
  budget. The helper waits for Main rather than reopening every eight seconds.
- Renderer recreation remains once per process, as required by AGENTS.
  Timestamped launches and the soak sampler expose hourly restart counts.
- Flic purchase, pairing, device address, Karabiner installation/admin approvals
  and physical press/hold tests remain unavailable. The device mapping requires
  an observed address and never claims arbitrary keyboard keys as the button.
- The final Mac's shared operation lease now uses a kernel exclusive file lock,
  so crash/reboot releases ownership even if diagnostic JSON remains. A real
  competing-process/SIGKILL regression passes. Valid dead legacy records migrate
  under that lock; live owners and unknown directory contents remain protected.
  Lock inodes are never unlinked. This uses documented
  [Darwin open/flock semantics](https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man2/open.2.html),
  not a second restart owner. Physical power-cut button acceptance remains open.
- A 24-hour soak needs the TV present and ten actual conversation cycles.
  The sampler never defeats intentional TV-off. No physical power-cut test,
  packaged/signing acceptance or phase advancement is claimed.
