/* RAM-only Annex-B H.264 evidence checker. No media, log text or pixels leave RAM.
 * Exit 0: >=1 conservatively associated clean IDR, EOF/drain, no reported errors.
 * Exit 1: stream rejected/no clean IDR. Exit 2: setup, I/O or resource failure.
 * "Clean" describes decoder evidence, never visual or P-frame certification.
 */
#include <errno.h>
#include <inttypes.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <sys/resource.h>
#include <time.h>
#include <unistd.h>

#include <libavcodec/avcodec.h>
#include <libavutil/buffer.h>
#include <libavutil/error.h>
#include <libavutil/frame.h>
#include <libavutil/log.h>
#include <libavutil/mem.h>
#include <libavutil/pixdesc.h>

enum {
    READ_BYTES = 64 * 1024,
    ALLOCATION_LIMIT = 8 * 1024 * 1024,
    PACKET_LIMIT = ALLOCATION_LIMIT - AV_INPUT_BUFFER_PADDING_SIZE,
    WIDTH = 1920,
    HEIGHT = 1080,
    CODED_HEIGHT_LIMIT = 1088
};

static struct {
    uint64_t bytes, packets, frames, frames_1080p, keyframes, i_frames, p_frames;
    uint64_t b_frames, decode_error_frames, corrupt_frames, unassociated_frames;
    uint64_t idr_nals, idr_candidates, idr_associated_frames, clean_idrs;
    uint64_t parser_errors, annexb_errors, send_errors, receive_errors;
    uint64_t error_logs, warning_logs, dimension_rejections, limit_errors;
    uint64_t setup_errors, input_errors, clock_errors, resource_errors, epoch;
    uint32_t decode_error_flags;
    size_t max_packet, max_pending, max_read;
    int width, height, rejected_width, rejected_height;
    bool stop, input_complete, decoder_drained;
} stats;

typedef struct {
    uint64_t first, previous, max_gap;
} Availability;

typedef struct {
    AVCodecContext *decoder;
    AVCodecParserContext *parser;
    AVPacket *packet;
    AVFrame *frame;
    uint64_t start_ns, end_ns, arrival_ns, parser_epoch;
    size_t pending;
    int64_t position;
    Availability candidates, clean;
} Checker;

typedef struct {
    int64_t pts;
    uint64_t arrival_ns, epoch;
    bool candidate, eligible, sent, used;
} PacketMark;

typedef struct {
    size_t idr_nals, first_idr_slices;
    bool other_vcl, invalid;
} NalInfo;

static void count_log(void *context, int level, const char *format, va_list args)
{
    (void)context;
    (void)format;
    (void)args;
    /* Do not format, retain or forward messages (including bytes/pointers). */
    if (level <= AV_LOG_ERROR) {
        ++stats.error_logs;
        ++stats.epoch;
    } else if (level <= AV_LOG_WARNING) {
        ++stats.warning_logs;
        ++stats.epoch;
    }
}

static uint64_t now_ns(void)
{
    struct timespec ts;
    if (clock_gettime(CLOCK_MONOTONIC, &ts) != 0) {
        ++stats.clock_errors;
        ++stats.epoch;
        stats.stop = true;
        return 0;
    }
    return (uint64_t)ts.tv_sec * UINT64_C(1000000000) + (uint64_t)ts.tv_nsec;
}

static void available(Availability *a, uint64_t when, uint64_t start)
{
    uint64_t previous = a->first ? a->previous : start;
    if (when < previous) {
        /* A reordered/ambiguous clock association cannot support availability. */
        ++stats.clock_errors;
        ++stats.epoch;
        stats.stop = true;
        return;
    }
    if (!a->first)
        a->first = when;
    if (when - previous > a->max_gap)
        a->max_gap = when - previous;
    a->previous = when;
}

static uint64_t final_gap(const Availability *a, const Checker *c)
{
    uint64_t previous = a->first ? a->previous : c->start_ns;
    uint64_t tail = c->end_ns >= previous ? c->end_ns - previous : 0;
    return tail > a->max_gap ? tail : a->max_gap;
}

static bool reject_dimensions(int width, int height)
{
    ++stats.dimension_rejections;
    ++stats.epoch;
    stats.rejected_width = width;
    stats.rejected_height = height;
    stats.stop = true;
    return false;
}

static int bounded_get_buffer(AVCodecContext *context, AVFrame *frame, int flags)
{
    /* SPS display size must be real 1080p; permit its macroblock padding only. */
    if (context->width != WIDTH || context->height != HEIGHT ||
        frame->width <= 0 || frame->width > WIDTH ||
        frame->height <= 0 || frame->height > CODED_HEIGHT_LIMIT) {
        (void)reject_dimensions(context->width, context->height);
        return AVERROR_INVALIDDATA;
    }
    int result = avcodec_default_get_buffer2(context, frame, flags);
    if (result == AVERROR(ENOMEM)) {
        ++stats.resource_errors;
        ++stats.epoch;
        stats.stop = true;
    }
    return result;
}

static enum AVPixelFormat software_format(AVCodecContext *context,
                                         const enum AVPixelFormat *formats)
{
    (void)context;
    for (; *formats != AV_PIX_FMT_NONE; ++formats) {
        const AVPixFmtDescriptor *description = av_pix_fmt_desc_get(*formats);
        if (description && !(description->flags & AV_PIX_FMT_FLAG_HWACCEL))
            return *formats;
    }
    return AV_PIX_FMT_NONE;
}

static size_t start_code(const uint8_t *data, size_t size, size_t from,
                         size_t *prefix)
{
    for (size_t i = from; i + 2 < size; ++i) {
        if (data[i] != 0 || data[i + 1] != 0)
            continue;
        if (data[i + 2] == 1) {
            *prefix = 3;
            return i;
        }
        if (i + 3 < size && data[i + 2] == 0 && data[i + 3] == 1) {
            *prefix = 4;
            return i;
        }
    }
    return size;
}

static NalInfo inspect_nals(const uint8_t *data, size_t size)
{
    NalInfo info = {0};
    size_t prefix = 0;
    size_t offset = start_code(data, size, 0, &prefix);
    if (offset == size) {
        info.invalid = true;
        return info;
    }
    for (size_t i = 0; i < offset; ++i)
        if (data[i] != 0)
            info.invalid = true;
    while (offset < size) {
        size_t header = offset + prefix;
        size_t next_prefix = 0;
        size_t next = start_code(data, size, header, &next_prefix);
        size_t end = next;
        while (end > header && data[end - 1] == 0)
            --end;
        if (header >= end || end - header < 2) {
            info.invalid = true;
        } else {
            unsigned type = data[header] & 31;
            if ((data[header] & 128) || type == 0 || type > 23)
                info.invalid = true;
            if (type == 5) {
                ++info.idr_nals;
                if (!(data[header] & 96))
                    info.invalid = true;
                /* ue(v) first_mb_in_slice == 0 begins with a one bit. */
                if (data[header + 1] & 128)
                    ++info.first_idr_slices;
            } else if ((type >= 1 && type <= 4) ||
                       type == 19 || type == 20 || type == 21) {
                info.other_vcl = true;
            }
        }
        offset = next;
        prefix = next_prefix;
    }
    return info;
}

static void inspect_frame(Checker *c)
{
    AVFrame *frame = c->frame;
    ++stats.frames;
    stats.width = frame->width;
    stats.height = frame->height;
    bool dimensions = frame->width == WIDTH && frame->height == HEIGHT;
    if (dimensions)
        ++stats.frames_1080p;
    else
        (void)reject_dimensions(frame->width, frame->height);
    bool key = (frame->flags & AV_FRAME_FLAG_KEY) != 0;
    if (key)
        ++stats.keyframes;
    if (frame->pict_type == AV_PICTURE_TYPE_I)
        ++stats.i_frames;
    if (frame->pict_type == AV_PICTURE_TYPE_P)
        ++stats.p_frames;
    if (frame->pict_type == AV_PICTURE_TYPE_B)
        ++stats.b_frames;
    if (frame->decode_error_flags) {
        ++stats.decode_error_frames;
        stats.decode_error_flags |= (uint32_t)frame->decode_error_flags;
        ++stats.epoch;
    }
    if (frame->flags & AV_FRAME_FLAG_CORRUPT) {
        ++stats.corrupt_frames;
        ++stats.epoch;
    }
    PacketMark *mark = frame->opaque_ref &&
                       frame->opaque_ref->size == sizeof(PacketMark)
                           ? (PacketMark *)frame->opaque_ref->data : NULL;
    if (!mark || frame->pts != mark->pts || mark->used) {
        ++stats.unassociated_frames;
        return;
    }
    mark->used = true;
    if (mark->candidate)
        ++stats.idr_associated_frames;
    /* Both opaque and exact PTS must agree. Mixed VCL, multiple first slices,
     * field pictures, errors/warnings during parsing or delayed decode all fail
     * closed. Neither I pict_type nor the decoder key flag alone implies IDR.
     */
    if (mark->eligible && mark->sent && mark->epoch == stats.epoch &&
        dimensions && key && frame->pict_type == AV_PICTURE_TYPE_I &&
        !frame->decode_error_flags &&
        !(frame->flags & (AV_FRAME_FLAG_CORRUPT | AV_FRAME_FLAG_DISCARD |
                          AV_FRAME_FLAG_INTERLACED))) {
        available(&c->clean, mark->arrival_ns, c->start_ns);
        if (!stats.stop)
            ++stats.clean_idrs;
    }
}

static int receive_frames(Checker *c)
{
    int result;
    while ((result = avcodec_receive_frame(c->decoder, c->frame)) == 0) {
        inspect_frame(c);
        av_frame_unref(c->frame);
        if (stats.stop)
            return AVERROR_EXIT;
    }
    if (result == AVERROR_EOF) {
        stats.decoder_drained = true;
    } else if (result != AVERROR(EAGAIN)) {
        ++stats.receive_errors;
        ++stats.epoch;
        if (result == AVERROR(ENOMEM)) {
            ++stats.resource_errors;
            stats.stop = true;
        }
    }
    return result;
}

static void send_packet(Checker *c, AVPacket *packet, PacketMark *mark)
{
    int result = avcodec_send_packet(c->decoder, packet);
    if (result == AVERROR(EAGAIN)) {
        uint64_t before = stats.frames;
        (void)receive_frames(c);
        if (stats.stop)
            return;
        if (stats.frames == before) {
            ++stats.send_errors;
            ++stats.epoch;
            stats.stop = true;
            return;
        }
        result = avcodec_send_packet(c->decoder, packet);
    }
    if (result < 0) {
        ++stats.send_errors;
        ++stats.epoch;
        if (result == AVERROR(ENOMEM)) {
            ++stats.resource_errors;
            stats.stop = true;
        }
    } else if (mark) {
        mark->sent = true;
    }
    if (!stats.stop)
        (void)receive_frames(c);
}

static void parsed_packet(Checker *c, const uint8_t *data, int size)
{
    if (size <= 0 || size > PACKET_LIMIT || !data) {
        ++stats.limit_errors;
        ++stats.epoch;
        stats.stop = true;
        return;
    }
    if ((size_t)size > stats.max_packet)
        stats.max_packet = (size_t)size;
    ++stats.packets;
    if (stats.packets > INT64_MAX) {
        ++stats.limit_errors;
        ++stats.epoch;
        stats.stop = true;
        return;
    }
    NalInfo nals = inspect_nals(data, (size_t)size);
    stats.idr_nals += nals.idr_nals;
    if (nals.idr_nals) {
        ++stats.idr_candidates;
        available(&c->candidates, c->arrival_ns, c->start_ns);
    }
    if (nals.invalid) {
        ++stats.annexb_errors;
        ++stats.epoch;
    }
    if (c->parser->width > 0 && c->parser->height > 0 &&
        (c->parser->width != WIDTH || c->parser->height != HEIGHT)) {
        (void)reject_dimensions(c->parser->width, c->parser->height);
        return;
    }
    av_packet_unref(c->packet);
    if (av_new_packet(c->packet, size) < 0 ||
        !(c->packet->opaque_ref = av_buffer_allocz(sizeof(PacketMark)))) {
        ++stats.resource_errors;
        ++stats.epoch;
        stats.stop = true;
        return;
    }
    memcpy(c->packet->data, data, (size_t)size);
    /* These are identity tokens, not media timestamps or a nominal FPS clock. */
    c->packet->pts = (int64_t)stats.packets;
    c->packet->dts = AV_NOPTS_VALUE;
    c->packet->time_base = (AVRational){1, 1};
    PacketMark *mark = (PacketMark *)c->packet->opaque_ref->data;
    *mark = (PacketMark){
        .pts = c->packet->pts, .arrival_ns = c->arrival_ns,
        .epoch = c->parser_epoch, .candidate = nals.idr_nals != 0,
        .eligible = nals.idr_nals && nals.first_idr_slices == 1 &&
                    !nals.other_vcl && !nals.invalid
    };
    send_packet(c, c->packet, mark);
}

static void parse_bytes(Checker *c, const uint8_t *data, int size)
{
    unsigned zero_progress = 0;
    do {
        uint8_t *packet = NULL;
        int packet_size = 0;
        uint64_t before = stats.epoch;
        int used = av_parser_parse2(c->parser, c->decoder, &packet, &packet_size,
                                    data, size, AV_NOPTS_VALUE, AV_NOPTS_VALUE,
                                    c->position);
        if (used < 0 || used > size || packet_size < 0 ||
            (size > 0 && used == 0 && packet_size == 0) ||
            (used == 0 && packet_size > 0 && ++zero_progress > 2)) {
            ++stats.parser_errors;
            ++stats.epoch;
            stats.stop = true;
            return;
        }
        if (used > 0)
            zero_progress = 0;
        c->pending += (size_t)used;
        c->position += used;
        if (c->pending > stats.max_pending)
            stats.max_pending = c->pending;
        if (packet_size > 0) {
            if ((size_t)packet_size > c->pending) {
                ++stats.parser_errors;
                ++stats.epoch;
                stats.stop = true;
                return;
            }
            c->pending -= (size_t)packet_size;
            parsed_packet(c, packet, packet_size);
            /* Include logs from the boundary-discovering call in both adjacent
             * packets; delayed errors can only reduce the clean-IDR count. */
            c->parser_epoch = before;
        }
        if (size == 0 || stats.stop)
            return;
        data += used;
        size -= used;
    } while (size > 0);
}

static void consume(Checker *c)
{
    uint8_t input[READ_BYTES + AV_INPUT_BUFFER_PADDING_SIZE];
    while (!stats.stop) {
        size_t capacity = PACKET_LIMIT - c->pending;
        size_t request = capacity < READ_BYTES ? capacity : READ_BYTES;
        /* At the limit, one byte distinguishes EOF from an oversized AU. */
        ssize_t count = read(STDIN_FILENO, input, request ? request : 1);
        if (count < 0 && errno == EINTR)
            continue;
        c->arrival_ns = now_ns();
        if (stats.stop)
            break;
        if (count < 0) {
            ++stats.input_errors;
            ++stats.epoch;
            stats.stop = true;
            break;
        }
        if (count == 0) {
            stats.input_complete = true;
            parse_bytes(c, NULL, 0);
            if (!stats.stop && c->pending) {
                ++stats.parser_errors;
                ++stats.epoch;
            }
            if (!stats.stop)
                send_packet(c, NULL, NULL);
            break;
        }
        stats.bytes += (uint64_t)count;
        if ((size_t)count > stats.max_read)
            stats.max_read = (size_t)count;
        if (!capacity || stats.bytes > INT64_MAX) {
            ++stats.limit_errors;
            ++stats.epoch;
            stats.stop = true;
            break;
        }
        memset(input + count, 0, AV_INPUT_BUFFER_PADDING_SIZE);
        parse_bytes(c, input, (int)count);
    }
    c->end_ns = now_ns();
    if (!c->end_ns)
        c->end_ns = c->start_ns;
}

static bool setup(Checker *c)
{
    const AVCodec *codec = avcodec_find_decoder_by_name("h264");
    if (!codec || !(c->decoder = avcodec_alloc_context3(codec)) ||
        !(c->parser = av_parser_init(AV_CODEC_ID_H264)) ||
        !(c->packet = av_packet_alloc()) || !(c->frame = av_frame_alloc()))
        return false;
    c->decoder->thread_count = 1;
    c->decoder->thread_type = 0;
    c->decoder->max_pixels = (int64_t)WIDTH * CODED_HEIGHT_LIMIT;
    c->decoder->err_recognition = AV_EF_EXPLODE | AV_EF_BITSTREAM | AV_EF_BUFFER;
    c->decoder->flags |= AV_CODEC_FLAG_COPY_OPAQUE;
    c->decoder->get_buffer2 = bounded_get_buffer;
    c->decoder->get_format = software_format;
    c->decoder->pkt_timebase = (AVRational){1, 1};
    return avcodec_open2(c->decoder, codec, NULL) == 0;
}

static void print_first(const char *name, uint64_t first, uint64_t start)
{
    printf("\"%s\":", name);
    if (first >= start && first)
        printf("%.3f", (double)(first - start) / 1000000.0);
    else
        printf("null");
}

int main(int argc, char **argv)
{
    (void)argv;
    av_log_set_callback(count_log);
    av_log_set_level(AV_LOG_WARNING);
    av_max_alloc(ALLOCATION_LIMIT);
    struct rlimit core = {.rlim_cur = 0, .rlim_max = 0};
    Checker checker = {0};
    checker.start_ns = now_ns();
    checker.end_ns = checker.start_ns;
    if (setrlimit(RLIMIT_CORE, &core) != 0 || argc != 1 || !setup(&checker)) {
        ++stats.setup_errors;
    } else if (!stats.stop) {
        consume(&checker);
    }
    av_frame_free(&checker.frame);
    av_packet_free(&checker.packet);
    if (checker.parser)
        av_parser_close(checker.parser);
    avcodec_free_context(&checker.decoder);

    bool incomplete = stats.setup_errors || stats.input_errors ||
                      stats.clock_errors || stats.resource_errors || stats.limit_errors;
    bool reported_errors = stats.parser_errors || stats.annexb_errors ||
                           stats.send_errors || stats.receive_errors ||
                           stats.error_logs || stats.warning_logs ||
                           stats.dimension_rejections || stats.decode_error_frames ||
                           stats.corrupt_frames;
    int exit_code = incomplete ? 2 :
        (reported_errors || !stats.clean_idrs || !stats.input_complete ||
         !stats.decoder_drained ? 1 : 0);
    printf("{\"status\":\"%s\",\"inputComplete\":%s,\"decoderDrained\":%s,",
           incomplete ? "incomplete" : (exit_code ? "rejected" : "no_reported_errors"),
           stats.input_complete ? "true" : "false",
           stats.decoder_drained ? "true" : "false");
#define COUNT(name, value) printf("\"" name "\":%" PRIu64 ",", (uint64_t)(value))
    COUNT("inputBytes", stats.bytes);
    COUNT("packets", stats.packets);
    COUNT("frames", stats.frames);
    printf("\"width\":%d,\"height\":%d,", stats.width, stats.height);
    COUNT("frames1920x1080", stats.frames_1080p);
    COUNT("keyframes", stats.keyframes);
    COUNT("iFrames", stats.i_frames);
    COUNT("pFrames", stats.p_frames);
    COUNT("bFrames", stats.b_frames);
    COUNT("decodeErrorFrames", stats.decode_error_frames);
    COUNT("decodeErrorFlagsOr", stats.decode_error_flags);
    COUNT("corruptFrames", stats.corrupt_frames);
    COUNT("unassociatedFrames", stats.unassociated_frames);
    COUNT("idrNals", stats.idr_nals);
    COUNT("idrCandidatePackets", stats.idr_candidates);
    COUNT("idrAssociatedFrames", stats.idr_associated_frames);
    COUNT("cleanIdrFrames", stats.clean_idrs);
    COUNT("parserErrors", stats.parser_errors);
    COUNT("annexBErrors", stats.annexb_errors);
    COUNT("sendErrors", stats.send_errors);
    COUNT("receiveErrors", stats.receive_errors);
    COUNT("errorLogCount", stats.error_logs);
    COUNT("warningLogCount", stats.warning_logs);
    COUNT("dimensionRejections", stats.dimension_rejections);
    printf("\"rejectedWidth\":%d,\"rejectedHeight\":%d,",
           stats.rejected_width, stats.rejected_height);
    COUNT("limitErrors", stats.limit_errors);
    COUNT("setupErrors", stats.setup_errors);
    COUNT("inputErrors", stats.input_errors);
    COUNT("clockErrors", stats.clock_errors);
    COUNT("resourceErrors", stats.resource_errors);
    COUNT("maxPacketBytes", stats.max_packet);
    COUNT("maxParserPendingBytes", stats.max_pending);
    COUNT("maxReadBytes", stats.max_read);
#undef COUNT
    printf("\"arrivalClock\":\"monotonic_stdin_parser_availability\","
           "\"durationMs\":%.3f,", (double)(checker.end_ns - checker.start_ns) / 1000000.0);
    print_first("firstIdrCandidateArrivalMs", checker.candidates.first, checker.start_ns);
    printf(",");
    print_first("firstCleanIdrArrivalMs", checker.clean.first, checker.start_ns);
    printf(",\"maxIdrCandidateGapMs\":%.3f,\"maxCleanIdrGapMs\":%.3f,"
           "\"gapsIncludeStartAndEnd\":true,\"pixelIntegrityCertified\":false,"
           "\"pFrameIntegrityCertified\":false}\n",
           (double)final_gap(&checker.candidates, &checker) / 1000000.0,
           (double)final_gap(&checker.clean, &checker) / 1000000.0);
    return exit_code;
}
