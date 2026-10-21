#import <AVFoundation/AVFoundation.h>
#import "camera-usb-reset.h"

static int32_t resultForException(NSException *exception) {
    return [exception.name isEqualToString:NSInvalidArgumentException] ? 1 : 2;
}

MirrorCameraRateAttempt mirror_camera_qa_try_rate(void *pointer, int32_t fps) {
    MirrorCameraRateAttempt result = {2, 2, 0};
    if (!pointer || (fps != 1 && fps != 2 && fps != 5)) return result;
    AVCaptureDevice *device = (__bridge AVCaptureDevice *)pointer;
    CMTime oldMinimum = device.activeVideoMinFrameDuration;
    CMTime oldMaximum = device.activeVideoMaxFrameDuration;
    CMTime requested = CMTimeMake(1, fps);
    // Actually call each setter, including unadvertised rates. Swift cannot
    // catch Objective-C exceptions; confine them to this QA-only boundary.
    @try { device.activeVideoMinFrameDuration = requested; result.minimumResult = 0; }
    @catch (NSException *exception) { result.minimumResult = resultForException(exception); }
    @try { device.activeVideoMaxFrameDuration = requested; result.maximumResult = 0; }
    @catch (NSException *exception) { result.maximumResult = resultForException(exception); }
    if (result.minimumResult || result.maximumResult) {
        @try {
            device.activeVideoMinFrameDuration = oldMinimum;
            device.activeVideoMaxFrameDuration = oldMaximum;
        } @catch (NSException *exception) { result.restoreResult = resultForException(exception); }
    }
    return result;
}
