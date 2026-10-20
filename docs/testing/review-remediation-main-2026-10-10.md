# Main remediation — 2026-10-10

Owned implementation is complete: 284 focused Node tests across 18 files pass,
the separate native wake replay passes, and the final Node typecheck exits 0.
No Electron, QA, build, microphone capture, provider call, operator-config write,
dependency/model change, host-service mutation, commit or push was performed.
Concurrent TV-presence, media, memory and renderer changes were preserved.

**Subsequent root integration:** the 17-check Raven UI run at
`.artifacts/phase4-qa/2026-10-10T15-31-55-055Z/evidence.json` actually crashed the
Active renderer, recovered a ready Dormant replacement, and woke it again.
The native camera backoff compiled during prebuild. Normal Electron created
only Mirror at boot, opened Console on demand through its application-menu
handler, and exited 0 after the authorized sleep-phrase publication. Root also
replaced the installed privileged HDMI script/plist with the inert repository
copies; that obsolete daemon remains disabled/unloaded and ADB remains enabled.
These facts supersede the original worker-only limitations below. Other
physical, recovery-exhaustion, latency and power claims remain untested unless
the [current ledger](review-remediation-2026-10-10.md) supplies later evidence.

## Root integration and live qualification

- **Renderer stop receipts:** unsuccessful rollover now dispatches an explicit
  stop and waits before acquiring wake or entering OfflineLoop. Preserve track
  cleanup before reporting success or `stop_no_active_session`. The existing
  IPC contract is sufficient; this slice changed no renderer/preload/shared file.
- **Recovery acceptance:** qualify a crash during activation/playback/stop and
  boot; one replacement must regain readiness and wake ownership. Failed or
  repeated recovery exits 1 for LaunchAgent supervision. Qualify the single
  audio-owner rebuild, absent-device retry, 30 s activation deadline and 15 s
  stop/Maintenance deadline with actual renderer/native ownership. No
  `app.relaunch()` or additional Electron restart owner was added.
- **PE-10 native portion:** root's concurrent `camera-tracker.swift` change now
  contains 2 Hz Vision backoff after 60 s without a face. This worker did not
  edit, compile or run it. Root owns its native/live qualification. Main
  deduplicates gaze and replays its current target to a replacement Mirror.
- **Memory coordination:** removed the eager embedding readiness call. Actual
  pending indexing still constitutes embedding demand. The memory worker owns
  lazy recovery/idle teardown. Its CO-05 integration note is now wired in
  `index.ts`: repository reports use `memoryReport`, and
  `memory_storage_ready` restores the public memory module status. The older
  “pending” statement in that worker's report predates this integration.
- Qualify lazy Console opening/reopening, media refresh while idle, clean exit
  0 and the unchanged **15 s dual HDMI/Ethernet absence** monitor. Physical Raven
  wake positives, ambient false wakes, capture latency, RSS and watt savings
  remain unmeasured here.

## Assigned findings

Evidence labels refer to exact commands below. “Static” means inspected source
and typechecked integration; it does not claim Electron acceptance.

| ID | Current-code verdict and owned fix | Focused evidence | Exact unresolved risk |
|---|---|---|---|
| PE-01 | Verified expensive hot-path `getConfig`. Use Main's published controls/scenes and active/draft model index; refresh on config mutations/Console reads. One Console read supplies both diffs; memoize wake defaults and suppress identical `config_loaded` events. | F1/T1, exit 0: hot reads add zero disk reads; draft/publish/rollback invalidation; one-read Console response. | Real boot/turn latency and telemetry volume were not measured. Operator draft media previews retain their explicit Console reads. |
| PE-02 | Verified two native threads. Set one thread; retain Mac 32-path and Windows 4-path search widths and package tuning. | N1, exit 0: production detector counts **positive 1 / silence 0 / unrelated tone 0**. F1 detector checks pass. | Synthetic replay does not establish physical Raven accuracy, ambient false-wake rate, latency or power savings. |
| PE-03 (Main) | Verified eager readiness embedding. Remove only that call; retain demand-driven indexing and the worker's API. | Static/T1, exit 0; memory worker supplies residency tests. | Eligible unindexed records can still load the model at boot. Cold recall latency/RSS require runtime evidence. |
| PE-07 | Review's live-watchdog claim is stale: current service is disabled and unloaded. Retire polling source and reject the obsolete installer; source plist cannot autostart or keep alive. | F1 legacy tests, exit 0; L1 disabled/unloaded read-only evidence. | Installed service files were not rewritten. The obsolete service must remain disabled/unloaded; no ADB/TV operation was run. |
| PE-08 | Verified native spotters lack destruction. End calibration with release → confirmed worker exit/restart → optional acquire. A termination timeout prevents a replacement owner. | F1 calibration/supervisor tests, exit 0: ordering, lease/race cleanup and unconfirmed-exit refusal. | Actual native allocation reclamation and physical mic teardown remain live checks. |
| PE-10 | Verified duplicate gaze/null sends. Send changed targets only and republish once on new renderer readiness. | F1 camera tests, exit 0: duplicate/null suppression and replacement replay. | Native Vision backoff belongs to root's concurrent Swift change and is not compiled/live-qualified here. |
| PE-11 | Verified 30 s refresh during Active. Automatic scans now run only in Dormant/OfflineLoop and stop scheduling at shutdown. | Static/T1, exit 0. | An already-running scan can finish after activation; slow CloudStorage scans and filesystem watching are not qualified or rewritten. |
| PE-12 | Verified hidden Console creation at normal boot. Create on first shortcut/menu use; skip absent Console snapshot delivery. Explicit smoke/QA harnesses still create both windows. | Static/T1, exit 0. | First-open rendering, reopen and actual RSS reduction require root's live checks. |
| CO-01 | Verified missing mint/probe deadlines. Combine caller cancellation with a 10 s deadline; preserve metadata-only error mapping. Abort pending session mints/probes on teardown. | F1 broker tests, exit 0: caller signal plus stalled mint/probe deadlines. | Real transport/body cancellation is untested; all transports in Node checks are synthetic. |
| CO-04 | Verified silent `[]` fallback. Cached published controls include spells, sleep and wake. Missing controls emit a reason and reject evidence before extraction. | F1 cache/unavailability tests and inspected memory caller ordering, exit 0. | Actual provider control-turn timing remains root's integration check; no permissive fallback remains in Main. |
| CO-08 | Verified truncate/rewrite. Derived keyword files are written atomically only when absent/different. | F1, exit 0: unchanged mtime, concurrent repair and replacement inode. | Unwritable directories still degrade with the existing package reason; no operator directory was touched. |
| CO-11 | Verified uncaught handlers/void rejection gaps. Fatal handlers use fixed metadata reasons and bounded exit 1; window loads and scene cleanup have explicit catches. Cleanup steps are isolated. | Static/T1, exit 0; F1 recovery deadlines. | Main handlers, window-load failure and modal-free exit were not exercised in Electron. |
| CO-12 (camera/player) | Verified wall-clock elapsed checks. Use monotonic clocks for camera freshness/watchdog and YouTube progress; wake health also uses monotonic time. | F1, exit 0: wall-clock steps do not kill responsive camera/player; actual elapsed timeout still fires. | Physical camera/YouTube timing remains live evidence. Memory confirmation timing belongs to the memory worker. |
| CO-13 | Verified teardown snapshot noise. Suppress publishing from `before-quit`/fatal exit onward, including readiness delivery; cancel timers/requests before resource teardown. | F1 IPC suppression, exit 0; Static/T1. | Clean Electron exit 0 and absence of teardown delivery noise require live verification. |
| MM-01 | Verified old renderer/private session survives failed rollover. Enter Suspending, dispatch stop, accept an idempotent closed receipt, acquire wake, then enter OfflineLoop. | F1, exit 0: failed/ignored rollover and exact stop-before-acquire order. | Physical track release must precede renderer receipt; provider/private-session closure is not claimed here. |
| MM-02 | Verified Main retains stale authority on renderer death. Clear session/timers/requests, await replacement readiness, then acquire wake and retry startup. Preserve existing single renderer recreation policy, including early-boot crash. | F1/F2, exit 0: authority closure, readiness deadline, early crash, one retry/repeated give-up policy. | Actual renderer process death and native microphone transfer remain live checks. |
| MM-03 | Verified terminal Maintenance and canceled device recovery. Distinguish proven-unowned failed wake from uncertain handoff; retain device retry through release/acquire. One audio-owner rebuild can send `RETRY_STARTUP`; unsuccessful/core recovery exits 1 after 15 s. | F1, exit 0: degraded absence, hotplug retry, closed receipt/rebuild, bounded retry and exhaustion. | Unconfirmed native termination intentionally stays unavailable until exit. Missing wake stays visibly degraded; it cannot wake visitors until device recovery or repair. |
| MM-06 | Review's “still live” claim is stale. Remove all obsolete privileged operations and Homebrew PATH lookup from historical shell entrypoints; installer refuses restoration. | F1/L1, exit 0 / expected absent-service exit 113. | No installed root copy or host launchd state was changed. Existing disabled/unloaded state remains the deployment boundary. |
| MM-08 (adjacent) | Verified actual/fallback disagreement. Share legality targets and add OfflineLoop audio failure → Maintenance. Recovery probes wait for any pending wake acquisition before Dormant. | F1, exit 0: failed OfflineLoop acquire stays Maintenance instead of falsely recovering. | Real failure timing and wake-listener presence require live qualification. |

## Focused commands and exits

F1 — exit **0**, **271 tests / 15 files**:

```sh
npm exec -- vitest run tests/unit/boot-runtime.test.ts tests/unit/boot-ipc.test.ts tests/unit/lifecycle.test.ts tests/unit/config-service.test.ts tests/unit/console-config-models.test.ts tests/unit/client-secret-broker.test.ts tests/unit/realtime-client-secret-broker.test.ts tests/unit/realtime-session-start-bundle.test.ts tests/main/camera/tracker.test.ts tests/unit/youtube-player.test.ts tests/main/wake/supervisor.test.ts tests/main/wake/calibration.test.ts tests/main/wake/model-package.test.ts tests/main/wake/detector.test.ts tests/unit/legacy-watchdog.test.ts
```

F2 — exit **0**, **13 tests / 3 files**:

```sh
npm exec -- vitest run tests/unit/crash-recovery.test.ts tests/unit/tv-presence.test.ts tests/main/wake/conversation-activation.test.ts
```

N1 — `MIRROR_WAKE_NATIVE_REPLAY=1 npm exec -- vitest run tests/main/wake/native-replay.test.ts`
exited **0**, **1 native replay test**. It reads the existing synthetic fixture;
all PCM stays in RAM and is zeroed, with no new audio artifact or microphone/API
access. It uses the production detector and existing model package.

T1 — final `npm run typecheck:node` exited **0** after Main's memory-report
integration. S1 — the following owned-path whitespace check exited **0**:

```sh
git diff --check -- src/main/{index,boot,lifecycle,config-service,console-config,ipc}.ts src/main/realtime/{client-secret-broker,session-start-bundle}.ts src/main/wake src/main/camera src/main/avatar/youtube-player.ts deploy/macos/{board-hdmi-keepalive.sh,install-board-hdmi-daemon.sh,com.magicmirror.board-hdmi.daemon.plist,test-board-hdmi-keepalive.py} tests/unit/{boot-runtime,boot-ipc,client-secret-broker,config-service,console-config-models,youtube-player,legacy-watchdog}.test.ts tests/main/wake tests/main/camera/tracker.test.ts docs/testing/review-remediation-main-2026-10-10.md
```

Final diff review covered owned source, tests and retirement scripts.

L1 — read-only `launchctl print-disabled system | rg 'board-hdmi'` exited **0**,
showing `com.magicmirror.board-hdmi => disabled`. `launchctl print system/com.magicmirror.board-hdmi`
exited **113**, the expected missing-service result; [complete output](artifacts/review-remediation-main-2026-10-10/legacy-service-absent.txt).

Preserved failures: initial focused run exited 1 (four failures: stale channel
expectation, two worker-fixture assumptions and scheduler-failure cleanup),
repaired before the passing run; [complete output](artifacts/review-remediation-main-2026-10-10/focused-tests-1.txt).
Earlier typechecks exited 2 for transient owned/unowned issues, all absent from
the final passing run: [first](artifacts/review-remediation-main-2026-10-10/typecheck-node-1.txt),
[second](artifacts/review-remediation-main-2026-10-10/typecheck-node-2.txt),
[third](artifacts/review-remediation-main-2026-10-10/typecheck-node-3.txt).
Failures contain only check diagnostics and synthetic metadata.

## Changed owned paths and invariants

Main: `index.ts`, `boot.ts`, `lifecycle.ts`, `config-service.ts`,
`console-config.ts`, `ipc.ts`, `realtime/{client-secret-broker,session-start-bundle}.ts`,
`wake/{supervisor,calibration,model-package,sherpa-detector}.ts`,
`camera/tracker.ts`, `avatar/youtube-player.ts`. Legacy source:
`deploy/macos/{board-hdmi-keepalive.sh,install-board-hdmi-daemon.sh,com.magicmirror.board-hdmi.daemon.plist,test-board-hdmi-keepalive.py}`.
Related tests: boot runtime/IPC, broker, config service/Console config, camera,
YouTube, wake supervisor/calibration/package; new opt-in native replay and
legacy-retirement tests. This report and its failure artifacts are task-owned.
PROGRESS, root's ledger and other workers' source were not edited.

Checked/preserved invariant IDs: **1/12** fixed-reason diagnostics, no raw
errors/content/credentials or key-source changes; **2–6** session authority
closure and control-turn exclusion, with memory ownership APIs unchanged;
**7** exact application scene authorization unchanged; **8** explicit renderer
stop and native exit proof before acquiring/replacing owners; **9/10** reasoned
local degradation and bounded recovery; **11** pinned runtime IDs, package
tuning and search width unchanged. Node evidence establishes controller
behavior, not physical/runtime acceptance.
