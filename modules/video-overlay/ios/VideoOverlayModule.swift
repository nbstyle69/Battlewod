import ExpoModulesCore
import AVFoundation
import UIKit
import QuartzCore

public class VideoOverlayModule: Module {

  private func resolveURL(_ path: String) -> URL {
    if path.hasPrefix("file://") {
      return URL(string: path) ?? URL(fileURLWithPath: path)
    }
    return URL(fileURLWithPath: path)
  }

  public func definition() -> ModuleDefinition {
    Name("VideoOverlay")

    AsyncFunction("burnOverlays") { (options: [String: Any], promise: Promise) in
      guard let inputPath = options["inputPath"] as? String,
            let outputPath = options["outputPath"] as? String,
            let timerType = options["timerType"] as? String else {
        promise.reject("ERR", "Missing required parameters")
        return
      }

      let timerStartMs = options["timerStartOffsetMs"] as? Double ?? 0
      let timerStopMs = options["timerStopOffsetMs"] as? Double ?? 0
      let countdownDuration = options["countdownDuration"] as? Double ?? 0
      let videoTitle = options["videoTitle"] as? String
      let timestamp = options["timestamp"] as? String

      DispatchQueue.global(qos: .userInitiated).async {
        self.processVideo(
          inputPath: inputPath,
          outputPath: outputPath,
          timerType: timerType,
          timerStartMs: timerStartMs,
          timerStopMs: timerStopMs,
          countdownDuration: countdownDuration,
          videoTitle: videoTitle,
          timestamp: timestamp,
          promise: promise
        )
      }
    }
  }

  private func processVideo(
    inputPath: String,
    outputPath: String,
    timerType: String,
    timerStartMs: Double,
    timerStopMs: Double,
    countdownDuration: Double,
    videoTitle: String?,
    timestamp: String?,
    promise: Promise
  ) {
    let inputURL = resolveURL(inputPath)
    let outputURL = resolveURL(outputPath)
    print("[VideoOverlay] inputURL: \(inputURL)")
    print("[VideoOverlay] outputURL: \(outputURL)")
    print("[VideoOverlay] input exists: \(FileManager.default.fileExists(atPath: inputURL.path))")

    // Remove existing output file
    try? FileManager.default.removeItem(at: outputURL)

    let asset = AVAsset(url: inputURL)
    guard let videoTrack = asset.tracks(withMediaType: .video).first else {
      promise.reject("ERR", "No video track found")
      return
    }

    let duration = CMTimeGetSeconds(asset.duration)
    let videoSize = videoTrack.naturalSize
    let transform = videoTrack.preferredTransform
    let isPortrait = transform.a == 0 && transform.d == 0
    let renderSize = isPortrait ? CGSize(width: videoSize.height, height: videoSize.width) : videoSize
    print("[VideoOverlay] duration: \(duration)s, size: \(videoSize), portrait: \(isPortrait), render: \(renderSize)")

    // Create composition
    let composition = AVMutableComposition()
    guard let compVideoTrack = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid) else {
      promise.reject("ERR", "Cannot create video track")
      return
    }

    let timeRange = CMTimeRange(start: .zero, duration: asset.duration)
    do {
      try compVideoTrack.insertTimeRange(timeRange, of: videoTrack, at: .zero)
    } catch {
      promise.reject("ERR", "Failed to insert video: \(error.localizedDescription)")
      return
    }

    // Add audio track if present
    if let audioTrack = asset.tracks(withMediaType: .audio).first,
       let compAudioTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) {
      try? compAudioTrack.insertTimeRange(timeRange, of: audioTrack, at: .zero)
    }

    // Create overlay layers
    let videoLayer = CALayer()
    videoLayer.frame = CGRect(origin: .zero, size: renderSize)

    let parentLayer = CALayer()
    parentLayer.frame = CGRect(origin: .zero, size: renderSize)
    parentLayer.addSublayer(videoLayer)

    let timerStartSec = timerStartMs / 1000.0
    let timerStopSec = timerStopMs > 0 ? timerStopMs / 1000.0 : duration

    // 1. Top bar background
    let topBar = CALayer()
    topBar.frame = CGRect(x: 0, y: renderSize.height - 80, width: renderSize.width, height: 80)
    topBar.backgroundColor = UIColor.black.withAlphaComponent(0.5).cgColor
    parentLayer.addSublayer(topBar)

    // 2. Timer type label (top-left)
    let typeLabel = CATextLayer()
    typeLabel.string = timerType.uppercased().replacingOccurrences(of: "-", with: " ")
    typeLabel.font = UIFont.boldSystemFont(ofSize: 28)
    typeLabel.fontSize = 28
    typeLabel.foregroundColor = UIColor.white.cgColor
    typeLabel.frame = CGRect(x: 20, y: renderSize.height - 58, width: 300, height: 40)
    typeLabel.alignmentMode = .left
    typeLabel.contentsScale = UIScreen.main.scale
    parentLayer.addSublayer(typeLabel)

    // 3. REC badge (top-right)
    let recLabel = CATextLayer()
    recLabel.string = "● REC"
    recLabel.font = UIFont.boldSystemFont(ofSize: 22)
    recLabel.fontSize = 22
    recLabel.foregroundColor = UIColor.red.cgColor
    recLabel.frame = CGRect(x: renderSize.width - 130, y: renderSize.height - 55, width: 120, height: 30)
    recLabel.alignmentMode = .right
    recLabel.contentsScale = UIScreen.main.scale
    parentLayer.addSublayer(recLabel)

    // 4. Countdown (center, animated opacity)
    if countdownDuration > 0 {
      let cdStartSec = max(0, timerStartSec - countdownDuration)
      for i in 1...Int(countdownDuration) {
        let num = Int(countdownDuration) - i + 1
        let cdLayer = CATextLayer()
        cdLayer.string = "\(num)"
        cdLayer.font = UIFont.systemFont(ofSize: 120, weight: .ultraLight)
        cdLayer.fontSize = 120
        cdLayer.foregroundColor = UIColor.white.cgColor
        cdLayer.frame = CGRect(x: 0, y: (renderSize.height - 120) / 2, width: renderSize.width, height: 140)
        cdLayer.alignmentMode = .center
        cdLayer.contentsScale = UIScreen.main.scale
        cdLayer.opacity = 0

        let showTime = cdStartSec + Double(i - 1)
        let hideTime = cdStartSec + Double(i)

        let anim = CAKeyframeAnimation(keyPath: "opacity")
        anim.values = [0, 1, 1, 0]
        anim.keyTimes = [
          NSNumber(value: showTime / duration),
          NSNumber(value: (showTime + 0.05) / duration),
          NSNumber(value: (hideTime - 0.05) / duration),
          NSNumber(value: hideTime / duration)
        ]
        anim.duration = duration
        anim.beginTime = AVCoreAnimationBeginTimeAtZero
        anim.isRemovedOnCompletion = false
        cdLayer.add(anim, forKey: "cdShow")
        parentLayer.addSublayer(cdLayer)
      }
    }

    // 5. Timer display (center) — show elapsed time as static snapshots per second
    let timerDurationSec = timerStopSec - timerStartSec
    let totalTimerSec = Int(ceil(timerDurationSec))
    for sec in 0...totalTimerSec {
      let mins = sec / 60
      let secs = sec % 60
      let timeStr = String(format: "%02d:%02d", mins, secs)
      let tl = CATextLayer()
      tl.string = timeStr
      tl.font = UIFont.systemFont(ofSize: 72, weight: .ultraLight)
      tl.fontSize = 72
      tl.foregroundColor = UIColor.white.cgColor
      tl.shadowColor = UIColor.black.cgColor
      tl.shadowOffset = CGSize(width: 2, height: -2)
      tl.shadowRadius = 4
      tl.shadowOpacity = 0.6
      tl.frame = CGRect(x: 0, y: (renderSize.height - 72) / 2, width: renderSize.width, height: 90)
      tl.alignmentMode = .center
      tl.contentsScale = UIScreen.main.scale
      tl.opacity = 0

      let showT = timerStartSec + Double(sec)
      let hideT = min(timerStartSec + Double(sec + 1), timerStopSec)

      if showT >= duration { continue }

      let anim = CAKeyframeAnimation(keyPath: "opacity")
      anim.values = [0, 1, 1, 0]
      anim.keyTimes = [
        NSNumber(value: max(0, showT - 0.01) / duration),
        NSNumber(value: showT / duration),
        NSNumber(value: min(hideT, duration) / duration),
        NSNumber(value: min(hideT + 0.01, duration) / duration)
      ]
      anim.duration = duration
      anim.beginTime = AVCoreAnimationBeginTimeAtZero
      anim.isRemovedOnCompletion = false
      tl.add(anim, forKey: "timerShow")
      parentLayer.addSublayer(tl)
    }

    // 6. Frozen timer after stop
    if timerStopMs > 0 && timerStopSec < duration {
      let frozenMins = Int(timerDurationSec) / 60
      let frozenSecs = Int(timerDurationSec) % 60
      let frozenStr = String(format: "%02d:%02d", frozenMins, frozenSecs)
      let fl = CATextLayer()
      fl.string = frozenStr
      fl.font = UIFont.systemFont(ofSize: 72, weight: .ultraLight)
      fl.fontSize = 72
      fl.foregroundColor = UIColor.white.cgColor
      fl.shadowColor = UIColor.black.cgColor
      fl.shadowOffset = CGSize(width: 2, height: -2)
      fl.shadowRadius = 4
      fl.shadowOpacity = 0.6
      fl.frame = CGRect(x: 0, y: (renderSize.height - 72) / 2, width: renderSize.width, height: 90)
      fl.alignmentMode = .center
      fl.contentsScale = UIScreen.main.scale
      fl.opacity = 0

      let anim = CAKeyframeAnimation(keyPath: "opacity")
      anim.values = [0, 1]
      anim.keyTimes = [
        NSNumber(value: max(0, timerStopSec - 0.01) / duration),
        NSNumber(value: timerStopSec / duration)
      ]
      anim.duration = duration
      anim.beginTime = AVCoreAnimationBeginTimeAtZero
      anim.isRemovedOnCompletion = false
      fl.add(anim, forKey: "frozenShow")
      parentLayer.addSublayer(fl)
    }

    // 7. Title (bottom-left)
    if let title = videoTitle, !title.isEmpty {
      let titleLayer = CATextLayer()
      titleLayer.string = title
      titleLayer.font = UIFont.boldSystemFont(ofSize: 22)
      titleLayer.fontSize = 22
      titleLayer.foregroundColor = UIColor.white.cgColor
      titleLayer.shadowColor = UIColor.black.cgColor
      titleLayer.shadowOffset = CGSize(width: 1, height: -1)
      titleLayer.shadowRadius = 3
      titleLayer.shadowOpacity = 0.7
      titleLayer.frame = CGRect(x: 20, y: 60, width: renderSize.width - 40, height: 30)
      titleLayer.alignmentMode = .left
      titleLayer.contentsScale = UIScreen.main.scale
      titleLayer.truncationMode = .end
      parentLayer.addSublayer(titleLayer)
    }

    // 8. Timestamp (bottom-left, below title)
    if let ts = timestamp, !ts.isEmpty {
      let tsLayer = CATextLayer()
      tsLayer.string = ts
      tsLayer.font = UIFont.systemFont(ofSize: 16)
      tsLayer.fontSize = 16
      tsLayer.foregroundColor = UIColor.white.withAlphaComponent(0.8).cgColor
      tsLayer.shadowColor = UIColor.black.cgColor
      tsLayer.shadowOffset = CGSize(width: 1, height: -1)
      tsLayer.shadowRadius = 3
      tsLayer.shadowOpacity = 0.7
      tsLayer.frame = CGRect(x: 20, y: 30, width: renderSize.width - 40, height: 24)
      tsLayer.alignmentMode = .left
      tsLayer.contentsScale = UIScreen.main.scale
      parentLayer.addSublayer(tsLayer)
    }

    // 9. ATHLEX watermark (bottom-right)
    let watermark = CATextLayer()
    watermark.string = "ATHLEX"
    watermark.font = UIFont.boldSystemFont(ofSize: 18)
    watermark.fontSize = 18
    watermark.foregroundColor = UIColor.white.withAlphaComponent(0.6).cgColor
    watermark.frame = CGRect(x: renderSize.width - 110, y: 30, width: 100, height: 24)
    watermark.alignmentMode = .right
    watermark.contentsScale = UIScreen.main.scale
    parentLayer.addSublayer(watermark)

    // Build video composition
    let videoComp = AVMutableVideoComposition()
    videoComp.renderSize = renderSize
    videoComp.frameDuration = CMTime(value: 1, timescale: 30)
    videoComp.animationTool = AVVideoCompositionCoreAnimationTool(
      postProcessingAsVideoLayer: videoLayer, in: parentLayer
    )

    let instruction = AVMutableVideoCompositionInstruction()
    instruction.timeRange = timeRange
    let layerInstruction = AVMutableVideoCompositionLayerInstruction(assetTrack: compVideoTrack)
    if isPortrait {
      layerInstruction.setTransform(transform, at: .zero)
    }
    instruction.layerInstructions = [layerInstruction]
    videoComp.instructions = [instruction]

    // Export
    guard let exporter = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality) else {
      promise.reject("ERR", "Cannot create export session")
      return
    }
    exporter.outputURL = outputURL
    exporter.outputFileType = .mp4
    exporter.videoComposition = videoComp
    exporter.shouldOptimizeForNetworkUse = true

    exporter.exportAsynchronously {
      switch exporter.status {
      case .completed:
        let exists = FileManager.default.fileExists(atPath: outputURL.path)
        print("[VideoOverlay] Export completed, output exists: \(exists)")
        promise.resolve(outputPath)
      case .failed:
        print("[VideoOverlay] Export FAILED: \(exporter.error?.localizedDescription ?? "unknown")")
        promise.reject("ERR", exporter.error?.localizedDescription ?? "Export failed")
      case .cancelled:
        print("[VideoOverlay] Export cancelled")
        promise.reject("ERR", "Export cancelled")
      default:
        print("[VideoOverlay] Export unknown status: \(exporter.status.rawValue)")
        promise.reject("ERR", "Export unknown status")
      }
    }
  }
}
