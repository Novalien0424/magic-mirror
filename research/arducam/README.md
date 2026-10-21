# Arducam driver investigation

This directory contains **diagnostic prototypes, not a production camera driver**.
**Current result: not qualified.** Owner now permits very low FPS and tiny edge
defects, requires a fresh full-HD photo within 5 seconds, and requires any fix to
persist across restart/reboot. Warning-free decoding remains a strong diagnostic;
warnings alone do not measure damaged area. `jpeg-prefix.h` conservatively
measures decoder progress using only bytes preceding the first reported USB hole.
It does not establish visual damage area or automatically accept damaged faces.

Strict warning-free JPEG decompression exposed
missing image data in the streams that ImageIO could display. The earlier burst,
five-minute and codec counters must not be interpreted as usable image quality.
The custom queue correction fixes queue exhaustion, not missing image bytes.
The later administrator-assisted probes temporarily detach this exact camera's
whole composite driver and restore it afterward. No extension is installed and
no captured images are written. See the [physical experiment results](../../docs/testing/camera-availability-qa-2026-10-18.md)
and [driver feasibility analysis](../../docs/testing/arducam-driver-research-2026-10-18.md).

`uvc-payload-audit.hpp` accepts a transport result and one complete UVC payload.
It retains counters only. It distinguishes transport failures, empty transfers,
invalid header lengths, truncated PTS/SCR headers, device ERR flags, missing EOH,
FID transitions, EOF, oversize and wrong-sized uncompressed frames. A sized
candidate is **not** a decoded, fresh, usable image. Compressed formats need a
separate bounded decoder; their maximum frame size is not an exact frame size.

The future USB adapter must validate actual lengths against allocated buffers
and preserve UVC payload boundaries. Do not call this once per physical USB
transaction: high-bandwidth isochronous service intervals may contain multiple
transactions. Keep transfer status separate from header/framing statistics.
Never make a malformed stream pass merely by dropping inconvenient error flags.

The original auditor has not consumed this Arducam's real USB payloads. The later
`libuvc-fullhd-probe.c` uses a separate instrumented real transport: root capture
works, and it records transfer errors separately from delivered payload headers.
The earlier non-root ACCESS result did not establish a root-access blocker.

Build and run the synthetic tests on this Mac:

```sh
xcrun clang++ -isysroot "$(xcrun --sdk macosx --show-sdk-path)" \
  -mmacosx-version-min=14.0 -std=c++17 -Wall -Wextra -Werror \
  -fsanitize=address,undefined -fno-omit-frame-pointer \
  research/arducam/uvc-payload-audit-test.cpp \
  -o .artifacts/camera-availability-2026-10-18/uvc-payload-audit-test
.artifacts/camera-availability-2026-10-18/uvc-payload-audit-test
```

Observed: pass with ASan/UBSan, including 65,536 synthetic header/flag/length
combinations. No physical camera acceptance follows from this test. Explicit SDK
selection is necessary on the current machine: the first compile picked a CLT
SDK whose TBD architecture was incompatible with the selected linker. Both the
failure and corrected build output are retained in the experiment artifacts.

This is an original diagnostic implementation. The Linux and libuvc sources
were inspected to compare behavior, not copied into this component. Any later
reuse of those implementations needs a separate license assessment; Linux UVC
code is GPL-2.0-or-later, and libuvc's licensing must be retained if reused.

`accessory-enumeration.m` is a macOS 27 AppKit probe for the new Accessory Access
API. It registers only VID `0c45` / PID `0520` and reports numeric enumeration
status. It never calls exclusive open, streams, resets or detaches a device.
It builds with the installed CLT 27 compiler/SDK and AppKit, AccessoryAccess and
IOUSBHost frameworks. The selected Xcode SDK is older and lacks this API.

The built `.artifacts/camera-availability-2026-10-18/AccessoryProbe.app` was
ad-hoc signed with the Claim USB Accessory entitlement. macOS killed the launch
with SIGKILL before enumeration; the OS diagnostic identifies a restricted
entitlement. A properly provisioned developer signature is required for the
next feasibility test. No valid signing identity is installed on this Mac.
Do not treat this failed launch as an authorized enumeration result or disable
system security to run it. The driver report links the relevant Apple
documentation and retained process/signing diagnostics.

`usb-cycle-probe.c` is a separate targeted recovery diagnostic, not part of
production recovery. It requires a unique 0c45:0520 match and normal device
open, then supports `suspend` (two seconds followed by unconditional resume),
`resume`, or `configure` (configuration 0 for two seconds, then unconditional
restoration of the original nonzero configuration). It reports numeric API
statuses and state readbacks only. SIGINT/SIGTERM shorten the dwell without
skipping cleanup. The caller must hold the Electron owner lease, verify all
capture owners have exited, confirm Jabra is the microphone and impose a
process deadline; the prototype itself does not enforce those external guards.
It never seizes a driver or changes hub power. Always inspect action, cleanup
and GET statuses: an exit 0 alone indicates cleanup success, not recovery.

Build with `xcrun clang -O2 -Wall -Wextra -Werror`, the selected macOS SDK,
`-mmacosx-version-min=14.0`, and IOKit/CoreFoundation frameworks. The guarded
physical tests confirmed configuration 1 → 0 → 1; suspend/resume calls succeeded
without a confirmed suspended-state transition. Neither restored reliable
1080p/5 delivery. These operations do not prove electrical power removal.
See the linked QA ledger for exact results and the bounded caller artifact.

`usb-claim-probe.c` validates a unique 0c45:0520 match and the expected video
interfaces, detaches the composite driver once, claims/releases interfaces 0–2,
then attaches the driver once. On macOS this also temporarily removes the camera's
audio interfaces. Root succeeded on this Mac; the caller separately confirmed all
three Apple drivers returned. SIGINT/SIGTERM proceed through cleanup. This is not
a physical power cycle.

`libuvc-fullhd-probe.c` uses an isolated upstream libuvc checkout at commit
`d07de4fa23905ee8cac06f5d24b2a03d42a3b363` plus `libuvc-diagnostic.patch`.
The BSD license is retained in `libuvc-LICENSE.txt`. No repository dependency or
system library is installed. The patch adds numeric transport/header counters,
bounds checks before variable-header reads, and an optional one-resubmission-per-
transfer experiment, capped at 20 retries for the entire run. The default does
not resubmit failed transfers. The separate upstream library is under ignored
`.artifacts/camera-availability-2026-10-18/libuvc-upstream`.

This probe requests actual 1920×1080 MJPEG, YUY2 or H264 for 35 seconds. MJPEG
candidates need a complete primary JPEG through EOI, actual ImageIO dimensions,
and a RAM-only bitmap decode. A bounded JPEG parser excludes bytes after the
primary EOI, skipping embedded metadata markers; the initial strict final-byte
validator incorrectly rejected camera padding. `libuvc-jpeg-test.c` checks
truncation, stuffed/restart bytes and65,536 synthetic segment-length pairs under
ASan/UBSan without invoking hardware. YUY2 validation here checks dimensions
and exact byte count only. H264
buffers are counted but **not decoded**. None of these alone establishes visual
quality or days-long availability. An exit 0 means buffers arrived and orderly
exit occurred, not that the QA acceptance criteria passed. The caller imposes a
50-second deadline, verifies the Electron lease/zero capture owners/Jabra default
audio, and independently checks restoration of Apple drivers on interfaces 0–2.

Build upstream with CMake `CMAKE_BUILD_TARGET=Static`, `BUILD_EXAMPLE=OFF`,
`BUILD_TEST=OFF`, `BUILD_TESTING=OFF`, `DISABLE_JPEG=ON`, and the explicit installed
Xcode 26.5 SDK. The installed libusb is 1.0.30. Build the probe as C11 with
`-Wall -Wextra -Werror`, upstream source/build include directories, libusb include
and library directories, the static `libuvc.a`, and CoreGraphics/ImageIO/
CoreFoundation frameworks. Use `-mmacosx-version-min=27.0` for the installed OS.
The native library's JPEG converter is not used; ImageIO performs validation.

Guarded invocations are retained in `run-libuvc.py` in the artifact directory.
Examples for an already isolated/root-authorized test are `mjpeg 15`, `yuy2 5`,
`h264 15`, and `mjpeg 15 --retry-once`. Requests `mjpeg 1` and `mjpeg 2` deliberately
probe unadvertised intervals directly; echoed negotiation is not proof of the
delivered cadence. Never run these alongside Electron, another camera owner, or
while the camera's own microphone is selected.

With8-packet transfers, `mjpeg 15 --burst` opens at full HD, returns after its
first validated JPEG, and releases ownership. Twenty independent corrected-
parser bursts obtained actual1920×1080 photos within0.992s, each followed by
verified Apple-driver restoration. This is promising bounded on-demand evidence,
not a production service, human image-quality verdict, video pass or48-hour soak.

`native-iso-probe.m` is a second transport implementation using Foundation,
IOKit, IOUSBHost, ImageIO and CoreGraphics. It uses native isochronous frame-list requests with
ASAP scheduling instead of libusb's legacy `ReadIsochPipeAsync` API. It verifies
all five descriptor interfaces (three video, two audio), claims only the video
interfaces after whole-device capture, validates PROBE/COMMIT full-HD MJPEG15,
and assembles bounded JPEGs, verifies actual full-HD dimensions, forces bitmap
decoding in RAM and checks UVC PTS progression. One decoder job may be in flight;
processing drops and transport-incomplete candidates remain counted separately.
The run accepts up to 35 seconds, with a 50-second hard deadline. Normal
cleanup aborts and joins USB and decoder jobs, releases DMA mappings, restores alt0 and
destroys the device for driver rematching. A hard-deadline exit explicitly
reports cleanup unverified; the guarded caller must check actual reattachment.
Build with ARC/blocks and the explicit Xcode26.5 SDK. Root corrected the initial
descriptor guard from three to the measured five interfaces before any physical
run; the filtered historical video-only inventory was insufficient for that guard.

`libusb-darwin-partial-iso.patch` is a separate exact-camera backend experiment
against libusb1.0.30 commit`87a55632db62c9bdc58cd31d3ccfa673f1bb017f` (LGPL license
retained in`libusb-COPYING.txt`). The backend trace found139 good packets inside
20 aggregate NotSent1 transfer failures. Existing completion handling discarded
their per-packet results, and libuvc retired those requests permanently.
The patch clears stale per-packet fields on submit, bounds actual lengths, and
only for0c45:0520 delivers mixed completions with every packet's actual status.
Raw aggregate failures and individual failed packets remain counted. It does
not turn empty/all-failed requests into success.

Build the nine upstream C files listed in`libusb/Makefile.am` for Darwin/POSIX
using the upstream`Xcode/config.h`, `-DOS_DARWIN`, explicit SDK, then archive them
and link this static library into the isolated libuvc probe with IOKit and
Security frameworks. No system/Homebrew library is replaced. The original
backend-trace and corrected trials are retained separately in the QA ledger.
The corrected35-second MJPEG30 trial decoded857 full-HD images in its30-second
measurement window (28.57FPS,100ms maximum valid receipt gap). That is a decoded
delivery result, not an encoded clip or production acceptance.

`--control34 --stable` selects a 305-second run (5-second warmup and exact
300-second measurement), guarded by a 320-second caller deadline. This produced
8,517 decoded full-HD frames (28.39 FPS; maximum gap 134 ms) without reopening.
`--control34 --encode` instead submits valid full-HD images during the exact
30-second measurement to `ram-video-codec.m`: bounded four-buffer hardware H264
encoding at a requested 12 Mbps, followed by hardware decoding of the actual
compressed samples. It reports dimensions, timestamps, errors, drops and bytes,
retaining no encoded or decoded images after processing. It does not create a
video file or prove file-container/playback integration. Build its Objective-C
object with ARC/blocks and link Foundation, CoreVideo, CoreMedia and VideoToolbox
in addition to the frameworks above. Codec finish joins callbacks; the caller's
process deadline remains necessary for hung native APIs.

`--strict-jpeg` adds the installed libjpeg-turbo 3.2.0 decoder with
STOPONWARNING, a 2,073,600-pixel limit, 32 MiB intermediate-buffer setting and
one fixed full-HD RGB buffer. Actual full-image decompression must succeed
without warnings before the image counts as valid or enters the codec. Safe
warning categories distinguish premature entropy end from harmless padding
outside the primary JPEG. Link the existing static `libturbojpeg.a`; no package
is installed or added to production dependencies. The synthetic JPEG test also
verifies acceptance of a generated complete image and rejection of missing
entropy with a retained EOI marker. This is still not human quality acceptance.

The native probe supports `--run 35 --strict-jpeg` with the same independent
decoder gate, bounded buffer, and metadata-only failure categories. It preserves
ImageIO-only counts to expose permissive decoder behavior. Cleanup joins the
decode queue before destroying the decoder and wiping/freeing its RGB storage.

The separate guarded `--h264-pipe` experiment sends the camera's actual H264
bytes directly to an unprivileged decoder over a private OS pipe. Metadata is
redirected to stderr in this mode; never invoke it with a terminal/log as its
stdout. The artifact caller verifies ownership/Jabra, consumes both pipes
concurrently, retains only allowlisted dimensions/counts/error totals, enforces
deadlines and verifies driver restoration. No compressed stream is written to
disk. Buffer counts alone never establish H264 integrity.

Additional isolated options added after the owner's 5-second/edge-defect ruling:
`--burst5`, `--reserve-max-payload`, `--quality5000`, `--quality100`, and
`--priority`. The latter raises only this diagnostic process/thread priority;
the static libusb patch calls its optional QoS hook. None is a system setting.
The libuvc diagnostic patch also records the first reported packet hole by
frame sequence; a bounded 64-entry ring fails closed on unmatched frames.
`jpeg-prefix.h` feeds only bytes preceding that hole to a warning-stopping
baseline decoder. Completed rows and the last-eight-row candidate count are
diagnostics, not a face-quality certification. Missing-packet boundaries can be
ambiguous, so these are conservative progress bounds, not measured visual area.
Synthetic full-HD prefix and ring-wrap tests join the marker tests under
ASan/UBSan; no synthetic or real image files are produced.

Sonix experiments use the primary Kurokesu C1 implementation's documented
extension controls, after matching both GUIDs, control lengths, read support,
chip ID 0x92 and DRAM code 0x00 (SNC292A). This establishes the control protocol
shape and readback on this specimen, not blanket C1/Arducam firmware equivalence.
`--sonix-mjpeg8m` and `--sonix-mjpeg4m` target volatile MJPEG bitrate;
`--sonix-h2641m` targets H264 bitrate; `--sonix-gop1` and `--sonix-gop5`
request keyframe spacing. `--sonix-vbr` selects mode 2, while
`--sonix-vbr-qp35` also requests QP 35 after reading the original VBR QP.
Actual NAL/frame behavior and transferred bytes must verify those requests.
Original values are read before mutation, restored in cleanup and verified.
No flash operation or arbitrary register write is exposed. Fixed chip-ID
read handshakes use command-selection OUT requests; they are not GET-only.
Every experiment still needs the guarded caller's ownership, device/audio
checks, deadline and post-restoration checks. No persistent service is installed.

`ram-h264-check.c` consumes Annex-B H264 on stdin and emits aggregate JSON only.
It uses a single libavcodec decoder thread with strict error recognition,
64 KiB reads, an 8 MiB individual allocation cap, and bounded packet/parser
input. Decoder RAM consists of multiple bounded buffers. Actual display output
must be 1920×1080; coded 1088-row padding is allowed. Clean IDRs require NAL
type 5, matched opaque metadata/PTS, and no associated parser/decoder warnings,
errors or frame damage flags. Keyframe/I-picture flags alone do not qualify.
Timing measures stdin parser availability, including lookahead/backpressure,
not the sensor clock. The checker does not certify pixel-level appearance or
predictive-frame integrity. Exit 1 for an erroneous whole stream can coexist
with a positive individual clean-IDR count; report both.

Build with the installed Xcode 26.5 compiler/SDK, `-std=c17 -O2 -Wall -Wextra
-Werror -mmacosx-version-min=27.0`, and `pkg-config --cflags --libs libavcodec
libavutil`. The same command builds `ram-h264-check-test.c`. Nineteen focused
checks and twelve RAM-only integration cases pass; see the QA ledger for
commands/results. Never store a real H264 stream to feed this checker later.

`--h264-pipe --burst5` bounds a cold-start diagnostic to five seconds and reports
transport only; acceptance belongs to the external decoder and its arrival
clock. The guarded artifact wrapper enforces process deadlines and post-run
restoration. At 1 Mbps/CBR/original GOP 29, one 35-second run yielded a clean
IDR at 2.251 s. A cold start yielded one at 2.558 s, then the next yielded none
within five seconds. Other tested GOP/VBR/QP combinations yielded zero clean
IDRs. These are experimental leads and retained failures, not a persistent fix.
