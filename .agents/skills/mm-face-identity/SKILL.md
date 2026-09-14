---
name: mm-face-identity
description: "Implement or review Magic Mirror face detection, candidate matching, consented enrollment or embedding rebuild."
---

# Face identity

Face recognition proposes a candidate; explicit verbal confirmation authorizes private memory. Guest/candidate IDs stay in Main. Runtime recognition frames and embedding values never enter telemetry. Camera failure degrades visibly and leaves conversation available.

- For YuNet/SFace APIs, model-pair hashes, thresholds and ambiguity: [detection/matching](references/detection-matching.md).
- For consented source images, quality, rebuild/rollback and camera failures: [enrollment/camera](references/enrollment-camera.md).

Enrollment source storage is distinct from runtime recognition capture. Never compare embeddings across detector/recognizer pairs or precision variants. Thresholds in references are calibration starting points, not accepted field results. Mac camera/TCC notes apply to the later port; verify the Windows backend for Windows work.

[AGENTS](../../../AGENTS.md) and current [DECISIONS](../../../DECISIONS.md) govern privacy and phase authority. Loading this skill does not start Phase 5.
