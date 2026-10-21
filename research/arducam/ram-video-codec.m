#import "ram-video-codec.h"
#import <Foundation/Foundation.h>
#import <VideoToolbox/VideoToolbox.h>

#include <inttypes.h>
#include <math.h>
#include <pthread.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
    CMTime pts;
    bool active, dropCounted;
} FrameSlot;

struct RamVideoCodec {
    pthread_mutex_t lock, decodeLock;
    pthread_cond_t callbacksJoined;
    VTCompressionSessionRef encoder;
    VTDecompressionSessionRef decoder;
    CMVideoFormatDescriptionRef decoderFormat;
    CVPixelBufferPoolRef pool;
    CFDictionaryRef allocationAux;
    CGColorSpaceRef colorSpace;
    FrameSlot slots[RAM_VIDEO_CODEC_MAX_INFLIGHT];
    CMTime lastInputPTS, lastEncodedPTS, lastDecodedPTS;
    unsigned callbacksActive;
    bool terminal, closing, decoderFailed;
    RamVideoCodecStats stats;
};

static void init_stats(RamVideoCodecStats *s) {
    memset(s, 0, sizeof(*s));
    s->firstPTSrelative = s->lastPTSrelative = -1;
    s->encodedFirstPTSrelative = s->encodedLastPTSrelative = -1;
    s->decodedFirstPTSrelative = s->decodedLastPTSrelative = -1;
    s->hardwareEncoderUsed = s->hardwareDecoderUsed = -1;
}

/* Caller holds lock. Any codec error closes admission, not the camera probe. */
static void error_locked(RamVideoCodec *c, RamVideoCodecErrorStage stage,
                         OSStatus status) {
    c->stats.errors++;
    c->stats.errorsByStage[stage]++;
    c->stats.lastErrorStage = stage;
    c->stats.lastStatus = status;
    c->terminal = true;
}

static void record_error(RamVideoCodec *c, RamVideoCodecErrorStage stage,
                         OSStatus status) {
    pthread_mutex_lock(&c->lock);
    error_locked(c, stage, status);
    pthread_mutex_unlock(&c->lock);
}

static int hardware_used(VTSessionRef session, CFStringRef key, OSStatus *status) {
    CFTypeRef value = NULL;
    *status = VTSessionCopyProperty(session, key, kCFAllocatorDefault, &value);
    int result = -1;
    if (*status == noErr && value && CFGetTypeID(value) == CFBooleanGetTypeID())
        result = CFBooleanGetValue((CFBooleanRef)value) ? 1 : 0;
    if (value) CFRelease(value);
    return result;
}

/* Caller holds lock. A timestamp error includes mismatch, invalidity or reorder. */
static void output_pts_locked(RamVideoCodec *c, CMTime pts, CMTime expected,
                              bool encoded) {
    CMTime *previous = encoded ? &c->lastEncodedPTS : &c->lastDecodedPTS;
    double *first = encoded ? &c->stats.encodedFirstPTSrelative
                            : &c->stats.decodedFirstPTSrelative;
    double *last = encoded ? &c->stats.encodedLastPTSrelative
                           : &c->stats.decodedLastPTSrelative;
    bool numeric = CMTIME_IS_NUMERIC(pts) && pts.epoch == 0;
    if (!numeric || CMTimeCompare(pts, expected) != 0 ||
        (CMTIME_IS_NUMERIC(*previous) && CMTimeCompare(pts, *previous) <= 0)) {
        if (encoded) c->stats.encodedPTSErrors++;
        else c->stats.decodedPTSErrors++;
        error_locked(c, RAM_VIDEO_CODEC_ERROR_TIMESTAMP, kVTParameterErr);
    }
    if (numeric) {
        if (*first < 0) *first = CMTimeGetSeconds(pts);
        *last = CMTimeGetSeconds(pts);
        *previous = pts;
    }
}

static void decoded(void *context, void *frameContext, OSStatus status,
                    VTDecodeInfoFlags flags, CVImageBufferRef image,
                    CMTime pts, CMTime duration) {
    (void)duration;
    RamVideoCodec *c = context;
    FrameSlot *slot = frameContext;
    @autoreleasepool {
        pthread_mutex_lock(&c->lock);
        if (flags & kVTDecodeInfo_FrameDropped) c->stats.decoderDrops++;
        if (status != noErr || !image || (flags & kVTDecodeInfo_FrameDropped)) {
            error_locked(c, RAM_VIDEO_CODEC_ERROR_DECODE,
                         status != noErr ? status : kVTVideoDecoderBadDataErr);
        } else {
            size_t width = CVPixelBufferGetWidth(image);
            size_t height = CVPixelBufferGetHeight(image);
            c->stats.decodedFrames++;
            c->stats.decodedWidth = (uint32_t)width;
            c->stats.decodedHeight = (uint32_t)height;
            if (width != RAM_VIDEO_CODEC_WIDTH || height != RAM_VIDEO_CODEC_HEIGHT) {
                c->stats.wrongDimensions++;
                error_locked(c, RAM_VIDEO_CODEC_ERROR_DIMENSIONS, kVTParameterErr);
            }
            output_pts_locked(c, pts, slot->pts, false);
        }
        pthread_mutex_unlock(&c->lock);
        /* Borrowed decoded image is neither retained nor read/copied/logged. */
    }
}

/* Serialized by decodeLock. No retry or software fallback. */
static bool create_decoder(RamVideoCodec *c, CMVideoFormatDescriptionRef format) {
    NSDictionary *spec = @{
        (__bridge id)kVTVideoDecoderSpecification_RequireHardwareAcceleratedVideoDecoder: @YES
    };
    NSDictionary *attrs = @{
        (__bridge id)kCVPixelBufferPixelFormatTypeKey: @(kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange),
        (__bridge id)kCVPixelBufferIOSurfacePropertiesKey: @{}
    };
    VTDecompressionOutputCallbackRecord callback = {decoded, c};
    OSStatus status = VTDecompressionSessionCreate(kCFAllocatorDefault, format,
        (__bridge CFDictionaryRef)spec, (__bridge CFDictionaryRef)attrs,
        &callback, &c->decoder);
    if (status != noErr) {
        record_error(c, RAM_VIDEO_CODEC_ERROR_DECODER_CREATE, status);
        return false;
    }
    c->decoderFormat = (CMVideoFormatDescriptionRef)CFRetain(format);
    status = VTSessionSetProperty(c->decoder, kVTDecompressionPropertyKey_RealTime,
                                  kCFBooleanTrue);
    if (status != noErr) {
        record_error(c, RAM_VIDEO_CODEC_ERROR_CONFIGURE, status);
        return false;
    }
    int hardware = hardware_used(c->decoder,
        kVTDecompressionPropertyKey_UsingHardwareAcceleratedVideoDecoder, &status);
    pthread_mutex_lock(&c->lock);
    c->stats.hardwareDecoderUsed = hardware;
    if (status != noErr || hardware != 1)
        error_locked(c, RAM_VIDEO_CODEC_ERROR_HARDWARE_DECODER,
                     status != noErr ? status : kVTCouldNotFindVideoDecoderErr);
    pthread_mutex_unlock(&c->lock);
    return status == noErr && hardware == 1;
}

/* Called within the encoder callback; the sample remains borrowed throughout. */
static void consume_sample(RamVideoCodec *c, FrameSlot *slot,
                           OSStatus status, VTEncodeInfoFlags flags,
                           CMSampleBufferRef sample) {
    pthread_mutex_lock(&c->lock);
    if ((flags & kVTEncodeInfo_FrameDropped) && !slot->dropCounted) {
        c->stats.encoderDrops++;
        slot->dropCounted = true;
    }
    if (status != noErr || !sample || (flags & kVTEncodeInfo_FrameDropped)) {
        error_locked(c, RAM_VIDEO_CODEC_ERROR_ENCODE,
                     status != noErr ? status : kVTVideoEncoderMalfunctionErr);
        pthread_mutex_unlock(&c->lock);
        return;
    }
    size_t bytes = CMSampleBufferGetTotalSampleSize(sample);
    CMVideoFormatDescriptionRef format = CMSampleBufferGetFormatDescription(sample);
    bool valid = CMSampleBufferDataIsReady(sample) &&
        CMSampleBufferGetNumSamples(sample) == 1 &&
        CMSampleBufferGetDataBuffer(sample) && bytes > 0 &&
        format && CMFormatDescriptionGetMediaType(format) == kCMMediaType_Video &&
        CMFormatDescriptionGetMediaSubType(format) == kCMVideoCodecType_H264;
    if (!valid) {
        error_locked(c, RAM_VIDEO_CODEC_ERROR_SAMPLE, kVTVideoDecoderBadDataErr);
        c->stats.decodeSkippedFrames++;
        pthread_mutex_unlock(&c->lock);
        return;
    }
    CMVideoDimensions dimensions = CMVideoFormatDescriptionGetDimensions(format);
    c->stats.encodedFrames++;
    c->stats.bytes += bytes;
    c->stats.encodedWidth = (uint32_t)dimensions.width;
    c->stats.encodedHeight = (uint32_t)dimensions.height;
    output_pts_locked(c, CMSampleBufferGetPresentationTimeStamp(sample), slot->pts, true);
    bool fullHD = dimensions.width == RAM_VIDEO_CODEC_WIDTH &&
                  dimensions.height == RAM_VIDEO_CODEC_HEIGHT;
    if (!fullHD) {
        c->stats.wrongDimensions++;
        error_locked(c, RAM_VIDEO_CODEC_ERROR_DIMENSIONS, kVTParameterErr);
    }
    if (bytes > RAM_VIDEO_CODEC_MAX_SAMPLE_BYTES)
        error_locked(c, RAM_VIDEO_CODEC_ERROR_SAMPLE, kVTVideoDecoderBadDataErr);
    if (!fullHD || bytes > RAM_VIDEO_CODEC_MAX_SAMPLE_BYTES || c->decoderFailed) {
        c->stats.decodeSkippedFrames++;
        pthread_mutex_unlock(&c->lock);
        return;
    }
    pthread_mutex_unlock(&c->lock);

    if (!c->decoder && !create_decoder(c, format)) c->decoderFailed = true;
    if (!c->decoderFailed && !CMFormatDescriptionEqual(format, c->decoderFormat)) {
        record_error(c, RAM_VIDEO_CODEC_ERROR_SAMPLE,
                     kVTFormatDescriptionChangeNotSupportedErr);
        c->decoderFailed = true;
    }
    if (c->decoderFailed) {
        pthread_mutex_lock(&c->lock);
        c->stats.decodeSkippedFrames++;
        pthread_mutex_unlock(&c->lock);
        return;
    }
    /* Flags 0 compel the callback to complete before this call returns (SDK). */
    status = VTDecompressionSessionDecodeFrame(c->decoder, sample, 0, slot, NULL);
    if (status != noErr) {
        record_error(c, RAM_VIDEO_CODEC_ERROR_DECODE, status);
        c->decoderFailed = true; /* SDK guarantees no callback on returned error. */
    }
}

static void encoded(void *context, void *frameContext, OSStatus status,
                    VTEncodeInfoFlags flags, CMSampleBufferRef sample) {
    RamVideoCodec *c = context;
    FrameSlot *slot = frameContext;
    pthread_mutex_lock(&c->lock);
    c->callbacksActive++;
    bool active = slot && slot->active;
    if (!active) error_locked(c, RAM_VIDEO_CODEC_ERROR_ENCODE,
                              kVTVideoEncoderMalfunctionErr);
    pthread_mutex_unlock(&c->lock);
    @autoreleasepool {
        if (active) {
            pthread_mutex_lock(&c->decodeLock);
            consume_sample(c, slot, status, flags, sample);
            pthread_mutex_unlock(&c->decodeLock);
        }
    }
    pthread_mutex_lock(&c->lock);
    if (active) {
        slot->active = false;
        c->stats.inFlight--;
    }
    c->callbacksActive--;
    pthread_cond_broadcast(&c->callbacksJoined);
    pthread_mutex_unlock(&c->lock); /* No context access after this point. */
}

RamVideoCodec *ram_video_codec_create(RamVideoCodecStats *initialOrFailureStats) {
    @autoreleasepool {
        RamVideoCodecStats failure;
        init_stats(&failure);
        RamVideoCodec *c = calloc(1, sizeof(*c));
        int lockStatus = c ? pthread_mutex_init(&c->lock, NULL) : -1;
        int decodeStatus = lockStatus == 0 ? pthread_mutex_init(&c->decodeLock, NULL) : -1;
        int condStatus = decodeStatus == 0 ? pthread_cond_init(&c->callbacksJoined, NULL) : -1;
        if (condStatus != 0) {
            if (decodeStatus == 0) pthread_mutex_destroy(&c->decodeLock);
            if (lockStatus == 0) pthread_mutex_destroy(&c->lock);
            free(c);
            failure.errors = failure.errorsByStage[RAM_VIDEO_CODEC_ERROR_CREATE] = 1;
            failure.lastErrorStage = RAM_VIDEO_CODEC_ERROR_CREATE;
            failure.lastStatus = kVTAllocationFailedErr;
            if (initialOrFailureStats) *initialOrFailureStats = failure;
            return NULL;
        }
        init_stats(&c->stats);
        c->lastInputPTS = c->lastEncodedPTS = c->lastDecodedPTS = kCMTimeInvalid;
        NSDictionary *attrs = @{
            (__bridge id)kCVPixelBufferWidthKey: @(RAM_VIDEO_CODEC_WIDTH),
            (__bridge id)kCVPixelBufferHeightKey: @(RAM_VIDEO_CODEC_HEIGHT),
            (__bridge id)kCVPixelBufferPixelFormatTypeKey: @(kCVPixelFormatType_32BGRA),
            (__bridge id)kCVPixelBufferBytesPerRowAlignmentKey: @64,
            (__bridge id)kCVPixelBufferCGBitmapContextCompatibilityKey: @YES,
            (__bridge id)kCVPixelBufferCGImageCompatibilityKey: @YES,
            (__bridge id)kCVPixelBufferIOSurfacePropertiesKey: @{}
        };
        NSDictionary *poolAttrs = @{
            (__bridge id)kCVPixelBufferPoolMinimumBufferCountKey: @(RAM_VIDEO_CODEC_MAX_INFLIGHT)
        };
        c->allocationAux = CFDictionaryCreateCopy(kCFAllocatorDefault,
            (__bridge CFDictionaryRef)@{
                (__bridge id)kCVPixelBufferPoolAllocationThresholdKey: @(RAM_VIDEO_CODEC_MAX_INFLIGHT)
            });
        c->colorSpace = CGColorSpaceCreateWithName(kCGColorSpaceSRGB);
        OSStatus status = CVPixelBufferPoolCreate(kCFAllocatorDefault,
            (__bridge CFDictionaryRef)poolAttrs, (__bridge CFDictionaryRef)attrs, &c->pool);
        RamVideoCodecErrorStage stage = RAM_VIDEO_CODEC_ERROR_CREATE;
        if (status == noErr && (!c->allocationAux || !c->colorSpace))
            status = kVTAllocationFailedErr;
        if (status == noErr) {
            NSDictionary *spec = @{
                (__bridge id)kVTVideoEncoderSpecification_RequireHardwareAcceleratedVideoEncoder: @YES
            };
            status = VTCompressionSessionCreate(kCFAllocatorDefault,
                RAM_VIDEO_CODEC_WIDTH, RAM_VIDEO_CODEC_HEIGHT, kCMVideoCodecType_H264,
                (__bridge CFDictionaryRef)spec, (__bridge CFDictionaryRef)attrs,
                kCFAllocatorDefault, encoded, c, &c->encoder);
        }
        if (status == noErr) {
            stage = RAM_VIDEO_CODEC_ERROR_CONFIGURE;
            NSDictionary *properties = @{
                (__bridge id)kVTCompressionPropertyKey_RealTime: @YES,
                (__bridge id)kVTCompressionPropertyKey_AllowFrameReordering: @NO,
                (__bridge id)kVTCompressionPropertyKey_ExpectedFrameRate: @30,
                (__bridge id)kVTCompressionPropertyKey_AverageBitRate: @12000000,
                (__bridge id)kVTCompressionPropertyKey_MaxKeyFrameInterval: @30,
                (__bridge id)kVTCompressionPropertyKey_MaxFrameDelayCount: @1,
                (__bridge id)kVTCompressionPropertyKey_ProfileLevel:
                    (__bridge id)kVTProfileLevel_H264_Main_AutoLevel
            };
            status = VTSessionSetProperties(c->encoder, (__bridge CFDictionaryRef)properties);
            if (status == noErr) status = VTCompressionSessionPrepareToEncodeFrames(c->encoder);
        }
        if (status == noErr) {
            stage = RAM_VIDEO_CODEC_ERROR_HARDWARE_ENCODER;
            c->stats.hardwareEncoderUsed = hardware_used(c->encoder,
                kVTCompressionPropertyKey_UsingHardwareAcceleratedVideoEncoder, &status);
            if (status == noErr && c->stats.hardwareEncoderUsed != 1)
                status = kVTCouldNotFindVideoEncoderErr;
        }
        if (status != noErr) {
            record_error(c, stage, status);
            (void)ram_video_codec_finish(c);
            ram_video_codec_get_stats(c, initialOrFailureStats);
            ram_video_codec_destroy(c);
            return NULL;
        }
        ram_video_codec_get_stats(c, initialOrFailureStats);
        return c;
    }
}

static CVPixelBufferRef copy_image(RamVideoCodec *c, CGImageRef image,
                                   OSStatus *status) {
    CVPixelBufferRef buffer = NULL;
    *status = CVPixelBufferPoolCreatePixelBufferWithAuxAttributes(kCFAllocatorDefault,
        c->pool, c->allocationAux, &buffer);
    if (*status != kCVReturnSuccess) return NULL;
    *status = CVPixelBufferLockBaseAddress(buffer, 0);
    if (*status == kCVReturnSuccess) {
        void *base = CVPixelBufferGetBaseAddress(buffer);
        size_t stride = CVPixelBufferGetBytesPerRow(buffer);
        /* Reject unexpected layouts; this also bounds our explicit memset. */
        bool layout = base && !CVPixelBufferIsPlanar(buffer) &&
            CVPixelBufferGetPixelFormatType(buffer) == kCVPixelFormatType_32BGRA &&
            CVPixelBufferGetWidth(buffer) == RAM_VIDEO_CODEC_WIDTH &&
            CVPixelBufferGetHeight(buffer) == RAM_VIDEO_CODEC_HEIGHT &&
            stride >= RAM_VIDEO_CODEC_WIDTH * 4 && stride <= 8192;
        CGContextRef bitmap = NULL;
        if (layout) {
            memset(base, 0, stride * RAM_VIDEO_CODEC_HEIGHT);
            bitmap = CGBitmapContextCreate(base, RAM_VIDEO_CODEC_WIDTH,
                RAM_VIDEO_CODEC_HEIGHT, 8, stride, c->colorSpace,
                kCGBitmapByteOrder32Little | kCGImageAlphaPremultipliedFirst);
        }
        if (bitmap) {
            CGContextSetBlendMode(bitmap, kCGBlendModeCopy);
            CGContextSetInterpolationQuality(bitmap, kCGInterpolationNone);
            CGContextDrawImage(bitmap, CGRectMake(0, 0, RAM_VIDEO_CODEC_WIDTH,
                                                 RAM_VIDEO_CODEC_HEIGHT), image);
            CGContextFlush(bitmap);
            CGContextRelease(bitmap);
        } else *status = layout ? kVTAllocationFailedErr : kVTParameterErr;
        OSStatus unlockStatus = CVPixelBufferUnlockBaseAddress(buffer, 0);
        if (*status == noErr) *status = unlockStatus;
    }
    if (*status != noErr) {
        CVPixelBufferRelease(buffer);
        return NULL;
    }
    return buffer;
}

int ram_video_codec_submit(RamVideoCodec *c, CGImageRef image, double seconds) {
    if (!c) return -1;
    @autoreleasepool {
        pthread_mutex_lock(&c->lock);
        c->stats.submissions++;
        if (c->terminal || c->closing) {
            c->stats.closedDrops++;
            pthread_mutex_unlock(&c->lock);
            return -1;
        }
        bool dimensions = image && CGImageGetWidth(image) == RAM_VIDEO_CODEC_WIDTH &&
                                   CGImageGetHeight(image) == RAM_VIDEO_CODEC_HEIGHT;
        CMTime pts = isfinite(seconds) && seconds >= 0
            ? CMTimeMakeWithSeconds(seconds, 1000000) : kCMTimeInvalid;
        bool timestamp = CMTIME_IS_NUMERIC(pts) && pts.epoch == 0 &&
            (!CMTIME_IS_NUMERIC(c->lastInputPTS) || CMTimeCompare(pts, c->lastInputPTS) > 0);
        if (!dimensions || !timestamp) {
            c->stats.invalidInputs++;
            if (!dimensions) {
                if (image) c->stats.wrongDimensions++;
                error_locked(c, RAM_VIDEO_CODEC_ERROR_INPUT, kVTParameterErr);
            }
            if (!timestamp) {
                c->stats.inputPTSErrors++;
                error_locked(c, RAM_VIDEO_CODEC_ERROR_TIMESTAMP, kVTParameterErr);
            }
            pthread_mutex_unlock(&c->lock);
            return -1;
        }
        FrameSlot *slot = NULL;
        for (unsigned i = 0; i < RAM_VIDEO_CODEC_MAX_INFLIGHT; i++) {
            if (!c->slots[i].active) { slot = &c->slots[i]; break; }
        }
        if (!slot) {
            c->stats.backpressureDrops++;
            pthread_mutex_unlock(&c->lock);
            return 1;
        }
        *slot = (FrameSlot){.pts = pts, .active = true};
        c->stats.inFlight++;
        if (c->stats.inFlight > c->stats.peakInFlight)
            c->stats.peakInFlight = c->stats.inFlight;
        pthread_mutex_unlock(&c->lock);

        OSStatus status = noErr;
        CVPixelBufferRef buffer = copy_image(c, image, &status);
        if (!buffer) {
            pthread_mutex_lock(&c->lock);
            slot->active = false;
            c->stats.inFlight--;
            bool pressure = status == kCVReturnWouldExceedAllocationThreshold;
            if (pressure) c->stats.backpressureDrops++;
            else error_locked(c, RAM_VIDEO_CODEC_ERROR_COPY, status);
            pthread_mutex_unlock(&c->lock);
            return pressure ? 1 : -1;
        }
        c->lastInputPTS = pts; /* Only the serial public owner accesses this PTS. */
        VTEncodeInfoFlags flags = 0;
        status = VTCompressionSessionEncodeFrame(c->encoder, buffer, pts,
                                                 kCMTimeInvalid, NULL, slot, &flags);
        CVPixelBufferRelease(buffer); /* Encoder retains as long as necessary. */
        pthread_mutex_lock(&c->lock);
        if (status == noErr) {
            c->stats.acceptedFrames++;
            if (c->stats.firstPTSrelative < 0) c->stats.firstPTSrelative = CMTimeGetSeconds(pts);
            c->stats.lastPTSrelative = CMTimeGetSeconds(pts);
        }
        if (status != noErr || (flags & kVTEncodeInfo_FrameDropped)) {
            if ((flags & kVTEncodeInfo_FrameDropped) && !slot->dropCounted) {
                c->stats.encoderDrops++;
                slot->dropCounted = true;
            }
            error_locked(c, RAM_VIDEO_CODEC_ERROR_ENCODE,
                         status != noErr ? status : kVTVideoEncoderMalfunctionErr);
            /* A still-active slot is never reused after this failure. Invalidate
             * and join at finish before releasing any possible callback state. */
        }
        bool failed = c->terminal;
        pthread_mutex_unlock(&c->lock);
        return failed ? -1 : 0;
    }
}

int ram_video_codec_finish(RamVideoCodec *c) {
    if (!c) return -1;
    @autoreleasepool {
        pthread_mutex_lock(&c->lock);
        bool finished = c->stats.finished != 0;
        c->closing = true;
        pthread_mutex_unlock(&c->lock);
        if (!finished) {
            if (c->encoder) {
                OSStatus status = VTCompressionSessionCompleteFrames(c->encoder, kCMTimeInvalid);
                if (status != noErr) record_error(c, RAM_VIDEO_CODEC_ERROR_FINISH, status);
                VTCompressionSessionInvalidate(c->encoder);
                CFRelease(c->encoder);
                c->encoder = NULL;
            }
            /* Invalidation closes callback delivery; join any callbacks already
             * inside our context. No timeout abandons live callback state. */
            pthread_mutex_lock(&c->lock);
            while (c->callbacksActive != 0)
                pthread_cond_wait(&c->callbacksJoined, &c->lock);
            pthread_mutex_unlock(&c->lock);
            if (c->decoder) {
                OSStatus status = VTDecompressionSessionWaitForAsynchronousFrames(c->decoder);
                if (status != noErr) record_error(c, RAM_VIDEO_CODEC_ERROR_FINISH, status);
                VTDecompressionSessionInvalidate(c->decoder);
                CFRelease(c->decoder);
                c->decoder = NULL;
            }
            if (c->decoderFormat) { CFRelease(c->decoderFormat); c->decoderFormat = NULL; }
            pthread_mutex_lock(&c->lock);
            if (c->stats.inFlight) {
                c->stats.missingOutputs += c->stats.inFlight;
                error_locked(c, RAM_VIDEO_CODEC_ERROR_FINISH, kVTVideoEncoderMalfunctionErr);
            }
            for (unsigned i = 0; i < RAM_VIDEO_CODEC_MAX_INFLIGHT; i++)
                c->slots[i].active = false;
            c->stats.inFlight = 0;
            c->stats.finished = 1;
            pthread_mutex_unlock(&c->lock);
        }
        pthread_mutex_lock(&c->lock);
        int result = c->stats.errors ? -1 : 0;
        pthread_mutex_unlock(&c->lock);
        return result;
    }
}

void ram_video_codec_get_stats(RamVideoCodec *c, RamVideoCodecStats *stats) {
    if (!c || !stats) return;
    pthread_mutex_lock(&c->lock);
    *stats = c->stats;
    pthread_mutex_unlock(&c->lock);
}

void ram_video_codec_print_stats(const RamVideoCodecStats *s) {
    if (!s) return;
    flockfile(stdout);
    printf("{\"event\":\"ram_video_codec\",\"submissions\":%" PRIu64
           ",\"acceptedFrames\":%" PRIu64 ",\"backpressureDrops\":%" PRIu64
           ",\"closedDrops\":%" PRIu64 ",\"invalidInputs\":%" PRIu64
           ",\"encodedFrames\":%" PRIu64 ",\"decodedFrames\":%" PRIu64
           ",\"bytes\":%" PRIu64 ",\"encoderDrops\":%" PRIu64
           ",\"decoderDrops\":%" PRIu64 ",\"decodeSkippedFrames\":%" PRIu64
           ",\"missingOutputs\":%" PRIu64 ",\"wrongDimensions\":%" PRIu64
           ",\"inputPTSErrors\":%" PRIu64 ",\"encodedPTSErrors\":%" PRIu64
           ",\"decodedPTSErrors\":%" PRIu64 ",\"errors\":%" PRIu64,
           s->submissions, s->acceptedFrames, s->backpressureDrops, s->closedDrops,
           s->invalidInputs, s->encodedFrames, s->decodedFrames, s->bytes,
           s->encoderDrops, s->decoderDrops, s->decodeSkippedFrames, s->missingOutputs,
           s->wrongDimensions, s->inputPTSErrors, s->encodedPTSErrors,
           s->decodedPTSErrors, s->errors);
    printf(",\"inFlight\":%u,\"peakInFlight\":%u,\"maxInFlight\":%u"
           ",\"encodedWidth\":%u,\"encodedHeight\":%u,\"decodedWidth\":%u,\"decodedHeight\":%u"
           ",\"firstPTSrelative\":%.6f,\"lastPTSrelative\":%.6f"
           ",\"encodedFirstPTSrelative\":%.6f,\"encodedLastPTSrelative\":%.6f"
           ",\"decodedFirstPTSrelative\":%.6f,\"decodedLastPTSrelative\":%.6f"
           ",\"hardwareEncoderUsed\":%d,\"hardwareDecoderUsed\":%d"
           ",\"finished\":%d,\"lastErrorStage\":%d,\"lastStatus\":%" PRId32
           ",\"errorsByStage\":[",
           s->inFlight, s->peakInFlight, (unsigned)RAM_VIDEO_CODEC_MAX_INFLIGHT,
           s->encodedWidth, s->encodedHeight, s->decodedWidth, s->decodedHeight,
           s->firstPTSrelative, s->lastPTSrelative,
           s->encodedFirstPTSrelative, s->encodedLastPTSrelative,
           s->decodedFirstPTSrelative, s->decodedLastPTSrelative,
           s->hardwareEncoderUsed, s->hardwareDecoderUsed,
           s->finished, s->lastErrorStage, s->lastStatus);
    for (unsigned i = 0; i < RAM_VIDEO_CODEC_ERROR_STAGE_COUNT; i++)
        printf("%s%" PRIu64, i ? "," : "", s->errorsByStage[i]);
    printf("]}\n");
    funlockfile(stdout);
}

void ram_video_codec_destroy(RamVideoCodec *c) {
    if (!c) return;
    @autoreleasepool {
        (void)ram_video_codec_finish(c);
        if (c->pool) { CVPixelBufferPoolFlush(c->pool, kCVPixelBufferPoolFlushExcessBuffers); CFRelease(c->pool); }
        if (c->allocationAux) CFRelease(c->allocationAux);
        if (c->colorSpace) CGColorSpaceRelease(c->colorSpace);
        pthread_cond_destroy(&c->callbacksJoined);
        pthread_mutex_destroy(&c->decodeLock);
        pthread_mutex_destroy(&c->lock);
        free(c);
    }
}
