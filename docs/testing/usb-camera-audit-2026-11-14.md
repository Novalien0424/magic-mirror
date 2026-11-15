# USB camera audit — 2026-11-14

## Result

Subsequent strict-resolution enforcement and fresh application tests: [20:33 follow-up](camera-paths-highest-resolution-2026-11-14.md).

**30-minute HD soak passed**, 18:54–19:24 Taipei on macOS 27.2.1.
The connected Arducam 2MP Mini Ultra-lowlight advertises a maximum of
1920×1080. Production now selects maximum advertised resolution, the supported
rate endpoint nearest 5 FPS, and native NV12 when resolution/rate match.
This implements the owner's 11-14 request, superseding temporary minimum mode.
Startup latency is reported separately, as requested; steady-state thresholds
were not relaxed. No firmware, system media service or unrelated USB device was reset.

| Check | Result |
| --- | --- |
| Continuous normal Vision/JPEG processing | 1,800 seconds after 5-second warmup; pass |
| Actual source and delivered buffers | 1920×1080 NV12, configured 0.2-second frame duration |
| Received samples | 9,836; measured 5.457 FPS by source timestamps |
| Steady-state worst source / receipt gap | 184.03 / 381.48 ms; limits 250 / 500 ms |
| Snapshots | 30/30 decoded at 1920×1080; slowest 279.8 ms |
| Stale samples / USB resets / worker restarts | 0 / 0 / 0 |
| Ownership | Maximum one camera worker; zero after release |
| Production-mode injected stall/recovery | Pass: six HD snapshots before and six after targeted USB reset |
| Recovery timing | Stall detected in 2.341 s; reset request to fresh frame 4.682 s |

[Soak metadata](../../.artifacts/phase4-qa/2026-11-14T10-54-15-142Z/camera-availability.json)
· [soak exit-0 evidence](../../.artifacts/phase4-qa/2026-11-14T10-54-15-142Z/evidence.json)
· [HD recovery](../../.artifacts/phase4-qa/2026-11-14T11-24-42-773Z/camera-native.json).
Soak uses the allowlisted `nv1210805_size` case with normal processing, matching
the production-selected format; recovery uses production selection without that
override. Images remain in RAM. No images, audio or transcripts are retained by
these native tests; only metadata is written.

## Repairs and checks

- Native source timestamps must advance in production as well as QA. Invalid,
  repeated and backwards timestamps cannot refresh the watchdog or satisfy a
  snapshot. Release clears timestamp history.
- Output dimensions are explicit. Native NV12 works; the alternate 2vuy path
  reported a 1080p input but delivered only 96×96, even with explicit output size.
- The shared macOS Electron guard now checks executable paths via `ps`, not
  command arguments. The old `pgrep -f` falsely matched another operator's shell;
  that shell was preserved.
- Added 1080p/5 size-controlled diagnostic cases, startup versus observation gap
  metadata, and the 30-minute `soak` check. Soak keeps normal processing and takes
  a decoded RAM snapshot every minute. The runner allows 35 minutes.
- **217 focused tests passed**, TypeScript and Swift checks passed, final build
  passed and its stamp verified. [Logs](../../.artifacts/camera-audit-2026-11-14/).

Reproduction, canonical checkout with normal Electron stopped and lease free:

```sh
node scripts/run-raven-conversation-qa.mjs --launch-agent --scenario camera_availability --camera-case nv1210805_size --camera-check soak
node scripts/run-raven-conversation-qa.mjs --launch-agent --scenario camera_native
```

## Retained earlier failures and limits

Clock-in was clean `field/macmini-deploy` at `1ad04e5`. Another speaker task
subsequently committed its own handoff; its runtime and edits were preserved.
IOKit enumerated vendor 3141/product 1584; System Information and
`system_profiler` were not run. At 18:36 the separate `speaker-check` lease
blocked camera QA until it finished; the final camera build supersedes the old
16:50 build mentioned in earlier handoffs.

- Initial queued STOP was rejected because its caller held the lease. Direct
  `operateButton` under the lease then stopped cleanly. Later false
  `raven_qa_electron_already_running` failures led to the executable guard fix.
- Minimum 96×96/5 delivered continuously for five minutes with no resets, but
  failed the strict source-gap threshold (906 ms). Its first cold snapshot
  exceeded the three-second target, so 20-cycle acceptance did not complete.
  [Minimum stable](../../.artifacts/phase4-qa/2026-11-14T10-39-04-413Z/camera-availability.json)
  · [cold snapshot](../../.artifacts/phase4-qa/2026-11-14T10-44-26-984Z/camera-availability.json).
- Initial 1080p 2vuy trials failed actual output dimensions (96×96).
  [Explicit-size result](../../.artifacts/phase4-qa/2026-11-14T10-48-54-820Z/camera-availability.json).
- The short NV12 HD trial delivered correct dimensions but its startup gap
  (366 ms) failed the old all-samples threshold. Post-warmup source/receipt gaps
  were 184/299 ms. The owner's latency tolerance led to separate warmup reporting
  for soak, keeping the same steady-state limits.
  [Short NV12 trial](../../.artifacts/phase4-qa/2026-11-14T10-49-31-601Z/camera-availability.json).
- A 30-minute soak does not establish days-long availability, reboot persistence,
  video encoding or portrait likeness. The owner confirms the camera faces the
  room/objects, so single-face/portrait acceptance is not tested.

## Live conversation and final runtime

The physical room-description test at 1% failed before image capture:
`raven_qa_response_camera_visual_question` and `raven_qa_real_audio_route`.
Camera asleep/awake/sleep ownership and final release passed; provider-errors
check passed. This does not establish physical microphone acceptance.
[Physical result](../../.artifacts/phase4-qa/2026-11-14T11-26-10-562Z/raven-results.json).
Cleanup reported `qa_output_restored=true`; calibrated Jabra 80% and A1 65%
read back unmuted.

**Native-camera conversation passed 8/8 checks, exit 0**, using synthetic speech
and the real USB camera. The app requested consent before capture, attached the
live image, and produced a grounded room description. All four image judgments
passed (substantive answer, grounded objects, no identity inference, no invented
precision). Camera ownership was zero asleep, one awake, zero after sleep;
provider-error check passed. No screenshots, images or transcripts were retained.
[Journey result](../../.artifacts/phase4-qa/2026-11-14T11-30-20-218Z/raven-results.json)
· [evidence](../../.artifacts/phase4-qa/2026-11-14T11-30-20-218Z/evidence.json).

The runner/Main QA allowlists were extended narrowly to enable ordinary camera
questions through `--native-camera`; six focused route/privacy tests passed.
This final rebuild changed QA routing only after the soak; the native capture
implementation was unchanged, so its soak/recovery evidence is reused.

At **19:32 Taipei**, normal production was restored through its LaunchAgent.
`MAIN_READY`, `RENDERER_READY`, named TV display `reason=match`, and music route
settled in 2.3 s with two speakers reconnected. The deployed build includes HD
selection. Speaker restoration succeeded. The operator's published configuration
was not modified. Remaining limits: physical microphone speech at 1%, human
portrait quality and reboot/days-long operation; no claim that these passed.
