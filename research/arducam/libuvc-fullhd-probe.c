// Isolated diagnostic against upstream libuvc; no image/file output.
// Caller owns the Electron lease, verifies Jabra, and enforces a deadline.
#include <libuvc/libuvc.h>
#include <libusb.h>
#include <CoreGraphics/CoreGraphics.h>
#include <ImageIO/ImageIO.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <unistd.h>
#include <sys/resource.h>
#include <pthread.h>
#include "ram-video-codec.h"
#include <turbojpeg.h>
#include <fcntl.h>
#include <poll.h>
#include <errno.h>
#include <pthread/qos.h>
#include "jpeg-prefix.h"

static volatile sig_atomic_t stopped;
static int retry_enabled, retried_count;
static int burst;
static int burst_seconds = 3;
static int reserve_max_payload, compression_quality;
static uint32_t sonix_bitrate_request, sonix_bitrate_original;
static int sonix_restore_needed, sonix_h264;
static unsigned sonix_gop_request, sonix_gop_original;
static int sonix_gop_restore_needed;
static unsigned sonix_mode_request, sonix_mode_original;
static int sonix_mode_restore_needed;
static unsigned sonix_qp_request, sonix_qp_original;
static int sonix_qp_restore_needed;
static int priority_requested;
void mm_usb_thread_qos(void) {
    if (priority_requested) (void)pthread_set_qos_class_self_np(QOS_CLASS_USER_INTERACTIVE,0);
}
static unsigned jpeg_dri_frames, jpeg_restart_frames, jpeg_dqt_min, jpeg_dqt_max;
typedef struct { uint32_t sequence; size_t first_gap, bytes; unsigned gaps; int occupied, closed; } FrameLoss;
static FrameLoss loss_ring[64];
static pthread_mutex_t loss_lock = PTHREAD_MUTEX_INITIALIZER;
static unsigned loss_mapped, loss_missing, loss_free, loss_bins[10];
static unsigned prefix_frames, prefix_row_bins[10], prefix_rows_max, prefix_last8_candidates;
static uint32_t previous_frame_pts;
static unsigned frame_pts_count, frame_pts_zero, frame_pts_duplicates, frame_pts_regressions;
void mm_uvc_note_gap(uint32_t sequence, size_t offset) {
    pthread_mutex_lock(&loss_lock);
    FrameLoss *m = &loss_ring[sequence % 64];
    if (!m->occupied || m->sequence != sequence) *m = (FrameLoss){.sequence=sequence,.occupied=1};
    if (!m->gaps || offset < m->first_gap) m->first_gap = offset;
    m->gaps++;
    pthread_mutex_unlock(&loss_lock);
}
void mm_uvc_frame_info(uint32_t sequence, size_t bytes, uint32_t pts) {
    pthread_mutex_lock(&loss_lock);
    FrameLoss *m = &loss_ring[sequence % 64];
    if (!m->occupied || m->sequence != sequence) *m = (FrameLoss){.sequence=sequence,.occupied=1};
    m->closed = 1; m->bytes = bytes;
    if (frame_pts_count) {
        int32_t step=(int32_t)(pts-previous_frame_pts);
        frame_pts_duplicates+=step==0; frame_pts_regressions+=step<0;
    }
    previous_frame_pts=pts; frame_pts_count++; frame_pts_zero+=pts==0;
    pthread_mutex_unlock(&loss_lock);
}
static FrameLoss frame_loss(const uvc_frame_t *frame) {
    pthread_mutex_lock(&loss_lock);
    FrameLoss result = loss_ring[frame->sequence % 64];
    pthread_mutex_unlock(&loss_lock);
    if (!result.occupied || !result.closed || result.sequence != frame->sequence || result.bytes != frame->data_bytes) {
        loss_missing++; return (FrameLoss){0};
    }
    loss_mapped++;
    if (!result.gaps) loss_free++;
    else {
        unsigned bin = result.bytes ? (unsigned)(result.first_gap*10/result.bytes) : 0;
        loss_bins[bin < 10 ? bin : 9]++;
    }
    return result;
}
static int run_seconds = 35;
static int force_control34;
static int encode_video;
static RamVideoCodec *video_codec;
static double frame_relative_seconds;
static int strict_jpeg;
static tjhandle strict_decoder;
static unsigned char *strict_pixels;
static unsigned imageio_valid, strict_valid, strict_warnings, strict_errors, strict_dimensions;
static unsigned strict_warning_kinds[6];
static int h264_pipe, binary_fd = -1;
static unsigned h264_pipe_frames, h264_pipe_failures;
static unsigned long long backend_error_calls, backend_good_packets, backend_bad_packets, backend_good_bytes;
void mm_libusb_iso_error(unsigned aggregate, unsigned good, unsigned bad, unsigned bytes) {
    (void)aggregate; backend_error_calls++; backend_good_packets += good; backend_bad_packets += bad; backend_good_bytes += bytes;
}
unsigned mm_uvc_control_length(unsigned suggested) { return force_control34 && suggested == 26 ? 34 : suggested; }
static double requested_at, first_valid;
static const void *retried[20];
int mm_uvc_retry_error(const void *transfer) {
    if (!retry_enabled || retried_count >= 20) return 0;
    for (int i = 0; i < retried_count; ++i) if (retried[i] == transfer) return 0;
    retried[retried_count++] = transfer;
    return 1;
}
static unsigned int io_error_codes[16], io_error_counts[16];
static pthread_mutex_t log_lock = PTHREAD_MUTEX_INITIALIZER;
static void usb_log(libusb_context *ctx, enum libusb_log_level level, const char *message) {
    (void)ctx; (void)level;
    const char *match = strstr(message, "(value = 0x");
    unsigned int value;
    if (!match || sscanf(match, "(value = 0x%x)", &value) != 1) return;
    pthread_mutex_lock(&log_lock);
    for (int i = 0; i < 16; i++) if (!io_error_counts[i] || io_error_codes[i] == value) {
        io_error_codes[i] = value; io_error_counts[i]++; break;
    }
    pthread_mutex_unlock(&log_lock);
}
static unsigned long long transfers[7], packets[7], empty, invalid, clockshort, errorbit, noend, eof, fidchange, bodies;
static int previous_fid = -1;
static double first_fid_time, last_fid_time, min_fid_gap, max_fid_gap;
static unsigned jpeg_soi, jpeg_eoi, jpeg_contains_eoi;
static unsigned jpeg_complete_prefixes, jpeg_trailer_max;
static unsigned primary_restart_markers;
static double now(void);
void mm_uvc_observe_transfer(int status) { if (status >= 0 && status < 7) transfers[status]++; }
void mm_uvc_observe_packet(int status, const unsigned char *b, size_t length, size_t capacity) {
    if (status >= 0 && status < 7) packets[status]++;
    if (status) return;
    if (!length) { empty++; return; }
    if (length > capacity || length < 2 || !b || b[0] < 2 || b[0] > length) { invalid++; return; }
    if (b[0] < 2 + ((b[1]&4) ? 4 : 0) + ((b[1]&8) ? 6 : 0)) { clockshort++; return; }
    if (b[1]&64) errorbit++;
    if (!(b[1]&128)) noend++;
    if (b[1]&2) eof++;
    int fid = b[1]&1;
    if (previous_fid >= 0 && fid != previous_fid) {
        double stamp = now(); fidchange++;
        if (!first_fid_time) first_fid_time = stamp;
        if (last_fid_time) {
            double gap = stamp - last_fid_time;
            if (!min_fid_gap || gap < min_fid_gap) min_fid_gap = gap;
            if (gap > max_fid_gap) max_fid_gap = gap;
        }
        last_fid_time = stamp;
    }
    previous_fid = fid;
    bodies += length - b[0];
}
static void print_transport(void) {
    printf("{\"event\":\"source_pts\",\"frames\":%u,\"zeroValues\":%u,\"duplicates\":%u,\"regressions\":%u}\n",frame_pts_count,frame_pts_zero,frame_pts_duplicates,frame_pts_regressions);
    printf("{\"event\":\"backend_error_details\",\"notSentTransfers\":%llu,\"goodPackets\":%llu,\"badPackets\":%llu,\"goodBytes\":%llu}\n", backend_error_calls, backend_good_packets, backend_bad_packets, backend_good_bytes); fflush(stdout);
    printf("{\"event\":\"transport\",\"transferStatusCounts\":[%llu,%llu,%llu,%llu,%llu,%llu,%llu],\"packetStatusCounts\":[%llu,%llu,%llu,%llu,%llu,%llu,%llu],\"emptyPayloads\":%llu,\"invalidHeaders\":%llu,\"truncatedClockHeaders\":%llu,\"deviceErrorHeaders\":%llu,\"missingEndHeader\":%llu,\"eof\":%llu,\"fidChanges\":%llu,\"bodyBytes\":%llu}\n",
        transfers[0],transfers[1],transfers[2],transfers[3],transfers[4],transfers[5],transfers[6],
        packets[0],packets[1],packets[2],packets[3],packets[4],packets[5],packets[6],
        empty,invalid,clockshort,errorbit,noend,eof,fidchange,bodies); fflush(stdout);
    for (int i = 0; i < 16; i++) if (io_error_counts[i])
        printf("{\"event\":\"iokit_error\",\"code\":%u,\"count\":%u}\n", io_error_codes[i], io_error_counts[i]);
    fflush(stdout);
    printf("{\"event\":\"fid_timing\",\"transitions\":%llu,\"spanSeconds\":%.6f,\"minGapSeconds\":%.6f,\"maxGapSeconds\":%.6f}\n", fidchange, last_fid_time-first_fid_time, min_fid_gap, max_fid_gap); fflush(stdout);
    printf("{\"event\":\"jpeg_framing\",\"startsSoi\":%u,\"endsEoi\":%u,\"containsEoi\":%u}\n", jpeg_soi, jpeg_eoi, jpeg_contains_eoi); fflush(stdout);
    printf("{\"event\":\"jpeg_prefix\",\"completePrefixes\":%u,\"maximumTrailerBytes\":%u}\n", jpeg_complete_prefixes, jpeg_trailer_max); fflush(stdout);
}
static void stop(int sig) { (void)sig; stopped = 1; }
static double now(void) {
    struct timespec t; clock_gettime(CLOCK_MONOTONIC, &t);
    return t.tv_sec + t.tv_nsec / 1e9;
}
static void event(const char *key, int value) {
    printf("{\"event\":\"%s\",\"result\":%d}\n", key, value); fflush(stdout);
}
// Fixed volatile Sonix MJPEG bitrate operation. Primary implementation:
// https://github.com/Kurokesu/C1_SONIX_Test_AP/blob/master/sonix_xu_ctrls.c
// No flash commands or arbitrary register writes are exposed.
static int sonix_control(libusb_device_handle *usb, int request, unsigned unit, unsigned selector, unsigned char *data, unsigned size) {
    return libusb_control_transfer(usb,request==1?0x21:0xa1,(uint8_t)request,(uint16_t)(selector<<8),(uint16_t)(unit<<8),data,(uint16_t)size,1000)==(int)size;
}
static int sonix_bitrate(libusb_device_handle *usb, uint32_t *value, int write_value) {
    unsigned char data[11] = {0x9a,sonix_h264?2:1};
    unsigned selector=sonix_h264?2:3, bytes=sonix_h264?3:4;
    if (!sonix_control(usb,1,4,selector,data,11)) return 0;
    memset(data,0,sizeof(data));
    if (write_value) for (unsigned i=0;i<bytes;++i) data[i]=(unsigned char)(*value>>((bytes-1-i)*8));
    if (!sonix_control(usb,write_value?1:0x81,4,selector,data,11)) return 0;
    if (!write_value) { *value=0; for (unsigned i=0;i<bytes;++i) *value=(*value<<8)|data[i]; }
    return 1;
}
static int sonix_validate(libusb_device_handle *usb) {
    const unsigned char guids[2][16] = {{0x70,0x33,0xf0,0x28,0x11,0x63,0x2e,0x4a,0xba,0x2c,0x68,0x90,0xeb,0x33,0x40,0x16},
        {0x94,0x73,0xdf,0xdd,0x3e,0x97,0x27,0x47,0xbe,0xd9,0x04,0xed,0x64,0x26,0xdc,0x67}};
    unsigned char descriptor[8192], data[4]; unsigned found=0;
    int n=libusb_control_transfer(usb,0x80,6,0x0200,0,descriptor,sizeof(descriptor),1000);
    for (int i=0;i+2<=n && descriptor[i]>=2 && i+descriptor[i]<=n;i+=descriptor[i])
        if (descriptor[i+1]==0x24 && descriptor[i]>=24 && descriptor[i+2]==6)
            for (unsigned g=0;g<2;++g) if (descriptor[i+3]==g+3 && !memcmp(descriptor+i+4,guids[g],16)) found|=1u<<g;
    if (found!=3) return 0;
    if (!sonix_control(usb,0x85,3,1,data,2) || data[0]!=4 || data[1]) return 0;
    if (!sonix_control(usb,0x85,4,sonix_h264?2:3,data,2) || data[0]!=11 || data[1]) return 0;
    if (!sonix_control(usb,0x86,4,sonix_h264?2:3,data,1) || (data[0]&3)!=3) return 0;
    // Documented ASIC read selectors: 0xff requests READ; no register is written.
    memcpy(data,(unsigned char[]){0x1f,0x10,0,0xff},4);
    if (!sonix_control(usb,1,3,1,data,4) || !sonix_control(usb,0x81,3,1,data,4) || data[2]!=0x92) return 0;
    memcpy(data,(unsigned char[]){0x07,0x16,0,0xff},4);
    if (!sonix_control(usb,1,3,1,data,4) || !sonix_control(usb,0x81,3,1,data,4) || data[2]!=0) return 0;
    return 1;
}
static int sonix_gop(libusb_device_handle *usb, unsigned *value, int write_value) {
    unsigned char data[11]={0x9a,3};
    if (!sonix_control(usb,1,4,2,data,11)) return 0;
    memset(data,0,sizeof(data));
    if (write_value) { data[0]=(unsigned char)*value; data[1]=(unsigned char)(*value>>8); }
    if (!sonix_control(usb,write_value?1:0x81,4,2,data,11)) return 0;
    if (!write_value) *value=data[0]+((unsigned)data[1]<<8);
    return 1;
}
static int sonix_scalar(libusb_device_handle *usb, unsigned subcommand, unsigned *value, int write_value) {
    unsigned char data[11]={0x9a,(unsigned char)subcommand};
    if (!sonix_control(usb,1,4,2,data,11)) return 0;
    memset(data,0,sizeof(data));
    if (write_value) data[0]=(unsigned char)*value;
    if (!sonix_control(usb,write_value?1:0x81,4,2,data,11)) return 0;
    if (!write_value) *value=data[0];
    return 1;
}
// Locate the primary JPEG EOI, skipping length-delimited metadata (which may
// contain thumbnail EOIs), stuffed entropy bytes and restart markers. Camera
// padding after a complete JPEG is not part of the image sent to the decoder.
static size_t jpeg_extent(const unsigned char *b, size_t n) {
    primary_restart_markers = 0;
    if (n < 4 || b[0] != 255 || b[1] != 216) return 0;
    size_t pos = 2;
    int entropy = 0;
    while (pos < n) {
        if (entropy) {
            while (pos < n) {
                if (b[pos] != 255) { pos++; continue; }
                size_t marker = pos++;
                while (pos < n && b[pos] == 255) pos++;
                if (pos == n) return 0;
                if (!b[pos]) { pos++; continue; }
                if (b[pos] >= 208 && b[pos] <= 215) { primary_restart_markers++; pos++; continue; }
                pos = marker; entropy = 0; break;
            }
        }
        if (pos >= n || b[pos++] != 255) return 0;
        while (pos < n && b[pos] == 255) pos++;
        if (pos == n) return 0;
        unsigned marker = b[pos++];
        if (marker == 217) return pos;
        if (!marker || marker == 216 || (marker >= 208 && marker <= 215)) return 0;
        if (marker == 1) continue;
        if (n - pos < 2) return 0;
        size_t length = (size_t)b[pos] * 256 + b[pos+1];
        if (length < 2 || length > n-pos) return 0;
        pos += length;
        entropy = marker == 218;
    }
    return 0;
}
static int decode_fullhd(const uvc_frame_t *f) {
    FrameLoss loss = frame_loss(f);
    if (f->data_bytes < 4 || f->data_bytes > 8 * 1024 * 1024) return 0;
    const unsigned char *b = f->data;
    jpeg_soi += b[0] == 255 && b[1] == 216;
    jpeg_eoi += b[f->data_bytes-2] == 255 && b[f->data_bytes-1] == 217;
    for (size_t i = 1; i < f->data_bytes; ++i) if (b[i-1] == 255 && b[i] == 217) { jpeg_contains_eoi++; break; }
    size_t extent = jpeg_extent(b, f->data_bytes);
    if (!extent) return 0;
    if (strict_jpeg && loss.occupied && loss.gaps && loss.first_gap < extent) {
        unsigned rows = jpeg_prefix_rows(b,loss.first_gap);
        prefix_frames++;
        unsigned bin = rows*10/1080;
        prefix_row_bins[bin < 10 ? bin : 9]++;
        if (rows > prefix_rows_max) prefix_rows_max = rows;
        prefix_last8_candidates += rows >= 1072;
    }
    // Header/marker metadata only: no compressed image bytes are logged.
    unsigned dri = 0, restarts = primary_restart_markers, quant = 0;
    for (size_t at = 2; at + 3 < extent;) {
        if (b[at++] != 255) break;
        unsigned marker = b[at++];
        if (marker == 218 || marker == 217) break;
        size_t size = (size_t)b[at]*256+b[at+1];
        if (size < 2 || size > extent-at) break;
        if (marker == 221 && size == 4) dri = (unsigned)b[at+2]*256+b[at+3];
        if (marker == 219) for (size_t q = at+2; q < at+size;) {
            unsigned precision = b[q++] >> 4;
            if (precision > 1 || (at+size-q) < 64*(precision+1)) break;
            for (unsigned k = 0; k < 64; ++k) {
                unsigned value = b[q++];
                if (precision) value = value*256+b[q++];
                quant += value;
            }
        }
        at += size;
    }
    jpeg_dri_frames += dri != 0; jpeg_restart_frames += restarts != 0;
    if (!jpeg_dqt_min || quant < jpeg_dqt_min) jpeg_dqt_min = quant;
    if (quant > jpeg_dqt_max) jpeg_dqt_max = quant;
    jpeg_complete_prefixes++;
    if (f->data_bytes - extent > jpeg_trailer_max) jpeg_trailer_max = (unsigned)(f->data_bytes - extent);
    CFDataRef data = CFDataCreateWithBytesNoCopy(NULL, b, (CFIndex)extent, kCFAllocatorNull);
    if (!data) return 0;
    CGImageSourceRef source = CGImageSourceCreateWithData(data, NULL);
    CGImageRef image = source ? CGImageSourceCreateImageAtIndex(source, 0, NULL) : NULL;
    int valid = image && CGImageGetWidth(image) == 1920 && CGImageGetHeight(image) == 1080;
    if (valid) {
        CGColorSpaceRef space = CGColorSpaceCreateDeviceRGB();
        CGContextRef bitmap = CGBitmapContextCreate(NULL, 1920, 1080, 8, 1920 * 4, space, kCGImageAlphaNoneSkipLast);
        if (bitmap) { CGContextDrawImage(bitmap, CGRectMake(0, 0, 1920, 1080), image); CGContextRelease(bitmap); }
        else valid = 0;
        CGColorSpaceRelease(space);
        valid = valid && CGImageSourceGetStatusAtIndex(source, 0) == kCGImageStatusComplete;
        if (valid) imageio_valid++;
        if (valid && strict_jpeg) {
            int failed = tj3DecompressHeader(strict_decoder, b, extent);
            if (!failed && (tj3Get(strict_decoder, TJPARAM_JPEGWIDTH) != 1920 ||
                            tj3Get(strict_decoder, TJPARAM_JPEGHEIGHT) != 1080)) {
                strict_dimensions++; valid = 0;
            } else {
                if (!failed) failed = tj3Decompress8(strict_decoder, b, extent, strict_pixels, 1920*3, TJPF_RGB);
                if (failed) {
                    if (tj3GetErrorCode(strict_decoder) == TJERR_WARNING) {
                        strict_warnings++;
                        const char *message = tj3GetErrorStr(strict_decoder);
                        unsigned kind = strstr(message, "premature end of data segment") ? 0 :
                            strstr(message, "bad Huffman code") ? 1 :
                            strstr(message, "extraneous bytes before marker") ? 2 :
                            strstr(message, "Premature end of JPEG file") ? 3 :
                            strstr(message, "Invalid SOS parameters") ? 4 : 5;
                        strict_warning_kinds[kind]++;
                    }
                    else strict_errors++;
                    valid = 0;
                } else strict_valid++;
            }
        }
        if (valid && video_codec && frame_relative_seconds >= 0 && frame_relative_seconds < 30)
            (void)ram_video_codec_submit(video_codec, image, frame_relative_seconds);
    }
    if (image) CGImageRelease(image);
    if (source) CFRelease(source);
    CFRelease(data);
    return valid;
}
int main(int argc, char **argv) {
    if (argc < 3 || argc > 8 || geteuid() != 0) return 2;
    int fps = atoi(argv[2]), clamp = 0;
    for (int i = 3; i < argc; ++i) {
        if (!strcmp(argv[i], "--clamp-payload")) clamp = 1;
        else if (!strcmp(argv[i], "--retry-once")) retry_enabled = 1;
        else if (!strcmp(argv[i], "--burst")) burst = 1;
        else if (!strcmp(argv[i], "--burst5")) { burst = 1; burst_seconds = 5; }
        else if (!strcmp(argv[i], "--reserve-max-payload")) reserve_max_payload = 1;
        else if (!strcmp(argv[i], "--quality5000")) compression_quality = 5000;
        else if (!strcmp(argv[i], "--quality100")) compression_quality = 100;
        else if (!strcmp(argv[i], "--priority")) priority_requested = 1;
        else if (!strcmp(argv[i], "--sonix-mjpeg8m")) sonix_bitrate_request = 8000000;
        else if (!strcmp(argv[i], "--sonix-mjpeg4m")) sonix_bitrate_request = 4000000;
        else if (!strcmp(argv[i], "--sonix-h2641m")) { sonix_bitrate_request = 1000000; sonix_h264=1; }
        else if (!strcmp(argv[i], "--sonix-gop1")) sonix_gop_request=1;
        else if (!strcmp(argv[i], "--sonix-gop5")) sonix_gop_request=5;
        else if (!strcmp(argv[i], "--sonix-vbr")) sonix_mode_request=2;
        else if (!strcmp(argv[i], "--sonix-vbr-qp35")) { sonix_mode_request=2; sonix_qp_request=35; }
        else if (!strcmp(argv[i], "--control34")) force_control34 = 1;
        else if (!strcmp(argv[i], "--stable")) run_seconds = 305;
        else if (!strcmp(argv[i], "--encode")) encode_video = 1;
        else if (!strcmp(argv[i], "--strict-jpeg")) strict_jpeg = 1;
        else if (!strcmp(argv[i], "--h264-pipe")) h264_pipe = 1;
        else return 2;
    }
    enum uvc_frame_format format = !strcmp(argv[1], "mjpeg") ? UVC_FRAME_FORMAT_MJPEG :
        !strcmp(argv[1], "yuy2") ? UVC_FRAME_FORMAT_YUYV : !strcmp(argv[1], "h264") ? UVC_FRAME_FORMAT_H264 : UVC_FRAME_FORMAT_UNKNOWN;
    if (!format || (fps != 1 && fps != 2 && fps != 5 && fps != 10 && fps != 15 && fps != 20 && fps != 25 && fps != 30) || (burst && run_seconds != 35)) return 2;
    if (encode_video && (format != UVC_FRAME_FORMAT_MJPEG || burst || run_seconds != 35)) return 2;
    if (strict_jpeg && format != UVC_FRAME_FORMAT_MJPEG) return 2;
    if ((reserve_max_payload || compression_quality) && format != UVC_FRAME_FORMAT_MJPEG) return 2;
    if (sonix_bitrate_request && format != (sonix_h264 ? UVC_FRAME_FORMAT_H264 : UVC_FRAME_FORMAT_MJPEG)) return 2;
    if (sonix_gop_request && (!sonix_h264 || !sonix_bitrate_request)) return 2;
    if (sonix_mode_request && (!sonix_h264 || !sonix_bitrate_request)) return 2;
    if (h264_pipe && (format != UVC_FRAME_FORMAT_H264 || (burst && burst_seconds != 5) || encode_video || strict_jpeg || run_seconds != 35)) return 2;
    requested_at = now();
    struct rlimit no_core = {0, 0};
    if (setrlimit(RLIMIT_CORE, &no_core)) return 2;
    if (h264_pipe) {
        // Only the guarded caller may use this mode: compressed images travel
        // directly into an unprivileged decoder pipe; JSON moves to stderr.
        binary_fd = dup(STDOUT_FILENO);
        if (binary_fd < 0 || dup2(STDERR_FILENO, STDOUT_FILENO) < 0 ||
            fcntl(binary_fd, F_SETFL, O_NONBLOCK) < 0) return 2;
        signal(SIGPIPE, SIG_IGN);
    }
    event("control_length_override", force_control34 ? 34 : 0);
    if (priority_requested) {
        int q = pthread_set_qos_class_self_np(QOS_CLASS_USER_INTERACTIVE,0);
        int p = setpriority(PRIO_PROCESS,0,-10);
        printf("{\"event\":\"process_priority\",\"qosStatus\":%d,\"niceStatus\":%d,\"niceReadback\":%d}\n",q,p,getpriority(PRIO_PROCESS,0));
        if (q || p) return 2;
    }
    signal(SIGINT, stop); signal(SIGTERM, stop);
    libusb_set_log_cb(NULL, usb_log, LIBUSB_LOG_CB_GLOBAL);
    libusb_set_option(NULL, LIBUSB_OPTION_LOG_LEVEL, LIBUSB_LOG_LEVEL_WARNING);
    uvc_context_t *ctx = NULL; uvc_device_t **devices = NULL, *selected = NULL;
    uvc_device_handle_t *handle = NULL; uvc_stream_handle_t *stream = NULL;
    int rc = uvc_init(&ctx, NULL), count = 0, started = 0, success = 0;
    event("init", rc); if (rc) goto cleanup;
    if (strict_jpeg) {
        strict_decoder = tj3Init(TJINIT_DECOMPRESS);
        strict_pixels = malloc(1920*1080*3);
        if (!strict_decoder || !strict_pixels || tj3Set(strict_decoder, TJPARAM_STOPONWARNING, 1) ||
            tj3Set(strict_decoder, TJPARAM_MAXMEMORY, 32) || tj3Set(strict_decoder, TJPARAM_MAXPIXELS, 1920*1080)) goto cleanup;
    }
    if (encode_video) {
        RamVideoCodecStats initial;
        video_codec = ram_video_codec_create(&initial);
        if (!video_codec) { ram_video_codec_print_stats(&initial); goto cleanup; }
    }
    rc = uvc_get_device_list(ctx, &devices); event("enumerate", rc); if (rc) goto cleanup;
    for (int i = 0; devices[i]; ++i) {
        uvc_device_descriptor_t *d = NULL;
        if (!uvc_get_device_descriptor(devices[i], &d)) {
            if (d->idVendor == 0x0c45 && d->idProduct == 0x0520) { count++; selected = devices[i]; }
            uvc_free_device_descriptor(d);
        }
    }
    event("matching_devices", count); if (count != 1 || stopped) goto cleanup;
    rc = uvc_open(selected, &handle); event("open", rc); if (rc || stopped) goto cleanup;
    uvc_stream_ctrl_t ctrl = {0};
    rc = uvc_get_stream_ctrl_format_size(handle, &ctrl, format, 1920, 1080, fps < 5 ? 5 : fps);
    if (!rc && fps < 5) {
        ctrl.bmHint |= 1;
        ctrl.dwFrameInterval = 10000000 / fps;
        rc = uvc_probe_stream_ctrl(handle, &ctrl);
        event("direct_interval_requested_fps", fps);
    }
    if (!rc && compression_quality) {
        ctrl.bmHint |= 8;
        ctrl.wCompQuality = (uint16_t)compression_quality;
        rc = uvc_probe_stream_ctrl(handle, &ctrl);
        printf("{\"event\":\"compression_quality\",\"requested\":%d,\"readback\":%u,\"hint\":%u,\"result\":%d}\n",compression_quality,ctrl.wCompQuality,ctrl.bmHint,rc);
    }
    printf("{\"event\":\"probe\",\"result\":%d,\"interface\":%u,\"format\":%u,\"frame\":%u,\"interval100ns\":%u,\"maxFrameBytes\":%u,\"maxPayloadBytes\":%u}\n",
        rc, ctrl.bInterfaceNumber, ctrl.bFormatIndex, ctrl.bFrameIndex, ctrl.dwFrameInterval, ctrl.dwMaxVideoFrameSize, ctrl.dwMaxPayloadTransferSize); fflush(stdout);
    if (rc || stopped) goto cleanup;
    if (reserve_max_payload) {
        // Exact-device descriptor maximum, used only to test larger isochronous
        // reservation while preserving full-HD source format and frame interval.
        if (ctrl.bInterfaceNumber != 1 || ctrl.dwMaxPayloadTransferSize > 3072) goto cleanup;
        ctrl.dwMaxPayloadTransferSize = 3072;
        event("larger_payload_reservation",3072);
    }
    if (clamp) {
        if (ctrl.bInterfaceNumber != 1) goto cleanup;
        if (ctrl.dwMaxPayloadTransferSize > 3072) ctrl.dwMaxPayloadTransferSize = 3072;
        ctrl.dwMaxVideoFrameSize = 1920 * 1080 * 2;
        event("bounded_descriptor_quirk_applied", 1);
    }
    if (!ctrl.dwMaxVideoFrameSize || ctrl.dwMaxVideoFrameSize > 32 * 1024 * 1024 || !ctrl.dwMaxPayloadTransferSize || ctrl.dwMaxPayloadTransferSize > 65536) goto cleanup;
    rc = uvc_stream_open_ctrl(handle, &stream, &ctrl); event("stream_open", rc); if (rc || stopped) goto cleanup;
    if (sonix_bitrate_request) {
        libusb_device_handle *usb=uvc_get_libusb_handle(handle);
        if (!sonix_validate(usb) || !sonix_bitrate(usb,&sonix_bitrate_original,0) ||
            sonix_bitrate_original<1000000 || sonix_bitrate_original>100000000) { event("sonix_compatible",0); goto cleanup; }
        sonix_restore_needed=1;
        uint32_t readback=0;
        int set_ok=sonix_bitrate(usb,&sonix_bitrate_request,1);
        int get_ok=sonix_bitrate(usb,&readback,0);
        printf("{\"event\":\"sonix_%s_bitrate\",\"original\":%u,\"requested\":%u,\"readback\":%u,\"setOk\":%s,\"getOk\":%s}\n",sonix_h264?"h264":"mjpeg",sonix_bitrate_original,sonix_bitrate_request,readback,set_ok?"true":"false",get_ok?"true":"false");
        if (!set_ok || !get_ok || readback!=sonix_bitrate_request) goto cleanup;
        if (sonix_gop_request) {
            if (!sonix_gop(usb,&sonix_gop_original,0) || !sonix_gop_original || sonix_gop_original>30000) goto cleanup;
            sonix_gop_restore_needed=1;
            unsigned gop_readback=0;
            set_ok=sonix_gop(usb,&sonix_gop_request,1); get_ok=sonix_gop(usb,&gop_readback,0);
            printf("{\"event\":\"sonix_h264_gop\",\"original\":%u,\"requested\":%u,\"readback\":%u,\"setOk\":%s,\"getOk\":%s}\n",sonix_gop_original,sonix_gop_request,gop_readback,set_ok?"true":"false",get_ok?"true":"false");
            if (!set_ok || !get_ok || gop_readback!=sonix_gop_request) goto cleanup;
        }
        if (sonix_mode_request) {
            if (!sonix_scalar(usb,6,&sonix_mode_original,0) || (sonix_mode_original!=1 && sonix_mode_original!=2)) goto cleanup;
            sonix_mode_restore_needed=1;
            unsigned mode_readback=0;
            set_ok=sonix_scalar(usb,6,&sonix_mode_request,1); get_ok=sonix_scalar(usb,6,&mode_readback,0);
            printf("{\"event\":\"sonix_h264_mode\",\"original\":%u,\"requested\":%u,\"readback\":%u,\"setOk\":%s,\"getOk\":%s}\n",sonix_mode_original,sonix_mode_request,mode_readback,set_ok?"true":"false",get_ok?"true":"false");
            if (!set_ok || !get_ok || mode_readback!=sonix_mode_request) goto cleanup;
            if (sonix_qp_request) {
                if (!sonix_scalar(usb,7,&sonix_qp_original,0) || sonix_qp_original<10 || sonix_qp_original>51) {
                    event("sonix_vbr_original_qp_unsupported",(int)sonix_qp_original); goto cleanup;
                }
                sonix_qp_restore_needed=1;
                unsigned qp_readback=0;
                set_ok=sonix_scalar(usb,7,&sonix_qp_request,1); get_ok=sonix_scalar(usb,7,&qp_readback,0);
                printf("{\"event\":\"sonix_h264_qp\",\"original\":%u,\"requested\":%u,\"readback\":%u,\"setOk\":%s,\"getOk\":%s}\n",sonix_qp_original,sonix_qp_request,qp_readback,set_ok?"true":"false",get_ok?"true":"false");
                if (!set_ok || !get_ok || qp_readback!=sonix_qp_request) goto cleanup;
            }
        }
    }
    double begin = now(), first = 0, last = 0, maxgap = 0;
    double last_valid_measured = 0, max_valid_measured_gap = 0;
    unsigned measured_valid = 0, valid_windows[300] = {0};
    unsigned frames = 0, valid = 0, bytesmin = 0, bytesmax = 0, errors = 0;
    rc = uvc_stream_start(stream, NULL, NULL, 0); event("stream_start", rc); if (rc) goto cleanup;
    started = 1;
    unsigned char alt = 0;
    int alt_rc = libusb_control_transfer(uvc_get_libusb_handle(handle), 0x81, 0x0a, 0, ctrl.bInterfaceNumber, &alt, 1, 1000);
    printf("{\"event\":\"active_alt\",\"result\":%d,\"alternate\":%u}\n", alt_rc, alt); fflush(stdout);
    while (!stopped && (burst ? now() - requested_at < burst_seconds : now() - begin < run_seconds)) {
        uvc_frame_t *frame = NULL;
        int wait_us = burst ? (int)fmax(1, fmin(1000000, (burst_seconds - (now()-requested_at)) * 1000000)) : 1000000;
        rc = uvc_stream_get_frame(stream, &frame, wait_us);
        if (rc) { errors++; continue; }
        if (!frame) continue;
        double stamp = now();
        if (!first) {
            first = stamp;
            if (sonix_mode_request) {
                unsigned qp=0, mode=0;
                libusb_device_handle *usb=uvc_get_libusb_handle(handle);
                int qok=sonix_scalar(usb,7,&qp,0), mok=sonix_scalar(usb,6,&mode,0);
                printf("{\"event\":\"sonix_active_mode_qp\",\"mode\":%u,\"qp\":%u,\"modeReadOk\":%s,\"qpReadOk\":%s}\n",mode,qp,mok?"true":"false",qok?"true":"false");
            }
        }
        if (last && stamp-last > maxgap) maxgap = stamp-last;
        last = stamp; frames++;
        if (!bytesmin || frame->data_bytes < bytesmin) bytesmin = (unsigned)frame->data_bytes;
        if (frame->data_bytes > bytesmax) bytesmax = (unsigned)frame->data_bytes;
        unsigned valid_before = valid;
        frame_relative_seconds = stamp-begin-5;
        if (format == UVC_FRAME_FORMAT_MJPEG) valid += decode_fullhd(frame);
        else if (format == UVC_FRAME_FORMAT_YUYV) valid += frame->width == 1920 && frame->height == 1080 && frame->data_bytes == 1920 * 1080 * 2;
        else if (h264_pipe) {
            size_t sent = 0;
            double send_begin = now();
            while (!stopped && sent < frame->data_bytes && now()-send_begin < 1) {
                ssize_t n = write(binary_fd, (const unsigned char *)frame->data+sent, frame->data_bytes-sent);
                if (n > 0) sent += (size_t)n;
                else if (n < 0 && (errno == EAGAIN || errno == EWOULDBLOCK || errno == EINTR)) {
                    struct pollfd wait = {binary_fd,POLLOUT,0}; (void)poll(&wait,1,50);
                } else break;
            }
            if (sent == frame->data_bytes) h264_pipe_frames++;
            else { h264_pipe_failures++; stopped = 1; }
        }
        if (valid > valid_before && stamp-begin >= 5 && stamp-begin < run_seconds) {
            measured_valid++;
            unsigned window = (unsigned)(stamp-begin-5);
            if (window < 300) valid_windows[window]++;
            double previous = last_valid_measured ? last_valid_measured : begin+5;
            if (stamp-previous > max_valid_measured_gap) max_valid_measured_gap = stamp-previous;
            last_valid_measured = stamp;
        }
        if (valid && !first_valid) first_valid = now() - requested_at;
        if (burst && valid) break;
    }
    double end = now();
    if (last && end-last > maxgap) maxgap = end-last;
    printf("{\"event\":\"capture\",\"elapsedSeconds\":%.6f,\"frames\":%u,\"validFullHd\":%u,\"firstFrameSeconds\":%.6f,\"maxGapSeconds\":%.6f,\"actualFps\":%.6f,\"minFrameBytes\":%u,\"maxFrameBytes\":%u,\"pollErrors\":%u}\n",
        end-begin, frames, valid, first ? first-begin : -1, maxgap, frames/(end-begin), bytesmin, bytesmax, errors); fflush(stdout);
    success = frames > 0;
    if (!burst) {
        unsigned measured_seconds = run_seconds-5;
        double finalgap = last_valid_measured ? begin+run_seconds-last_valid_measured : measured_seconds;
        if (finalgap > max_valid_measured_gap) max_valid_measured_gap = finalgap;
        printf("{\"event\":\"measured_decoding\",\"warmupSeconds\":5,\"windowSeconds\":%u,\"validFrames\":%u,\"validFps\":%.6f,\"maxValidReceiptGap\":%.6f,\"firstValidSeconds\":%.6f,\"perSecond\":[", measured_seconds, measured_valid, measured_valid/(double)measured_seconds, max_valid_measured_gap, first_valid);
        for (unsigned i = 0; i < measured_seconds; ++i) printf("%s%u", i ? "," : "", valid_windows[i]);
        puts("]}"); fflush(stdout);
    }
    if (burst && !h264_pipe) {
        success = first_valid > 0 && first_valid <= burst_seconds;
        printf("{\"event\":\"burst_result\",\"firstValidSeconds\":%.6f,\"deadlineSeconds\":%d,\"passedDeadline\":%s}\n", first_valid ? first_valid : -1,burst_seconds, success ? "true" : "false"); fflush(stdout);
    }
    if (burst && h264_pipe) {
        // The separate decoder owns image validation and arrival timing.
        // A successful private pipe is only transport evidence.
        printf("{\"event\":\"h264_burst_window\",\"deadlineSeconds\":%d,\"requiresExternalDecoder\":true}\n",burst_seconds); fflush(stdout);
    }
cleanup:
    if (started) { uvc_stream_stop(stream); event("stream_stopped", 0); print_transport(); event("error_resubmissions", retried_count); }
    if (handle && sonix_qp_restore_needed) {
        unsigned readback=0;
        libusb_device_handle *usb=uvc_get_libusb_handle(handle);
        int set_ok=sonix_scalar(usb,7,&sonix_qp_original,1), get_ok=sonix_scalar(usb,7,&readback,0);
        int restored=set_ok && get_ok && readback==sonix_qp_original;
        printf("{\"event\":\"sonix_h264_qp_restored\",\"expected\":%u,\"readback\":%u,\"restored\":%s}\n",sonix_qp_original,readback,restored?"true":"false");
        if (!restored) success=0;
    }
    if (handle && sonix_mode_restore_needed) {
        unsigned readback=0;
        libusb_device_handle *usb=uvc_get_libusb_handle(handle);
        int set_ok=sonix_scalar(usb,6,&sonix_mode_original,1), get_ok=sonix_scalar(usb,6,&readback,0);
        int restored=set_ok && get_ok && readback==sonix_mode_original;
        printf("{\"event\":\"sonix_h264_mode_restored\",\"expected\":%u,\"readback\":%u,\"restored\":%s}\n",sonix_mode_original,readback,restored?"true":"false");
        if (!restored) success=0;
    }
    if (handle && sonix_gop_restore_needed) {
        unsigned readback=0;
        libusb_device_handle *usb=uvc_get_libusb_handle(handle);
        int set_ok=sonix_gop(usb,&sonix_gop_original,1), get_ok=sonix_gop(usb,&readback,0);
        int restored=set_ok && get_ok && readback==sonix_gop_original;
        printf("{\"event\":\"sonix_h264_gop_restored\",\"expected\":%u,\"readback\":%u,\"restored\":%s}\n",sonix_gop_original,readback,restored?"true":"false");
        if (!restored) success=0;
    }
    if (handle && sonix_restore_needed) {
        uint32_t readback=0;
        libusb_device_handle *usb=uvc_get_libusb_handle(handle);
        int set_ok=sonix_bitrate(usb,&sonix_bitrate_original,1);
        int get_ok=sonix_bitrate(usb,&readback,0);
        int restored=set_ok && get_ok && readback==sonix_bitrate_original;
        printf("{\"event\":\"sonix_%s_restored\",\"expected\":%u,\"readback\":%u,\"restored\":%s}\n",sonix_h264?"h264":"mjpeg",sonix_bitrate_original,readback,restored?"true":"false");
        if (!restored) success=0;
    }
    if (stream) uvc_stream_close(stream);
    if (handle) { uvc_close(handle); event("device_closed", 0); }
    if (devices) uvc_free_device_list(devices, 1);
    if (ctx) uvc_exit(ctx);
    if (binary_fd >= 0) {
        close(binary_fd);
        printf("{\"event\":\"h264_private_pipe\",\"framesWritten\":%u,\"writeFailures\":%u}\n",h264_pipe_frames,h264_pipe_failures); fflush(stdout);
    }
    if (strict_jpeg) {
        printf("{\"event\":\"packet_loss_location\",\"mappedFrames\":%u,\"unmappedFrames\":%u,\"noReportedLossFrames\":%u,\"firstLossCompressedByteDeciles\":[",loss_mapped,loss_missing,loss_free);
        for (unsigned i=0;i<10;++i) printf("%s%u",i?",":"",loss_bins[i]);
        puts("]}");
        printf("{\"event\":\"jpeg_prefix_before_loss\",\"frames\":%u,\"maximumCompletedRows\":%u,\"atLeast1072Rows\":%u,\"completedRowDeciles\":[",prefix_frames,prefix_rows_max,prefix_last8_candidates);
        for (unsigned i=0;i<10;++i) printf("%s%u",i?",":"",prefix_row_bins[i]);
        puts("]}");
        printf("{\"event\":\"jpeg_structure\",\"framesWithDRI\":%u,\"framesWithRestartMarkers\":%u,\"quantizationSumMin\":%u,\"quantizationSumMax\":%u}\n",jpeg_dri_frames,jpeg_restart_frames,jpeg_dqt_min,jpeg_dqt_max);
        printf("{\"event\":\"strict_jpeg\",\"imageioValid\":%u,\"strictValid\":%u,\"warningsRejected\":%u,\"errorsRejected\":%u,\"wrongDimensions\":%u}\n", imageio_valid, strict_valid, strict_warnings, strict_errors, strict_dimensions); fflush(stdout);
        printf("{\"event\":\"strict_warning_kinds\",\"prematureEntropyEnd\":%u,\"badHuffman\":%u,\"extraneousBeforeMarker\":%u,\"prematureFileEnd\":%u,\"invalidSOS\":%u,\"other\":%u}\n", strict_warning_kinds[0],strict_warning_kinds[1],strict_warning_kinds[2],strict_warning_kinds[3],strict_warning_kinds[4],strict_warning_kinds[5]); fflush(stdout);
        if (strict_decoder) tj3Destroy(strict_decoder);
        if (strict_pixels) {
            volatile unsigned char *wipe = strict_pixels;
            for (size_t i = 0; i < 1920*1080*3; ++i) wipe[i] = 0;
            free(strict_pixels);
        }
    }
    if (video_codec) {
        int finish_result = ram_video_codec_finish(video_codec);
        RamVideoCodecStats stats;
        ram_video_codec_get_stats(video_codec, &stats);
        ram_video_codec_print_stats(&stats);
        if (finish_result || stats.encodedFrames < 450 || stats.decodedFrames != stats.encodedFrames ||
            stats.encodedFrames != stats.acceptedFrames || stats.backpressureDrops || stats.closedDrops ||
            stats.lastPTSrelative-stats.firstPTSrelative < 29) success = 0;
        ram_video_codec_destroy(video_codec);
        video_codec = NULL;
    }
    event("interrupted", stopped != 0);
    return success && !stopped ? 0 : 2;
}
