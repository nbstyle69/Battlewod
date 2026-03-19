import UIKit
import CoreGraphics
import CoreMedia

/// Holds the current overlay state pushed from JS
struct OverlayState {
  var timerType: String = ""
  var timerDisplay: String = ""       // e.g. "02:35.42"
  var title: String = ""
  var timestamp: String = ""
  var isRecording: Bool = false
  var countdownValue: Int = 0         // >0 means countdown is visible
  var showTimer: Bool = false         // true when chrono is running/frozen
  var boxLogoUrl: String = ""         // URL of the box logo (empty = no box)
}

/// Draws overlay graphics directly onto a CVPixelBuffer using Core Graphics
final class OverlayRenderer {

  // Cached images
  private var cachedAthlexLogo: UIImage?
  private var cachedBoxLogo: UIImage?
  private var cachedBoxLogoUrl: String = ""
  private var boxLogoLoading = false

  init() {
    loadAthlexLogo()
  }

  // MARK: - Logo loading

  private func loadAthlexLogo() {
    // Try the resource bundle first (CocoaPods resource_bundles)
    let bundleName = "RealtimeRecorderResources"
    if let bundleURL = Bundle.main.url(forResource: bundleName, withExtension: "bundle"),
       let resBundle = Bundle(url: bundleURL),
       let img = UIImage(named: "logo", in: resBundle, compatibleWith: nil) ?? UIImage(contentsOfFile: resBundle.path(forResource: "logo", ofType: "png") ?? "") {
      cachedAthlexLogo = img
    }
    // Fallback: main bundle
    else if let img = UIImage(named: "logo") ?? UIImage(named: "logo.png") {
      cachedAthlexLogo = img
    }
  }

  private func loadBoxLogoIfNeeded(url: String) {
    guard !url.isEmpty, url != cachedBoxLogoUrl, !boxLogoLoading else { return }
    boxLogoLoading = true
    cachedBoxLogoUrl = url

    DispatchQueue.global(qos: .utility).async { [weak self] in
      guard let self = self, let imgURL = URL(string: url),
            let data = try? Data(contentsOf: imgURL),
            let img = UIImage(data: data) else {
        self?.boxLogoLoading = false
        return
      }
      self.cachedBoxLogo = img
      self.boxLogoLoading = false
    }
  }

  // MARK: - Main render

  /// Draw all overlays onto the given pixel buffer. Thread-safe — called from capture queue.
  func render(onto pixelBuffer: CVPixelBuffer, state: OverlayState) {
    let width = CVPixelBufferGetWidth(pixelBuffer)
    let height = CVPixelBufferGetHeight(pixelBuffer)
    let size = CGSize(width: CGFloat(width), height: CGFloat(height))

    CVPixelBufferLockBaseAddress(pixelBuffer, [])
    defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, []) }

    guard let context = CGContext(
      data: CVPixelBufferGetBaseAddress(pixelBuffer),
      width: width,
      height: height,
      bitsPerComponent: 8,
      bytesPerRow: CVPixelBufferGetBytesPerRow(pixelBuffer),
      space: CGColorSpaceCreateDeviceRGB(),
      bitmapInfo: CGBitmapInfo.byteOrder32Little.rawValue | CGImageAlphaInfo.premultipliedFirst.rawValue
    ) else { return }

    // Core Graphics origin is bottom-left; UIKit is top-left.
    context.translateBy(x: 0, y: size.height)
    context.scaleBy(x: 1, y: -1)

    // Load box logo in background if URL changed
    loadBoxLogoIfNeeded(url: state.boxLogoUrl)

    let margin: CGFloat = 24
    let safeTop: CGFloat = 60  // safe area for notch

    // ─── 1. Title (top center) ───
    if !state.title.isEmpty {
      drawText(context: context, text: state.title,
               rect: CGRect(x: margin, y: safeTop, width: size.width - margin * 2, height: 40),
               fontSize: 28, bold: true, color: .white, alignment: .center, shadow: true)
    }

    // ─── 2. Box logo (top right) ───
    if let boxImg = cachedBoxLogo {
      let logoH: CGFloat = 50
      let logoW = logoH * (boxImg.size.width / boxImg.size.height)
      let logoRect = CGRect(x: size.width - logoW - margin, y: safeTop, width: logoW, height: logoH)
      UIGraphicsPushContext(context)
      boxImg.draw(in: logoRect)
      UIGraphicsPopContext()
    }

    // ─── 3. Countdown (center, large — same style as React) ───
    if state.countdownValue > 0 {
      let cdStr = "\(state.countdownValue)"
      drawText(context: context, text: cdStr,
               rect: CGRect(x: 0, y: (size.height - 160) / 2, width: size.width, height: 160),
               fontSize: 140, bold: false, color: .white, alignment: .center, weight: .ultraLight)
    }

    // ─── 4. Timestamp (centered, above timer) ───
    if !state.timestamp.isEmpty && state.showTimer && state.countdownValue <= 0 {
      drawText(context: context, text: state.timestamp,
               rect: CGRect(x: 0, y: size.height - 170, width: size.width, height: 26),
               fontSize: 18, bold: false, color: UIColor.white.withAlphaComponent(0.7),
               alignment: .center, shadow: true)
    }

    // ─── 5. Timer display (bottom center, large monospace with hundredths) ───
    if state.showTimer && state.countdownValue <= 0 {
      drawText(context: context, text: state.timerDisplay,
               rect: CGRect(x: 0, y: size.height - 140, width: size.width, height: 80),
               fontSize: 64, bold: false, color: .white, alignment: .center,
               weight: .medium, shadow: true, monospace: true)
    }

    // ─── 6. ATHLEX logo (bottom right) ───
    if let atlImg = cachedAthlexLogo {
      let logoH: CGFloat = 40
      let logoW = logoH * (atlImg.size.width / atlImg.size.height)
      let logoRect = CGRect(x: size.width - logoW - margin, y: size.height - 55, width: logoW, height: logoH)
      UIGraphicsPushContext(context)
      atlImg.draw(in: logoRect)
      UIGraphicsPopContext()
    }
  }

  // MARK: - Text drawing helper

  private func drawText(
    context: CGContext,
    text: String,
    rect: CGRect,
    fontSize: CGFloat,
    bold: Bool,
    color: UIColor,
    alignment: NSTextAlignment,
    weight: UIFont.Weight? = nil,
    shadow: Bool = false,
    monospace: Bool = false
  ) {
    let font: UIFont
    if monospace {
      font = UIFont.monospacedDigitSystemFont(ofSize: fontSize, weight: weight ?? (bold ? .bold : .regular))
    } else if let w = weight {
      font = UIFont.systemFont(ofSize: fontSize, weight: w)
    } else {
      font = bold ? UIFont.boldSystemFont(ofSize: fontSize) : UIFont.systemFont(ofSize: fontSize)
    }

    let paragraphStyle = NSMutableParagraphStyle()
    paragraphStyle.alignment = alignment
    paragraphStyle.lineBreakMode = .byTruncatingTail

    var attributes: [NSAttributedString.Key: Any] = [
      .font: font,
      .foregroundColor: color,
      .paragraphStyle: paragraphStyle,
    ]

    if shadow {
      let s = NSShadow()
      s.shadowColor = UIColor.black.withAlphaComponent(0.7)
      s.shadowOffset = CGSize(width: 1, height: 1)
      s.shadowBlurRadius = 4
      attributes[.shadow] = s
    }

    let attrString = NSAttributedString(string: text, attributes: attributes)

    UIGraphicsPushContext(context)
    attrString.draw(in: rect)
    UIGraphicsPopContext()
  }
}
