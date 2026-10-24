# Magic Mirror — current handoff, 2026-10-23

Latest delivery on `field/macmini-deploy`: local **music, video and picture**
discovery/presentation, with Mandarin sound-alike matching across all three types
and the Console file search. The avatar page is now **Media**. PNG/JPG/JPEG/WebP
pictures display uncropped for 15 seconds after actual decode; explicit loop holds
until stopped. Completion, Stop and decode failure restore the avatar. Exact
names/aliases outrank pronunciation; ambiguous versions/type mismatches remain
choices. Missing pictures do not suggest YouTube. New image creation stays with
the image skill. Spoken-command authorization is unchanged.

## Current runtime

Normal canonical LaunchAgent is **running in Conversation mode**. Mirror renderer
ready **22:11:56 Taipei**; normal Start acknowledged mode success and TV awake at
22:11:58. Portrait target T749/display 3 selected. Final build **22:11:20 Taipei**:
source `afade18e8be63055`, output `b53cc6350748189d`; build verification passes.

Private tailnet Console **https://macmini-m6-33.tailf9113c.ts.net:8443/** returned
HTTP 200 after deployment. Production own/shared libraries are ready with **4
videos, 3 music files and 2 pictures**. The actual priestess track remains present.
Raven v21 active/draft hashes equal task entry; Studio defaults and the unrelated
saved draft are preserved. No test setting was published. Jabra **70.08%**,
unmuted; read back after QA and normal startup. QA used 0.97% output and preserved
mute/input gain/other outputs.

## Evidence and boundaries

- Rendered canonical Electron QA: **21/21 checks, exit 0**, run
  `2026-10-23T14-07-59-026Z`, 22:07:59–22:09:20 Taipei. Actual decoded
  music/video/picture, pronunciation search in Console and authenticated lookup,
  picture timing/loop/wake-stop/failure recovery, Save/apply/reload, BGM,
  removed-file denial and black Dormant pixels. Portrait 1080×1920 verified.
  Six relevant Console/media/returned-avatar screenshots inspected; 14 captured.
- Focused unit checks **353/353**, additional renderer/Main/tool checks **90/90**;
  after final image-miss routing/help changes, affected tests **155/155**. Node/web
  typechecks and final build pass. Existing nonfatal build warnings unchanged.
- Final build differs from rendered-QA build only in the reviewed image-miss
  routing guard, tool guidance and help wording, verified with focused tests.
  Display code is unchanged. QA used built-in Ren/synthetic local fixtures,
  **not fresh Raven provider dialogue or human microphone/acoustic acceptance**.
- The earlier provider spoken-quality failures remain open. The previous sample
  proved correct priestess playback once, then exposed model type guessing; the
  deterministic type-mismatch repair has integration evidence, not a new provider
  pass. No third retry of that provider scenario was made.

[Journey, implementation, self-review and QA](../testing/media-pictures-2026-10-23.md) ·
[Development failure metadata](../testing/media-pictures-failures-2026-10-23.txt) ·
[Previous pronunciation delivery/provider limits](../archive/progress-before-media-pictures-2026-10-23.md).

## Cleanup and next action

Reviewed and deleted the exact owned QA run through the artifact tool: **96 files,
23,938,055 bytes**, excluding markers. Three task scratch/helper files removed.
Owner deliverables, synced media and Drive upload untouched. Production active
hash `336abd36578bd17422ff80fdbf0e532bcc8411fae5a7a59078e6a97dd82ad64d`,
draft `d9c62c4a890794741a0a95396585587422c46187b697fd2aba88cb5638758b07`.

Next: owner voice acceptance of a music/video/picture title, including a similar
pronunciation. Inspect fresh metadata if a request fails; do not equate this
rendered pass with complete conversational-quality acceptance. Prior human-name,
second-computer browser, Arducam-frame and deferred/no-op printing items remain
in [TODO](../../TODO.md); [DECISIONS](../../DECISIONS.md) owns rulings. No phase promotion,
new restart owner, dependency or runtime-model change.
