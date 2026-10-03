# Phase 4 trial assets

These four small 9:16 assets are deterministic test patterns generated from
FFmpeg `lavfi` sources. They contain no third-party artwork or personal data and
may be used, modified, and redistributed with this project.

| File | Purpose | Expected metadata |
|---|---|---|
| `phase4-still.png` | Image decode, contain/cover, return-to-Avatar | 360×640, no audio |
| `phase4-finite-silent.webm` | `video_complete` Stage | 360×640, 3.000 s, no audio |
| `phase4-loop-silent.webm` | Loop + external managed BGM + stop/replacement | 360×640, 2.000 s loop source, no audio |
| `phase4-finite-embedded-audio.webm` | Shared background bus and dialogue ducking | 360×640, about 3.008 s, Opus audio |

For rejected-import testing, use a temporary empty or text file renamed with a
`.webm` extension. It is intentionally not checked in as a misleading media
asset.

Import them through Console → Scenes → Managed visuals. Importing copies bytes
into managed app storage; runtime configuration never stores the source path.

SHA-256:

- `phase4-still.png`: `ac5e4c98ba6c08eea0e06523d6c947997b5fea5bc78c5a5b2c600612621b19ea`
- `phase4-finite-silent.webm`: `20b626356bc09fb233d13b9bc43c8da150c97aaf83e8359efed4f0d1781a5707`
- `phase4-loop-silent.webm`: `369a5dcc7144e998c99888c59f1058148c1416f140d4f616f69ae0d0d5cc8310`
- `phase4-finite-embedded-audio.webm`: `51501827d89c3d7367028994307af643e68bceb826e83abb9a125cb6d45941f2`
