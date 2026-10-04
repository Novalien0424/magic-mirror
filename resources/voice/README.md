# Saved Raven voice, mist loop and BGM

`raven-god.json` preserves the voice fields from the Windows operator's
published Raven configuration v29, exported on 2026-10-04. The saved draft
matched the published configuration at export. This is an authoring resource;
the app does not automatically load this JSON or change an existing avatar.

The built-in **God** sound profile is already versioned in
`src/shared/voice-profiles.ts` (commit `f755cb1`). The saved Raven tuning uses
**cedar**, **0.80x speed** and **-4 semitones pitch**, whereas the built-in God
profile uses 0.85x and -3. All other voice fields match the built-in profile.

To restore through Console on another machine:

1. Select Raven under Avatars, open Voice and choose the God sound profile.
2. Set voice speed to 0.80x and pitch to -4 semitones. The selector may then
   display Custom settings. The JSON contains every saved voice/effect value.
3. Import `sample/_media/raven/fog.webm` into the visual media library and choose
   it as Raven's presentation background under Appearance. It is the exact
   silent, portrait 720x1280, eight-second loop used by the Windows profile.
4. Import `resources/music/raven-bgm.mp3` into the music library and select it
   as Raven's Sleep ambience. Its original library name is `天使_intro`.
   Set Ambience volume to 50%. The saved configuration has no active BGM gain;
   the runtime default is 0%. Global BGM volume also affects playback.
5. For Raven's saved rain scene, import
   `sample/_media/video-rain-leaves-embedded-audio-25s.webm`. This is the visual
   referenced by its `Test Play Magic` scene; restore the scene/action binding
   on the destination if needed. The video includes audio.
6. Save and publish when ready to apply these settings on the target machine.

The fog file is 1,876,805 bytes; SHA-256:
`7b3a265e4ffc7fe509099b8d2af660f87cdfefb205c70dcf1598e3f6d49e27dd`.
Its source and processing details are in `sample/_media/raven/README.md`.
The BGM's byte count, SHA-256 and saved gains are in
`resources/music/raven-bgm.json`. This is the exact operator-imported MP3,
98.099250 seconds, stereo, 44.1 kHz. It is different from the older
`sample/_media/raven/bgm.wav` test track, which remains local and is not Raven's
selected BGM. The MP3's original composition/provider provenance is not recorded
in the runtime library; no authorship or license claim is inferred.

The scene video is 3,038,225 bytes; SHA-256:
`1265110d03c1b975a163eb35e27b0b22389daee0583aeb2bbb1ac0dacfbbb790`.
See `sample/_media/SOURCES.md` for its source and processing notes.
Other unreferenced local music/video fixtures remain outside this archive.

No voice recording, credential, conversation, visitor identity, runtime
database or complete operator configuration is included. Restoring these
resources does not establish macOS playback or live voice acceptance.
