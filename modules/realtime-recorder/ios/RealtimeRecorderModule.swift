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
  var isLandscape = false
  // Tracks the actual device orientation (last valid interface orientation).
  // Used to distinguish landscape-left vs landscape-right and to keep the
  // preview upright when the user rotates the phone before recording.
  private var currentDeviceOrientation: UIDeviceOrientation = .portrait

  private let renderer = OverlayRenderer()
  var overlayState = OverlayState()
  let stateLock = NSLock()

  // Weak ref to the visible host view (set by the view itself)
  weak var hostView: RealtimeRecorderHostView?

  private override init() {
    super.init()
    // Listen to device rotation so we can keep the preview upright in real time
    // (only when we're not actively recording — orientation is locked once the
    // user presses "Démarrer").
    UIDevice.current.beginGeneratingDeviceOrientationNotifications()
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleDeviceOrientationChange),
      name: UIDevice.orientationDidChangeNotification,
      object: nil
    )
  }

  deinit {
    NotificationCenter.default.removeObserver(self)
    UIDevice.current.endGeneratingDeviceOrientationNotifications()
  }

  @objc private func handleDeviceOrientationChange() {
    let orientation = UIDevice.current.orientation
    guard orientation.isValidInterfaceOrientation else { return }
    captureQueue.async { [weak self] in
      guard let self = self else { return }
      // Lock orientation once recording has started — never re-rotate the live
      // capture connection while the asset writer is consuming frames.
      if self.isRecording { return }
      self.currentDeviceOrientation = orientation
      self.isLandscape = orientation.isLandscape
      self.applyOrientationToConnections()
    }
  }

  // MARK: Orientation helpers

  /// Clockwise rotation (in degrees) needed to display an upright image for a
  /// given device orientation. Used on iOS 17+ via `videoRotationAngle`.
  ///
  /// The front camera sensor on iPhone is mounted with the opposite "native"
  /// landscape orientation than the back camera. Combined with the horizontal
  /// mirroring we apply for selfie mode (`isVideoMirrored = true`), the
  /// landscape angles must be swapped (180° offset) for the front camera,
  /// otherwise the live feed appears upside-down in both landscape directions.
  private func videoRotationAngle(for orientation: UIDeviceOrientation) -> CGFloat {
    let isFront = (currentFacing == .front)
    switch orientation {
    case .portrait:            return 90
    case .portraitUpsideDown:  return 270
    case .landscapeLeft:       return isFront ? 180 : 0
    case .landscapeRight:      return isFront ? 0   : 180
    default:                   return 90
    }
  }

  /// Legacy `AVCaptureVideoOrientation` for iOS < 17. Note: the mapping is
  /// inverted between `UIDeviceOrientation` and `AVCaptureVideoOrientation`,
  /// and front camera landscape values are also swapped vs back camera (see
  /// `videoRotationAngle(for:)` for the rationale).
  private func captureVideoOrientation(for orientation: UIDeviceOrientation) -> AVCaptureVideoOrientation {
    let isFront = (currentFacing == .front)
    switch orientation {
    case .portrait:            return .portrait
    case .portraitUpsideDown:  return .portraitUpsideDown
    case .landscapeLeft:       return isFront ? .landscapeLeft  : .landscapeRight
    case .landscapeRight:      return isFront ? .landscapeRight : .landscapeLeft
    default:                   return .portrait
    }
  }

  /// Live-update both the video output connection and the preview layer to the
  /// current device orientation. Safe to call from `captureQueue`.
  private func applyOrientationToConnections() {
    let angle = videoRotationAngle(for: currentDeviceOrientation)
    let avOrientation = captureVideoOrientation(for: currentDeviceOrientation)

    if let conn = videoOutput?.connection(with: .video) {
      if #available(iOS 17.0, *) {
        if conn.isVideoRotationAngleSupported(angle) { conn.videoRotationAngle = angle }
      } else {
        if conn.isVideoOrientationSupported { conn.videoOrientation = avOrientation }
      }
    }

    DispatchQueue.main.async { [weak self] in
      guard let self = self,
            let preview = self.hostView?.currentPreviewLayer,
            let conn = preview.connection else { return }
      if #available(iOS 17.0, *) {
        if conn.isVideoRotationAngleSupported(angle) { conn.videoRotationAngle = angle }
      } else {
        if conn.isVideoOrientationSupported { conn.videoOrientation = avOrientation }
      }
    }
  }

  // MARK: Setup

  func setupSession() {
    captureQueue.async { [weak self] in
      guard let self = self else { return }

      // Auto-detect actual device orientation (incl. landscape direction) so
      // we can pick the correct rotation angle for both the capture connection
      // and the preview layer. Falls back to the previously known orientation
      // for .unknown / .faceUp / .faceDown.
      DispatchQueue.main.sync {
        let orientation = UIDevice.current.orientation
        if orientation.isValidInterfaceOrientation {
          self.currentDeviceOrientation = orientation
          self.isLandscape = orientation.isLandscape
        }
      }

      if let existing = self.captureSession, existing.isRunning {
        existing.stopRunning()
      }

      // Configure audio session BEFORE capture session to ensure iOS locks the correct audio route
      let audioSession = AVAudioSession.sharedInstance()
      do {
        try audioSession.setCategory(.playAndRecord, mode: .videoRecording, options: [.defaultToSpeaker, .allowBluetooth, .mixWithOthers])
        try audioSession.setActive(true, options: .notifyOthersOnDeactivation)
        try audioSession.overrideOutputAudioPort(.speaker)
        print("[RealtimeRecorder] Audio session configured (videoRecording mode)")
      } catch {
        print("[RealtimeRecorder] Audio session config error: \(error)")
      }

      let session = AVCaptureSession()
      // Keep our own audio session (with .mixWithOthers) — otherwise AVCaptureSession
      // reconfigures it when the mic input is added and interrupts the user's music.
      session.automaticallyConfiguresApplicationAudioSession = false
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
        let angle = self.videoRotationAngle(for: self.currentDeviceOrientation)
        let avOrientation = self.captureVideoOrientation(for: self.currentDeviceOrientation)
        if #available(iOS 17.0, *) {
          if connection.isVideoRotationAngleSupported(angle) { connection.videoRotationAngle = angle }
        } else {
          if connection.isVideoOrientationSupported { connection.videoOrientation = avOrientation }
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

        // Match preview orientation to the actual device orientation
        if let conn = preview.connection {
          let angle = self.videoRotationAngle(for: self.currentDeviceOrientation)
          let avOrientation = self.captureVideoOrientation(for: self.currentDeviceOrientation)
          if #available(iOS 17.0, *) {
            if conn.isVideoRotationAngleSupported(angle) { conn.videoRotationAngle = angle }
          } else {
            if conn.isVideoOrientationSupported { conn.videoOrientation = avOrientation }
          }
        }

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
      try audioSession.setCategory(.playAndRecord, mode: .videoRecording, options: [.defaultToSpeaker, .allowBluetooth, .mixWithOthers])
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

    let vidW = isLandscape ? 1920 : 1080
    let vidH = isLandscape ? 1080 : 1920

    let videoSettings: [String: Any] = [
      AVVideoCodecKey: AVVideoCodecType.h264,
      AVVideoWidthKey: vidW,
      AVVideoHeightKey: vidH,
      AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: 6_000_000,
        AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
      ]
    ]
    let vInput = AVAssetWriterInput(mediaType: .video, outputSettings: videoSettings)
    vInput.expectsMediaDataInRealTime = true

    let adaptorAttrs: [String: Any] = [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
      kCVPixelBufferWidthKey as String: vidW,
      kCVPixelBufferHeightKey as String: vidH,
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
      let landscape = options["isLandscape"] as? Bool ?? false

      self.engine.currentFacing = facing == "front" ? .front : .back
      self.engine.isLandscape = landscape

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

      // Always re-setup session so video orientation matches isLandscape
      self.engine.setupSession()
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
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

      Prop("isLandscape") { (view: RealtimeRecorderHostView, landscape: Bool) in
        if landscape != self.engine.isLandscape {
          self.engine.isLandscape = landscape
          self.engine.setupSession()
        }
      }
    }
  }
}

// MARK: - Host View

public class RealtimeRecorderHostView: ExpoView {
  private var currentPreview: AVCaptureVideoPreviewLayer?

  /// Exposed so `RecorderEngine` can live-update the preview orientation.
  var currentPreviewLayer: AVCaptureVideoPreviewLayer? { currentPreview }

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
