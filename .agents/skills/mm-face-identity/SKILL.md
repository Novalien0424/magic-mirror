---
name: mm-face-identity
description: "Implement or review Magic Mirror face detection, candidate matching, consented enrollment or embedding rebuild (YuNet/SFace, Phase 5)."
---

# Face identity

Face recognition is not implemented yet. Today identity is verbal self-identification confirmed by the application in [memory](../../../src/main/memory/relationship.ts), and Main already owns one native camera child for gaze and `capture_camera` ([tracker](../../../src/main/camera/tracker.ts)). Design face capture around that owner; a second concurrent camera client is a new ownership decision. Loading this skill does not start Phase 5.

- YuNet/SFace APIs, model-pair hashes, thresholds and ambiguity: [detection/matching](references/detection-matching.md).
- Consented source images, quality, rebuild/rollback and camera failures: [enrollment/camera](references/enrollment-camera.md).

Enrollment source storage is distinct from runtime recognition capture, whose frames and embeddings never persist or reach telemetry. Never compare embeddings across detector/recognizer pairs or precision variants. Reference thresholds are calibration starting points, not accepted field results. Verify camera TCC on the actual worker launch path.
