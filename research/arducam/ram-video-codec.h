#ifndef RAM_VIDEO_CODEC_H
#define RAM_VIDEO_CODEC_H

#include <CoreGraphics/CoreGraphics.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

enum {
    RAM_VIDEO_CODEC_WIDTH = 1920,
    RAM_VIDEO_CODEC_HEIGHT = 1080,
    RAM_VIDEO_CODEC_MAX_INFLIGHT = 4,
    RAM_VIDEO_CODEC_MAX_SAMPLE_BYTES = 4 * 1024 * 1024
};

/* Stable numeric reasons for errorsByStage and lastErrorStage. */
typedef enum {
    RAM_VIDEO_CODEC_ERROR_NONE = 0,
    RAM_VIDEO_CODEC_ERROR_CREATE,
    RAM_VIDEO_CODEC_ERROR_CONFIGURE,
    RAM_VIDEO_CODEC_ERROR_HARDWARE_ENCODER,
    RAM_VIDEO_CODEC_ERROR_INPUT,
    RAM_VIDEO_CODEC_ERROR_COPY,
    RAM_VIDEO_CODEC_ERROR_ENCODE,
    RAM_VIDEO_CODEC_ERROR_SAMPLE,
    RAM_VIDEO_CODEC_ERROR_DECODER_CREATE,
    RAM_VIDEO_CODEC_ERROR_HARDWARE_DECODER,
    RAM_VIDEO_CODEC_ERROR_DECODE,
    RAM_VIDEO_CODEC_ERROR_DIMENSIONS,
    RAM_VIDEO_CODEC_ERROR_TIMESTAMP,
    RAM_VIDEO_CODEC_ERROR_FINISH,
    RAM_VIDEO_CODEC_ERROR_STAGE_COUNT
} RamVideoCodecErrorStage;

typedef struct RamVideoCodec RamVideoCodec;

typedef struct {
    uint64_t submissions, acceptedFrames;
    uint64_t backpressureDrops, closedDrops, invalidInputs;
    uint64_t encodedFrames, decodedFrames, bytes;
    uint64_t encoderDrops, decoderDrops, decodeSkippedFrames, missingOutputs;
    uint64_t wrongDimensions, inputPTSErrors, encodedPTSErrors, decodedPTSErrors;
    uint64_t errors, errorsByStage[RAM_VIDEO_CODEC_ERROR_STAGE_COUNT];
    uint32_t inFlight, peakInFlight;
    uint32_t encodedWidth, encodedHeight, decodedWidth, decodedHeight;
    /* Caller-relative seconds, rounded to microseconds; -1 means no observation. */
    double firstPTSrelative, lastPTSrelative;
    double encodedFirstPTSrelative, encodedLastPTSrelative;
    double decodedFirstPTSrelative, decodedLastPTSrelative;
    /* -1 unknown/not created, 0 software, 1 hardware. Both sessions require HW. */
    int hardwareEncoderUsed, hardwareDecoderUsed;
    int finished, lastErrorStage;
    int32_t lastStatus;
} RamVideoCodecStats;

/*
 * Single serial owner for create/submit/finish/destroy; not signal-safe.
 * Stats snapshots/printing may run concurrently while the handle is alive.
 * Every entry point manages its own autorelease pool when needed; callers may
 * be plain C. No camera, microphone, file, credential, or process-state APIs.
 * Caller owns the 30-second measurement window and its outer process deadline.
 */
RamVideoCodec *ram_video_codec_create(RamVideoCodecStats *initialOrFailureStats);

/*
 * 0: accepted by the encoder; 1: bounded backpressure drop; -1: rejected/error.
 * The caller retains image ownership and may CGImageRelease immediately after
 * return. An accepted image has been synchronously drawn at exactly 1920x1080
 * into owned BGRA RAM, without scaling. No CGImage is retained. Nonnegative,
 * finite relative_seconds must advance strictly after microsecond rounding.
 * Submission can block inside native copy/encode (including a synchronous
 * callback); this is bounded admission, not a nonblocking latency guarantee.
 */
int ram_video_codec_submit(RamVideoCodec *codec, CGImageRef image,
                           double relative_seconds);

/*
 * Idempotent stop/drain/invalidate/join. 0 means no recorded errors; -1 means
 * inspect stats. Drops and empty input still require caller acceptance checks.
 * No timeout frees live callback state: native calls/join may wait indefinitely;
 * the outer process deadline must terminate the process if they hang.
 */
int ram_video_codec_finish(RamVideoCodec *codec);
void ram_video_codec_get_stats(RamVideoCodec *codec, RamVideoCodecStats *stats);
/* One metadata-only JSON line to stdout, including create-failure snapshots. */
void ram_video_codec_print_stats(const RamVideoCodecStats *stats);
/* Finishes if needed; never call concurrently with any use of this handle. */
void ram_video_codec_destroy(RamVideoCodec *codec);

#ifdef __cplusplus
}
#endif
#endif
