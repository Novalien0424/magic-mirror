# Arducam instability: USB, firmware and driver research — 2026-10-18

**1920×1080 is mandatory. No usable full-resolution repair is established.**
The owner now permits very low FPS and tiny edge defects with an intact face,
sets the normal photo deadline to 5 seconds, and requires a persistent fix.
Warnings alone cannot decide that quality gate. Packet-offset/prefix checks
did not establish a face-safe edge-damage bound. Native IOUSBHost and verified
Sonix SNC292A bitrate/GOP/mode/QP controls have now been tested. H264 at 1 Mbps
and original GOP supplied an independent full-HD frame at 2.251 s, followed by
one successful cold-start screen at 2.558 s and one failed five-second window.
Repeatable usable-image supply remains unqualified. The bounded trials ended
at 23:32 with normal runtime and original device/audio state restored; no
persistent capture service or background test is running.
The experimental USB queue correction sustains delivery, but a stricter JPEG
decoder rejected 973 of 975 ImageIO-valid images with warnings (only two clean
decodes in 35 seconds). The earlier throughput/burst results prove transport
and permissive decoding only; they do not establish intact pictures. Production
integration is withheld because the tested routes do not meet usable-image QA.
Administrator-assisted capture bypasses Apple's UVC camera driver.
Tracing `0xe000400e` (`kIOUSBNotSent1Err`) exposed a separate libusb Darwin
completion defect: good packets inside partially failed transfers were discarded
and libuvc's receive queue drained. The exact-camera correction retains valid
packets and their individual error statuses. ImageIO decoded 20 independent full-HD
photo acquisitions (each under 1 second) and a five-minute measurement with
8,517 decoded full-HD images, 28.39 valid FPS and a 134 ms maximum valid-frame
receipt gap. This does not prove the same defect in Apple's driver or eliminate
the remaining physical packet errors. The earlier small-image trial is
diagnostic evidence only and is explicitly not an accepted solution.

The initial 14:23 investigation below was read-only; runtime was left running.
The subsequent authorized physical experiments are recorded in
[camera availability QA](camera-availability-qa-2026-10-18.md), whose accepted
latency/clip/48-hour criteria supersede the preliminary qualification proposal
below. The later driver work and its limitations are described at the end of
this report. No firmware, OS or driver extension was installed.

## What the evidence establishes

Read-only inspection on October 18, around 14:23 Taipei:

- macOS **27.0.1, build 26A434** (`sw_vers`).
- The enumerated product is **Arducam 1080P Low Light**, with nonunique USB
  product identifiers **0c45:0520**, `bcdUSB=0200`, `bcdDevice=0100`.
  These values do not identify the sensor, retail SKU, PCB revision or actual
  firmware release. The owner subsequently confirmed the product link for the
  2MP low-light USB module with M12 pinhole lens; firmware/PCB revision remains
  distinct from retail model identity.
- IOKit places the camera directly beneath one `AppleT8152USBXHCI` controller;
  that controller's USB tree contains only the Arducam. Jabra is beneath a
  different controller. An adapter without hub electronics would not appear as
  a hub, so this does not establish the physical cable arrangement.
- The camera has video-control interface 0, video-streaming interfaces 1 and 2,
  and audio interfaces 3 and 4. Both streaming interfaces were idle at alternate
  setting 0 in this inspection. Electron was running; no native camera tracker
  was present in the process sample. This is an enumeration observation, not a
  healthy-camera result or proof of the Mirror lifecycle state.
- Apple's installed camera extension is
  `com.apple.cmio.uvcassistantextension`, executable `UVCAssistant`; its plist
  versions are only `1.0` / `1`. Track the macOS build when comparing drivers.
  Installed components also include `com.apple.UVCService` and
  `com.apple.iokit.IOUSBHostFamily`.
- `tcpdump -D` succeeded but exposed no USB/XHC capture interface. No traffic
  was captured. `system_profiler SPUSBDataType -json` returned successfully but
  supplied no matching camera entry; fresh electrical power figures are unknown.

The important historical results remain failures:

- The [October 13 matched helper control](focused-research-2026-10-13.md#camera-application-processing-is-no-longer-the-leading-explanation)
  bypassed Vision, JPEG and pixel copying, yet had a **48.035-second maximum
  fresh-frame receipt gap** and exhausted two resets. The signed helper and
  launch route matched production. Standalone unsigned/differently launched
  Swift failures are weaker, inconclusive controls.
- [Driver counters](../../.artifacts/focused-research-2026-10-13/uvc-delivery-control.json)
  recorded invalid-payload counts of **2089/2112, 2600/2640 and 2161/2640**
  received packets. Other recorded drop categories were zero. This establishes
  rejection before application image processing; it does not identify a cable
  defect, malformed header, bad firmware or Apple bug individually.
- [Earlier trials](camera-reliability-2026-10-13.md#hardware-experiments) already
  failed with native YUY2 output, NV12 conversion, near-30-fps operation, an
  alternate format that selected MJPEG, fresh helpers, and device reset plus
  re-enumeration. Another unchanged trial is not a new discriminator.
- [October 14](review-fixes-2026-10-14.md) again obtained initial frames,
  a stall, recovery, and another stall. Automatic recovery works in some cases;
  sustained streaming remains unproven.

## A specific new lead: high-bandwidth isochronous transfers

The archived [descriptors](../../.artifacts/focused-research-2026-10-13/uvc-idle.json)
and [control readback](../../.artifacts/focused-research-2026-10-13/uvc-capture-start.json)
allow a more discriminating test than another general resolution change.

At USB high speed, an isochronous endpoint can use multiple transactions in each
125-microsecond microframe. Decode the descriptor as:

```text
bytes_per_transaction = wMaxPacketSize & 0x07ff
transactions_per_microframe = 1 + ((wMaxPacketSize >> 11) & 0x03)
capacity = bytes_per_transaction * transactions_per_microframe * 8000
```

This is endpoint capacity, not measured throughput. See the
[USB 2.0 specification](https://www.usb.org/document-library/usb-20-specification)
and Wireshark's distinct
[packet-size and transactions-per-microframe fields](https://www.wireshark.org/docs/dfref/u/usb.html).

| Interface 1 alternate | Raw descriptor | Transactions × bytes | Maximum MB/s |
| --- | --- | --- | --- |
| 1 | `0x0080` | 1 × 128 | 1.024 |
| 2 | `0x0100` | 1 × 256 | 2.048 |
| 3 | `0x0320` | 1 × 800 | 6.400 |
| 4 | `0x0b20` | 2 × 800 | 12.800 |
| 5 | `0x1320` | 3 × 800 | 19.200 |
| 6 | `0x1400` | 3 × 1024 | 24.576 |

VGA YUY2 near 15 fps requires about **9.216 MB/s of image data**, before
headers. Its readback requests a **1600-byte maximum payload**. A single
transaction cannot carry that mode on the advertised endpoints; alternate 4 is
the smallest sufficient advertised capacity. This does not prove which
alternate Apple actually selected.

The archived idle control instead reads **320×240 YUY2 at 5 fps, 256-byte
maximum payload**. That image stream requires **0.768 MB/s**, fitting a
single-transaction endpoint. A matched, signed-helper run that verifies this
mode and its actual endpoint would separate the multi-transaction path from a
much lighter path. If successful, then try 320×240 near 15 fps or VGA at 5 fps,
but verify negotiation again rather than infer it from average bandwidth.

**Measurement caveat:** the older active-sequence samples also report
`GET_INTERFACE=0`, despite the expected PROBE/COMMIT values. Alternate 0 has no
streaming endpoint. Possible explanations include a stopped stream at sample
time, stale device control state, firmware readback behavior, or an inspection
limitation. The existing records do not choose among them. Correlate timestamps,
actual transfers and active endpoint state before calling any mode verified.

If the low mode passes and higher transaction modes fail, that narrows the
problem to transfer scheduling, packetization, firmware throughput or a marginal
link under load; it does **not** uniquely prove an Apple driver bug. If both
fail similarly, pursue packet framing, physical transport and firmware first.

## Covering the practical failure mechanisms

These are ranked diagnostic possibilities, not established causes.

| Layer | Useful controlled test | Resolution if confirmed |
| --- | --- | --- |
| Cable, connector, adapter, board harness | Short known-good shielded data cable; inspect strain, loose board connector, damage and any extension. Change one component per run. | Replace the defective component and provide strain relief. Physical service is a one-time diagnosis/repair, not the normal recovery procedure. |
| Voltage drop or transient power | Measure at the camera under streaming load; compare a correctly powered hub. Host current allocation is not a voltage measurement. | Repair power delivery. A powered hub can help power but cannot repair malformed UVC framing. |
| USB controller or hub interoperability | Compare a different root controller, then a suitable powered USB 2 hub; record topology. A different socket may share a controller. | Retain the demonstrated stable route. A true external USB controller can be another test; an ordinary dock may only add a hub. |
| Bandwidth/isochronous scheduling | Verified single-transaction mode versus current VGA mode. Record active alternate and per-transfer status. | Use a proven usable mode, vendor packetization correction, or a host/controller workaround. Current isolation makes simple competition with Jabra less likely. |
| Sensor/ISP/encoder firmware | Same camera and mode on another OS/host; compare another specimen of the same board if available. | Exact-board firmware correction or replacement. A UVC-compatible label is not proof of correct payloads under every host. |
| UVC negotiation and framing | Correlate PROBE/COMMIT, SET_INTERFACE, transfer lengths, header flags and completed frames. | Correct descriptors/firmware, a justified parser workaround, or Apple/vendor fix. See driver investigation below. |
| Exposure and low-light processing | Bright controlled scene versus dark scene; normal sensitivity versus documented low-light setting; bound exposure to the requested frame period. | Correct the demonstrated control setting. Darkness, long exposure and 60-Hz lighting can affect cadence/image quality but do not by themselves explain invalid transport payloads. |
| Temperature, enclosure, EMI or ground disturbance | Compare cool versus warmed operation and cable placement away from power/display wiring, with temperature and timing metadata. | Ventilation, shielding, mounting or component repair if failure tracks the condition. No temperature correlation has yet been measured. |
| Competing camera/audio clients | Sole signed capture owner, camera microphone unused, both video interfaces accounted for. | Remove the demonstrated conflict. The composite device matters: whole-device resets/detach affect its audio too. |
| Sleep, power management, rapid reopen | Cold acquisition, repeated app-owned acquire/release, then host sleep/wake in an isolated window. | Fix observed lifecycle ordering or a supported device power setting. Do not globally disable power management based on speculation. |
| App buffers, processing or scheduling | Reuse delivery-only control; measure callback time, source timestamps and frame-drop reasons. | Repair only a newly demonstrated application fault. Prior bypass failure makes Vision/JPEG tuning a low-priority explanation. |
| macOS build regression or third-party camera extension | Same hardware/mode on a supported alternate macOS installation/host; inventory installed camera extensions. | Adopt a demonstrated fixed OS build or correct a confirmed extension conflict. Do not overwrite production or claim an unverified release fixes this camera. |

Apple recommends direct connection, alternate ports and appropriate hub power
for USB power-related symptoms; those are useful controls, not a diagnosis of
this stall. [Apple USB troubleshooting](https://support.apple.com/en-us/102204).
Arducam documents sensitivity switching for several IMX291 models via backlight
compensation, but apply it only after confirming the model and supported
controls. [Arducam low-light mode](https://docs.arducam.com/UVC-Camera/Appilcation-Note/Ultra%20Low%20Light%20Mode/).

## Driver investigation and realistic alternatives

The relevant macOS path is camera firmware → USB host transfers → Apple's UVC
handling/CMIO → AVFoundation → native helper → Main. Apple's default CMIO camera
extension has existed since macOS 12.3. The installed UVC extension was verified
locally; this research did not obtain Apple's internal parser implementation or
a public definition of `packetDropInvalidDataPayloadCount`.

**What to measure below AVFoundation.** Separate USB transfer status from UVC
payload validity. Retain numeric counts for short/failed transfers, lengths,
header-length violations, device ERR flags, FID transitions, EOF markers,
PTS/SCR discontinuities and assembled-frame sizes. For VGA YUY2 a complete image
requires 614400 image bytes; do not count payload headers as pixels. Verify
which streaming interface and alternate are actually active. Zero completed
frames with good USB transfer status and broken framing supports a different
fix from host-controller transaction errors.

The Linux UVC implementation supplies concrete examples: it validates payload
headers, tracks device error flags and frame boundaries, and has targeted
workarounds for devices that mishandle FID or report bandwidth incorrectly.
These mechanisms suggest tests; **Linux quirk flags are not macOS settings**.
Do not apply random `uvcvideo quirks=` recipes or accept corrupt frames as a
repair. The inspected v6.12 table has no `0x0520` match, which does not establish
the absence of a fix in every version.
[Linux parser/negotiation source](https://raw.githubusercontent.com/torvalds/linux/v6.12/drivers/media/usb/uvc/uvc_video.c),
[device table](https://raw.githubusercontent.com/torvalds/linux/v6.12/drivers/media/usb/uvc/uvc_driver.c).
The separate [libuvc parser](https://raw.githubusercontent.com/libuvc/libuvc/master/src/stream.c)
also exposes explicit payload assembly behavior; successful capture through a
different parser would still require completeness and freshness verification.

| Route | What it changes | Assessment |
| --- | --- | --- |
| Vendor firmware | Device USB descriptors, packetization, encoder and startup behavior, depending on the vendor fix | Strong candidate once exact SKU/PCB/firmware is established. Arducam supplies firmware privately through staff; there is no verified update for this specimen yet. |
| macOS update or controlled alternate version | Apple's UVC/CMIO/USB implementation | Worth testing if the same camera works on another stack. No verified fixed macOS build was found for this exact device. |
| FFmpeg, OpenCV, another preview app | Client/session choices; the usual Mac capture paths still rely on AVFoundation | Useful application controls, not an independent USB driver. A passing Photo Booth preview can reveal a mode difference, but cannot prove our requested mode works. |
| Direct `libuvc` / `libusb` on Mac | USB access and UVC assembly outside AVFoundation | Research prototype only. Driver ownership and composite-device effects must be solved first. It may fail for the same physical reason. |
| Custom DriverKit matching extension + CMIO extension | Replaces Apple's selected camera extension with our implementation | Officially supported architecture; substantial packaging, signing, ownership and parser work. Justified only after the fault is isolated and simpler remedies fail. |
| Linux V4L2 or Windows native UVC on another host | Independent OS driver and host implementation | Best diagnostic comparison. Linux offers inspectable source/usbmon; Windows uses Microsoft's `Usbvideo.sys`. Match actual wire mode, cable and lighting as closely as possible. |
| Dedicated Linux capture bridge | Runs capture on a host/driver that has passed sustained tests; sends frames to the Mac | Viable architectural fallback if Linux passes and macOS fails. Adds hardware, latency, local transport security and ownership work; no disk recording. |

Sources for the table: [Arducam firmware procedure](https://docs.arducam.com/UVC-Camera/Firmware-Burning/),
[FFmpeg AVFoundation input](https://ffmpeg.org/ffmpeg-devices.html#avfoundation),
[OpenCV macOS capture implementation](https://github.com/opencv/opencv/blob/a16c4a9fe22a5e0aec30e4a02e9ee98c026bbc5d/modules/videoio/src/cap_avfoundation_mac.mm),
[Microsoft UVC driver](https://learn.microsoft.com/en-us/windows-hardware/drivers/stream/usb-video-class-driver-overview).

**Direct USB access is not a drop-in library swap.** libusb documents that Mac
driver capture/detach operates on the whole device and may need root or an
appropriate entitlement; its documentation also records entitlement deployment
limitations. That can release the camera's audio driver. Our read-only control
requests do not establish that exclusive streaming access is available.
[libusb macOS access limitations](https://github.com/libusb/libusb/wiki/FAQ).

**A custom driver is possible without modifying Apple's binaries.** Apple's
documented route uses a small DriverKit extension to match the chosen USB
vendor/product and route `CameraAssistantBundleID` to a custom CMIO extension.
This changes matching; it does not supply a working UVC parser. The implementation
would still need transport, negotiation, frame assembly, timestamps, cancellation
and reconnect handling. [Apple UVC override architecture](https://developer.apple.com/documentation/coremediaio/overriding-the-default-usb-video-class-extension).
Apple provides [IOUSBHostPipe](https://developer.apple.com/documentation/iousbhost/iousbhostpipe)
for transfer operations. Deployment must satisfy system-extension signatures,
entitlements and activation requirements.
[Apple extension installation](https://developer.apple.com/documentation/systemextensions/installing-system-extensions-and-drivers).
This would be a separate implementation scope, with safe uninstallation and
tests proving other cameras and audio are unaffected.

**Packet capture needs a feasible, private route.** This Mac exposes no XHC
capture interface in the current unprivileged inventory. Wireshark documents
macOS-version/SIP limitations; do not disable SIP on the deployed mirror to chase
this. Linux `usbmon` observes host-side USB requests/completions, not a full
electrical bus trace. A hardware analyzer is the escalation if electrical
transaction evidence is needed. Process any video-bearing buffers in RAM and
persist only allowlisted counters/header fields; an ordinary pcap or broad
usbmon text dump can contain image/audio bytes and identifiers. No raw trace is
required for the first controls.
[Wireshark USB capture](https://wiki.wireshark.org/CaptureSetup/USB),
[Linux usbmon](https://docs.kernel.org/usb/usbmon.html).

## Recovery options versus eliminating the fault

The current [Main tracker](../../src/main/camera/tracker.ts) and
[native reset helper](../../deploy/macos/camera-usb-reset.c) already provide
bounded, camera-targeted re-enumeration after releasing capture. Keep the
two-attempt budget, backoff, fresh-frame acceptance and microphone guard.
Reopening AVCaptureSession, restarting its helper and USB re-enumeration do not
guarantee removal of electrical power. More frequent resets would hide neither
the stall nor the interruption to a visitor.

A **dedicated port with proven VBUS power switching** could provide a stronger,
automatic recovery step if full power removal demonstrably restores sustained
operation. Some hubs disconnect data without cutting power; some switch a whole
group of ports. Verify the exact hub revision and physical power behavior first.
Keep Jabra and all unrelated devices outside the switched port, release camera
ownership, defer if its microphone is in use, switch only that port, rediscover,
and require new frames. This preserves application-owned recovery without asking
the operator to unplug the camera. It remains a workaround if stalls recur.
[uhubctl power-switching requirements](https://github.com/mvp/uhubctl#faq).

A replacement UVC camera is the practical fallback when the fault follows this
camera across hosts/cables or vendor remediation is unavailable. First borrow a
known-good unit for the same-port comparison. Select the final replacement by
measured low-light quality, framing, mounting and sustained capture on this Mac;
there is no purchase recommendation or assumption that a particular brand cures
the issue. HDMI capture, Ethernet cameras or a separate capture computer also
change the failing path, but materially expand the deployment and privacy work.

Lower-priority ideas: a vendor-confirmed alternate encoded stream, such as H.264,
could bypass a defective encoding path, but the second interface's frame-based
descriptor alone does not prove H.264 support. Bulk transfers cannot be enabled
by an AVFoundation preference when the device exposes only isochronous streaming
endpoints. USB 3 ports do not turn this USB 2 device into a SuperSpeed camera.
Legacy-camera-plugin overrides address a different compatibility mechanism and
are not justified for this already enumerated UVC extension.
[Apple legacy plugin guidance](https://support.apple.com/en-us/108387).

## Recommended execution order and decision rules

This was the initial proposal, not results. The later user-approved targets and
executed tests are in the [availability ledger](camera-availability-qa-2026-10-18.md).
For hardware QA start with
`PROGRESS.md` and `mm-ui-qa`, acquire the Electron ownership lease, preserve any
unsaved Console edits, and use the canonical signed helper route. Run one owner
at a time. No ordinary Electron/QA overlap. All images stay in RAM.

1. **Verify the light USB mode.** Add a QA-only exact-format/rate selection to
   the existing helper and delivery control; leave production defaults intact.
   Test 320×240 YUY2 at 5 fps for five minutes, with advancing timestamps,
   actual frame counts, maximum gap, negotiated controls and active endpoint
   correlation. A clean window must have zero spontaneous resets; a short burst
   after reset is failure. Compare against the already failing VGA mode only
   when a fresh correlated baseline is needed. If the low mode cannot be
   confirmed, mark the experiment inconclusive instead of interpreting it.
2. **Resolve physical transport.** With the same mode, compare one short
   known-good cable, then another root port, then a powered hub if available.
   Require a complete stable window for each claimed improvement. Physical
   changes require someone at the installation; no repeat unplug recovery loop.
3. **Cross camera and host.** Test a known-good camera on this Mac and this
   Arducam on a separate Windows/Linux host. Arducam failure on both hosts with
   a known-good cable points toward camera firmware/hardware; success elsewhere
   with failure here points toward Mac/host interoperability. Other cameras
   passing on the Mac narrows scope but does not distinguish Arducam firmware
   from an Arducam-specific Apple parser interaction.
4. **Follow the evidence into firmware or parser work.** Ask Arducam for the
   exact-board firmware release and relevant UVC fixes. If only macOS fails,
   compare a supported alternate macOS environment and collect sanitized
   transfer/header evidence for an Apple/vendor report. Firmware flashing
   requires confirmed board compatibility, recovery instructions and owner
   approval; no generic Microdia or similarly named camera image.
5. **Qualify the chosen solution.** First pass 30 minutes of continuous fresh
   capture and repeated acquire/release, then an 8-hour awake-only soak under
   representative lighting and USB/audio load. Run requested RAM-only snapshots
   throughout, and test deliberate-stall recovery separately. Proposed
   thresholds: no unexplained gap over the existing 2.5-second stall limit, no
   spontaneous reset, every scheduled snapshot succeeds, source timestamps
   advance, and Jabra remains undisturbed. Add host sleep/wake testing if that
   operating mode is supported. These thresholds are recommendations, not new
   phase acceptance or a claim that short tests prove indefinite reliability.

## Vendor escalation brief — drafted, not sent

Report the nonunique product identity, exact SKU/PCB when available, macOS build,
USB topology, cable arrangement, wire mode, frame/payload sizes and the three
sanitized counter samples above. Describe the matched helper control and list
failed format/reset trials. Ask Arducam to:

- Identify the installed firmware through a supported read-only procedure;
  `bcdDevice=0100` is insufficient.
- Confirm firmware fixes for macOS UVC interoperability, FID/EOF/ERR framing,
  PROBE/COMMIT and high-bandwidth isochronous packetization for this board.
- Explain the two video-streaming interfaces and whether audio/video concurrency
  has limitations.
- Supply an exact-board image, release notes, supported flashing host/tool,
  rollback/recovery process, or an RMA recommendation.

Arducam's [USB2 selection guide](https://docs.arducam.com/UVC-Camera/USB2-UVC-Camera-Kit/Specs-and-Selection-Guide/)
lists multiple similar IMX291 low-light models; the friendly name is not enough
to choose firmware. Its [configuration guide](https://docs.arducam.com/UVC-Camera/UVC-Camera-Configuration-Guide/)
distinguishes USB3 firmware-information tooling from the legacy USB2 name/serial
tool. Do not assume the former supports this device or write identity fields to
discover a version. No vendor contact or external upload was made.

## Research limits and checks

Reviewed the selected camera issue, current helper/reset implementation,
historical metadata and primary Apple, Arducam, USB-IF, Linux, libusb/libuvc,
Microsoft and Wireshark sources. Local observations used allowlisted fields;
no serial number, USB location ID, AVFoundation unique ID, image, audio,
transcript, credential or private context is retained here.

Source-access limitations: direct raw-GitHub retrieval returned HTTP 429;
web retrieval of versioned Linux v6.12 sources succeeded. Arducam's firmware
page failed to open twice with `Internal Error`; its indexed official text was
available, so the staff-supplied firmware procedure is supported by that text,
not a downloaded firmware image. Apple documentation's HTML was JavaScript-only
and two Markdown links returned `Internal Error`; Apple's own documentation
JSON supplied the override/install/pipe content. A passive strings search of
the installed UVCAssistant executable found no matching payload-error strings;
it did not reveal parser semantics. No repeated failed fetch loop was used.

The initial read-only stage did not run a new stability trial. Subsequent work
below includes physical Electron QA, reversible control experiments and native
diagnostic code. The availability ledger records their results and checks.
There is still no confirmed SKU/firmware, live payload trace, alternate-host
comparison or root-cause/repair claim.

## Subsequent driver investigation and implementation path

The owner explicitly requested deeper fault identification and research toward
a custom driver if necessary. Fresh experiments reproduced delivery loss below
Vision/JPEG, established a working low-resolution intermittent-capture case,
and exposed misleading AVFoundation format readback. They did **not** establish
a defective cable, a particular firmware bug or an Apple parser bug.

### Fresh findings that change the driver decision

- A normal, non-detaching `libusb_claim_interface(handle, 1)` returned **-3
  (`LIBUSB_ERROR_ACCESS`)**. Read-only queries later reported driver ownership
  for interfaces 0, 1 and 2. Endpoint-zero control reads working does not imply
  permission to receive isochronous video.
- Interface 2 advertises frame-based **H264**, GUID
  `4832363400001000800000aa00389b71`, variable-size payloads. This is now verified
  from this device's descriptors, replacing the earlier uncertainty about its
  second interface. No H.264 stream was acquired or decoded. The inspected
  AVFoundation format list exposes yuvs, 420v and 2vuy representations instead.
  Testing H.264 through independent transport is a useful next hypothesis,
  not a proven workaround.
- Selecting 1280×720 in AVFoundation sometimes left USB COMMIT at 320×240 YUY2
  and delivered 320×240 buffers. Therefore neither an `activeFormat` readback
  nor a requested output size proves the source mode. A post-start format
  configuration reached a 720p MJPEG COMMIT but delivered zero samples and
  exhausted recovery. See exact timestamps in the availability ledger.
- The best low-resolution acquisition trial passed 20 separate owners and 27
  decoded snapshots, with no resets and no surviving owner during idle. Its
  maximum request took 2.991 seconds. This is close to the accepted 3-second
  limit and below the required image resolution; it is not a production fix.
- `security find-identity -v -p codesigning` reported **zero valid identities**.
  No account contents, certificate identities or credentials were recorded.

Evidence: [control/ownership/H.264 inventory](../../.artifacts/camera-availability-2026-10-18/control-final-inventory.json),
[initial claim result](../../.artifacts/camera-availability-2026-10-18/control-inventory.json),
[mode readbacks](../../.artifacts/camera-availability-2026-10-18),
[intermittent capture](../../.artifacts/phase4-qa/2026-10-18T10-46-48-347Z/camera-availability.json).

### New macOS 27 route: Accessory Access

Current Apple documentation adds a route that the older libusb advice does not
cover: `AAUSBAccessoryManager` discovers accessories, and an `AAUSBAccessory`
can open exclusive USB access. It requires a normal app with a Dock presence
and the `com.apple.developer.accessory-access.usb` entitlement. The installed
macOS 27 SDK contains these APIs. A CLI flag or the sandbox USB entitlement
alone is not equivalent. [Apple manager documentation](https://developer.apple.com/documentation/accessoryaccess/aausbaccessorymanager),
[Claim USB Accessory entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.accessory-access.usb).

Built a minimal [enumeration-only AppKit probe](../../research/arducam/accessory-enumeration.m)
using the installed CLT 27 SDK/compiler, with matching criteria limited to this
VID/PID. It deliberately contains no exclusive-open call. An ad-hoc signed
launch was terminated with **SIGKILL (-9)** before producing a registration
result; allowlisted OS diagnostics report a **restricted entitlement**. This
is a measured signing/provisioning blocker, not a failure to enumerate the
camera through a successfully authorized API. Do not work around it by
weakening system security. The next useful step is a properly provisioned
developer-signed build; the owner has been asked whether a team is available.
[Process result](../../.artifacts/camera-availability-2026-10-18/accessory-process.json),
[signing diagnostic](../../.artifacts/camera-availability-2026-10-18/accessory-signing-diagnostics.json).

Apple also documents USB passthrough through `VZUSBPassthroughDeviceConfiguration`
using an `AAUSBAccessory`. A Linux guest could then compare another UVC parser
without another cable, but it still needs authorized device capture and adds
VM scheduling. It is not an independent physical-host comparison, and UVC
isochronous behavior must be measured. No VM was installed or USB device moved.
The retrieved Apple pages label these APIs beta, so SDK availability alone is
not a reliability claim. [Apple USB passthrough](https://developer.apple.com/documentation/virtualization/vzusbpassthroughdeviceconfiguration).

### Replacement architecture if independent capture warrants it

Use a small native installer/diagnostic app, a narrowly matched DriverKit
extension and a CMIO camera extension. Apple's documented override associates
the camera's UVC service with our `CameraAssistantBundleID`; the matching
extension does not provide packet transport or decoding. Match the measured
VID/PID and video interfaces, then verify descriptor topology before streaming.
Do not deploy a generic Microdia-wide match. Validate generated plists rather
than copying documentation snippets unchecked. [Apple UVC override](https://developer.apple.com/documentation/coremediaio/overriding-the-default-usb-video-class-extension).

Proposed data path:

```text
Exact camera match → one USB transport owner → PROBE/COMMIT/alternate verification
  → bounded isochronous buffers → payload/header audit → frame assembly/decode
  → CMIO stream → existing AVFoundation helper → Main-owned on-demand requests
```

The transport owns cancellation, disconnect, deadlines and recovery. Use the
current transaction-based IOUSBHost API, retaining each buffer until completion
and recording per-transaction status/actual length. The installed SDK describes
`IOUSBHostIsochronousTransaction` as a frame or microframe: do not confuse it
with each physical transaction in a high-bandwidth service interval. A bounded
ring must be measured under scheduling stress before determining its size.
[Apple asynchronous isochronous API](https://developer.apple.com/documentation/iousbhost/iousbhostpipe/enqueueiorequest%28with%3Atransactionlist%3Atransactionlistcount%3Afirstframenumber%3Aoptions%3Acompletionhandler%3A%29).

The CMIO layer should publish only verified formats, supply monotonically
advancing timestamps, stop when the last authorized client releases capture,
and expose recoverable failure. It must preserve macOS camera privacy. A
virtual camera that merely consumes the same failing AVFoundation input would
leave the failing USB path in place. Packaging and activation require an app in
`/Applications` and the system-extension approval flow; no extension is installed
by this investigation. [Apple camera-extension guide](https://developer.apple.com/documentation/coremediaio/creating-a-camera-extension-with-core-media-i-o).

Provisioning must include the applicable DriverKit and USB transport rights,
with device matching consistent with the signed profile. Approval for this
third-party VID cannot be assumed. A certificate by itself is insufficient.
We have not submitted an entitlement request, registered an app, contacted a
vendor or created a signing identity. [Apple entitlement requests](https://developer.apple.com/documentation/driverkit/requesting-entitlements-for-driverkit-development),
[USB transport entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.driverkit.transport.usb).

### What raw diagnostics must distinguish before adding a quirk

| Observation from an authorized transport | Interpretation / next experiment |
| --- | --- |
| USB completion errors, missed service or short transfers before header parsing | Investigate transport scheduling, power/link and firmware; a permissive image parser cannot reconstruct missing bytes. |
| Successful transfers, valid boundaries, but incorrect header length or optional-clock layout | Compare a precise parser rule against the specification; a narrowly scoped compatibility correction may be justified. |
| Repeated device ERR flags | Device-reported trouble; do not silently clear ERR to manufacture successful frames. |
| Broken FID/EOF behavior but complete decodable images and stable timestamps | A measured framing quirk may be viable, gated by exact device/firmware identity and regression cases. |
| Valid headers but short/oversized raw frames or JPEG decode errors | Check payload grouping, loss, device encoder and negotiated format before publishing frames. |
| Complete correctly sized, decoded frames through independent transport while Apple fails | Strong evidence for a host parser/negotiation compatibility issue; proceed with the supported replacement route and the full QA gates. |
| Both implementations fail with equivalent transport/header faults | Prioritize camera firmware/hardware or host transport; additional CMIO presentation code does not address the failure. |

Linux provides examples of explicit negotiation/bandwidth/framing workarounds;
libuvc uses different frame-boundary rules. These demonstrate that independent
parsers can discriminate the fault, not that any particular quirk applies here.
Do not port a Linux bitmask into macOS settings or publish partially assembled
buffers as success. [Linux UVC implementation](https://raw.githubusercontent.com/torvalds/linux/v6.12/drivers/media/usb/uvc/uvc_video.c),
[libuvc implementation](https://raw.githubusercontent.com/libuvc/libuvc/master/src/stream.c).

The new [payload auditor](../../research/arducam/README.md) implements the
metadata-only part of this discriminator. ASan/UBSan and 65,536 synthetic
header/flag/length combinations pass. It performs no USB I/O and retains no
image bytes. Real payload access, transport adaptation, compressed-frame decode,
CMIO publication, signing, activation and physical qualification remain undone.
This is useful preparatory code, not a claimed custom-driver repair.

### Engineering exit rule

First obtain provisioned USB access or an independent host and feed live
transport/header statistics into the auditor. Try verified low YUY2, usable
MJPEG, then the separate H.264 interface. If a bounded correction yields valid
images, qualify still bursts, 30-second video delivery and encoding, deliberate
recovery, then 48 hours of intermittent use. Keep the existing camera untouched
by a new production default until those gates pass. Exact SKU/board/firmware
identification and electrical/cable controls remain unresolved; the available
cable was used throughout this work.

## Broader macOS USB-camera failures and practical workarounds

Follow-up research on 2026-10-18 covers generic UVC webcams, inexpensive HDMI
capture devices, Logitech cameras, Elgato capture devices and an open-source
Raspberry Pi webcam. Price is not a fault diagnosis: similar frozen previews
can originate in very different layers. First-person issue reports below are
leads, with OS and resolution status stated; they are not universal fixes.

| Failure class and primary evidence | Workaround or discriminator | Applicability here |
| --- | --- | --- |
| Application queue/buffer starvation. Apple's [TN2445](https://developer.apple.com/library/archive/technotes/tn2445/_index.html) distinguishes late frames, exhausted buffers and discontinuity. A Mac OBS user [reported reducing latency by disabling buffering](https://obsproject.com/forum/threads/webcam-lagging-massively-in-obs.137854/) on OBS 27.2/macOS 11.6.4. | Drain callbacks, bound queues, release buffers promptly, discard obsolete frames and use supported lower capture rates. Separate delivery from face processing/encoding. | Already tested with Vision, JPEG and pixel copying bypassed; failures persist. Production uses late-frame discard. Additional UI buffering changes cannot explain the measured lower-layer invalid payloads. |
| Firmware descriptor compatibility. [Show-me Webcam issue 164](https://github.com/showmewebcam/showmewebcam/issues/164) reproduced failure after macOS 12.0.1 on Intel and M1. Changing its sole USB configuration value from 2 to 1 restored detection/MJPEG; a [source change](https://github.com/stoggi/showmewebcam/commit/70f18e210b5ce2bc1d1595e691b1a3c81b08fcf9) records the repair. Switching to raw video alone had failed. | Compare descriptors/selected configuration across OS versions, and correct a specifically identified firmware incompatibility. | Strong precedent for an OS/firmware interaction, not proof this camera has that bug. Our camera already uses configuration 1. Its inconsistent 1080p YUY2 COMMIT limits are a different lead. |
| Unsupported or misleading modes. A [$20 capture-device owner](https://obsproject.com/forum/threads/obs-studio-usb-video-capture-fatal-no-jpeg-data-found-in-image-error-decoding-video.134130/) reported resolving JPEG errors with explicit 1080p/30 MJPEG; a later owner in the same thread still failed. OS was not established for that remedy. | Select a verified format/resolution/rate tuple, check actual decoded dimensions and source timestamps, and avoid relying on advertised headline FPS. | Both raw and compressed candidates have been tested. Direct 1/2-fps setters reject; 5 fps accepts but does not deliver reliably. This is not evidence that requesting any smaller number will lower the wire rate. |
| Application/provider interaction. [OBS 9472](https://github.com/obsproject/obs-studio/issues/9472) reports black USB sources on macOS 13/M2 while Photo Booth works; powered hub and direct attachment both failed for that reporter. [OBS 4150](https://github.com/obsproject/obs-studio/issues/4150) reports temporary recovery by switching away/back on Big Sur. Neither establishes a universal repair. | One capture owner; release/recreate the source, compare a minimal native client and another app at the same actual mode. Avoid concurrent camera utilities and unnecessary virtual-camera chains. | Serialized ownership and matched native-helper controls are already in place. Reopening/re-enumeration can recover individual frames but not sustained supply. |
| Newer app/OS-specific freeze. A [Cam Link/M2 OBS report](https://obsproject.com/forum/threads/camera-freezing-on-obs-32-0-2-macos-tahoe-26-1-m2-cam-link-4k.192047/) says QuickTime works while OBS freezes after an update. The post mixes inconsistent macOS version labels and has no confirmed fix. | Preserve exact OS/app versions and compare identical modes. A successful alternative app is a useful discriminator, not proof the electrical link is perfect. | Our investigation identifies macOS build 26A434 and the signed helper route. An OS update/downgrade is not a justified blind repair or performed experiment. |
| Negotiation/driver quirks. [libuvc 282](https://github.com/libuvc/libuvc/issues/282) reports a requested/returned payload-size mismatch; its proposed ignored check remains an issue suggestion. [Linux UVC code](https://raw.githubusercontent.com/torvalds/linux/v6.12/drivers/media/usb/uvc/uvc_video.c) has explicit device compatibility branches. | Observe PROBE/COMMIT, endpoint capacity, transfer completion status and frame boundaries through an independent transport before adding a narrow quirk. | Relevant to inconsistent readback and invalid payloads. Do not silently ignore size bounds or device error flags to count corrupt frames as healthy. Raw capture is blocked by current interface ownership/provisioning. |
| Independent-stack application errors. [libuvc 325](https://github.com/libuvc/libuvc/issues/325), macOS 26.6.2, reports a delivered frame followed by an AppKit main-thread exception in its display example. [Older issue 16](https://github.com/libuvc/libuvc/issues/16) reports a stop-streaming hang. | Start with a headless, bounded metadata collector; separate transport from GUI and explicitly test cancellation. | Installing libuvc alone is not a guaranteed replacement driver. Our proposed collector deliberately has no GUI or saved imagery. |
| Power/link/topology. [Apple's USB-power guidance](https://support.apple.com/en-us/102204) recommends direct attachment/another port and checking powered-hub supply when USB devices are disabled. | Compare existing ports/controllers, eliminate extensions/adapters when possible, and later compare known-good power/cable hardware. Distinguish a power warning/disconnect from malformed image delivery. | Camera is already alone on its controller; no electrical current/voltage measurement or substitute cable exists. Low-bandwidth failure weakens a pure throughput explanation but does not exclude cable/power defects. |
| Legacy camera software blocked after OS upgrade. [Apple's Sonoma 14.1 notice](https://support.apple.com/en-us/108387) concerns legacy camera/video-output plug-ins. | Prefer supported vendor camera extensions; verify whether a legacy plug-in is involved before following a security-changing recipe. | This camera uses Apple's UVC extension. No evidence connects its failure to that legacy plug-in restriction; the workaround is not applicable. |

For occasional stills, short owned acquisition windows can reduce idle traffic
and heat. They must nevertheless pass cold-start and long-idle latency tests;
repeated opening is not itself a reliability guarantee. A one-frame-per-second
application timer drops work after delivery, whereas lower USB traffic requires
a supported capture interval or stopping the stream. The camera advertises no
separate UVC still-trigger path. Current evidence supports no reliable HD
on-demand implementation yet.

### What software disable/re-enable means on this Mac

[Apple's IOUSBLib declarations](https://github.com/apple-oss-distributions/IOUSBFamily/blob/main/IOUSBFamily/Headers/IOUSBLib.h)
separate three operations: reset without rediscovery, suspend/resume, and
re-enumeration that terminates clients/interfaces and emulates unplug/replug.
Our production recovery already uses the latter after releasing capture. It
does not guarantee electrical power removal. Unconfiguring/reconfiguring is
another device-level operation; our diagnostic verified configuration 1 → 0 → 1
with successful GET/SET statuses. It also affects the composite camera's audio
interfaces, so a known separate microphone is required.

The [new physical trials](camera-availability-qa-2026-10-18.md#follow-up-direct-api-requests-and-disablere-enable)
found suspend/resume status success but no observed suspended flag, followed by
one late HD frame and a stall. Unconfigure/reconfigure succeeded, followed by
zero frames. These failures rule out adopting either operation as a demonstrated
repair. No result establishes that firmware actually rebooted.

True power cycling requires a port that really switches VBUS. Upstream
[uhubctl documentation](https://github.com/mvp/uhubctl/blob/master/README.md)
requires suitable hub hardware and warns that some devices disconnect data
without cutting power. USB 3 hubs can expose separate USB 2/3 companions. Its
macOS 26+ path requires libusb >=1.0.30, including the
[port-number fix](https://github.com/libusb/libusb/pull/1700).

The installed libusb is 1.0.30. Read-only hub descriptors show two Apple hubs
with individual-port switching, but the Arducam is directly on a root XHCI
port, outside those hub branches. Thus there is **no verified software VBUS
switch for its current attachment**. Moving the existing cable to a different
port could make one available; actual downstream matching and power loss must
then be verified before switching. No hub or unrelated port was switched.
Do not infer current-machine compatibility from the upstream list's Mac mini
M4 front-port entry. [Measured topology/capabilities](camera-availability-qa-2026-10-18.md#follow-up-direct-api-requests-and-disablere-enable).

### Resulting priority

The application-side rate, conversion, buffering-bypass, exposure, acquisition,
reopen, logical replug, suspend and reconfiguration hypotheses have bounded
evidence. None qualifies usable HD supply. The highest-value next discriminator
is independent USB transport with proper provisioning, or the same camera and
cable on another host. Exact SKU/board identification is needed before vendor
firmware investigation. A verified power-switchable attachment would enable
the stronger automated recovery experiment the owner proposes. These are
concrete access/hardware prerequisites, not reasons to repeat the failed API
matrix or lower the accepted still/video/48-hour criteria.

## Full-resolution directive and independent transport, from 21:31 Taipei

The owner now explicitly requires the highest advertised resolution, **1920×1080**.
Small images cannot satisfy the repair. The application separately reduced its
JPEG long edge to 1280 pixels at quality 0.7; the native encoder and IPC contract
now preserve actual 1920×1080 at fixed JPEG quality 0.95, with a 4 MiB JPEG cap
and 6 MiB framed-message cap. Oversize encoding reports failure rather than
lowering JPEG quality. This fixes a downstream quality limit; it cannot repair
missing source pixels or justify upscaling a smaller capture.

Noninteractive administrator access is available. A newly built exact-device
libusb probe successfully detached the whole composite camera, claimed video
interfaces 0/1/2, released all three and restored Apple's driver. Independent
GET-only checks confirmed driver-active=1 on all three afterward. Each physical
test runs under the Electron ownership lease, with normal Electron stopped,
zero camera helpers and independently verified Jabra input/output. The earlier
ordinary-user ACCESS result is **not a root-access blocker**.

An isolated upstream [libuvc](https://github.com/libuvc/libuvc) build at commit
`d07de4fa23905ee8cac06f5d24b2a03d42a3b363`, using installed libusb 1.0.30, has now
received this camera's real USB payloads. No library was installed into the
system or added as an application dependency. The original headless probe and
small instrumented upstream patch are in [research/arducam](../../research/arducam/README.md).
Images are RAM-only; diagnostics contain counts, dimensions and relative timing.

The independent path still fails at full HD. MJPEG5/15, YUY2/5 and interface-2
H264/15 receive initial payloads, then transport stops. The instrumented runs
report macOS error `0xe000400e`, `kIOUSBNotSent1Err` (transaction not sent), which
libusb maps to `LIBUSB_TRANSFER_ERROR`. Increasing the request queue from 20 to
100 does not fix it; one bounded resubmission per transfer also fails. This is
distinct from Apple's earlier invalid-payload counters. We cannot assert that
all Apple failures share this exact cause, or that libusb's legacy transport
behavior is free of defects. [Apple error symbol](https://developer.apple.com/documentation/iokit/kiousbnotsent1err),
[libusb Darwin mapping and scheduling](https://github.com/libusb/libusb/blob/v1.0.30/libusb/os/darwin_usb.c).

Direct YUY2 negotiation selects descriptor **frame 1** and reports the sensible
4,147,200-byte frame / 3,072-byte payload, unlike the earlier Apple-associated
frame-9 / 17,171,712 / 8,192 observation. It still produces no complete frame.
Correcting negotiation alone therefore has not repaired delivery.

Direct UVC PROBE accepts and echoes unadvertised 1 FPS and 2 FPS frame
intervals, whereas AVFoundation rejects those duration settings.
Neither direct request yields a usable full-HD photo or sustained cadence.
At requested 2 FPS, the four observed FID transitions are approximately 260 ms
apart, not 500 ms. These are partial-stream header timings, not decoded frame
timestamps. Parameter acceptance therefore does not establish lower bandwidth
or a valid 2 FPS capture mode. See the [exact physical ledger](camera-availability-qa-2026-10-18.md).

### Remaining driver and firmware routes

| Route | What it adds and what is still required |
|---|---|
| Native root IOUSBHost transport | Bypasses libusb's legacy `ReadIsochPipeAsync` scheduling as well as Apple's UVC parser. Apple DTS identifies privilege escalation as a route for directly distributed USB capture. It still uses this Mac's controller and cannot distinguish the cable electrically. [DTS](https://developer.apple.com/forums/thread/747029), [native pipe](https://developer.apple.com/documentation/iousbhost/iousbhostpipe). |
| Development-signed DriverKit | Feasible with a paid developer team, Apple Development identity and profiles. Apple DTS documents development entitlements without special distribution approval or disabling SIP. No signing identity is currently installed. Root permission alone does not provide the identity/profile. A measured correction should precede production driver packaging. [Apple signing guidance](https://developer.apple.com/forums/thread/809202). |
| CMIO camera extension | Can publish a proven custom transport as a system camera. Apple's override DEXT/`CameraAssistantBundleID` mechanism selects the extension; it does not itself implement UVC transport or repair packets. [Apple architecture](https://developer.apple.com/documentation/coremediaio/overriding-the-default-usb-video-class-extension). |
| macOS 27 Accessory Access | Requires an appropriately provisioned app, USB capability and user assignment. The prior ad-hoc probe was killed for its restricted entitlement. Root does not substitute for entitlement provisioning. [Manager requirements](https://developer.apple.com/documentation/accessoryaccess/aausbaccessorymanager). |
| Alternative existing implementations | Pupil Labs pyuvc uses direct MJPEG/libusb and documents root on macOS; it is another parser/control implementation, not another USB backend. OpenPnP uses AVFoundation on macOS. Old macam builds are not established Apple Silicon/macOS 27 replacements. The Thor DriverKit prototype demonstrates packaging and 640×480 **bulk** capture for different hardware, not this camera's isochronous 1080p. [pyuvc](https://github.com/pupil-labs/pyuvc), [OpenPnP](https://github.com/openpnp/openpnp-capture), [Thor limits](https://github.com/SiboVG/thor-camera-driver/blob/master/native/macos/README.md). |
| Exact-board firmware | Arducam B0520 is a plausible model: the official page advertises 1080p MJPEG/H26430 and YUY2/5. PID0520 does not identify that SKU or board revision. No matched public firmware image has been verified; vendor documentation says staff supply firmware. Exact SKU/revision, read-only version identification, matched release notes and recovery procedure are prerequisites. [Product](https://www.arducam.com/arducam-2mp-low-light-usb-camera-module-with-m12-pinhole-lens.html), [configuration tools](https://docs.arducam.com/UVC-Camera/UVC-Camera-Configuration-Guide/), [firmware process](https://docs.arducam.com/UVC-Camera/Firmware-Burning/). |
| Another physical Linux/Windows host | Strongest comparison of OS driver and host controller, using the same camera/cable and verified actual 1080p. A successful alternate host could also provide a full-resolution local capture bridge. It does not require accepting smaller images. |
| Genuine VM USB passthrough | Ordinary shared-camera mode reuses host capture and is not independent. UTM's Apple backend currently documents a webcam/isochronous limitation; QEMU and Fusion raw USB are separate candidates but still depend on Mac USB capture/scheduling. [UTM issue and merged limitation](https://github.com/utmapp/UTM/issues/7914), [UTM QEMU constraints](https://docs.getutm.app/guest-support/sharing/usb/), [Fusion raw camera passthrough](https://knowledge.broadcom.com/external/article?legacyId=2145940). |
| Verified port power cycle / alternate existing port | Logical re-enumeration, suspend and configuration cycling have been tested without repair. Actual VBUS removal requires a verified controllable attachment; the current root-port topology has none established. Moving the existing cable is a useful later discriminator, but no cable or port was physically changed in these trials. |

The survey did not find a verified drop-in driver or firmware repair for this
specific camera/macOS combination. Vendor utilities were not executed, firmware
was not flashed, and no OS/security changes or third-party driver installs were
made. Some Arducam software pages returned HTTP403; indexed official text was
available, but no matching utility/firmware binary was verified.

### Correction to strict JPEG validation and the burst candidate

The first diagnostic required JPEG EOI to occupy the final two buffer bytes.
Later metadata showed buffers beginning with SOI and containing EOI but carrying
additional bytes afterward. That strict rule can reject a complete JPEG; earlier
zero validation counts must not be read as proof that every buffer was an
incomplete image. The original results are retained with this limitation.

The probe now parses JPEG segment lengths and entropy markers to locate the
primary image's EOI, skipping embedded thumbnail markers and escaped/restart
bytes. It decodes only that complete prefix, checks actual1920×1080 dimensions
and draws the bitmap in RAM. It does not fabricate missing image bytes or scale
the image. Synthetic truncation and65,536 segment-length cases pass ASan/UBSan.
The first corrected full-HD burst produced a validated photo in0.924s and
completed release/driver restoration in1.342s;6 trailer bytes were excluded.
Repeated acquisition is being measured separately from sustained video. This
does not erase the independently measured USB transaction failures.

The corrected burst candidate passed20 independent full-HD acquisitions, maximum
first-valid latency0.991320s, with driver restoration after each request. Native
IOUSBHost ASAP transport separately continued for20s (297FID transitions and
292EOF markers), with both successful and NotResponding packet statuses retained.
That version counted payloads only; decoded-video validation is separate.

### A measured legacy backend defect and experimental correction

Giving libuvc34-byte controls alone did not repair its stall. An isolated build
of libusb1.0.30 (`87a55632db62c9bdc58cd31d3ccfa673f1bb017f`) then inspected the
per-packet results inside aggregate NotSent1 errors. In one trace,20 failed
transfers contained**139 successful packets,21 failed packets and51,572 good
bytes**. The existing Darwin completion path copies isochronous packet results
only for selected aggregate statuses; NotSent1 skips that copy, and libuvc
permanently retires each transfer reported as ERROR. The queue consequently
drains. This explains the **independent legacy path's** shutdown; it does not
prove the same implementation defect in Apple's UVC code.

The experimental correction initializes per-packet results before submission,
validates actual length against requested capacity, and, **only for0c45:0520**,
delivers mixed NotSent1 completions with their individual packet statuses when
some valid data exists. Failed packets retain their errors; raw aggregate errors
remain counted. Empty/all-failed and unrelated-device errors retain the existing
behavior. This is not a blanket success conversion or error suppression.

The first corrected35-second MJPEG15 run stayed live:511 buffers,469 validated
1920×1080 JPEGs, no polling timeouts, largest buffer-receipt gap68ms. It retained
9,618 failed-packet statuses and6,880 raw NotSent1 aggregate errors. Thus the
shutdown is corrected in this trial, while imperfect frame delivery remains.
[Trace](../../.artifacts/camera-availability-2026-10-18/libuvc-mjpeg15-backendtrace.json),
[first correction trial](../../.artifacts/camera-availability-2026-10-18/libuvc-mjpeg15-partialiso.json).

At requested30FPS, the corrected path delivered**857 validated1920×1080 images
in the30-second measurement window after5-second warmup:28.566667 validFPS**.
Per-second counts were24–30; maximum valid-image receipt gap100.008ms. It retained
7,288 failed packet statuses. This meets the initial decoded-delivery FPS/gap
targets, but it is not an encoded clip, human visual acceptance, application
integration or days-long qualification.
[30FPS correction trial](../../.artifacts/camera-availability-2026-10-18/libuvc-mjpeg30-partialiso.json).

Source changes and the LGPL license are retained in the research directory;
the custom library is statically linked only into an ignored diagnostic binary.
The installed Homebrew/system libusb, Apple driver and production capture owner
are unchanged. A production privileged helper or DriverKit implementation still
needs ownership, cancellation, signing/installation and multi-day validation.

### Follow-through: sustained capture, low rates and video

The five-minute measurement produced **8,517 actual decoded 1920×1080 images,
28.39 valid FPS, maximum valid receipt gap 134 ms**, without reopening or reset.
The independent native IOUSBHost implementation also decoded fresh full-HD
images continuously, but its requested 15 FPS trial supplied 14.07 valid FPS;
that setting misses the initial video threshold. Native PTS had no duplicates
or regressions. Both paths preserve failed-packet counts and restore Apple
drivers after release. Details and retained failures are in the
[QA ledger](camera-availability-qa-2026-10-18.md#five-minute-full-resolution-delivery-and-independent-decoding).

After correcting the transport, direct full-HD 1/2/5 FPS tests all produced
about **3.85 source FPS**, despite echoing the three distinct requested
intervals. Valid image supply was 3.70/3.70/3.77 FPS. Thus true 1 or 2 FPS is
not implemented in these observations. This low-traffic mode remains a possible
avatar/gaze source; avatar animation is independent. For idle availability,
release/reacquire avoids continuous USB streaming entirely, and the 20 full-HD
burst results support investigating that policy. Neither policy is production
qualified yet.

Actual hardware H264 encode/decode then passed on 848 full-HD source images
over the 30-second measurement: 848 compressed and 848 decoded, zero codec
errors/drops/timestamp errors, actual 1920×1080 on both sides, 28.27 valid FPS.
No video file was saved, so container writing/playback remains a distinct gate.
[Codec evidence](camera-availability-qa-2026-10-18.md#actual-full-hd-hardware-video-encodedecode).

### Owner-confirmed product and firmware boundary

The owner supplied the [2MP low-light USB module with M12 pinhole lens product
link](https://www.arducam.com/arducam-2mp-low-light-usb-camera-module-with-m12-pinhole-lens.html).
The product page returned HTTP 403 to the research fetch. Arducam's current
[configuration guide](https://docs.arducam.com/UVC-Camera/UVC-Camera-Configuration-Guide/)
lists B0520 and B052001 under the Sony IMX291 2MP low-light family. This supports
the family identification; the exact PCB/firmware revision still needs vendor
confirmation rather than inference from PID 0520 or bcdDevice 0100.

Arducam's [firmware instructions](https://docs.arducam.com/UVC-Camera/Firmware-Burning/)
say firmware is supplied privately by their staff and call for physical
unplug/replug after programming. No model-matched firmware image has been
provided, downloaded or flashed. The useful vendor case is now concrete:
macOS 27.0.1/26A434, 0c45:0520, full-HD failure through Apple UVC, UVC 1.00
descriptor with 34-byte PROBE/COMMIT GET_LEN, ignored 1/2 FPS cadence, and
successful custom transport with preserved mixed packet results. Ask the vendor
whether an IMX291/B0520 firmware revision corrects those negotiation/transport
behaviors and request exact revision matching plus rollback procedure. No
message has been sent to the vendor.

### Final integrity result and practical next steps

The apparent delivery breakthrough does **not** qualify the camera. Strict
libjpeg-turbo decoding found predominantly premature ends of compressed image
data. At full-HD MJPEG30, only 2/975 ImageIO-valid images were warning-free;
MJPEG5 achieved 5/124, and increasing USB batches from 8 to 128 packets achieved
2/965. The native ASAP path obtained zero strict-valid images, independently of
the legacy libusb transport. Uncompressed full-HD frames were all short. The
camera's lower-bandwidth H264 stream also produced decoder errors (693 decoded
1080p frames, 655 error lines). See the
[integrity evidence](camera-availability-qa-2026-10-18.md#strict-image-integrity-check-overrides-usable-image-interpretation).

This distinguishes two issues: the custom backend fixes receive-queue exhaustion,
but image bytes are still missing/corrupt before a usable picture is produced.
Driver code cannot recover bytes that did not arrive merely by suppressing
errors. A different scheduling/firmware/host combination could prevent their
loss; that remains a hypothesis requiring a new discriminator. Neither a bad
cable nor an Apple-specific defect has been uniquely established. Lower
resolution working better is consistent with load-dependent loss, but does not
identify cable, power, firmware, host controller or driver individually.

| Path | Current decision |
| --- | --- |
| Full-HD custom capture helper | Source/probes exist; keep experimental until strict clean-frame latency and video gates pass. No production install. |
| Low-FPS full-HD standby / release during idle | Remains architecturally appropriate; 1/2 FPS requests are not honored and current full-HD pixels fail integrity. Cannot qualify from the earlier permissive bursts. |
| DriverKit or CMIO replacement | Feasible longer-term packaging/ownership routes, not evidence of a solution to the remaining byte loss. Native IOUSBHost already bypassed Apple UVC and still failed integrity. |
| Targeted logical reset/configuration cycle | Already measured; not a verified VBUS power cycle and did not restore sustained full-HD supply. |
| Vendor firmware | Request exact B0520/B052001/PCB-matched revision, relevant fixes, rollback and programming requirements. No supplied matching binary; no blind flash. |
| Physical port/controller/powered hub or another host | Valuable discriminators when physically available; existing cable retained throughout. Current port has no verified remote VBUS switch. |
| Application integration / 48-hour soak | Held behind source-integrity and recovery gates. Running a long soak on known corrupt frames would not qualify the user's goals. |

If source integrity is repaired, retain Main's existing camera lease, one
unprivileged full-HD decoder for still/gaze consumers, and a bounded optional
30-second encoder. A root-owned fixed native transport helper or restricted
on-demand LaunchDaemon is a feasible local route; do not run user-writable code
permanently as root or grant arbitrary sudo commands. Initial composite claim,
reclaim and reset must all guard camera/unknown microphone selection. Parent
loss and cancellation need a privileged-side watchdog because an unprivileged
Main cannot be assumed to kill root children. This engineering work is distinct
from Developer ID/DriverKit distribution. The current application has gaze and
portrait capture seams, but no implemented face-identity recognizer or camera
recording feature; those must share the same capture owner when added.

## Revised acceptance, vendor controls and persistence, 23:17 Taipei

The owner authorizes a custom driver/direct USB path and requires a persistent
solution while abroad. Highest actual resolution remains 1920×1080; very low
FPS and tiny edge defects are acceptable, the face must remain intact, and the
normal fresh-photo deadline is 5 seconds. The previous zero-warning gate is
therefore a diagnostic discriminator, not the only possible acceptance rule.
No current result qualifies a damaged image merely because ImageIO decodes it.

Additional physical tests cover maximum endpoint reservation, per-process/thread
priority, standard compression-quality controls, the remaining advertised
MJPEG10/20/25 rates, a real five-second cold burst, and H2645. None qualified.
Failed-packet offsets and a RAM-only prefix decoder show that reported loss
usually precedes much of the image. Across the measured prefix trials, no
damaged JPEG candidate was conservatively confined to the last eight rows.
This does not measure actual visual damage: decoder progress, missing-byte
locations and perceived artifacts are different quantities. The JPEG restart
interval is absent, preventing a straightforward local entropy-recovery bound.
[All new measurements](camera-availability-qa-2026-10-18.md).

Matching vendor extension GUIDs, fixed chip-ID readback 0x92/DRAM 0x00 and exact
control lengths identify the Sonix SNC292A control protocol on this specimen.
The public [Kurokesu Sonix implementation](https://github.com/Kurokesu/C1_SONIX_Test_AP/blob/master/sonix_xu_ctrls.c)
documents separate MJPEG bitrate, H264 bitrate and H264 GOP controls. Initial
readbacks are 45 Mbps, 10 Mbps and GOP 29 respectively; H264 mode reads CBR.
These controls are volatile settings, restored/read back after each experiment.
Matching that protocol does not authorize other-board firmware or undocumented
register/flash writes. The advertised/answering control masks do not support the
sample SDK's substream FPS/frame-dropping commands on this specimen.

MJPEG 8/4 Mbps did not meet latency/integrity. H264 1 Mbps sustained all 129
source buffers and decoded 77 full-HD frames, versus zero frames at the original
10 Mbps setting for the same requested 5 FPS. Errors remain. GOP 1 produces more
independent-frame candidates but more actual bytes/errors; the requested bitrate
is not a demonstrated hard bandwidth ceiling. A dedicated unprivileged decoder
now distinguishes true IDR frames and reported frame damage; successful
decoding of predictive frames does not establish intact references.

The dedicated checker passes 19 focused and twelve RAM-only integration cases.
At requested 5 FPS/1 Mbps, GOP 1 and GOP 5 produced zero clean IDRs; VBR at QP 25
and QP 35 also produced zero, with receive-queue exhaustion on all-failed
transfers. Original GOP 29 produced one clean IDR at 2.251 s in 35 seconds.
The targeted five-second cold-start follow-up produced one at 2.558 s, but the
next cold start produced none. This promising first-frame behavior is therefore
not repeatable enough for deployment. A decoded IDR without reported damage
does not certify human face quality. No conservative edge-only bound was found
for the damaged JPEG candidates. The latest criterion accepts very low FPS;
these trials fail usable-image availability, not the former 15-FPS minimum.
[Complete IDR and repeatability evidence](camera-availability-qa-2026-10-18.md#h264-independent-frame-checks-and-cold-start-repeatability-23182332).

A deployable persistent fix must meet all of the following, after usable source
selection is demonstrated:

- Install a fixed root-owned transport binary with protected parent directories
  and pinned libraries; expose only the exact camera/approved settings through
  restricted local IPC. No root execution from a user-writable checkout.
- Keep USB transport and unprivileged decoding separate; Main retains the
  single camera lease and RAM-only portrait ownership. Guard initial composite
  claim as well as reset/reclaim against camera/unknown microphone use.
- Reapply the qualified settings after enumeration/reconnect. A privileged-side
  parent-loss deadline releases the device and restores ownership; failures
  surface metadata reasons without blocking conversation. Electron's existing
  LaunchAgent remains its only restart owner.
- Verify actual app integration with the avatar active, repeated idle/capture
  transitions, helper/app restart and reboot, then the 48-hour intermittent
  soak. Persisting a failing transport or a readback-only setting is not a fix.

This is the authorized deployment route, not an installed service or a claim
that restart/reboot/48-hour QA has passed. No physical cable change is assumed.
The bounded trials ended at 23:32 with original UVC/Sonix controls and Apple
drivers restored, normal Electron PID 19470 Dormant/wake-listening, Jabra levels
restored, and the research lease released. No background capture remains.

Further progress needs a new discriminating input, such as exact vendor-matched
firmware information or another physical USB path/host. The experiments do not
prove that every conceivable software change will fail, nor isolate the cable
as the cause. They do establish that neither bypassing Apple UVC, preserving
partial completions, lower requested FPS, the tested compression controls nor
logical resets presently meets the five-second repeatable photo requirement.
