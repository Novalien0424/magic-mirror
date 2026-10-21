/* Focused RAM-only checks for conservative association and damage reporting.
 * Real decoding/fragmentation is checked separately with an ffmpeg stdout pipe.
 */
#include <assert.h>

#define main checker_main
#include "ram-h264-check.c"
#undef main

static Checker frame_fixture(void)
{
    memset(&stats, 0, sizeof(stats));
    Checker c = {.start_ns = UINT64_C(1000000000)};
    c.frame = av_frame_alloc();
    assert(c.frame);
    c.frame->width = WIDTH;
    c.frame->height = HEIGHT;
    c.frame->pts = 17;
    c.frame->flags = AV_FRAME_FLAG_KEY;
    c.frame->pict_type = AV_PICTURE_TYPE_I;
    c.frame->opaque_ref = av_buffer_allocz(sizeof(PacketMark));
    assert(c.frame->opaque_ref);
    PacketMark *mark = (PacketMark *)c.frame->opaque_ref->data;
    *mark = (PacketMark){.pts = 17, .arrival_ns = UINT64_C(1100000000),
                         .candidate = true, .eligible = true, .sent = true};
    return c;
}

int main(void)
{
    av_log_set_callback(count_log);
    av_log_set_level(AV_LOG_WARNING);
    av_max_alloc(ALLOCATION_LIMIT);
    struct rlimit core = {.rlim_cur = 0, .rlim_max = 0};
    assert(setrlimit(RLIMIT_CORE, &core) == 0);
    unsigned tests = 0;

    for (unsigned scenario = 0; scenario < 13; ++scenario) {
        Checker c = frame_fixture();
        PacketMark *mark = (PacketMark *)c.frame->opaque_ref->data;
        switch (scenario) {
        case 0: break; /* fully associated, unflagged IDR */
        case 1: ++c.frame->pts; break;
        case 2: av_buffer_unref(&c.frame->opaque_ref); break;
        case 3: mark->sent = false; break;
        case 4: ++stats.epoch; break;
        case 5:
            c.frame->decode_error_flags = FF_DECODE_ERROR_INVALID_BITSTREAM |
                                          FF_DECODE_ERROR_CONCEALMENT_ACTIVE;
            break;
        case 6: c.frame->flags |= AV_FRAME_FLAG_CORRUPT; break;
        case 7: c.frame->pict_type = AV_PICTURE_TYPE_P; break;
        case 8: mark->candidate = false; mark->eligible = false; break;
        case 9: c.frame->flags |= AV_FRAME_FLAG_INTERLACED; break;
        case 10: c.frame->flags |= AV_FRAME_FLAG_DISCARD; break;
        case 11: c.frame->width = 1280; break;
        case 12: mark->used = true; break;
        }
        inspect_frame(&c);
        assert(stats.frames == 1);
        assert(stats.clean_idrs == (scenario == 0 ? 1 : 0));
        if (scenario == 0) {
            assert(c.clean.first == UINT64_C(1100000000));
            assert(c.clean.max_gap == UINT64_C(100000000));
            inspect_frame(&c);
            assert(stats.clean_idrs == 1 && stats.unassociated_frames == 1);
        }
        if (scenario == 1 || scenario == 2 || scenario == 12)
            assert(stats.unassociated_frames == 1);
        if (scenario == 5) {
            assert(stats.decode_error_frames == 1);
            assert(stats.decode_error_flags ==
                   (FF_DECODE_ERROR_INVALID_BITSTREAM | FF_DECODE_ERROR_CONCEALMENT_ACTIVE));
        }
        if (scenario == 6)
            assert(stats.corrupt_frames == 1);
        if (scenario == 7)
            assert(stats.keyframes == 1 && stats.p_frames == 1);
        if (scenario == 8)
            assert(stats.keyframes == 1 && stats.i_frames == 1 && !stats.idr_associated_frames);
        if (scenario == 11)
            assert(stats.dimension_rejections == 1 && stats.frames_1080p == 0);
        av_frame_free(&c.frame);
        ++tests;
    }

    const uint8_t mixed[] = {0, 0, 0, 1, 0x65, 0x80, 0x80,
                             0, 0, 1, 0x41, 0x80, 0x80};
    NalInfo info = inspect_nals(mixed, sizeof(mixed));
    assert(info.idr_nals == 1 && info.first_idr_slices == 1 && info.other_vcl);
    ++tests;
    const uint8_t non_idr_i[] = {0, 0, 1, 0x41, 0x88, 0x80};
    info = inspect_nals(non_idr_i, sizeof(non_idr_i));
    assert(!info.idr_nals && info.other_vcl && !info.invalid);
    ++tests;
    const uint8_t ambiguous[] = {0, 0, 1, 0x65, 0x80, 0x80,
                                 0, 0, 0, 1, 0x65, 0x80, 0x80};
    info = inspect_nals(ambiguous, sizeof(ambiguous));
    assert(info.idr_nals == 2 && info.first_idr_slices == 2);
    ++tests;
    const uint8_t invalid[] = {0, 0, 1, 0xe5, 0x80};
    info = inspect_nals(invalid, sizeof(invalid));
    assert(info.invalid);
    ++tests;

    memset(&stats, 0, sizeof(stats));
    av_log(NULL, AV_LOG_ERROR, "suppressed synthetic error\n");
    av_log(NULL, AV_LOG_WARNING, "suppressed synthetic warning\n");
    assert(stats.error_logs == 1 && stats.warning_logs == 1 && stats.epoch == 2);
    ++tests;

    Checker c = {.start_ns = 100, .end_ns = 1000};
    Availability a = {0};
    assert(final_gap(&a, &c) == 900); /* no candidates: full observation gap */
    available(&a, 200, c.start_ns);
    available(&a, 400, c.start_ns);
    assert(final_gap(&a, &c) == 600); /* include the trailing gap */
    ++tests;
    printf("{\"unitTests\":%u,\"passed\":true}\n", tests);
    return 0;
}
