---
name: mm-face-identity
description: Use when implementing the face worker or identity flow — YuNet detection, SFace embeddings, candidate matching thresholds, enrollment image capture/quality, embedding rebuild/rollback, or camera access from the Python worker (Phase 5).
---

# Face Identity Pipeline (YuNet + SFace) — Magic Mirror Reference

## Overview

Verified **2026-08-16**. Python worker, OpenCV `objdetect` (no contrib
needed). Face only PROPOSES a candidate; verbal confirmation authorizes
(invariant #2). Candidate scan runs ~2–3 s during Activating only; runtime
frames are never persisted.

## Versions & Models — pin the PAIR

- `pip install opencv-python` now installs **5.0** (5.0.0.93); the 4.x line
  continues (4.14.0.94). **Pin one combo and don't mix:**
  `opencv-python==4.14.0.94` + `face_detection_yunet_2023mar.onnx` (fixed
  shape), OR `5.0.0.93` + `face_detection_yunet_2026may.onnx` (dynamic
  shape, may need `OPENCV_FORCE_DNN_ENGINE=4`). Recognizer:
  `face_recognition_sface_2021dec.onnx` (~37 MB, the ONLY zoo recognition
  model; int8 variants are NOT embedding-compatible with fp32).
- **Download trap:** `raw.githubusercontent.com` returns a ~131-byte Git-LFS
  pointer that fails at `create()` with an opaque ONNX error. Use
  `media.githubusercontent.com/media/opencv/opencv_zoo/main/models/...` or
  `git lfs pull`.
- A detector change shifts landmarks → shifts `alignCrop` → perturbs
  embeddings: version the **(detector, recognizer) pair** + sha256 in every
  embedding record; never compare across pairs (Spec §10.3).

## Detection & Embedding

```python
det = cv.FaceDetectorYN.create(yunet_path, "", (320, 320), 0.6, 0.3, 5000)
det.setInputSize((w, h))            # (width, height) — reverse of frame.shape! every frame
n, faces = det.detect(frame)        # faces is None (not []) when nothing found
# row[15]: 0-3 bbox, 4-13 five landmarks (eyes, nose, mouth corners), 14 score
rec = cv.FaceRecognizerSF.create(sface_path, "")
aligned = rec.alignCrop(frame, face_row)   # needs the FULL 15-col row (landmark warp)
feat = rec.feature(aligned)                 # assert shape at runtime (128-d expected)
sim = rec.match(f1, f2, cv.FaceRecognizerSF_FR_COSINE)  # cosine: HIGHER = same
```

Cosine is similarity (≥ threshold = same); NORM_L2 is distance (≤) — the
operator flips, classic sign bug.

## Candidate Matching (1:N against 5–8 templates)

- Reference 1:1 LFW threshold is cosine **0.363** — but max-over-N-templates
  1:N inflates scores. **Start at 0.40–0.45**, calibrate on real guests via
  the Console recorded-gallery runner.
- Score = max cosine over the guest's enrolled embeddings (store all N plus
  a normalized centroid). Accept top-1 only with a **margin**:
  `best - second_best ≥ 0.05–0.10`, else return `no_candidate` — the product
  never guesses (Spec §10.1). Excluded/below-threshold candidates log
  `reason` + score to Console, no error.
- Off-angle doorway captures degrade scores (cross-pose LFW threshold drops
  to 0.275): enroll deliberately across angles/lighting instead of lowering
  the accept threshold. YuNet is trained on ~10–300 px faces — a guest very
  close to the mirror can drop out of detection.

## Enrollment (5–8 consented source images)

- Quality gate order (no extra deps): YuNet score (col 14) → face size
  (≥~100 px) → roll (eye-vector angle) → yaw proxy (nose offset vs eye
  midpoint / inter-ocular distance) → Laplacian blur variance **on the
  aligned 112×112 crop** (~100 starting threshold). Optional ranking-only
  extra: Apple Vision `faceCaptureQuality` via pyobjc — valid for ranking
  the SAME subject's shots, never as a cross-guest threshold.
- Persist full-frame source images (temp file → fsync → atomic rename → DB
  row), with bbox, quality, consent/capture time, camera ID, SHA-256.
  Aligned crops and embeddings are derived, rebuildable data.
- Rebuild: batch-embed all source images with the new model pair → same/
  different-person validation on the recorded gallery → only then switch
  active model; keep the old batch for rollback. No re-photographing, ever
  (US-ID-002).

## Camera & TCC

- `cv2.VideoCapture(0, cv2.CAP_AVFOUNDATION)`; opencv-python wheels have a
  long-open bug (#291) where a missing permission yields
  `camera failed to properly initialize!` instead of a prompt.
- Permission attributes to the **responsible ancestor app**, not Python: dev
  from Terminal = grant Terminal; production = worker inside the signed .app
  with `NSCameraUsageDescription` (see `mm-electron-foundation`). Silent
  denial is indistinguishable from broken hardware in logs — treat
  init-failure as Camera `Degraded` in Console and fall back to asking the
  guest's name; never block conversation (invariant #10).
- Never `fork()` without `exec()` — AVFoundation loses its Mach ports.

## Common Mistakes

- Feeding `alignCrop` just the bbox — it needs the landmarks.
- Forgetting `setInputSize` per frame or passing (h, w).
- Comparing int8-model embeddings against fp32 enrollments.
- Persisting runtime recognition frames or embedding vectors to telemetry
  (forbidden — Spec §6.3).
- Letting the worker retry-loop a permission-denied camera instead of
  surfacing Degraded once.
