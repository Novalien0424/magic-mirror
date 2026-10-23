# Local music, video and picture journey — 2026-10-23

## Delivered behavior

Local media discovery and playback now include PNG, JPG/JPEG and WebP pictures,
alongside the existing MP4/WebM video and MP3/WAV/OGG/M4A music formats. Pictures
reuse the managed visual renderer. A successful tool response requires actual
image decode, not merely dispatching a command. The default display lasts 15
seconds from the renderer's ready report; loop keeps it displayed until stopped.
Pictures use `contain`, so the complete image remains visible. Music keeps the
avatar visible, while video and pictures fade it out and restore it on completion,
Stop or failure. Timers are cancelled on replacement/Stop; obsolete reports cannot
affect the next item.

The existing Mandarin pronunciation index now serves all three media types and
the Console file search. Literal names/aliases rank ahead of similar sounds.
Equally plausible versions remain candidates. A type-filter miss returns matching
authorized candidates of another type for clarification. Discovery never starts
playback. Pronunciation tolerance does not alter spoken-command authorization.

## Operator journey

1. Open **Avatars → Media** and select the intended avatar. The shorter Media
   label replaces Music & video and covers pictures too.
2. Expand **Folders** and link the avatar folder. Use **Configure shared folder**
   to reach **System → Media folders** for the common library. These links save
   immediately; unlinking does not delete files. Web Console shows the library
   and allows refresh, but native folder selection remains on the Mac.
3. Place supported files in those folders or subfolders and keep synced files
   available offline. **Refresh files** updates immediately; automatic refresh
   runs every 30 seconds. Folder filenames supply spoken titles; existing imported
   names/aliases also participate in voice discovery.
4. Use **Find a file…** with literal or Mandarin sound-alike text. Exact matches
   rank first. Searches display up to 20 results and explicitly ask the operator
   to narrow the query when truncated. Empty search restores the full list.
5. Expand **Playback settings**, change fade or media volume, then use
   **Save & apply all changes**. The help now describes that actual control.
   Music/video use the volume; pictures are silent. Stored changes survive reload.
6. Start a new conversation for the updated media list. Use **Stop All** to stop
   playback. Existing loop sleep/wake ownership is preserved.

Imported picture resources are also valid in configuration, selection and
Console preview; their access follows visual-resource locks. The rendered QA
below exercises the folder route, not a separate imported-picture authoring pass.

## Visitor journey

1. Ask for existing music, a video or a picture using its title or alias. Raven
   searches the active avatar's own/shared catalog; unspecified type uses all.
2. An exact or clear pronunciation match can be selected. Multiple plausible
   versions or a conflicting media type require a short clarification.
3. Main verifies the current session, asset kind, scope and availability before
   playback. Cloud files are prepared locally before the avatar fades away.
4. Music plays with the avatar visible. Video fills the presentation. A picture
   shows uncropped for 15 seconds, then returns to the avatar. Explicit loop
   requests hold/repeat media under the existing Dormant/wake lifecycle.
5. For a loop, wake the avatar before the spoken stop command, or use Console
   Stop All. Decode errors return the avatar and a bounded failure result.
6. A missing picture stays a local miss and does not suggest YouTube. Requests
   to create a new picture remain assigned to the image-generation skill.

## Implementation and self-review

Reviewed shared DTO/parser changes, folder MIME indexing, Main authorization,
decode readiness/timer ownership, renderer tool bindings, Console navigation,
preview, search, help and the extended production-path QA runner. Review found
and fixed the inappropriate YouTube suggestion for an image miss, plus stale
Save/check/publish help for the direct Save & apply controls.

No model, dependency, microphone owner, identity/memory policy, command matcher,
credential source or production story/default setting changed. Invariants 1–12
remain in force; tests specifically cover current-session authorization, visual
locks, wrong-kind rejection, stale reports and metadata privacy. Application
code owns effects; versioned tool definitions describe use and presentation.

## Verification

`npm run typecheck:node` and `npm run typecheck:web`: exit 0.

Focused tests (unchanged passes reused):

- Eight affected unit files: **353/353**, exit 0. Files: media-discovery,
  media-folders, media-skill-runtime, media-skill-config, media-selection,
  boot-ipc, realtime-tools and realtime-session-adapter.
- Actual renderer controller plus Main/tool boundary tests: **90/90** across
  tests/renderer/mirror/scene-visual-controller.test.ts, boot-ipc and realtime-tools.
- After the final image-miss guard and test correction: **155/155**, exit 0,
  across realtime-session-adapter, realtime-tools and field-help.
- The new adapter case also passed individually (1 passed, 122 intentionally
  unselected). Initial development failures are retained in
  [failure metadata](media-pictures-failures-2026-10-23.txt).

`node scripts/run-phase4-qa.mjs --media-skill`: **exit 0**, **21/21 checks**,
14 captures, 3 media types, active music analyser. Run
`2026-10-23T14-07-59-026Z`, 22:07:59–22:09:20 Taipei. Canonical macOS Electron;
portrait display 3 verified at 1080×1920, Console display 5. Normal Electron was
stopped first. Only the native picker return was substituted; folder linkage,
React controls, persistence, IPC, decoding and presentation used production paths.

Covered: device Save/reload, own/shared folder linkage, large-file/range delivery,
playback setting Save/apply/reload, compact filenames, all-type Console phonetic
search, authenticated phonetic lookup, type mismatch clarification, image decode
and timed return, image loop beyond 15 seconds and wake/Stop, corrupt-image
recovery, video fade/once/loop, video audio versus BGM, music once/loop, Console
Stop All, persisted folder playback, corrupt-video recovery, removed-file denial,
Dormant black pixels, BGM persistence and unlink.

Opened and inspected media-file-list.png, media-skills-console.png,
media-picture-displayed.png, media-picture-return.png, media-video-playing.png
and media-music-avatar-visible.png. Controls and Save action are readable;
filenames include the picture; the test picture fills its portrait aspect without
cropping; the avatar returns intact; video frames render and music retains the
avatar. The test video's timestamp is baked into the fixture, not app captions.
The isolated wake-listener warning is expected in this simulated lifecycle mode.

QA build: source `6ba3c001382bd1c5df60814e493cce2d6d010967f6dcb973eb1f263a1160f480`,
output `a8078120023ca66a46fcd5a76cb7d90c8b81424c161d5b4f28be855479fcbd6e`.
Final deployment build, 22:11:20 Taipei: source
`afade18e8be6305549369a5048b8549da2bbfeaf8d6f03efd367d16f78476eff`, output
`b53cc6350748189d86cba43b9de0503c439070b8413aa9a8c49a0056f43fffc5`.
The last build adds only the reviewed image-miss routing guard, tool guidance and
help wording after rendered QA; those have focused tests. Display code is unchanged.
Build/verification pass; existing JSON import-attribute and chunk-size warnings
remain nonfatal.

Jabra output was 0.97% during QA; mute remained 0. An EXIT/INT/TERM cleanup handler
restored and read back **70.08%** after Electron exited. No input gain or alternate
output was changed. Production active/draft hashes matched task entry before QA.

This is actual Electron rendering and decoded-media evidence using synthetic
fixtures and built-in Ren. It is not new Raven provider dialogue, physical speaker
audibility, wake/ASR or human microphone acceptance. The earlier provider spoken
quality failures remain open; this pass does not supersede them. See
[previous handoff](../archive/progress-before-media-pictures-2026-10-23.md).

Only the marked run above and task-owned scratch helpers are eligible for
requested cleanup. Metadata findings remain here; current runtime, configuration
preservation and the deletion receipt are recorded in [PROGRESS](../../PROGRESS.md).
