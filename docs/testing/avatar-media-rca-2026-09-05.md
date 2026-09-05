# Avatar preview, playback and sleep RCA — Windows, 2026-09-05

Scope: the operator's three Avatar configuration failures and BUG-SLEEP-001.
Includes the earlier requested Console/media/dialogue work in the same pending
delivery. No dependency, runtime model, credential, phase or normal configuration
change. Windows development deployment only; no Mac or packaged release claim.

## Root causes and corrections

| Symptom | Evidence / cause | Correction |
|---|---|---|
| Draft preview times out / no uploaded media | Preview used published media URLs even for unpublished imports; the editor unconditionally disabled audio. Real Console regression failed before correction. | Resolve preview through managed draft/import IDs; allow routed ambience after explicit preview interaction. Full cycle demonstrates sleep media, entrance, awake and exit; Stop preview stops playback. |
| Background persists while voice is active; avatar hidden | Metadata at 13:33:19 UTC shows Main entering OfflineLoop on a transport error, then Dormant after recovery, while the old renderer session continued output and stale-session activity. Failure reporting did not close that session. | Stop renderer session and release its media before reporting fatal failure to Main. Cleanup failure enters Maintenance instead of reacquiring the wake microphone. Pause video/audio and hide the background during the awake presentation. |
| OFFLINE LOOP flashes on sleep | Request-level errors were indiscriminately classified as ICE failure after connection (reproduced by a failing unit test). Sleep also called interrupt/clear when no output was playing. The original provider error code is unavailable, so that specific historical request error is not proven. | Only interrupt existing output. Report invalid request errors as visible metadata degradation, not a lost connection. Keep genuine connection failure recovery. Two live-provider sleep cycles pass with no OfflineLoop. |
| Slow/lagging media | Actual Chromium request for bytes 0–15 returned HTTP 200 and the whole file; repeated visual requests hashed the entire file. | Stream exact HTTP 206 ranges with Content-Range/Length, suffix/open-ended support, 416 and HEAD handling, abortable streams. Reuse hash verification only while expected hash and file stat identity remain unchanged; publication still verifies independently. |
| Lagging Console animation | Asynchronous Cubism initialization restored stale full-window dimensions: 706×1256 actual versus 329×584 required in the embedded preview. Only 7–9 video frames advanced over 1.2 seconds. | Initialize with current layout/state refs. Regression now observes 329×584, 23 frames over 1.2 seconds, zero dropped frames. This does not promise every codec/hardware combination runs at a fixed frame rate. |

The request-versus-connection distinction is also consistent with the official
[Realtime API cancellation documentation](https://github.com/openai/openai-python/blob/main/src/openai/resources/beta/realtime/realtime.py): cancellation without an active response is a request error, not proof that a peer connection failed.

## Implementation sequence and self-review

Reproduced draft loading, request-error classification, cleanup ordering and byte
ranges first; patched their owning boundaries, then ran real Console, provider
and portrait playback checks. The added performance assertion exposed the stale
canvas dimensions; corrected that measured cause before continuing delivery.

- Published and draft asset authorization remain separate; no arbitrary renderer
  file paths are accepted. Preview does not publish or acquire a microphone.
- Fatal cleanup completes before wake acquisition; stale session failures cannot
  close a newer renderer session. Cleanup failure remains visitor-visible.
- Hash caching is bounded, shares in-flight verification, invalidates on stat or
  expected-asset changes, and never caches a verification failure.
- Live QA keeps speech text in renderer RAM and retains only expected-line
  comparisons, counts, states and sanitized error codes. Synthetic input drives
  the real provider/SDK/tool/audio path; no recorded conversation is saved.
- The normal operator configuration and untracked personal `sample/` media are
  excluded from QA fixture writes and Git delivery.
- Model-generated greeting/farewell remains subject to provider behavior. The
  passing cycles prove the observed wording, not a deterministic TTS guarantee.

## QA evidence

| Command | Exit | Result |
|---|---:|---|
| `npm test` | 0 | 90 files, 852 tests |
| `npm run typecheck` | 0 | Main and renderer types, including final canvas fix |
| `npm run build` | 0 | Canonical Electron bundle |
| `npm run test:phase4:qa:console` | 0 | 24 checks, 21 screenshots; unpublished video/audio, byte ranges, Save/Test/Publish, background pause, avatar visibility, readability |
| `npm run test:phase4:qa:lifecycle-live` | 0 | Two real-provider greeting/sleep cycles; exact expected-line comparisons, no extra line, no OfflineLoop, tracks released |
| `npm run test:phase4:qa` | 0 | 7 motions, 5 expressions, 3 scenes, 5 visual cases, 28 screenshots; music analyser active |

Final Console artifacts: `.artifacts/phase4-qa/2026-09-05T14-14-16-944Z/`.
Draft video/audio startup: 1510 ms. Decoder sample: 23 frames / 1200 ms, 0 dropped.
Canvas actual and expected: 329×584. These are synthetic-fixture measurements,
not measurements of every operator-uploaded asset.

Live lifecycle artifacts: `.artifacts/phase4-qa/2026-09-05T14-04-32-423Z/`.
The initial live QA expected-line comparison failed. The comparator was updated
to normalize equivalent simplified characters; the required greeting/farewell
and forbidden-extra-word checks were retained. Original raw text was not saved,
so no retrospective claim is made about that attempt's precise wording.

Full Cubism/media artifacts: `.artifacts/phase4-qa/2026-09-05T14-15-15-791Z/`.
Non-live dialogue scene actions report expected partial failure because no
Realtime session exists in that mode; their other actions and cleanup pass.

RED artifacts include unpublished preview `2026-09-05T13-50-37-715Z`, byte range
`2026-09-05T13-56-26-231Z`, and stale canvas/performance
`2026-09-05T14-13-45-273Z`. Their failures were not counted as passes.

Portrait placement verified on Windows display 750255250, 800×1280 logical,
scale 2. Inspected final awake Mirror and sleeping Console preview screenshots:
full Cubism avatar visible awake; selected synthetic video visible asleep;
controls and text readable. Static screenshots alone do not prove smoothness or
physical audibility.

Native Windows Computer Use also selected the isolated QA looping video and
ambience, switched to Emerge from mist, ran Preview draft, held Entrance, and
stopped the preview. The sleep frame showed the selected video and the held
awake frame showed the full avatar without the video. Preview reported stopped
after Stop preview. No normal configuration was saved or published. UIA geometry
required screenshot-coordinate recovery; a stale screenshot ID prevented the
final File-menu click, so the isolated manual runner was stopped with Ctrl-C
(intentional exit 1, not an automated pass). Physical sound was not certified.

## Operator retest after deployment

1. Scenes → Avatar presentation → Preview draft: selected video/audio should
   play while asleep, fade/pause for entrance, show the moving avatar, and return
   to the sleep loop. Stop preview before testing the live Mirror.
2. Save Draft → Test Draft → Publish if changing settings. Saving alone does not
   replace the live presentation; preview uses the current draft without publish.
3. Say the configured wake phrase over the loop: expect one greeting, avatar
   appearance and background silence. Converse through a long avatar response.
4. Say `恭送渡鴨大人`: expect only the configured farewell, then mist/Dormant and
   resumed ambience, never OFFLINE LOOP. Repeat while avatar speech is playing.

Physical 2-SRS-NB10 audibility, acoustic wake recognition over the operator's
music, and personal-media smoothness still require operator acceptance. These
checks do not block delivery of the verified corrective code or promote Phase 4.
