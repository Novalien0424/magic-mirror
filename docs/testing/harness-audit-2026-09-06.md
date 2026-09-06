# Harness and skill audit — Windows, 2026-09-06

Scope: the current Console/avatar work. No dependency upgrade, global plugin
rewrite, phase promotion, deletion of historical evidence, or operator-data
change. Final delivery status is owned by PROGRESS.md.

## Follow-through — 2026-09-06 08:05 Windows

The earlier failures below remain historical evidence. The production Windows
startup policy now disables accelerated **video decoding only**, preserving
WebGL acceleration. A temporary CDP observation selected VpxVideoDecoder;
probe-free Console runs advanced 36 frames in about 1.2 seconds with zero drops.
This fixes the reproduced host path, not every driver/high-resolution workload.

Native inspection caught a false positive: managed Cubism reported ready but
showed only collar and hand after a model switch. Fresh-start comparison rendered
the full same rig. Releasing the retired context's pooled offscreen targets
fixed the switch. Anonymous CORS image loading fixes managed texture uploads.
The QA now checks actual Ren coat coverage as well as readiness, and still
requires screenshot inspection. Async replacement waits for load/release before
the next model touches the same canvas.

Two focused failing controller tests proved a failed load left its temporary
draft behind and a concurrent save could interleave with loading. Both now pass:
Console operations serialize and compensated load failures restore the old draft.
The 28-check Console run at `2026-09-05T23-58-04-313Z` passed and the managed-rig
capture was visually inspected. Full suite: exit 0, 881 tests / 96 files;
one subsequent import-path test also passed. Final QA remains separately tracked.

Live-test timeout evidence now includes bounded classifications/settings flags.
Case and Unicode punctuation normalize spoken-equivalent transcript formatting;
extra words remain failures. Earlier live mismatches are not relabelled as passes.
The expanded live-scene run exposed a harness ordering error: voice transitions
preempted standalone motion tests. Those same motion/expression checks now run
before starting Realtime. Live scene input is a synthetic silent track, and that
fixture uses silent wake; greeting/farewell has its own two-avatar lifecycle
suite. No motion, expression, scene or cleanup assertion was removed.

## Applied changes

- `scripts/qa-build.mjs`: explicit allowlisted build inputs and compiled-output
  content hashes. npm pre/postbuild record building/complete state; Phase 4 QA
  refuses missing, interrupted, stale or altered builds before Electron launch.
  Each isolated run retains hashes/time in `build.json`. Root `.env`, normal
  user data, transcripts and credentials are not scanned.
- Phase 4 runner rejects unknown, duplicate and combined mode flags. Existing
  named npm modes remain the interface. No automatic retry or decoder fallback.
  Windows launches also require the explicit canonical checkout, not merely a
  cwd that matches a copied/worktree runner.
- Console QA waits for enabled Test Draft after an asynchronous refresh, not
  merely the earlier failure message. Playback evidence now includes elapsed
  milliseconds, media times, frame counters and viewport/visibility metadata.
- Workflow and Cubism skills were compacted from 12,925 to 7,840 characters
  (about 39%). QA guidance gained the proven build/readiness rules. The privacy
  skill's conflicting future-DB persistence sentence was corrected against
  AGENTS.md. Historical reports, PRD detail and accepted evidence were retained.

## Research applied, not copied wholesale

Small deterministic checks and negative cases give more useful feedback than
expanding every task into a large agent workflow. This follows OpenAI's
[skill evaluation guidance](https://developers.openai.com/blog/eval-skills).
Its example of saving full agent traces is **not** adopted for this product:
the repository's RAM-only/content-free evidence rules take precedence.

Observe readiness conditions with bounded waits; a rendered status message
does not establish that the next control is actionable. This is consistent
with [Playwright's assertion guidance](https://playwright.dev/docs/test-assertions).
No Playwright dependency or new orchestration framework was added.

The four edited skills' relative Markdown links resolve. Descriptions now
exclude adjacent routine work where appropriate. This is a structural and
in-context audit, not a claim that a fresh-model routing benchmark ran or that
token/wall-clock savings have been proven for every task.

## Verification

- Final focused build/mode/canonical-checkout regressions: 14 tests passed.
- `npm run typecheck`: exit 0, Node and renderer.
- `npm test -- tests/unit/qa-build.test.ts tests/unit/phase4-qa-runner.test.ts tests/unit/offline-loop-packaging.test.ts tests/unit/avatar-profiles.test.ts tests/unit/config-service.test.ts`:
  exit 0, 83 tests / 5 files.
- `git diff --check` and relative skill-link check: exit 0.
- The initial full suite had 863 passes and one obsolete exact prebuild-string
  assertion. That assertion now checks both new build-stamp hooks explicitly;
  it passes in the focused run. Final full-suite/build results are recorded in
  PROGRESS.md, not inferred from the earlier run.
- Final `npm run build`: exit 0. Full `npm test`: exit 1, 863 passed / 1 failed
  across 92 files; P0-D4 exceeded its 10-second test timeout. No timeout was
  raised. This is not a full-suite pass.
- One isolated retry of `tests/integration/phase0-demos.test.ts`: exit 0,
  all 8 tests passed. npm consumed the requested name filter, so this evidence
  covers the entire file, not only P0-D4.

## Historical failed QA: BUG-PREVIEW-STALL-002

Normal-path `npm run test:phase4:qa:console` failed with
`phase4_qa_preview_playback_stalled`. First artifact:
`.artifacts/phase4-qa/2026-09-05T15-53-32-082Z/`.
Final normal-path verification also failed, with the video frozen at 1.548
seconds and zero decoded frames during 1,204 ms:
`.artifacts/phase4-qa/2026-09-05T16-17-39-405Z/`.
Further bounded probes captured a video stuck near 1.5 seconds, zero further
decoded frames, paused=false, readyState=2, full 3-second buffered duration,
and presentation phase asleep. `ffprobe` reports 30 FPS; FFmpeg decodes the
whole synthetic file without errors. Backing canvas dimensions match CSS×DPR.

Native Windows input independently opened Scenes/Avatar presentation, selected
QA finite silent, and started Exit/sleep with **no ambience**. Repeated native
screenshots showed the video frozen at the same frame while the Cubism pose
changed. The freeze is not merely an automation timing error or ambience-only
failure. The isolated run also showed `wake_worker_timeout`; no wake quality
acceptance is claimed.

Disabling background throttling and scrolling the preview into view did not
resolve the sampled stall. A blob-source probe was blocked and supplies no
playback evidence. A temporary software-video-decoding launch progressed
through preview and finite-scene completion/return, then exposed the separate
busy-control race fixed above. Diagnostic artifact:
`.artifacts/phase4-qa/2026-09-05T16-06-15-590Z/`.
That run also failed; it is **not** a normal-path pass or complete RCA.

Chromium documents the diagnostic
[disable-accelerated-video-decode switch](https://chromium.googlesource.com/chromium/src/+/master/content/test/gpu/gpu_tests/common_browser_args.py);
Electron supports [startup switches](https://www.electronjs.org/docs/latest/api/command-line-switches).
The result narrows investigation toward the decoder path but does not prove
a driver cause or justify changing production decoding globally. All temporary
decoder/throttling/blob/extra-sampling mutations were removed. No threshold
was lowered and no failing case was hidden.

The follow-through section above supersedes that investigation's next steps.
Final evidence is consolidated in [multi-avatar QA](multi-avatar-qa-2026-09-06.md):
883 tests, Console and portrait/live scenes, and two-avatar provider cycles pass.
Historical failed runs remain failed; they motivated the retained regressions.
