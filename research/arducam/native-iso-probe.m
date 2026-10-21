// One-device IOUSBHost/ASAP probe. JPEGs and decoded bitmaps stay in bounded RAM.
// Run only under the operator's exclusive camera lease, after the Jabra guard.
#define __STDC_WANT_LIB_EXT1__ 1
#import <Foundation/Foundation.h>
#import <IOUSBHost/IOUSBHost.h>
#import <IOKit/usb/USB.h>
#import <ImageIO/ImageIO.h>
#import <CoreGraphics/CoreGraphics.h>
#include <math.h>
#include <signal.h>
#include <stdatomic.h>
#include <stdbool.h>
#include <stdlib.h>
#include <string.h>
#include <sys/resource.h>
#include <time.h>
#include <turbojpeg.h>
#include <unistd.h>

enum { VID = 0x0c45, PID = 0x0520, PACKET = 1600, SLOTS = 8, FRAMES = 128,
       MAX_FRAME = 4147789, INTERVAL = 666666, MAX_ENQUEUES = 8192,
       JPEG_CAP = 4 * 1024 * 1024, WIDTH = 1920, HEIGHT = 1080,
       BITMAP_BYTES = WIDTH * HEIGHT * 4, STRICT_RGB_BYTES = WIDTH * HEIGHT * 3,
       STRICT_MAXMEMORY_MB = 32, SECONDS = 40, WARMUP = 5,
       MAX_CAPTURE = 35, SETUP_CAP = 7, CLEANUP_CAP = 8, HARD_CAP = 50 };
_Static_assert(SLOTS * FRAMES * (PACKET + sizeof(IOUSBHostIsochronousFrame)) < 2 * 1024 * 1024,
               "DMA buffers and frame lists must remain below 2 MiB");
_Static_assert(2 * JPEG_CAP <= 8 * 1024 * 1024 && BITMAP_BYTES <= 8 * 1024 * 1024 &&
               STRICT_RGB_BYTES <= 8 * 1024 * 1024,
               "Encoded storage and each bitmap must remain at most 8 MiB");
static volatile sig_atomic_t stopSignal;
static double epoch, operationDeadline;
static void onSignal(int sig) { stopSignal = sig; }
static double now(void) {
    struct timespec t;
    clock_gettime(CLOCK_MONOTONIC, &t);
    return (double)t.tv_sec + (double)t.tv_nsec / 1e9;
}
static uint16_t le16(const uint8_t *p) { return (uint16_t)(p[0] | p[1] << 8); }
static uint32_t le32(const uint8_t *p) {
    return (uint32_t)p[0] | (uint32_t)p[1] << 8 | (uint32_t)p[2] << 16 | (uint32_t)p[3] << 24;
}
static void put32(uint8_t *p, uint32_t n) {
    for (unsigned i = 0; i < 4; ++i) p[i] = (uint8_t)(n >> (8 * i));
}
static NSString *hex(IOReturn status) {
    return [NSString stringWithFormat:@"0x%08x", (unsigned)status];
}
static void emit(NSDictionary *fields) {
    NSData *data = [NSJSONSerialization dataWithJSONObject:fields options:NSJSONWritingSortedKeys error:NULL];
    if (data) { fwrite(data.bytes, 1, data.length, stdout); fputc('\n', stdout); fflush(stdout); }
}
static BOOL fail(NSString *stage, NSString *reason, NSError *error) {
    emit(@{@"event": @"failure", @"stage": stage, @"reason": reason,
           @"status": error ? hex((IOReturn)error.code) : @"none"});
    return NO;
}
static BOOL mayRun(void) { return !stopSignal && now() < operationDeadline; }
static void wipe(void *bytes, size_t length) {
    if (length) (void)memset_s(bytes, length, 0, length);
}

// Fixed-size histograms: arbitrary kernel statuses cannot grow memory usage.
typedef struct { IOReturn code[32]; uint64_t count[32], overflow; unsigned used; } Histogram;
static void countStatus(Histogram *h, IOReturn code) {
    for (unsigned i = 0; i < h->used; ++i) if (h->code[i] == code) { ++h->count[i]; return; }
    if (h->used == 32) { ++h->overflow; return; }
    unsigned i = h->used++;
    h->code[i] = code; h->count[i] = 1;
}
static NSDictionary *histogram(const Histogram *h) {
    NSMutableDictionary *d = [NSMutableDictionary dictionary];
    for (unsigned i = 0; i < h->used; ++i) d[hex(h->code[i])] = @(h->count[i]);
    d[@"other_status_count"] = @(h->overflow);
    return d;
}
typedef struct {
    Histogram transfers, packets, enqueueErrors;
    uint64_t submitted, completed, completedAfterStop, packetsAfterStop;
    uint64_t reportedBytes, goodBytes, zeroPackets, shortPackets, fullPackets, invalidLengths;
    uint64_t headers, badHeaders, eof, fid[2], fidChanges, errorHeaders, noEOH, pts, scr;
    uint64_t payloadBytes, payloadPackets, frameBytes, maxObservedFrameBytes, frameCapViolations;
    uint64_t payloadBySecond[SECONDS], completionsBySecond[SECONDS];
    uint64_t transferErrors, packetErrors, zeroErrorPackets, errorPacketsWithData, goodPacketsInErrorTransfers;
    uint64_t outOfOrderCompletions, invalidCompletionLists, payloadPacketsOutsideWindow;
    uint64_t candidates, eofCandidates, missingEOF, incompleteCandidates, emptyCandidates, oversizedCandidates;
    uint64_t postEOFPayloads, processingDrops, decodeSubmitted, ptsCandidates, missingPTS, inconsistentPTS;
    uint64_t ptsAdvances, ptsDuplicates, ptsRegressions, ptsWraps;
    uint32_t minLength, maxLength;
    int previousFID;
    double firstPayload, lastPayload;
} Stats;
typedef struct {
    uint8_t *bytes[2]; // One assembler and one decoder; ownership swaps without copying.
    size_t length;
    unsigned writeIndex;
    int fid, closedFID;
    BOOL active, incomplete, overflow, pendingLoss, hasPTS, consistentPTS, havePreviousPTS;
    uint32_t pts, previousPTS;
    double receivedAt;
} Assembly;
typedef enum {
    StrictPrematureSegment, StrictBadHuffman, StrictExtraneousBytes,
    StrictPrematureEOF, StrictInvalidSOS, StrictOtherWarning, StrictWarningKindCount
} StrictWarningKind;
// Written only on the serial decode queue, read only after its group joins.
typedef struct {
    uint64_t attempted, fullHD, wrongDimensions, unparseableJPEG, truncatedJPEG, decoderFailures;
    uint64_t imageIOFullHD, strictAttempts, strictValid, strictWarnings, strictErrors, strictDimensions;
    uint64_t strictWarningKinds[StrictWarningKindCount];
    uint64_t completePrefixes, maxTrailerBytes, decodedIncomplete, freshFullHD;
    uint64_t measuredFullHD, measuredFresh, decodedBySecond[SECONDS], freshBySecond[SECONDS];
    double firstValidStartup, firstValid, lastValid, maxValidGap, firstFresh, lastFresh, maxFreshGap;
    double measuredFirst, measuredLast, measuredFirstFresh, measuredLastFresh, measuredMaxFreshGap;
    double measuredMaxValidGap, maxDecodeSeconds, maxPTSFrameGap;
    uint32_t lastFreshPTS;
    BOOL haveFreshPTS;
} DecodeStats;

@interface NativeProbe : NSObject {
@public
    IOUSBHostDevice *device;
    IOUSBHostInterface *interfaces[3];
    IOUSBHostPipe *pipe;
    dispatch_queue_t queue;
    dispatch_group_t group;
    dispatch_queue_t decodeQueue;
    dispatch_group_t decodeGroup;
    NSMutableData *buffers[SLOTS];
    IOUSBHostIsochronousFrame frames[SLOTS][FRAMES];
    uint64_t slotSequence[SLOTS], nextCompletion;
    IOReturn completionStatus[SLOTS];
    BOOL ready[SLOTS], validList[SLOTS];
    atomic_bool running, decodeBusy;
    Stats stats;
    Assembly assembly;
    DecodeStats decoded;
    uint8_t *bitmapBytes;
    CGContextRef bitmap;
    // Created, used and destroyed only on decodeQueue; one fixed RGB destination.
    tjhandle strictDecoder;
    uint8_t *strictRGB;
    BOOL strictJPEG;
    uint32_t ptsClockHz;
    uint8_t endpoint, configuration, controlLength;
    double streamStart, streamEnd, captureStoppedAt;
    BOOL captured, joined, decodeJoined, abortOK, alt0OK, destroyed, submissionFailed;
}
@end
@implementation NativeProbe
@end

// Validate only the required descriptor facts; never print descriptor bytes/IDs.
static BOOL validateConfiguration(NativeProbe *p, const IOUSBConfigurationDescriptor *config) {
    if (!config) return fail(@"descriptors", @"configuration_missing", nil);
    const uint8_t *bytes = (const uint8_t *)config;
    size_t length = le16(bytes + 2);
    if (bytes[0] != 9 || bytes[1] != 2 || length < 9 || length > 16384 || bytes[4] != 5 || !bytes[5])
        return fail(@"descriptors", @"configuration_shape_mismatch", nil);
    int number = -1, alternate = -1, subclass = -1, format = -1;
    unsigned vc = 0, mjpeg = 0, fullHD = 0, alt4 = 0, endpointCount = 0;
    unsigned baseInterfaces = 0, expectedAlt4Endpoints = 0;
    uint8_t inputEndpoint = 0;
    p->configuration = bytes[5];
    for (size_t offset = 9; offset < length;) {
        const uint8_t *d = bytes + offset;
        if (length - offset < 2 || d[0] < 2 || d[0] > length - offset)
            return fail(@"descriptors", @"malformed_descriptor_length", nil);
        size_t n = d[0];
        if (d[1] == 4) {
            if (n != 9) return fail(@"descriptors", @"interface_shape_mismatch", nil);
            number = d[2]; alternate = d[3]; subclass = d[6]; format = -1;
            if (number > 4 || d[5] != (number < 3 ? 0x0e : 1) ||
                subclass != (number == 0 || number == 3 ? 1 : 2))
                return fail(@"descriptors", @"unexpected_composite_interface", nil);
            if (alternate == 0) {
                if (baseInterfaces & (1u << number)) return fail(@"descriptors", @"duplicate_interface", nil);
                baseInterfaces |= 1u << number;
                if (number && d[4] != 0) return fail(@"descriptors", @"vs_alt0_has_endpoint", nil);
            }
            if (number == 1 && alternate == 4) { ++alt4; expectedAlt4Endpoints = d[4]; }
        } else if (d[1] == 0x24 && n >= 3) {
            if (number == 0 && alternate == 0 && d[2] == 1) {
                if (n < 14 || le16(d + 3) != 0x0100 || d[11] != 2 ||
                    !((d[12] == 1 && d[13] == 2) || (d[12] == 2 && d[13] == 1)))
                    return fail(@"descriptors", @"expected_uvc10_two_streams", nil);
                p->ptsClockHz = le32(d + 7);
                ++vc;
            }
            if (number == 1 && alternate == 0) {
                // UVC format subtypes. Frame subtypes do not change the current format.
                if (d[2] == 4 || d[2] == 6 || d[2] == 10 || d[2] == 12 || d[2] == 16 || d[2] == 19)
                    format = n >= 4 && d[2] == 6 && d[3] == 1 ? 1 : -1;
                if (d[2] == 6 && format == 1) {
                    if (n < 11 || d[4] < 1) return fail(@"descriptors", @"mjpeg_format_invalid", nil);
                    ++mjpeg;
                }
                if (d[2] == 7 && format == 1 && n >= 4 && d[3] == 1) {
                    if (n < 26 || le16(d + 5) != 1920 || le16(d + 7) != 1080 ||
                        le32(d + 17) != MAX_FRAME || !d[25] || n < 26u + 4u * d[25])
                        return fail(@"descriptors", @"fullhd_mjpeg_frame_mismatch", nil);
                    BOOL interval = NO;
                    for (unsigned i = 0; i < d[25]; ++i) if (le32(d + 26 + i * 4) == INTERVAL) interval = YES;
                    if (!interval) return fail(@"descriptors", @"mjpeg15_interval_missing", nil);
                    ++fullHD;
                }
                if (d[2] == 1) {
                    if (n < 13) return fail(@"descriptors", @"vs_input_header_invalid", nil);
                    inputEndpoint = d[6];
                }
            }
        } else if (d[1] == 5 && number == 1 && alternate == 4) {
            if (n < 7) return fail(@"descriptors", @"endpoint_truncated", nil);
            uint16_t maxPacket = le16(d + 4);
            unsigned capacity = (maxPacket & 0x7ffu) * (1u + ((maxPacket >> 11) & 3u));
            if (!(d[2] & 0x80) || !(d[2] & 15) || (d[3] & 3) != 1 || d[6] != 1 ||
                (maxPacket & 0xe000) || ((maxPacket >> 11) & 3) == 3 || capacity != PACKET)
                return fail(@"descriptors", @"alt4_not_1600_byte_in_iso_interval1", nil);
            p->endpoint = d[2]; ++endpointCount;
        }
        offset += n;
    }
    if (vc != 1 || mjpeg != 1 || fullHD != 1 || baseInterfaces != 31 || alt4 != 1 ||
        endpointCount != 1 || expectedAlt4Endpoints != 1 || inputEndpoint != p->endpoint)
        return fail(@"descriptors", @"required_unique_descriptor_facts_missing", nil);
    emit(@{@"event": @"descriptors_validated", @"uvc_bcd": @"1.00", @"vs_interface": @1,
           @"format": @1, @"frame": @1, @"width": @1920, @"height": @1080,
           @"interval_100ns": @(INTERVAL), @"alternate": @4, @"capacity": @(PACKET),
           @"endpoint_derived_from_descriptor": @YES});
    return YES;
}

static BOOL capture(NativeProbe *p) {
    io_iterator_t iterator = IO_OBJECT_NULL;
    CFMutableDictionaryRef match = [IOUSBHostDevice createMatchingDictionaryWithVendorID:@(VID)
        productID:@(PID) bcdDevice:nil deviceClass:nil deviceSubclass:nil deviceProtocol:nil speed:nil productIDArray:nil];
    IOReturn status = IOServiceGetMatchingServices(kIOMainPortDefault, match, &iterator);
    if (status != kIOReturnSuccess) return fail(@"match", @"registry_match_failed", [NSError errorWithDomain:IOUSBHostErrorDomain code:status userInfo:nil]);
    io_service_t selected = IO_OBJECT_NULL, candidate;
    unsigned count = 0;
    while ((candidate = IOIteratorNext(iterator))) {
        ++count;
        if (!selected) selected = candidate; else IOObjectRelease(candidate);
    }
    IOObjectRelease(iterator);
    emit(@{@"event": @"match", @"matching_devices": @(count)});
    if (count != 1 || !mayRun()) {
        if (selected) IOObjectRelease(selected);
        return fail(@"match", count != 1 ? @"exact_unique_vid_pid_required" : @"interrupted_or_deadline", nil);
    }
    NSError *error = nil;
    p->device = [[IOUSBHostDevice alloc] initWithIOService:selected options:IOUSBHostObjectInitOptionsDeviceCapture
        queue:p->queue error:&error interestHandler:nil];
    IOObjectRelease(selected);
    if (!p->device) return fail(@"capture", @"native_capture_failed_no_fallback", error);
    p->captured = YES;
    emit(@{@"event": @"capture", @"whole_composite": @YES, @"root_capture": @YES});
    const IOUSBDeviceDescriptor *d = p->device.deviceDescriptor;
    if (!d || d->bLength != 18 || d->bDescriptorType != 1 ||
        le16((const uint8_t *)&d->idVendor) != VID || le16((const uint8_t *)&d->idProduct) != PID ||
        le16((const uint8_t *)&d->bcdUSB) != 0x0200 || d->bNumConfigurations != 1)
        return fail(@"descriptors", @"device_descriptor_mismatch", nil);
    if (!mayRun() || !validateConfiguration(p, [p->device configurationDescriptorWithIndex:0 error:&error])) return NO;
    if (![p->device configureWithValue:p->configuration matchInterfaces:NO error:&error])
        return fail(@"configure", @"native_configure_failed", error);

    // Enumerate only children of the captured service, never globally matched interfaces.
    double until = fmin(operationDeadline, now() + 2.0);
    unsigned found = 0;
    while (found != 7 && mayRun() && now() < until) {
        io_iterator_t children = IO_OBJECT_NULL;
        status = IORegistryEntryGetChildIterator(p->device.ioService, kIOServicePlane, &children);
        if (status != kIOReturnSuccess) return fail(@"claim", @"child_iterator_failed", [NSError errorWithDomain:IOUSBHostErrorDomain code:status userInfo:nil]);
        while ((candidate = IOIteratorNext(children))) {
            if (IOObjectConformsTo(candidate, "IOUSBHostInterface")) {
                CFTypeRef value = IORegistryEntryCreateCFProperty(candidate, (__bridge CFStringRef)IOUSBHostMatchingPropertyKeyInterfaceNumber, kCFAllocatorDefault, 0);
                int number = -1;
                if (value && CFGetTypeID(value) == CFNumberGetTypeID()) CFNumberGetValue(value, kCFNumberIntType, &number);
                if (value) CFRelease(value);
                if (number < 0 || number > 2 || (found & (1u << number))) { IOObjectRelease(candidate); continue; }
                p->interfaces[number] = [[IOUSBHostInterface alloc] initWithIOService:candidate
                    options:IOUSBHostObjectInitOptionsNone queue:p->queue error:&error interestHandler:nil];
                IOObjectRelease(candidate);
                if (!p->interfaces[number]) { IOObjectRelease(children); return fail(@"claim", @"native_interface_claim_failed", error); }
                const IOUSBInterfaceDescriptor *id = p->interfaces[number].interfaceDescriptor;
                if (!id || id->bInterfaceNumber != number || id->bInterfaceClass != 0x0e ||
                    id->bInterfaceSubClass != (number == 0 ? 1 : 2)) {
                    IOObjectRelease(children); return fail(@"claim", @"claimed_interface_mismatch", nil);
                }
                found |= 1u << number;
            } else IOObjectRelease(candidate);
        }
        IOObjectRelease(children);
        if (found != 7) { struct timespec delay = {0, 20000000}; nanosleep(&delay, NULL); }
    }
    if (found != 7) return fail(@"claim", @"three_captured_interfaces_not_available", nil);
    for (unsigned i = 1; i <= 2; ++i)
        if (![p->interfaces[i] selectAlternateSetting:0 error:&error]) return fail(@"claim", @"initial_alt0_failed", error);
    emit(@{@"event": @"interfaces_claimed", @"count": @3, @"both_vs_alt0": @YES});
    return YES;
}

static BOOL control(NativeProbe *p, uint8_t request, uint8_t selector, NSMutableData *data, NSError **error) {
    if (!mayRun()) return fail(@"control", @"interrupted_or_deadline", nil);
    IOUSBDeviceRequest r = {.bmRequestType = (request & 0x80) ? 0xa1 : 0x21, .bRequest = request,
        .wValue = OSSwapHostToLittleInt16((uint16_t)selector << 8),
        .wIndex = OSSwapHostToLittleInt16(1), .wLength = OSSwapHostToLittleInt16((uint16_t)data.length)};
    NSUInteger transferred = 0;
    if (![p->device sendDeviceRequest:r data:data bytesTransferred:&transferred completionTimeout:1.0 error:error]) return NO;
    if (transferred != data.length) return fail(@"control", @"short_control_data_phase", nil);
    return YES;
}
static BOOL validateControl(NSMutableData *data, NSString *stage) {
    const uint8_t *b = data.bytes;
    if ((data.length != 26 && data.length != 34) || b[2] != 1 || b[3] != 1 || le32(b + 4) != INTERVAL ||
        le32(b + 18) != MAX_FRAME || le32(b + 22) != PACKET)
        return fail(stage, @"negotiated_mode_or_capacity_mismatch_no_lower_mode", nil);
    emit(@{@"event": stage, @"length": @(data.length), @"format": @1, @"frame": @1,
           @"interval_100ns": @(le32(b + 4)), @"max_frame_bytes": @(le32(b + 18)),
           @"max_payload_bytes": @(le32(b + 22))});
    return YES;
}
static BOOL negotiate(NativeProbe *p) {
    NSError *error = nil;
    // GET_LEN is optional on UVC 1.0; only STALL/unsupported permit the validated 26-byte fallback.
    for (uint8_t selector = 1; selector <= 2; ++selector) {
        NSMutableData *length = [NSMutableData dataWithLength:2];
        error = nil;
        BOOL ok = control(p, 0x85, selector, length, &error);
        if (!ok && (!error || ((IOReturn)error.code != kIOUSBPipeStalled && (IOReturn)error.code != kIOReturnUnsupported)))
            return fail(@"get_len", @"get_len_failed", error);
        unsigned actualLength = ok ? le16(length.bytes) : 26;
        if (actualLength != 26 && actualLength != 34) return fail(@"get_len", @"unsupported_control_length", nil);
        if (selector == 1) p->controlLength = actualLength;
        else if (actualLength != p->controlLength) return fail(@"get_len", @"probe_commit_length_mismatch", nil);
        emit(@{@"event": @"get_len", @"selector": @(selector), @"length": @(actualLength),
               @"uvc10_fallback": @(!ok), @"status": ok ? hex(kIOReturnSuccess) : hex((IOReturn)error.code)});
    }
    NSMutableData *probe = [NSMutableData dataWithLength:p->controlLength];
    if (!control(p, 0x81, 1, probe, &error)) return fail(@"probe_get_initial", @"get_cur_failed", error);
    // Preserve all other negotiation fields, including compression/quality fields.
    uint8_t *b = probe.mutableBytes;
    b[0] |= 1; b[2] = 1; b[3] = 1; put32(b + 4, INTERVAL);
    put32(b + 18, MAX_FRAME); put32(b + 22, PACKET);
    if (!control(p, 0x01, 1, probe, &error)) return fail(@"probe_set", @"set_cur_failed", error);
    if (!control(p, 0x81, 1, probe, &error)) return fail(@"probe_get", @"get_cur_failed", error);
    if (!validateControl(probe, @"probe_validated")) return NO;
    if (!control(p, 0x01, 2, probe, &error)) return fail(@"commit_set", @"set_cur_failed", error);
    NSMutableData *commit = [NSMutableData dataWithLength:p->controlLength];
    if (!control(p, 0x81, 2, commit, &error)) return fail(@"commit_get", @"get_cur_failed", error);
    if (!validateControl(commit, @"commit_validated")) return NO;
    if (commit.length == 34 && le32((const uint8_t *)commit.bytes + 26))
        p->ptsClockHz = le32((const uint8_t *)commit.bytes + 26);
    if (!mayRun()) return fail(@"alternate", @"interrupted_or_deadline", nil);
    if (![p->interfaces[1] selectAlternateSetting:4 error:&error]) return fail(@"alternate", @"alt4_failed", error);
    p->pipe = [p->interfaces[1] copyPipeWithAddress:p->endpoint error:&error];
    if (!p->pipe) return fail(@"pipe", @"copy_native_pipe_failed", error);
    const IOUSBHostIOSourceDescriptors *pd = p->pipe.descriptors;
    if (!pd || pd->descriptor.bEndpointAddress != p->endpoint ||
        (pd->descriptor.bmAttributes & 3) != 1 || pd->descriptor.bInterval != 1 ||
        le16((const uint8_t *)&pd->descriptor.wMaxPacketSize) != 2848)
        return fail(@"pipe", @"native_pipe_descriptor_mismatch", nil);
    for (unsigned i = 0; i < SLOTS; ++i) {
        p->buffers[i] = [p->interfaces[1] ioDataWithCapacity:FRAMES * PACKET error:&error];
        if (!p->buffers[i] || p->buffers[i].length != FRAMES * PACKET)
            return fail(@"buffer", @"native_dma_allocation_failed", error);
    }
    for (unsigned i = 0; i < 2; ++i) p->assembly.bytes[i] = calloc(1, JPEG_CAP);
    p->bitmapBytes = calloc(1, BITMAP_BYTES);
    if (!p->assembly.bytes[0] || !p->assembly.bytes[1] || !p->bitmapBytes)
        return fail(@"buffer", @"bounded_decode_allocation_failed", nil);
    CGColorSpaceRef space = CGColorSpaceCreateDeviceRGB();
    if (space) {
        p->bitmap = CGBitmapContextCreate(p->bitmapBytes, WIDTH, HEIGHT, 8, WIDTH * 4, space,
                                        kCGImageAlphaNoneSkipLast | kCGBitmapByteOrder32Big);
        CGColorSpaceRelease(space);
    }
    if (!p->bitmap) return fail(@"buffer", @"ram_bitmap_allocation_failed", nil);
    emit(@{@"event": @"native_pipe_ready", @"api": @"IOUSBHostPipe.enqueueIORequestWithData:frameList:",
           @"first_frame_number": @0, @"scheduling": @"ASAP_XHCI", @"slots": @(SLOTS),
           @"packets_per_transfer": @(FRAMES), @"packet_capacity": @(PACKET),
           @"dma_buffer_bytes": @(SLOTS * FRAMES * PACKET), @"frame_list_bytes": @(sizeof(p->frames)),
           @"jpeg_buffer_bytes_each": @(JPEG_CAP), @"jpeg_buffer_bytes_total": @(2 * JPEG_CAP),
           @"bitmap_bytes": @(BITMAP_BYTES), @"max_decode_inflight": @1});
    return YES;
}

// Same primary-EOI parser as libuvc-fullhd-probe.c: skip APP thumbnail markers,
// length-delimited segments, stuffed entropy bytes and restart markers. Only
// the complete prefix is decoded; e.g. the camera's six trailer bytes are not.
static size_t jpeg_extent(const unsigned char *b, size_t n) {
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
                if (!b[pos] || (b[pos] >= 208 && b[pos] <= 215)) { pos++; continue; }
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

// All strict decoder helpers run only on decodeQueue. Failed setup retains any
// allocations for cleanup, which joins decode jobs before destroying anything.
static BOOL prepareStrictJPEG(NativeProbe *p) {
    p->strictDecoder = tj3Init(TJINIT_DECOMPRESS);
    if (!p->strictDecoder) return fail(@"strict_jpeg", @"decoder_initialization_failed", nil);
    if (tj3Set(p->strictDecoder, TJPARAM_STOPONWARNING, 1) < 0 ||
        tj3Set(p->strictDecoder, TJPARAM_MAXMEMORY, STRICT_MAXMEMORY_MB) < 0 ||
        tj3Set(p->strictDecoder, TJPARAM_MAXPIXELS, WIDTH * HEIGHT) < 0)
        return fail(@"strict_jpeg", @"decoder_limits_failed", nil);
    p->strictRGB = calloc(1, STRICT_RGB_BYTES);
    if (!p->strictRGB) return fail(@"strict_jpeg", @"bounded_rgb_allocation_failed", nil);
    emit(@{@"event": @"strict_jpeg_ready", @"stop_on_warning": @YES,
           @"max_memory_mb": @(STRICT_MAXMEMORY_MB), @"max_pixels": @(WIDTH * HEIGHT),
           @"rgb_buffer_bytes": @(STRICT_RGB_BYTES), @"scaling": @NO,
           @"warning_policy": @"reject_frame_without_concealment"});
    return YES;
}

static StrictWarningKind strictWarningKind(const char *message) {
    if (message) {
        if (strstr(message, "premature end of data segment")) return StrictPrematureSegment;
        if (strstr(message, "bad Huffman code")) return StrictBadHuffman;
        if (strstr(message, "extraneous bytes before marker")) return StrictExtraneousBytes;
        if (strstr(message, "Premature end of JPEG file")) return StrictPrematureEOF;
        if (strstr(message, "Invalid SOS parameters")) return StrictInvalidSOS;
    }
    return StrictOtherWarning;
}

static void countStrictFailure(NativeProbe *p) {
    if (tj3GetErrorCode(p->strictDecoder) == TJERR_WARNING) {
        ++p->decoded.strictWarnings;
        ++p->decoded.strictWarningKinds[strictWarningKind(tj3GetErrorStr(p->strictDecoder))];
    } else ++p->decoded.strictErrors;
}

static BOOL validateStrictJPEG(NativeProbe *p, const uint8_t *bytes, size_t length) {
    ++p->decoded.strictAttempts;
    if (tj3DecompressHeader(p->strictDecoder, bytes, length) < 0) {
        countStrictFailure(p); return NO;
    }
    // Actual header dimensions, without scaling, must fit the fixed RGB buffer.
    if (tj3Get(p->strictDecoder, TJPARAM_JPEGWIDTH) != WIDTH ||
        tj3Get(p->strictDecoder, TJPARAM_JPEGHEIGHT) != HEIGHT) {
        ++p->decoded.strictDimensions; return NO;
    }
    if (tj3Decompress8(p->strictDecoder, bytes, length, p->strictRGB, WIDTH * 3, TJPF_RGB) < 0) {
        countStrictFailure(p); return NO;
    }
    // STOPONWARNING makes either call fail on its first warning.
    ++p->decoded.strictValid;
    return YES;
}

static void decodeFrame(NativeProbe *p, uint8_t *bytes, size_t length, double receivedAt,
                        BOOL incomplete, BOOL freshPTS, uint32_t pts) {
    DecodeStats *d = &p->decoded;
    double began = now();
    ++d->attempted;
    CFDataRef data = NULL;
    CGImageSourceRef source = NULL;
    CGImageRef image = NULL;
    do {
        size_t extent = jpeg_extent(bytes, length);
        if (!extent) { ++d->unparseableJPEG; break; }
        ++d->completePrefixes;
        if (length - extent > d->maxTrailerBytes) d->maxTrailerBytes = length - extent;
        BOOL strictValid = !p->strictJPEG || validateStrictJPEG(p, bytes, extent);
        // Still draw ImageIO after a strict rejection to expose tolerant decodes.
        data = CFDataCreateWithBytesNoCopy(NULL, bytes, (CFIndex)extent, kCFAllocatorNull);
        NSDictionary *options = @{(__bridge NSString *)kCGImageSourceShouldCache: @NO,
                                  (__bridge NSString *)kCGImageSourceShouldAllowFloat: @NO};
        source = data ? CGImageSourceCreateWithData(data, (__bridge CFDictionaryRef)options) : NULL;
        if (!source || CGImageSourceGetCount(source) < 1) { ++d->decoderFailures; break; }
        // Check the primary dimensions before ImageIO allocates a decoded image.
        NSDictionary *properties = CFBridgingRelease(CGImageSourceCopyPropertiesAtIndex(source, 0, NULL));
        NSNumber *width = properties[(__bridge NSString *)kCGImagePropertyPixelWidth];
        NSNumber *height = properties[(__bridge NSString *)kCGImagePropertyPixelHeight];
        if (!width || !height) { ++d->decoderFailures; break; }
        if (width.unsignedLongLongValue != WIDTH || height.unsignedLongLongValue != HEIGHT) {
            ++d->wrongDimensions; break;
        }
        image = CGImageSourceCreateImageAtIndex(source, 0, (__bridge CFDictionaryRef)options);
        if (!image) { ++d->decoderFailures; break; }
        if (CGImageGetWidth(image) != WIDTH || CGImageGetHeight(image) != HEIGHT) {
            ++d->wrongDimensions; break;
        }
        // This synchronous full bitmap draw forces lazy JPEG decoding into RAM.
        CGContextDrawImage(p->bitmap, CGRectMake(0, 0, WIDTH, HEIGHT), image);
        CGContextFlush(p->bitmap);
        if (CGImageSourceGetStatusAtIndex(source, 0) != kCGImageStatusComplete) {
            ++d->decoderFailures; break;
        }
        ++d->imageIOFullHD;
        if (!strictValid) break;
        double validatedAt = now();
        unsigned second = (unsigned)fmin(fmax(receivedAt, 0), SECONDS - 1);
        ++d->fullHD; ++d->decodedBySecond[second];
        if (incomplete) ++d->decodedIncomplete;
        if (d->firstValid < 0) { d->firstValid = receivedAt; d->firstValidStartup = validatedAt - epoch; }
        if (d->lastValid >= 0) d->maxValidGap = fmax(d->maxValidGap, receivedAt - d->lastValid);
        d->lastValid = receivedAt;
        if (receivedAt >= WARMUP) {
            ++d->measuredFullHD;
            if (d->measuredFirst < 0) d->measuredFirst = receivedAt;
            if (d->measuredLast >= 0) d->measuredMaxValidGap = fmax(d->measuredMaxValidGap, receivedAt - d->measuredLast);
            d->measuredLast = receivedAt;
        }
        if (freshPTS) {
            ++d->freshFullHD; ++d->freshBySecond[second];
            if (d->firstFresh < 0) d->firstFresh = receivedAt;
            if (d->lastFresh >= 0) d->maxFreshGap = fmax(d->maxFreshGap, receivedAt - d->lastFresh);
            d->lastFresh = receivedAt;
            if (d->haveFreshPTS && p->ptsClockHz)
                d->maxPTSFrameGap = fmax(d->maxPTSFrameGap, (double)(uint32_t)(pts - d->lastFreshPTS) / p->ptsClockHz);
            d->haveFreshPTS = YES; d->lastFreshPTS = pts;
            if (receivedAt >= WARMUP) {
                ++d->measuredFresh;
                if (d->measuredFirstFresh < 0) d->measuredFirstFresh = receivedAt;
                if (d->measuredLastFresh >= 0)
                    d->measuredMaxFreshGap = fmax(d->measuredMaxFreshGap, receivedAt - d->measuredLastFresh);
                d->measuredLastFresh = receivedAt;
            }
        }
    } while (0);
    if (source && CGImageSourceGetCount(source)) {
        CGImageSourceStatus status = CGImageSourceGetStatusAtIndex(source, 0);
        if (status == kCGImageStatusUnexpectedEOF || status == kCGImageStatusIncomplete || status == kCGImageStatusReadingHeader)
            ++d->truncatedJPEG;
    }
    if (image) CGImageRelease(image);
    if (source) CFRelease(source);
    if (data) CFRelease(data);
    wipe(bytes, length);
    wipe(p->bitmapBytes, BITMAP_BYTES);
    if (p->strictRGB) wipe(p->strictRGB, STRICT_RGB_BYTES);
    d->maxDecodeSeconds = fmax(d->maxDecodeSeconds, now() - began);
}

static void finishCandidate(NativeProbe *p, BOOL eof, BOOL allowDecode) {
    Assembly *a = &p->assembly;
    Stats *s = &p->stats;
    if (!a->active) return;
    ++s->candidates;
    if (eof) ++s->eofCandidates; else ++s->missingEOF;
    BOOL incomplete = a->incomplete || !eof || a->overflow;
    if (incomplete) ++s->incompleteCandidates;
    if (a->overflow) ++s->oversizedCandidates;
    BOOL fresh = NO;
    if (!a->hasPTS) ++s->missingPTS;
    else {
        ++s->ptsCandidates;
        if (!a->consistentPTS) ++s->inconsistentPTS;
        else if (!a->havePreviousPTS) fresh = YES;
        else {
            uint32_t delta = a->pts - a->previousPTS;
            if (!delta) ++s->ptsDuplicates;
            else if (delta < UINT32_C(0x80000000)) {
                ++s->ptsAdvances; fresh = YES;
                if (a->pts < a->previousPTS) ++s->ptsWraps;
            } else ++s->ptsRegressions;
        }
        if (fresh) { a->havePreviousPTS = YES; a->previousPTS = a->pts; }
    }
    if (!a->length) ++s->emptyCandidates;
    else if (!a->overflow) {
        bool expected = false;
        if (!allowDecode || !atomic_compare_exchange_strong(&p->decodeBusy, &expected, true)) ++s->processingDrops;
        else {
            uint8_t *bytes = a->bytes[a->writeIndex];
            size_t length = a->length;
            double receivedAt = a->receivedAt;
            uint32_t pts = a->pts;
            a->writeIndex ^= 1;
            ++s->decodeSubmitted;
            dispatch_group_async(p->decodeGroup, p->decodeQueue, ^{
                @autoreleasepool { decodeFrame(p, bytes, length, receivedAt, incomplete, fresh, pts); }
                atomic_store(&p->decodeBusy, false);
            });
        }
    }
    a->closedFID = a->fid;
    a->active = NO; a->length = 0;
}

static void losePacket(NativeProbe *p) {
    if (p->assembly.active) p->assembly.incomplete = YES;
    else p->assembly.pendingLoss = YES;
}
static void assemble(NativeProbe *p, const uint8_t *b, uint32_t n, unsigned h, unsigned flags, double elapsed) {
    Assembly *a = &p->assembly;
    int fid = flags & 1;
    if (a->active && a->fid != fid) finishCandidate(p, NO, YES);
    if (!a->active) {
        if (a->closedFID == fid) {
            if (n > h) { ++p->stats.postEOFPayloads; a->pendingLoss = YES; }
            return;
        }
        a->active = YES; a->fid = fid; a->length = 0; a->overflow = NO;
        a->incomplete = a->pendingLoss; a->pendingLoss = NO;
        a->hasPTS = NO; a->consistentPTS = YES;
    }
    a->receivedAt = elapsed;
    if ((flags & 0x40) || !(flags & 0x80)) a->incomplete = YES;
    if (flags & 4) {
        uint32_t pts = le32(b + 2);
        if (a->hasPTS && a->pts != pts) { a->consistentPTS = NO; a->incomplete = YES; }
        else if (!a->hasPTS) { a->pts = pts; a->hasPTS = YES; }
    }
    size_t payload = n - h;
    if (!a->overflow && payload) {
        if (payload > JPEG_CAP - a->length) a->overflow = YES;
        else { memcpy(a->bytes[a->writeIndex] + a->length, b + h, payload); a->length += payload; }
    }
    if (flags & 2) finishCandidate(p, YES, YES);
}

static void observe(NativeProbe *p, unsigned slot, IOReturn status, IOUSBHostIsochronousFrame *list) {
    Stats *s = &p->stats;
    ++s->completed; countStatus(&s->transfers, status);
    if (status != kIOReturnSuccess) ++s->transferErrors;
    BOOL stopping = !atomic_load(&p->running) || stopSignal;
    if (stopping) ++s->completedAfterStop;
    double elapsed = now() - p->streamStart;
    BOOL withinWindow = !stopping && elapsed >= 0 && elapsed <= p->streamEnd - p->streamStart;
    unsigned second = (unsigned)fmin(fmax(elapsed, 0), SECONDS - 1);
    ++s->completionsBySecond[second];
    if (!list) { ++s->invalidCompletionLists; losePacket(p); return; }
    const uint8_t *bytes = p->buffers[slot].bytes;
    size_t capacity = p->buffers[slot].length;
    for (unsigned i = 0; i < FRAMES; ++i) {
        IOUSBHostIsochronousFrame f = list[i];
        countStatus(&s->packets, f.status);
        if (stopping) ++s->packetsAfterStop;
        s->reportedBytes += f.completeCount;
        // A transfer-level error does not invalidate successful individual packets.
        if (f.status != kIOReturnSuccess) {
            ++s->packetErrors;
            if (!f.completeCount) ++s->zeroErrorPackets; else ++s->errorPacketsWithData;
            if (withinWindow) losePacket(p);
        } else if (status != kIOReturnSuccess) ++s->goodPacketsInErrorTransfers;
        size_t offset = (size_t)i * PACKET;
        if (f.requestCount != PACKET || f.completeCount > f.requestCount ||
            offset > capacity || f.completeCount > capacity - offset) {
            ++s->invalidLengths;
            if (withinWindow) losePacket(p);
            continue;
        }
        if (f.status != kIOReturnSuccess) continue; // Never consume failed-packet bytes.
        uint32_t n = f.completeCount;
        s->goodBytes += n;
        if (!n) { ++s->zeroPackets; continue; }
        if (n == PACKET) ++s->fullPackets; else ++s->shortPackets;
        if (n < s->minLength) s->minLength = n;
        if (n > s->maxLength) s->maxLength = n;
        const uint8_t *b = bytes + offset;
        unsigned h = b[0], flags = n >= 2 ? b[1] : 0;
        unsigned required = 2 + ((flags & 4) ? 4 : 0) + ((flags & 8) ? 6 : 0);
        if (n < 2 || h < required || h > 12 || h > n) {
            ++s->badHeaders;
            if (withinWindow) losePacket(p);
            continue;
        }
        ++s->headers; ++s->fid[flags & 1];
        if (s->previousFID >= 0 && s->previousFID != (flags & 1)) { ++s->fidChanges; s->frameBytes = 0; }
        s->previousFID = flags & 1;
        if (flags & 4) ++s->pts;
        if (flags & 8) ++s->scr;
        if (flags & 0x40) ++s->errorHeaders;
        if (!(flags & 0x80)) ++s->noEOH;
        if (n > h) {
            uint64_t payload = n - h;
            ++s->payloadPackets; s->payloadBytes += payload; s->payloadBySecond[second] += payload;
            if (s->firstPayload < 0) s->firstPayload = elapsed;
            s->lastPayload = elapsed;
            if (s->frameBytes <= MAX_FRAME && s->frameBytes + payload > MAX_FRAME) ++s->frameCapViolations;
            s->frameBytes += payload;
            if (s->frameBytes > s->maxObservedFrameBytes) s->maxObservedFrameBytes = s->frameBytes;
            if (!withinWindow) ++s->payloadPacketsOutsideWindow;
        }
        if (flags & 2) { ++s->eof; s->frameBytes = 0; }
        if (withinWindow) assemble(p, b, n, h, flags, elapsed);
    }
}
static void enqueue(NativeProbe *p, unsigned slot) {
    if (!atomic_load(&p->running) || stopSignal || now() >= p->streamEnd || !mayRun()) return;
    if (p->stats.submitted >= MAX_ENQUEUES) {
        atomic_store(&p->running, false); p->submissionFailed = YES;
        fail(@"enqueue", @"bounded_submission_cap", nil); return;
    }
    memset(p->buffers[slot].mutableBytes, 0, FRAMES * PACKET);
    memset(p->frames[slot], 0, sizeof(p->frames[slot]));
    for (unsigned i = 0; i < FRAMES; ++i) {
        p->frames[slot][i].status = kIOReturnInvalid;
        p->frames[slot][i].requestCount = PACKET;
    }
    p->slotSequence[slot] = p->stats.submitted;
    dispatch_group_enter(p->group);
    NSError *error = nil;
    // Deliberately use the SDK's native frameList overload, NOT ReadIsochPipeAsync/current+4.
    BOOL ok = [p->pipe enqueueIORequestWithData:p->buffers[slot] frameList:p->frames[slot]
        frameListCount:FRAMES firstFrameNumber:0 error:&error
        completionHandler:^(IOReturn result, IOUSBHostIsochronousFrame *completed) {
            @autoreleasepool {
                // Retain at most SLOTS completed requests and drain submission order.
                // No buffer is reused while an earlier ASAP request is outstanding.
                p->ready[slot] = YES; p->completionStatus[slot] = result;
                p->validList[slot] = completed != NULL;
                if (completed && completed != p->frames[slot]) memcpy(p->frames[slot], completed, sizeof(p->frames[slot]));
                if (p->slotSequence[slot] != p->nextCompletion) ++p->stats.outOfOrderCompletions;
                for (;;) {
                    unsigned next = SLOTS;
                    for (unsigned i = 0; i < SLOTS; ++i)
                        if (p->ready[i] && p->slotSequence[i] == p->nextCompletion) { next = i; break; }
                    if (next == SLOTS) break;
                    observe(p, next, p->completionStatus[next], p->validList[next] ? p->frames[next] : NULL);
                    p->ready[next] = NO; ++p->nextCompletion;
                    enqueue(p, next);
                    dispatch_group_leave(p->group);
                }
            }
        }];
    if (ok) ++p->stats.submitted;
    else {
        countStatus(&p->stats.enqueueErrors, error ? (IOReturn)error.code : kIOReturnError);
        p->submissionFailed = YES; atomic_store(&p->running, false);
        fail(@"enqueue", @"native_enqueue_rejected", error);
        dispatch_group_leave(p->group);
    }
}

static BOOL cleanup(NativeProbe *p, BOOL setup) {
    p->captureStoppedAt = now();
    atomic_store(&p->running, false);
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, CLEANUP_CAP * NSEC_PER_SEC),
                   dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
        static const char message[] = "{\"event\":\"cleanup_deadline\",\"reason\":\"usb_or_decode_cleanup_exceeded_8s\",\"cleanup_complete\":false,\"kernel_reattachment_verified\":false}\n";
        (void)write(STDOUT_FILENO, message, sizeof(message) - 1);
        _exit(124); // Never free memory underneath an outstanding USB/decode job.
    });
    // Fence all resubmissions before abort; never block the completion queue on abort/join.
    dispatch_sync(p->queue, ^{});
    emit(@{@"event": @"stop", @"reason": stopSignal ? @"signal" : !setup ? @"setup_failed" :
        p->submissionFailed ? @"enqueue_failed_or_cap" : now() >= p->streamEnd ? @"capture_window_complete" : @"operation_deadline"});
    NSError *error = nil;
    p->abortOK = !p->pipe || [p->pipe abortWithOption:IOUSBHostAbortOptionSynchronous error:&error];
    emit(@{@"event": @"abort", @"ok": @(p->abortOK), @"status": error ? hex((IOReturn)error.code) : hex(kIOReturnSuccess)});
    // Both groups join before ANY DMA/JPEG/bitmap buffer is freed. Watchdogs
    // terminate without unwinding if a kernel call or decode cannot join.
    dispatch_group_wait(p->group, DISPATCH_TIME_FOREVER);
    dispatch_sync(p->queue, ^{});
    p->joined = YES;
    emit(@{@"event": @"transfers_joined", @"submitted": @(p->stats.submitted), @"completed": @(p->stats.completed)});
    finishCandidate(p, NO, NO); // Account for an unfinished terminal FID; never queue it at stop.
    dispatch_group_wait(p->decodeGroup, DISPATCH_TIME_FOREVER);
    dispatch_sync(p->decodeQueue, ^{});
    p->decodeJoined = YES;
    emit(@{@"event": @"decode_joined", @"submitted": @(p->stats.decodeSubmitted), @"processed": @(p->decoded.attempted)});
    dispatch_sync(p->decodeQueue, ^{
        if (p->strictDecoder) { tj3Destroy(p->strictDecoder); p->strictDecoder = NULL; }
        if (p->strictRGB) { wipe(p->strictRGB, STRICT_RGB_BYTES); free(p->strictRGB); p->strictRGB = NULL; }
    });
    p->alt0OK = YES;
    for (unsigned i = 1; i <= 2; ++i) if (p->interfaces[i]) {
        error = nil;
        BOOL ok = [p->interfaces[i] selectAlternateSetting:0 error:&error];
        p->alt0OK &= ok;
        emit(@{@"event": @"restore_alt0", @"interface": @(i), @"ok": @(ok),
               @"status": error ? hex((IOReturn)error.code) : hex(kIOReturnSuccess)});
    }
    p->pipe = nil;
    // Wipe/release DMA mappings while their interface user client is still alive.
    for (unsigned i = 0; i < SLOTS; ++i) {
        if (p->buffers[i]) memset(p->buffers[i].mutableBytes, 0, p->buffers[i].length);
        p->buffers[i] = nil;
    }
    if (p->bitmap) { CGContextRelease(p->bitmap); p->bitmap = NULL; }
    if (p->bitmapBytes) { wipe(p->bitmapBytes, BITMAP_BYTES); free(p->bitmapBytes); p->bitmapBytes = NULL; }
    for (unsigned i = 0; i < 2; ++i) if (p->assembly.bytes[i]) {
        wipe(p->assembly.bytes[i], JPEG_CAP);
        free(p->assembly.bytes[i]); p->assembly.bytes[i] = NULL;
    }
    for (unsigned i = 0; i < 3; ++i) { [p->interfaces[i] destroy]; p->interfaces[i] = nil; }
    if (p->device) {
        [p->device destroy]; // Plain destroy: reset and driver re-registration, NEVER DeviceSurrender.
        p->destroyed = YES; p->device = nil;
        emit(@{@"event": @"device_destroyed", @"documented_driver_rematch": @YES, @"kernel_reattachment_verified": @NO});
    }
    return p->abortOK && p->joined && p->decodeJoined && p->alt0OK && (!p->captured || p->destroyed);
}
static double maximumGap(double begin, double end, uint64_t count, double first, double last, double between) {
    if (!count) return fmax(0, end - begin);
    return fmax(between, fmax(first - begin, end - last));
}
static void summary(NativeProbe *p, BOOL setup, BOOL restored) {
    Stats *s = &p->stats;
    NSMutableArray *payload = [NSMutableArray array], *completions = [NSMutableArray array];
    NSMutableArray *decoded = [NSMutableArray array], *fresh = [NSMutableArray array];
    DecodeStats *d = &p->decoded;
    for (unsigned i = 0; i < SECONDS; ++i) {
        [payload addObject:@(s->payloadBySecond[i])]; [completions addObject:@(s->completionsBySecond[i])];
        [decoded addObject:@(d->decodedBySecond[i])]; [fresh addObject:@(d->freshBySecond[i])];
    }
    emit(@{@"event": @"summary", @"setup_complete": @(setup), @"submitted": @(s->submitted), @"completed": @(s->completed),
           @"transfer_completion_status": histogram(&s->transfers), @"packet_completion_status": histogram(&s->packets),
           @"enqueue_error_status": histogram(&s->enqueueErrors), @"completions_after_stop": @(s->completedAfterStop),
           @"transfer_errors": @(s->transferErrors), @"packet_errors": @(s->packetErrors),
           @"zero_byte_error_packets": @(s->zeroErrorPackets), @"error_packets_with_reported_data": @(s->errorPacketsWithData),
           @"successful_packets_in_error_transfers": @(s->goodPacketsInErrorTransfers),
           @"out_of_order_completions_resequenced": @(s->outOfOrderCompletions), @"invalid_completion_lists": @(s->invalidCompletionLists),
           @"packets_after_stop": @(s->packetsAfterStop), @"reported_packet_bytes_all_statuses": @(s->reportedBytes),
           @"successful_packet_bytes": @(s->goodBytes), @"zero_packets": @(s->zeroPackets),
           @"short_nonzero_packets": @(s->shortPackets), @"full_packets": @(s->fullPackets), @"invalid_lengths": @(s->invalidLengths),
           @"min_nonzero_success_length": @(s->maxLength ? s->minLength : 0), @"max_success_length": @(s->maxLength),
           @"uvc_headers": @(s->headers), @"bad_uvc_headers": @(s->badHeaders), @"uvc_eof_markers": @(s->eof),
           @"uvc_fid_zero": @(s->fid[0]), @"uvc_fid_one": @(s->fid[1]), @"fid_changes_in_completion_order": @(s->fidChanges),
           @"uvc_error_headers": @(s->errorHeaders), @"uvc_missing_eoh": @(s->noEOH), @"uvc_pts_headers": @(s->pts), @"uvc_scr_headers": @(s->scr),
           @"uvc_payload_bytes": @(s->payloadBytes), @"uvc_payload_packets": @(s->payloadPackets),
           @"max_observed_frame_bytes_in_completion_order": @(s->maxObservedFrameBytes), @"frame_cap_violations": @(s->frameCapViolations),
           @"first_payload_ms": @(s->firstPayload < 0 ? -1 : s->firstPayload * 1000),
           @"last_payload_ms": @(s->lastPayload < 0 ? -1 : s->lastPayload * 1000),
           @"payload_bytes_by_second": payload, @"completions_by_second": completions,
           @"payload_packets_outside_capture_window": @(s->payloadPacketsOutsideWindow),
           @"abort_and_join_complete": @(p->abortOK && p->joined && p->decodeJoined),
           @"usb_join_complete": @(p->joined), @"decode_join_complete": @(p->decodeJoined),
           @"alt0_restored": @(p->alt0OK), @"device_destroy_called": @(p->destroyed),
           @"cleanup_complete": @(restored), @"kernel_reattachment_verified": @NO,
           @"transport_observation": s->payloadBytes && s->eof ? @"payload_and_eof_observed" : @"payload_and_eof_not_both_observed",
           @"signal": @(stopSignal), @"elapsed_ms": @((now() - epoch) * 1000),
           @"image_persistence": @"none", @"decoding": p->strictJPEG ?
               @"ImageIO_RAM_bitmap_and_TurboJPEG_warning_free_full_RGB" : @"ImageIO_primary_JPEG_forced_RAM_bitmap"});
    double duration = p->streamStart ? fmax(0, fmin(p->captureStoppedAt, p->streamEnd) - p->streamStart) : 0;
    double measured = fmax(0, duration - WARMUP);
    emit(@{@"event": @"decoded_summary", @"capture_seconds": @(duration), @"warmup_seconds": @(WARMUP),
           @"measured_seconds": @(measured), @"thirty_second_measurement_complete": @(measured >= 30.0),
           @"candidates": @(s->candidates), @"eof_candidates": @(s->eofCandidates), @"missing_eof_candidates": @(s->missingEOF),
           @"incomplete_candidates": @(s->incompleteCandidates), @"empty_candidates": @(s->emptyCandidates),
           @"oversized_candidates": @(s->oversizedCandidates), @"payload_packets_after_eof_same_fid": @(s->postEOFPayloads),
           @"processing_drops": @(s->processingDrops), @"decode_submitted": @(s->decodeSubmitted), @"decode_attempts": @(d->attempted),
           @"complete_primary_jpeg_prefixes": @(d->completePrefixes), @"maximum_jpeg_trailer_bytes": @(d->maxTrailerBytes),
           @"truncated_or_unparseable_jpeg": @(d->unparseableJPEG + d->truncatedJPEG),
           @"unparseable_or_missing_primary_eoi": @(d->unparseableJPEG), @"imageio_truncated_jpeg": @(d->truncatedJPEG),
           @"decoder_failures": @(d->decoderFailures), @"wrong_dimensions": @(d->wrongDimensions), @"decoded_fullhd": @(d->fullHD),
           @"imageio_valid_fullhd_prestrict": @(d->imageIOFullHD), @"strict_jpeg_enabled": @(p->strictJPEG),
           @"strict_jpeg_attempts": @(d->strictAttempts), @"strict_jpeg_valid": @(d->strictValid),
           @"strict_jpeg_warnings": @(d->strictWarnings), @"strict_jpeg_errors": @(d->strictErrors),
           @"strict_jpeg_wrong_dimensions": @(d->strictDimensions),
           @"strict_jpeg_warning_kinds": @{
               @"premature_end_of_data_segment": @(d->strictWarningKinds[StrictPrematureSegment]),
               @"bad_huffman_code": @(d->strictWarningKinds[StrictBadHuffman]),
               @"extraneous_bytes_before_marker": @(d->strictWarningKinds[StrictExtraneousBytes]),
               @"premature_end_of_jpeg_file": @(d->strictWarningKinds[StrictPrematureEOF]),
               @"invalid_sos_parameters": @(d->strictWarningKinds[StrictInvalidSOS]),
               @"other": @(d->strictWarningKinds[StrictOtherWarning])},
           @"decoded_with_incomplete_transport_or_boundary": @(d->decodedIncomplete),
           @"decoded_without_incomplete_marker": @(d->fullHD - d->decodedIncomplete),
           @"startup_first_valid_ms": @(d->firstValidStartup < 0 ? -1 : d->firstValidStartup * 1000),
           @"startup_first_valid_within_3s": @(d->firstValidStartup >= 0 && d->firstValidStartup <= 3.0),
           @"first_valid_ms_from_stream_start": @(d->firstValid < 0 ? -1 : d->firstValid * 1000),
           @"last_valid_ms_from_stream_start": @(d->lastValid < 0 ? -1 : d->lastValid * 1000),
           @"actual_decoded_fps": @(duration > 0 ? d->fullHD / duration : 0),
           @"pts_fresh_decoded_fullhd": @(d->freshFullHD), @"actual_pts_fresh_fps": @(duration > 0 ? d->freshFullHD / duration : 0),
           @"max_decoded_frame_gap_ms_including_window_edges": @(maximumGap(0, duration, d->fullHD, d->firstValid, d->lastValid, d->maxValidGap) * 1000),
           @"max_fresh_frame_gap_ms_including_window_edges": @(maximumGap(0, duration, d->freshFullHD, d->firstFresh, d->lastFresh, d->maxFreshGap) * 1000),
           @"measured_decoded_fullhd": @(d->measuredFullHD), @"measured_pts_fresh_fullhd": @(d->measuredFresh),
           @"measured_first_valid_ms_after_warmup": @(d->measuredFirst < 0 ? -1 : (d->measuredFirst - WARMUP) * 1000),
           @"measured_last_valid_ms_after_warmup": @(d->measuredLast < 0 ? -1 : (d->measuredLast - WARMUP) * 1000),
           @"measured_first_fresh_ms_after_warmup": @(d->measuredFirstFresh < 0 ? -1 : (d->measuredFirstFresh - WARMUP) * 1000),
           @"measured_last_fresh_ms_after_warmup": @(d->measuredLastFresh < 0 ? -1 : (d->measuredLastFresh - WARMUP) * 1000),
           @"measured_max_decoded_gap_ms_including_window_edges": @(maximumGap(WARMUP, duration, d->measuredFullHD, d->measuredFirst, d->measuredLast, d->measuredMaxValidGap) * 1000),
           @"measured_max_fresh_gap_ms_including_window_edges": @(maximumGap(WARMUP, duration, d->measuredFresh, d->measuredFirstFresh, d->measuredLastFresh, d->measuredMaxFreshGap) * 1000),
           @"measured_actual_decoded_fps": @(measured > 0 ? d->measuredFullHD / measured : 0),
           @"measured_actual_pts_fresh_fps": @(measured > 0 ? d->measuredFresh / measured : 0),
           @"measured_decoded_cadence_fps": @(d->measuredFullHD > 1 && d->measuredLast > d->measuredFirst ? (d->measuredFullHD - 1) / (d->measuredLast - d->measuredFirst) : 0),
           @"decoded_by_receipt_second": decoded, @"pts_fresh_decoded_by_receipt_second": fresh,
           @"maximum_decode_job_ms": @(d->maxDecodeSeconds * 1000), @"pts_candidates": @(s->ptsCandidates),
           @"missing_pts_candidates": @(s->missingPTS), @"inconsistent_pts_candidates": @(s->inconsistentPTS),
           @"pts_advances": @(s->ptsAdvances), @"pts_duplicates": @(s->ptsDuplicates), @"pts_regressions": @(s->ptsRegressions), @"pts_wraps": @(s->ptsWraps),
           @"pts_monotonic": @(s->ptsCandidates > 0 && !s->missingPTS && !s->ptsDuplicates && !s->ptsRegressions && !s->inconsistentPTS),
           @"pts_clock_available": @(p->ptsClockHz != 0),
           @"maximum_decoded_pts_gap_ms": @(p->ptsClockHz && d->freshFullHD > 1 ? d->maxPTSFrameGap * 1000 : -1),
           @"freshness_basis": @"first_consistent_PTS_baseline_then_strict_wrap_aware_advance",
           @"fps_basis": @"counts_divided_by_exact_capture_window_seconds;cadence_uses_count_minus_one_over_last_minus_first",
           @"timing_basis": p->strictJPEG ? @"relative_monotonic_host_receipt;startup_latency_at_completed_strict_and_ImageIO_decode" :
               @"relative_monotonic_host_receipt;startup_latency_at_completed_bitmap_draw",
           @"validation_scope": p->strictJPEG ? @"complete_primary_JPEG_actual_dimensions_ImageIO_draw_and_warning_free_TurboJPEG_full_RGB" :
               @"complete_primary_JPEG_dimensions_and_forced_RAM_bitmap_draw",
           @"image_quality_evaluated": @NO, @"video_acceptance_claimed": @NO, @"image_persistence": @"none"});
}

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        long seconds = 10;
        BOOL strictJPEG = NO, haveSeconds = NO;
        BOOL help = argc == 2 && strcmp(argv[1], "--help") == 0;
        BOOL valid = argc >= 2 && argc <= 4 && strcmp(argv[1], "--run") == 0;
        for (int i = 2; valid && i < argc; ++i) {
            if (strcmp(argv[i], "--strict-jpeg") == 0 && !strictJPEG) strictJPEG = YES;
            else if (!haveSeconds) {
                char *end = NULL; seconds = strtol(argv[i], &end, 10);
                valid = end != argv[i] && !*end && seconds >= 1 && seconds <= MAX_CAPTURE;
                haveSeconds = YES;
            } else valid = NO;
        }
        if (help || !valid) {
            emit(@{@"event": @"usage", @"usage": @"native-iso-probe --run [1..35 seconds; default 10] [--strict-jpeg]",
                   @"requires": @"root; exclusive camera lease and Jabra guard performed by operator",
                   @"mode": @"unique 0c45:0520, VS1 MJPEG 1920x1080, interval666666, alt4 capacity1600",
                   @"hard_deadline_seconds": @(HARD_CAP), @"setup_cap_seconds": @(SETUP_CAP),
                   @"cleanup_cap_seconds": @(CLEANUP_CAP), @"warmup_seconds": @(WARMUP),
                   @"measurement": @"35s capture provides 5s warmup plus 30s measurement; shorter captures do not",
                   @"jpeg_buffer_bytes_each": @(JPEG_CAP), @"jpeg_buffer_bytes_total": @(2 * JPEG_CAP),
                   @"bitmap_bytes": @(BITMAP_BYTES), @"max_decode_inflight": @1,
                   @"strict_rgb_buffer_bytes": @(STRICT_RGB_BYTES), @"strict_max_memory_mb": @(STRICT_MAXMEMORY_MB),
                   @"strict_max_pixels": @(WIDTH * HEIGHT), @"strict_stop_on_warning": @YES,
                   @"help_performs_hardware_io": @NO});
            return help ? 0 : 64;
        }
        if (geteuid() != 0) { fail(@"preflight", @"root_required_before_any_hardware_io", nil); return 77; }
        struct rlimit noCore = {0, 0};
        if (setrlimit(RLIMIT_CORE, &noCore) != 0) { fail(@"preflight", @"cannot_disable_core_dumps", nil); return 77; }
        struct sigaction action = {0}; action.sa_handler = onSignal; sigemptyset(&action.sa_mask);
        if (sigaction(SIGINT, &action, NULL) || sigaction(SIGTERM, &action, NULL)) {
            fail(@"preflight", @"cannot_install_cleanup_signal_handlers", nil); return 77;
        }
        signal(SIGPIPE, SIG_IGN);
        epoch = now();
        operationDeadline = epoch + SETUP_CAP;
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, HARD_CAP * NSEC_PER_SEC), dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
            // Do not unwind or explicitly release DMA buffers while joins may be outstanding.
            static const char message[] = "{\"event\":\"hard_deadline\",\"reason\":\"native_api_or_cleanup_exceeded_50s\",\"cleanup_complete\":false,\"kernel_reattachment_verified\":false}\n";
            (void)write(STDOUT_FILENO, message, sizeof(message) - 1);
            _exit(124); // Kernel user-client teardown; operator MUST independently verify restoration.
        });
        NativeProbe *p = [NativeProbe new];
        p->queue = dispatch_queue_create("magic-mirror.native-iso-probe", DISPATCH_QUEUE_SERIAL);
        p->group = dispatch_group_create(); atomic_init(&p->running, false);
        p->decodeQueue = dispatch_queue_create("magic-mirror.native-iso-probe.decode", DISPATCH_QUEUE_SERIAL);
        p->decodeGroup = dispatch_group_create(); atomic_init(&p->decodeBusy, false);
        p->strictJPEG = strictJPEG;
        p->stats.previousFID = -1; p->stats.firstPayload = p->stats.lastPayload = -1; p->stats.minLength = UINT32_MAX;
        p->assembly.fid = p->assembly.closedFID = -1;
        p->decoded.firstValidStartup = p->decoded.firstValid = p->decoded.lastValid = -1;
        p->decoded.firstFresh = p->decoded.lastFresh = -1;
        p->decoded.measuredFirst = p->decoded.measuredLast = -1;
        p->decoded.measuredFirstFresh = p->decoded.measuredLastFresh = -1;
        __block BOOL strictReady = YES;
        if (strictJPEG) dispatch_sync(p->decodeQueue, ^{ strictReady = prepareStrictJPEG(p); });
        BOOL setup = strictReady && capture(p) && mayRun() && negotiate(p);
        if (setup && !mayRun()) setup = fail(@"setup", @"setup_cap_or_signal", nil);
        if (setup) {
            p->streamStart = now(); p->streamEnd = p->streamStart + seconds;
            operationDeadline = p->streamEnd;
            atomic_store(&p->running, true);
            dispatch_sync(p->queue, ^{ for (unsigned i = 0; i < SLOTS; ++i) enqueue(p, i); });
            while (mayRun() && now() < p->streamEnd && atomic_load(&p->running)) {
                struct timespec delay = {0, 20000000}; nanosleep(&delay, NULL);
            }
        }
        BOOL restored = cleanup(p, setup);
        summary(p, setup, restored);
        if (stopSignal) return 128 + stopSignal;
        if (!setup || !restored || p->submissionFailed) return 1;
        // A zero exit proves at least one full-HD RAM decode, not image quality
        // or sustained-video acceptance. The measurement and transport metadata
        // must be assessed separately by the operator.
        return p->decoded.fullHD ? 0 : 2;
    }
}
