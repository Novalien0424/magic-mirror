# Studio redraw and MusicLoop 200 MB — 2026-10-26

## Requested behavior and reviewed implementation

The owner raised MusicLoop's abnormal-file threshold to 200 MB and clarified
that Studio redraws should preserve meaning while using the saved modern
minimalist style. A new random style per revision was explicitly declined.

- MusicLoop accepts up to **200,000,000 bytes**, including the boundary. Larger
  files are rejected before cache access or download. Existing ready-track
  playback, one background preparation owner, cancellation and STOP remain.
- The music preparation window remains 120 seconds plus one second per 256 KiB,
  now capped at 900 seconds: **883 seconds at 200 MB**. Main and the Swift helper
  accept the same range. Ordinary media retains its existing 600-second cap.
  Console copy and both button guides show 200 MB.
- Both full-picture and sticker redraw defaults treat the supplied artwork as
  a reference for subject/meaning, not its rendering. They discard the old
  medium, brushwork, texture, shading, palette and composition. The requested
  change is quoted data, and the complete first-picture prompt follows: saved
  operator style, format rules, privacy guard, original answers and lettering.
  Sticker redraws therefore also receive the no-texture/shadow/glow instructions.
- Main supplies the original answers; Console preview and Prompt Inspector use
  the same builder with synthetic answers. Change-instruction help now describes
  the complete assembly. No model, dependency, owner draft or published setting
  was changed. Existing custom prompt overrides remain operator-owned; Raven v21
  has none. The previous image remains until the redraw cue completes; byte-identical
  edits still fail visibly and retain the original.

Self-review covered prompt priority, answer quoting, the complete style/format
being present on redraw, preview/runtime parity, inclusive file limit, matching
native/Main deadlines and unchanged cancellation/ownership. Invariants 1–12 are
preserved; no private transcript or image archive was added.

## Local checks

- Nine focused test files: **142/142 pass**, covering MusicLoop, media preparation,
  operator-loop ownership, Studio runtime/soul journey, prompt builder, image
  provider, inspector and Experiences editor. The cap test uses actual sparse
  files of 200,000,000 and 200,000,001 bytes; the cache test verifies the 883-second
  helper argument and reuse after restart.
- Studio QA stories: **19/19 pass** after updating the soul-story revision request
  to ask for modern minimalist multicolour vector rendering and silver wings.
- Both TypeScript projects, production build and build fingerprint pass.
  Build retains existing mixed JSON-import-attribute and chunk-size warnings.
- Native macOS copy: exact 200 MB valid synthetic MP3, 4,995.936 seconds of
  repeated encoded frames with valid ID3 padding. Source and copy SHA-256 match:
  `d089e287e101954bb8c80f8e27c0a55cbe41003f3cacc496951d161895ee2582`.
  The helper accepted the new 883-second deadline. This is local copy/decoder
  evidence, not a fresh cloud hydration test.

Build: source `01baaad36a1c3e3cee78b62076dc824119fd44efacd65befeabf546cd945ec91`,
output `4a218bc1edc3fbef7d2081ffe6ee7abb65ea83443b1bb944dda884c43fa3df3b`,
built `2026-10-26T13:03:10.659Z`.

## Provider and native playback checks

Completed, exit 0, **26/26 checks pass** in 431.930 seconds. Exact isolated run:
`.artifacts/phase4-qa/2026-10-26T13-04-33-053Z`.

Command: `node scripts/run-raven-conversation-qa.mjs --launch-agent --scenario portrait_studio --studio-story soul`,
inside the Electron ownership lease. Uses synthetic visitor speech and actual
Realtime/image providers; no transcript retention. Output controls are lowered
to 1% for sound-producing QA. Guaranteed cleanup restores other output levels
and Jabra to 70%, preserving mute/input/default devices.

The provider journey covered opening/name denial/correction/confirmation, four
answers and comments, drawing-cue ordering, Console placement while painting and
after reveal, real image generation, explicit restyle plus silver wings, one
revision, transfer/farewell/Dormant, Traditional Chinese, name-only text, fresh
name after restart, Conversation-to-Studio request and release. Both images were
1024×1024 PNGs. This is one synthetic-provider sample, not human microphone or
physical speaker acceptance.

Opened and visually compared `studio-reveal.png` and `studio-revision-1.png`.
The original was a multicolour outlined soul creature carrying a pack, with
mountains/river and houses. The redraw retained those travel/home/freedom motifs,
added silver wings, changed the pose, silhouette and supporting shapes, and used
crisp vector-like colour regions without visible watercolour brushwork. Some
tonal shading remains; this does not establish perfectly uniform flat fills or
every future image's style adherence. Because the initial result was already
vector-like, this run does not directly prove conversion of an old watercolour
reference. The source-style override and full style/answer propagation also have
focused builder/runtime tests.

Native production `out/native/music-loop` played the exact 200 MB cached MP3
for **16.001 seconds after its playback acknowledgement**, without a decode or
stall failure (the helper's stall guard is 12 seconds). Route: three physical
outputs, one stereo stream, two channels. EOF stopped the helper; exit 0.
Both native signatures and the final build fingerprint pass.

All test-owned playback ended before audio restoration. Jabra read-back is
**70.077%**; other output levels were restored, with no input/mute/default-device
mutation. Published and draft configuration hashes are unchanged.

Normal LaunchAgent was stopped at preflight and remains off. The empty Electron
default-app window opened by app inspection was closed before QA; no owner
session or unsaved Console editor was present. The canonical build/native helpers
are deployed for the next START/MUSIC LOOP. Metadata is retained in
[checks](studio-redraw-music-cap-checks-2026-10-26.json); no transcript or source
artwork is retained in that record. Cleanup removed the reviewed isolated QA root
(103 files / 26,422,267 bytes) and exact task scratch root (12 files /
400,500,113 bytes), preserving the owner's files and MusicLoop cache.
