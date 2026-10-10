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
    var session: AVCaptureSession?
    var deviceID: String?
    var lastFrame = ProcessInfo.processInfo.systemUptime
    var lastDetection = 0.0
    var lastFace = ProcessInfo.processInfo.systemUptime
    var lastReason = ""
    var stopping = false
    var timer: DispatchSourceTimer?
    var captureID: Int?
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
        DispatchQueue.global(qos: .utility).async {
            while let line = readLine() {
                guard line.utf8.count < 256, let bytes = line.data(using: .utf8),
                      let command = try? JSONSerialization.jsonObject(with: bytes) as? [String: Any],
                      command["type"] as? String == "capture", let id = command["id"] as? Int else { continue }
                self.queue.async { if !self.stopping { self.captureID = id } }
            }
        }
        NotificationCenter.default.addObserver(forName: AVCaptureDevice.wasConnectedNotification,
            object: nil, queue: nil) { [weak self] _ in self?.queue.async { self?.reconcile() } }
        NotificationCenter.default.addObserver(forName: AVCaptureDevice.wasDisconnectedNotification,
            object: nil, queue: nil) { [weak self] _ in self?.queue.async { self?.reconcile() } }
        NotificationCenter.default.addObserver(forName: AVCaptureSession.runtimeErrorNotification,
            object: nil, queue: nil) { [weak self] _ in self?.queue.async {
                self?.status("camera_capture_failed")
            } }
        queue.async { self.reconcile() }
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
        session?.stopRunning()
        session = nil
        deviceID = nil
    }

    func reconcile() {
        guard !stopping else { return }
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
        if session?.isRunning == true && deviceID == device.uniqueID
            && ProcessInfo.processInfo.systemUptime - lastFrame < 6 { return }
        session?.stopRunning(); session = nil; deviceID = nil
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
            // Choose a format actually advertised by this UVC camera. Some
            // drivers reject the preset's inferred format during StartStream.
            if let format = device.formats.first(where: {
                let size = CMVideoFormatDescriptionGetDimensions($0.formatDescription)
                return size.width == 640 && size.height == 480
                    && CMFormatDescriptionGetMediaSubType($0.formatDescription)
                        == kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange
            }) {
                try device.lockForConfiguration()
                device.activeFormat = format
                if format.videoSupportedFrameRateRanges.contains(where: { $0.minFrameRate <= 15 && $0.maxFrameRate >= 15 }) {
                    device.activeVideoMinFrameDuration = CMTime(value: 1, timescale: 15)
                    device.activeVideoMaxFrameDuration = CMTime(value: 1, timescale: 15)
                }
                device.unlockForConfiguration()
            }
            next.commitConfiguration()
            session = next; deviceID = device.uniqueID
            lastFrame = ProcessInfo.processInfo.systemUptime
            status("camera_starting")
            next.startRunning()
        } catch { status("camera_open_failed") }
    }

    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer,
                       from connection: AVCaptureConnection) {
        let now = ProcessInfo.processInfo.systemUptime
        lastFrame = now
        if !stopping, let id = captureID, let pixels = CMSampleBufferGetImageBuffer(sampleBuffer) {
            captureID = nil
            autoreleasepool {
                let image = CIImage(cvPixelBuffer: pixels)
                if let jpeg = imageContext.jpegRepresentation(of: image, colorSpace: CGColorSpaceCreateDeviceRGB(),
                    options: [kCGImageDestinationLossyCompressionQuality as CIImageRepresentationOption: 0.7]), jpeg.count <= 500000 {
                    emit(["type": "snapshot", "id": id, "jpeg": jpeg.base64EncodedString(),
                          "width": CVPixelBufferGetWidth(pixels), "height": CVPixelBufferGetHeight(pixels)])
                } else { emit(["type": "snapshot", "id": id]) }
            }
        }
        // An empty room needs fewer Vision passes. A newly detected face
        // restores normal gaze updates within at most half a second.
        let detectionInterval = now - lastFace >= 60 ? 0.5 : 0.2
        guard !stopping, now - lastDetection >= detectionInterval,
              let pixels = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        lastDetection = now
        autoreleasepool {
            let request = VNDetectFaceRectanglesRequest()
            do {
                try VNImageRequestHandler(cvPixelBuffer: pixels, orientation: .up).perform([request])
                let boxes: [[String: Double]] = (request.results ?? [])
                    .filter { $0.confidence >= 0.65 }.prefix(16).map { face in
                        let box = face.boundingBox
                        // Vision uses bottom-left origin. Main receives normalized top-left boxes.
                        return ["x": Double(box.minX), "y": Double(1 - box.maxY),
                                "width": Double(box.width), "height": Double(box.height)]
                    }
                if !boxes.isEmpty { lastFace = now }
                status("camera_tracking_ready", ready: true)
                emit(["type": "faces", "faces": boxes])
            } catch { status("camera_detection_failed") }
        }
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
