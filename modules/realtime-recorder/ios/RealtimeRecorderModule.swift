import ExpoModulesCore
import AVFoundation
import UIKit

// MARK: - Shared engine (singleton that owns the capture session)

final class RecorderEngine: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate, AVCaptureAudioDataOutputSampleBufferDelegate {
  static let shared = RecorderEngine()

  private let captureQueue = DispatchQueue(label: "com.athlex.recorder.capture", qos: .userInitiated)
  private let writerQueue  = DispatchQueue(label: "com.athlex.recorder.writer",  qos: .userInitiated)

  private(set) var captureSession: AVCaptureSession?
  private var videoOutput: AVCaptureVideoDataOutput?
  private var audioOutput: AVCaptureAudioDataOutput?

  private var assetWriter: AVAssetWriter?
  private var videoWriterInput: AVAssetWriterInput?
  private var audioWriterInput: AVAssetWriterInput?
  private var pixelBufferAdaptor: AVAssetWriterInputPixelBufferAdaptor?

  private var isRecording = false
  private var isSessionStarted = false
  private var outputURL: URL?
  var currentFacing: AVCaptureDevice.Position = .back

  private let renderer = OverlayRenderer()
  var overlayState = OverlayState()
  let stateLock = NSLock()

  // Weak ref to the visible host view (set by the view itself)
  weak var hostView: RealtimeRecorderHostView?

  private override init() { super.init() }

  // MARK: Setup

  func setupSession() {
    captureQueue.async { [weak self] in
      guard let self = self else { return }

      if let existing = self.captureSession, existing.isRunning {
        existing.stopRunning()
      }

      // Configure audio session BEFORE capture session to ensure iOS locks the correct audio route
      let audioSession = AVAudioSession.sharedInstance()
      do {
        try audioSession.setCategory(.playAndRecord, mode: .videoRecording, options: [.defaultToSpeaker, .allowBluetooth])
        try audioSession.setActive(true, options: .notifyOthersOnDeactivation)
        try audioSession.overrideOutputAudioPort(.speaker)
        print("[RealtimeRecorder] Audio session configured (videoRecording mode)")
      } catch {
        print("[RealtimeRecorder] Audio session config error: \(error)")
      }

      let session = AVCaptureSession()
      session.beginConfiguration()
      session.sessionPreset = .hd1920x1080

      guard let camera = self.findCamera(position: self.currentFacing),
            let videoInput = try? AVCaptureDeviceInput(device: camera),
            session.canAddInput(videoInput) else {
        print("[RealtimeRecorder] Cannot add video input")
        session.commitConfiguration()
        return
      }
      session.addInput(videoInput)

      if let mic = AVCaptureDevice.default(for: .audio),
         let audioInput = try? AVCaptureDeviceInput(device: mic),
         session.canAddInput(audioInput) {
        session.addInput(audioInput)
      }

      let vOutput = AVCaptureVideoDataOutput()
      vOutput.videoSettings = [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA
      ]
      vOutput.alwaysDiscardsLateVideoFrames = true
      vOutput.setSampleBufferDelegate(self, queue: self.captureQueue)
      if session.canAddOutput(vOutput) { session.addOutput(vOutput) }

      if let connection = vOutput.connection(with: .video) {
        if #available(iOS 17.0, *) {
          connection.videoRotationAngle = 90
        } else {
          connection.videoOrientation = .portrait
        }
        if self.currentFacing == .front {
          connection.isVideoMirrored = true
        }
      }

      let aOutput = AVCaptureAudioDataOutput()
      aOutput.setSampleBufferDelegate(self, queue: self.captureQueue)
      if session.canAddOutput(aOutput) { session.addOutput(aOutput) }

      session.commitConfiguration()

      self.captureSession = session
      self.videoOutput = vOutput
      self.audioOutput = aOutput

      // Attach preview on main thread
      DispatchQueue.main.async {
        let preview = AVCaptureVideoPreviewLayer(session: session)
        preview.videoGravity = .resizeAspectFill
        self.hostView?.attachPreview(preview)
      }

      session.startRunning()
      print("[RealtimeRecorder] Session started, facing: \(self.currentFacing == .back ? "back" : "front")")

      DispatchQueue.main.async {
        self.hostView?.markReady()
      }
    }
  }

  // MARK: Recording

  func startRecording(url: URL) throws {
    // Reassert audio session before each recording to guarantee mic is active
    let audioSession = AVAudioSession.sharedInstance()
    do {
      try audioSession.setCategory(.playAndRecord, mode: .videoRecording, options: [.defaultToSpeaker, .allowBluetooth])
      try audioSession.setActive(true, options: .notifyOthersOnDeactivation)
      try audioSession.overrideOutputAudioPort(.speaker)
      print("[RealtimeRecorder] Audio session reasserted for recording")
    } catch {
      print("[RealtimeRecorder] Audio session reassert error: \(error)")
    }

    try? FileManager.default.removeItem(at: url)
    self.outputURL = url
    self.isSessionStarted = false

    let writer = try AVAssetWriter(url: url, fileType: .mp4)

    let videoSettings: [String: Any] = [
      AVVideoCodecKey: AVVideoCodecType.h264,
      AVVideoWidthKey: 1080,
      AVVideoHeightKey: 1920,
      AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: 6_000_000,
        AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
      ]
    ]
    let vInput = AVAssetWriterInput(mediaType: .video, outputSettings: videoSettings)
    vInput.expectsMediaDataInRealTime = true

    let adaptorAttrs: [String: Any] = [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
      kCVPixelBufferWidthKey as String: 1080,
      kCVPixelBufferHeightKey as String: 1920,
    ]
    let adaptor = AVAssetWriterInputPixelBufferAdaptor(
      assetWriterInput: vInput,
      sourcePixelBufferAttributes: adaptorAttrs
    )

    let audioSettings: [String: Any] = [
      AVFormatIDKey: kAudioFormatMPEG4AAC,
      AVSampleRateKey: 44100,
      AVNumberOfChannelsKey: 1,
      AVEncoderBitRateKey: 128000,
    ]
    let aInput = AVAssetWriterInput(mediaType: .audio, outputSettings: audioSettings)
    aInput.expectsMediaDataInRealTime = true

    if writer.canAdd(vInput) { writer.add(vInput) }
    if writer.canAdd(aInput) { writer.add(aInput) }

    self.assetWriter = writer
    self.videoWriterInput = vInput
    self.audioWriterInput = aInput
    self.pixelBufferAdaptor = adaptor
    self.isRecording = true

    // Prevent screen from auto-locking during recording
    DispatchQueue.main.async {
      UIApplication.shared.isIdleTimerDisabled = true
    }

    print("[RealtimeRecorder] Recording started → \(url.lastPathComponent)")
  }

  func stopRecording(completion: @escaping (Result<String, Error>) -> Void) {
    guard isRecording else {
      completion(.failure(NSError(domain: "RealtimeRecorder", code: 1, userInfo: [NSLocalizedDescriptionKey: "Not recording"])))
      return
    }

    isRecording = false

    // Re-enable screen auto-lock
    DispatchQueue.main.async {
      UIApplication.shared.isIdleTimerDisabled = false
    }

    print("[RealtimeRecorder] Stopping recording...")

    writerQueue.async { [weak self] in
      guard let self = self else { return }
      self.videoWriterInput?.markAsFinished()
      self.audioWriterInput?.markAsFinished()

      self.assetWriter?.finishWriting {
        let status = self.assetWriter?.status ?? .unknown
        if status == .completed, let path = self.outputURL?.absoluteString {
          print("[RealtimeRecorder] Recording saved: \(path)")
          completion(.success(path))
        } else {
          let errMsg = self.assetWriter?.error?.localizedDescription ?? "Unknown error"
          print("[RealtimeRecorder] Recording failed: \(errMsg)")
          completion(.failure(NSError(domain: "RealtimeRecorder", code: 2, userInfo: [NSLocalizedDescriptionKey: errMsg])))
        }

        self.assetWriter = nil
        self.videoWriterInput = nil
        self.audioWriterInput = nil
        self.pixelBufferAdaptor = nil
      }
    }
  }

  // MARK: Delegate

  func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
    guard isRecording, let writer = assetWriter else { return }

    let timestamp = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)

    if !isSessionStarted {
      if writer.status == .unknown {
        writer.startWriting()
        writer.startSession(atSourceTime: timestamp)
        isSessionStarted = true
        print("[RealtimeRecorder] Writer session started at \(timestamp.seconds)s")
      }
    }

    guard writer.status == .writing else { return }

    if output == videoOutput {
      guard let videoInput = videoWriterInput, videoInput.isReadyForMoreMediaData else { return }
      guard let imageBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }

      stateLock.lock()
      let currentState = overlayState
      stateLock.unlock()

      renderer.render(onto: imageBuffer, state: currentState)
      pixelBufferAdaptor?.append(imageBuffer, withPresentationTime: timestamp)

    } else if output == audioOutput {
      guard let audioInput = audioWriterInput, audioInput.isReadyForMoreMediaData else { return }
      audioInput.append(sampleBuffer)
    }
  }

  // MARK: Helpers

  private func findCamera(position: AVCaptureDevice.Position) -> AVCaptureDevice? {
    if let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: position) {
      return device
    }
    return AVCaptureDevice.default(for: .video)
  }
}

// MARK: - Expo Module

public class RealtimeRecorderModule: Module {
  private var engine: RecorderEngine { RecorderEngine.shared }

  public func definition() -> ModuleDefinition {
    Name("RealtimeRecorder")

    Function("updateOverlayState") { (dict: [String: Any]) in
      self.engine.stateLock.lock()
      if let v = dict["timerType"] as? String   { self.engine.overlayState.timerType = v }
      if let v = dict["timerDisplay"] as? String { self.engine.overlayState.timerDisplay = v }
      if let v = dict["title"] as? String        { self.engine.overlayState.title = v }
      if let v = dict["timestamp"] as? String    { self.engine.overlayState.timestamp = v }
      if let v = dict["isRecording"] as? Bool    { self.engine.overlayState.isRecording = v }
      if let v = dict["countdownValue"] as? Int  { self.engine.overlayState.countdownValue = v }
      if let v = dict["showTimer"] as? Bool      { self.engine.overlayState.showTimer = v }
      if let v = dict["boxLogoUrl"] as? String  { self.engine.overlayState.boxLogoUrl = v }
      if let v = dict["competitionLogoUrl"] as? String { self.engine.overlayState.competitionLogoUrl = v }
      self.engine.stateLock.unlock()
    }

    AsyncFunction("startRecording") { (options: [String: Any], promise: Promise) in
      let outputPath = options["outputPath"] as? String ?? ""
      let facing = options["facing"] as? String ?? "back"

      self.engine.currentFacing = facing == "front" ? .front : .back

      guard !outputPath.isEmpty else {
        promise.reject("ERR", "outputPath is required")
        return
      }

      let url: URL
      if outputPath.hasPrefix("file://") {
        url = URL(string: outputPath) ?? URL(fileURLWithPath: outputPath)
      } else {
        url = URL(fileURLWithPath: outputPath)
      }

      // Ensure session is running before recording
      if self.engine.captureSession == nil || !(self.engine.captureSession?.isRunning ?? false) {
        self.engine.setupSession()
        // Small delay to let session start
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
          do {
            try self.engine.startRecording(url: url)
            promise.resolve(nil)
          } catch {
            promise.reject("ERR", error.localizedDescription)
          }
        }
      } else {
        do {
          try self.engine.startRecording(url: url)
          promise.resolve(nil)
        } catch {
          promise.reject("ERR", error.localizedDescription)
        }
      }
    }

    AsyncFunction("stopRecording") { (promise: Promise) in
      self.engine.stopRecording { result in
        switch result {
        case .success(let path):
          promise.resolve(path)
        case .failure(let error):
          promise.reject("ERR", error.localizedDescription)
        }
      }
    }

    Function("switchCamera") {
      self.engine.currentFacing = self.engine.currentFacing == .back ? .front : .back
      self.engine.setupSession()
    }

    View(RealtimeRecorderHostView.self) {
      Events("onReady")

      Prop("facing") { (view: RealtimeRecorderHostView, val: String) in
        let newFacing: AVCaptureDevice.Position = val == "front" ? .front : .back
        if newFacing != self.engine.currentFacing {
          self.engine.currentFacing = newFacing
          self.engine.setupSession()
        }
      }
    }
  }
}

// MARK: - Host View

public class RealtimeRecorderHostView: ExpoView {
  private var currentPreview: AVCaptureVideoPreviewLayer?

  // Expo Modules EventDispatcher — automatically bridged to JS onReady prop
  let onReady = EventDispatcher()

  /// Called by RecorderEngine when the capture session is running.
  func markReady() {
    onReady()
  }

  public override func didMoveToWindow() {
    super.didMoveToWindow()
    if window != nil {
      RecorderEngine.shared.hostView = self
      RecorderEngine.shared.setupSession()
    }
  }

  func attachPreview(_ layer: AVCaptureVideoPreviewLayer) {
    currentPreview?.removeFromSuperlayer()
    layer.frame = bounds
    self.layer.insertSublayer(layer, at: 0)
    currentPreview = layer
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    currentPreview?.frame = bounds
  }
}
