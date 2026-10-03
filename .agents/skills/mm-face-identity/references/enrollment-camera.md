# Enrollment, rebuild and camera access

Repository implementation reference; installed code, current DECISIONS and focused contract tests outrank historical SDK/version observations. Follow AGENTS for execution policy.

## Enrollment (5-8 consented source images)

- Quality gate order (no extra deps): YuNet score (col 14) -> face size
  (>=~100 px) -> roll (eye-vector angle) -> yaw proxy (nose offset vs eye
  midpoint / inter-ocular distance) -> Laplacian blur variance **on the
  aligned 112x112 crop** (~100 starting threshold). Optional ranking-only
  extra: Apple Vision `faceCaptureQuality` via pyobjc - valid for ranking the
  SAME subject's shots, never as a cross-guest threshold.
- Persist full-frame source images (temp file -> fsync -> atomic rename -> DB
  row), with bbox, quality, consent/capture time, camera ID, SHA-256. Aligned
  crops and embeddings are derived, rebuildable data.
- Rebuild: batch-embed all source images with the new model pair -> same/
  different-person validation on the recorded gallery -> only then switch
  active model; keep the old batch for rollback. No re-photographing, ever
  (US-ID-002).

## Camera and TCC

- `cv2.VideoCapture(0, cv2.CAP_AVFOUNDATION)`; opencv-python wheels have a
  long-open bug (#291) where a missing permission yields
  `camera failed to properly initialize!` instead of a prompt.
- Permission attributes to the **responsible ancestor app**, not Python: dev
  from Terminal = grant Terminal; production = worker inside the signed .app
  with `NSCameraUsageDescription` (see `mm-electron-foundation`). Silent
  denial is indistinguishable from broken hardware in logs - treat init-failure
  as Camera `Degraded` in Console and fall back to asking the guest's name;
  never block conversation (invariant #10).
- Never `fork()` without `exec()` - AVFoundation loses its Mach ports.

## Privacy, degradation, and common mistakes

- Runtime recognition frames are never persisted. Persisting runtime
  recognition frames or embedding vectors to telemetry is forbidden (Spec
  Section 6.3).
- Never feed `alignCrop` just the bbox - it needs the landmarks.
- Never forget `setInputSize` per frame or pass (h, w).
- Never compare int8-model embeddings against fp32 enrollments.
- Never compare embeddings across detector/recognizer pairs.
- Never let the worker retry-loop a permission-denied camera instead of
  surfacing Degraded once.
