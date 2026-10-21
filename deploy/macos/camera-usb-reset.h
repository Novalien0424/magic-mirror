#pragma once
#include <stdint.h>

// No identifiers, frames or driver messages leave this boundary.
// 0 success; 1 absent; 2 ambiguous; 3 access; 4 open; 5 reset failed.
int mirror_camera_usb_reset(uint32_t location, uint16_t vendor, uint16_t product);

// QA only, caller holds the AVCaptureDevice configuration lock. Exception text
// never leaves Objective-C. Results: 0 accepted, 1 invalid argument, 2 other.
typedef struct {
    int32_t minimumResult;
    int32_t maximumResult;
    int32_t restoreResult;
} MirrorCameraRateAttempt;
MirrorCameraRateAttempt mirror_camera_qa_try_rate(void *device, int32_t fps);
