// Transient gaze boxes and requested JPEG frames. No recognition or disk storage.
// stdout is a private pipe to Electron Main, never a log file.
import AVFoundation
import Foundation
import Vision
import CoreImage
import Darwin

setvbuf(stdout, nil, _IOLBF, 0)
let parentPID = getppid()

final class CameraTracker: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate {
    let queue = DispatchQueue(label: "com.magicmirror.camera", qos: .utility)
    let visionQueue = DispatchQueue(label: "com.magicmirror.camera.vision", qos: .utility)
    var session: AVCaptureSession?
    var deviceID: String?
    var lastFrame = ProcessInfo.processInfo.systemUptime
    var lastDetection = 0.0
    var lastFrameReceipt = 0.0
    var detectionPending = false
    var captureGeneration = 0
    var lastFace = ProcessInfo.processInfo.systemUptime
    var lastReason = ""
    var stopping = false
    var timer: DispatchSourceTimer?
    var captureID: Int?
    var waitingForRecovery = false
    var reopenAfter = 0.0
    // Isolated native QA can withhold frames once to exercise the real reset.
    var qaStallOnce = CommandLine.arguments.contains("--qa-stall-once")
    var qaStallAfter: Double?
    var qaStallReported = false
    let qaDeliveryOnly = CommandLine.arguments.contains("--qa-delivery-only")
    var qaSourceTime = CMTime.invalid
    var reportedDrops = Set<String>()
    let imageContext = CIContext(options: [.cacheIntermediates: false])
    let needle = CommandLine.arguments.dropFirst().first ?? "Arducam"

    func emit(_ value: [String: Any]) {
        guard let bytes = try? JSONSerialization.data(withJSONObject: value),
              let line = String(data: bytes, encoding: .utf8) else { return }
        print(line)
    }

    func status(_ reason: String, ready: Bool = false) {
        guard lastReason != reason else { return }
        lastReason = reason
        emit(["type": "status", "status": ready ? "ready" : "degraded", "reason": reason])
    }

    func start() {
        // Commands and JPEG replies stay in private pipes, never files or logs.
        // Main holds stdin open for this helper's lifetime; EOF means Main is
        // gone. The reader thread bounds exit even if the capture queue is wedged.
        Thread {
            while let line = readLine() {
                guard line.utf8.count < 256, let bytes = line.data(using: .utf8),
                      let command = try? JSONSerialization.jsonObject(with: bytes) as? [String: Any] else { continue }
                if command["type"] as? String == "capture", let id = command["id"] as? Int, command.count == 2 {
                    self.queue.async { if !self.stopping { self.captureID = id } }
                } else if command["type"] as? String == "reset_usb", command.count == 1 {
                    self.queue.async { self.resetUSB() }
                }
            }
            self.queue.async { self.shutdown(); exit(0) }
            Thread.sleep(forTimeInterval: 2)
            _exit(0)
        }.start()
        NotificationCenter.default.addObserver(forName: AVCaptureDevice.wasConnectedNotification,
            object: nil, queue: nil) { [weak self] _ in self?.queue.async {
                self?.waitingForRecovery = false; self?.reconcile()
            } }
        NotificationCenter.default.addObserver(forName: AVCaptureDevice.wasDisconnectedNotification,
            object: nil, queue: nil) { [weak self] _ in self?.queue.async { self?.reconcile() } }
        NotificationCenter.default.addObserver(forName: AVCaptureSession.runtimeErrorNotification,
            object: nil, queue: nil) { [weak self] _ in self?.queue.async {
                self?.status("camera_capture_failed")
            } }
        queue.async {
            if CommandLine.arguments.contains("--reset-usb-first") { self.resetUSB() }
            else { self.reconcile() }
        }
        let ticker = DispatchSource.makeTimerSource(queue: queue)
        ticker.schedule(deadline: .now() + 2, repeating: 2)
        ticker.setEventHandler { [weak self] in
            guard let self else { return }
            if getppid() != parentPID { self.shutdown(); exit(0) }
            self.emit(["type": "heartbeat"])
            self.reconcile()
        }
        timer = ticker
        ticker.resume()
    }

    func shutdown() {
        stopping = true
        timer?.cancel()
        releaseCapture()
    }

    func releaseCapture() {
        captureGeneration += 1
        qaSourceTime = .invalid
        captureID = nil
        autoreleasepool {
            session?.outputs.forEach { ($0 as? AVCaptureVideoDataOutput)?.setSampleBufferDelegate(nil, queue: nil) }
            session?.stopRunning()
            session = nil
        }
    }

    func resetUSB() {
        guard !stopping else { return }
        guard AVCaptureDevice.authorizationStatus(for: .video) == .authorized else {
            status("camera_permission_denied"); return
        }
        // AVFoundation's USB ID encodes location/vendor/product. Cross-check all
        // three against exactly one IOKit device; never reset by a name substring.
        var id = deviceID
        if id == nil {
            let devices = AVCaptureDevice.DiscoverySession(deviceTypes: [.external],
                mediaType: .video, position: .unspecified).devices.filter {
                $0.localizedName.localizedCaseInsensitiveContains(needle)
            }
            // A replacement has no selected capture device yet. Refuse to
            // guess between identically named cameras before touching USB.
            guard devices.count == 1 else {
                status(devices.isEmpty ? "camera_device_absent" : "camera_usb_reset_ambiguous"); return
            }
            id = devices[0].uniqueID
        }
        guard let id, id.hasPrefix("0x"), let packed = UInt64(id.dropFirst(2), radix: 16) else {
            status("camera_usb_reset_unsupported"); return
        }
        status("camera_usb_reset_releasing")
        releaseCapture()
        deviceID = nil
        waitingForRecovery = true
        status("camera_usb_resetting")
        let result = mirror_camera_usb_reset(UInt32(truncatingIfNeeded: packed >> 32),
            UInt16(truncatingIfNeeded: packed >> 16), UInt16(truncatingIfNeeded: packed))
        let reasons = ["camera_usb_reset_complete", "camera_usb_reset_device_absent",
            "camera_usb_reset_ambiguous", "camera_usb_reset_access_failed",
            "camera_usb_reset_open_failed", "camera_usb_reset_failed"]
        status(reasons.indices.contains(Int(result)) ? reasons[Int(result)] : "camera_usb_reset_failed")
        if result == 0 {
            qaStallOnce = false
            waitingForRecovery = false
            reopenAfter = ProcessInfo.processInfo.systemUptime + 2
            // Reopen as soon as the re-enumeration grace ends, rather than
            // waiting up to another two seconds for the periodic watchdog.
            queue.asyncAfter(deadline: .now() + 2) { [weak self] in self?.reconcile() }
        }
    }

    func reconcile() {
        guard !stopping else { return }
        guard ProcessInfo.processInfo.systemUptime >= reopenAfter else { return }
        guard AVCaptureDevice.authorizationStatus(for: .video) == .authorized else {
            session?.stopRunning(); session = nil; deviceID = nil
            status("camera_permission_denied")
            return
        }
        let discovery = AVCaptureDevice.DiscoverySession(deviceTypes: [.external],
            mediaType: .video, position: .unspecified)
        guard let device = discovery.devices.first(where: {
            $0.localizedName.localizedCaseInsensitiveContains(needle)
        }) else {
            session?.stopRunning(); session = nil; deviceID = nil
            status("camera_device_absent")
            return
        }
        if waitingForRecovery { return }
        if session?.isRunning == true && deviceID == device.uniqueID
            && ProcessInfo.processInfo.systemUptime - lastFrame < 6 { return }
        if session != nil {
            releaseCapture()
            waitingForRecovery = true
            status("camera_frames_missing")
            return
        }
        deviceID = device.uniqueID
        do {
            let next = AVCaptureSession()
            next.beginConfiguration()
            if next.canSetSessionPreset(.vga640x480) { next.sessionPreset = .vga640x480 }
            let input = try AVCaptureDeviceInput(device: device)
            let output = AVCaptureVideoDataOutput()
            output.alwaysDiscardsLateVideoFrames = true
            output.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String:
                kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange]
            output.setSampleBufferDelegate(self, queue: queue)
            guard next.canAddInput(input), next.canAddOutput(output) else {
                next.commitConfiguration(); status("camera_configuration_failed"); return
            }
            next.addInput(input); next.addOutput(output)
            // On macOS the session can overwrite activeFormat at commit/start.
            // Keep the device configuration lock through both operations, then
            // release it immediately once the stream has started.
            try device.lockForConfiguration()
            defer { device.unlockForConfiguration() }
            // Choose a format actually advertised by this UVC camera. Some
            // drivers reject the preset's inferred format during StartStream.
            if let format = device.formats.first(where: {
                let size = CMVideoFormatDescriptionGetDimensions($0.formatDescription)
                return size.width == 640 && size.height == 480
                    && CMFormatDescriptionGetMediaSubType($0.formatDescription)
                        == kCVPixelFormatType_422YpCbCr8_yuvs
            }) {
                device.activeFormat = format
                // UVC advertises 15.000015 fps, not exactly 15. Reuse the
                // device's exact duration instead of silently staying at 30 fps
                // or passing an unsupported rounded duration to AVFoundation.
                if let range = format.videoSupportedFrameRateRanges.min(by: {
                    abs($0.maxFrameRate - 15) < abs($1.maxFrameRate - 15)
                }), abs(range.maxFrameRate - 15) < 0.1 {
                    device.activeVideoMinFrameDuration = range.minFrameDuration
                    device.activeVideoMaxFrameDuration = range.minFrameDuration
                }
            }
            next.commitConfiguration()
            session = next; deviceID = device.uniqueID
            lastFrame = ProcessInfo.processInfo.systemUptime
            status("camera_starting")
            next.startRunning()
            // Starting a UVC stream may block during warmup. Count the frame
            // deadline from its return, before the queued delivery callbacks.
            lastFrame = ProcessInfo.processInfo.systemUptime
            if !next.isRunning { waitingForRecovery = true; status("camera_stream_not_running") }
        } catch { waitingForRecovery = true; status("camera_open_failed") }
    }

    func captureOutput(_ output: AVCaptureOutput, didDrop sampleBuffer: CMSampleBuffer,
                       from connection: AVCaptureConnection) {
        guard !stopping else { return }
        let value = CMGetAttachment(sampleBuffer, key: kCMSampleBufferAttachmentKey_DroppedFrameReason,
                                    attachmentModeOut: nil) as? String
        let reason: String
        if value == kCMSampleBufferDroppedFrameReason_FrameWasLate as String { reason = "camera_frame_dropped_late" }
        else if value == kCMSampleBufferDroppedFrameReason_OutOfBuffers as String { reason = "camera_frame_dropped_buffers" }
        else if value == kCMSampleBufferDroppedFrameReason_Discontinuity as String { reason = "camera_frame_dropped_discontinuity" }
        else { reason = "camera_frame_dropped_unknown" }
        // At most one event per reason/worker; no pixels or device identifiers.
        if reportedDrops.insert(reason).inserted {
            emit(["type": "status", "status": "degraded", "reason": reason])
        }
    }

    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer,
                       from connection: AVCaptureConnection) {
        guard !stopping else { return }
        let now = ProcessInfo.processInfo.systemUptime
        if qaStallOnce {
            // Prove the running-stream deadline, not the separate startup grace.
            if qaStallAfter == nil { qaStallAfter = now + 1 }
            if now >= qaStallAfter! {
                if !qaStallReported { qaStallReported = true; status("camera_qa_frames_halted") }
                return
            }
        }
        if qaDeliveryOnly {
            let sourceTime = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
            guard sourceTime.isNumeric, !qaSourceTime.isValid || CMTimeCompare(sourceTime, qaSourceTime) > 0 else {
                status("camera_qa_frame_timestamp_stale"); return
            }
            qaSourceTime = sourceTime
        }
        lastFrame = now
        if now - lastFrameReceipt >= 0.5 {
            lastFrameReceipt = now
            emit(["type": "frame"])
        }
        if qaDeliveryOnly { status("camera_qa_delivery_ready", ready: true); return }
        if !stopping, let id = captureID, let pixels = CMSampleBufferGetImageBuffer(sampleBuffer) {
            captureID = nil
            autoreleasepool {
                // UVC drivers may ignore the requested VGA preset. The IPC
                // snapshot contract caps both dimensions at 1280 regardless.
                let source = CIImage(cvPixelBuffer: pixels)
                let scale = min(1, 1280 / max(source.extent.width, source.extent.height))
                let image = source.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
                if let jpeg = imageContext.jpegRepresentation(of: image, colorSpace: CGColorSpaceCreateDeviceRGB(),
                    options: [kCGImageDestinationLossyCompressionQuality as CIImageRepresentationOption: 0.7]), jpeg.count <= 500000 {
                    emit(["type": "snapshot", "id": id, "jpeg": jpeg.base64EncodedString(),
                          "width": Int(image.extent.width.rounded()), "height": Int(image.extent.height.rounded())])
                } else { status("camera_snapshot_encode_failed"); emit(["type": "snapshot", "id": id]) }
            }
        }
        // An empty room needs fewer Vision passes. A newly detected face
        // restores normal gaze updates within at most half a second.
        let detectionInterval = now - lastFace >= 60 ? 0.5 : 0.2
        guard !stopping, !detectionPending, now - lastDetection >= detectionInterval,
              let pixels = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        guard let analysisPixels = copyForAnalysis(pixels) else {
            status("camera_analysis_copy_failed"); return
        }
        lastDetection = now
        detectionPending = true
        let generation = captureGeneration
        // Keep one Vision pass in flight, using owned RAM rather than retaining
        // the driver's reusable capture pool while inference is running.
        visionQueue.async { autoreleasepool {
            let request = VNDetectFaceRectanglesRequest()
            do {
                try VNImageRequestHandler(cvPixelBuffer: analysisPixels, orientation: .up).perform([request])
                let boxes: [[String: Double]] = (request.results ?? [])
                    .filter { $0.confidence >= 0.65 }.prefix(16).map { face in
                        let box = face.boundingBox
                        // Vision uses bottom-left origin. Main receives normalized top-left boxes.
                        return ["x": Double(box.minX), "y": Double(1 - box.maxY),
                                "width": Double(box.width), "height": Double(box.height)]
                    }
                self.queue.async {
                    self.detectionPending = false
                    guard !self.stopping, generation == self.captureGeneration else { return }
                    if !boxes.isEmpty { self.lastFace = now }
                    self.status("camera_tracking_ready", ready: true)
                    self.emit(["type": "faces", "faces": boxes])
                }
            } catch { self.queue.async {
                self.detectionPending = false
                if !self.stopping, generation == self.captureGeneration { self.status("camera_detection_failed") }
            } }
        } }
    }

    func copyForAnalysis(_ source: CVPixelBuffer) -> CVPixelBuffer? {
        var destination: CVPixelBuffer?
        guard CVPixelBufferCreate(kCFAllocatorDefault, CVPixelBufferGetWidth(source), CVPixelBufferGetHeight(source),
            CVPixelBufferGetPixelFormatType(source), nil, &destination) == kCVReturnSuccess,
            let destination else { return nil }
        guard CVPixelBufferLockBaseAddress(source, .readOnly) == kCVReturnSuccess else { return nil }
        defer { CVPixelBufferUnlockBaseAddress(source, .readOnly) }
        guard CVPixelBufferLockBaseAddress(destination, []) == kCVReturnSuccess else { return nil }
        defer { CVPixelBufferUnlockBaseAddress(destination, []) }
        let planes = CVPixelBufferGetPlaneCount(source)
        guard planes == CVPixelBufferGetPlaneCount(destination) else { return nil }
        for plane in 0..<max(1, planes) {
            let from = planes == 0 ? CVPixelBufferGetBaseAddress(source) : CVPixelBufferGetBaseAddressOfPlane(source, plane)
            let to = planes == 0 ? CVPixelBufferGetBaseAddress(destination) : CVPixelBufferGetBaseAddressOfPlane(destination, plane)
            let sourceStride = planes == 0 ? CVPixelBufferGetBytesPerRow(source) : CVPixelBufferGetBytesPerRowOfPlane(source, plane)
            let targetStride = planes == 0 ? CVPixelBufferGetBytesPerRow(destination) : CVPixelBufferGetBytesPerRowOfPlane(destination, plane)
            let rows = planes == 0 ? CVPixelBufferGetHeight(source) : CVPixelBufferGetHeightOfPlane(source, plane)
            guard let from, let to else { return nil }
            for row in 0..<rows {
                to.advanced(by: row * targetStride).copyMemory(from: from.advanced(by: row * sourceStride), byteCount: min(sourceStride, targetStride))
            }
        }
        return destination
    }
}

let tracker = CameraTracker()
signal(SIGTERM, SIG_IGN)
signal(SIGINT, SIG_IGN)
let terminate = DispatchSource.makeSignalSource(signal: SIGTERM, queue: tracker.queue)
let interrupt = DispatchSource.makeSignalSource(signal: SIGINT, queue: tracker.queue)
for source in [terminate, interrupt] {
    source.setEventHandler { tracker.shutdown(); exit(0) }
    source.resume()
}
tracker.start()
dispatchMain()
