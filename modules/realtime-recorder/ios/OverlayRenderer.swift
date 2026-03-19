import UIKit
import CoreGraphics
import CoreMedia
import CoreText

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
  private var blackOpsFont: UIFont?

  init() {
    loadAthlexLogo()
    loadBlackOpsFont()
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

  private func loadBlackOpsFont() {
    let bundleName = "RealtimeRecorderResources"
    guard let bundleURL = Bundle.main.url(forResource: bundleName, withExtension: "bundle"),
          let resBundle = Bundle(url: bundleURL),
          let fontURL = resBundle.url(forResource: "BlackOpsOne", withExtension: "ttf") else {
      print("[OverlayRenderer] BlackOpsOne.ttf not found in resource bundle")
      return
    }
    var errorRef: Unmanaged<CFError>?
    CTFontManagerRegisterFontsForURL(fontURL as CFURL, .process, &errorRef)
    if let err = errorRef?.takeRetainedValue() {
      // Already registered is OK
      let desc = CFErrorGetDomain(err) as String
      if !desc.contains("already registered") {
        print("[OverlayRenderer] Font registration error: \(err)")
      }
    }
    // PostScript name for Black Ops One is "BlackOpsOne-Regular"
    if let font = UIFont(name: "BlackOpsOne-Regular", size: 48) {
      blackOpsFont = font
    } else {
      print("[OverlayRenderer] BlackOpsOne-Regular font not available after registration")
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

    // ─── 2. Box logo (top right — rounded square, app style, x2) ───
    if let boxImg = cachedBoxLogo {
      let logoSize: CGFloat = 240
      let logoRect = CGRect(x: size.width - logoSize - margin, y: safeTop, width: logoSize, height: logoSize)
      let cornerRadius: CGFloat = 40
      UIGraphicsPushContext(context)
      context.saveGState()
      let path = UIBezierPath(roundedRect: logoRect, cornerRadius: cornerRadius)
      path.addClip()
      UIColor.white.withAlphaComponent(0.9).setFill()
      path.fill()
      boxImg.draw(in: logoRect.insetBy(dx: 16, dy: 16))
      context.restoreGState()
      UIGraphicsPopContext()
    }

    // ─── 3. Countdown (center, large, bold) ───
    if state.countdownValue > 0 {
      let cdStr = "\(state.countdownValue)"
      drawText(context: context, text: cdStr,
               rect: CGRect(x: 0, y: (size.height - 220) / 2, width: size.width, height: 220),
               fontSize: 180, bold: true, color: .white, alignment: .center, weight: .bold)
    }

    // ════════════════════════════════════════════
    //  BOTTOM ZONE — right side: timer + logo stacked
    //                left side:  "AthleX" branded text
    // ════════════════════════════════════════════
    let safeBottom: CGFloat = 40
    let atlLogoH: CGFloat = 160

    // ─── 4. ATHLEX logo (bottom right) ───
    var atlLogoW: CGFloat = atlLogoH  // fallback square
    if let atlImg = cachedAthlexLogo {
      atlLogoW = atlLogoH * (atlImg.size.width / atlImg.size.height)
      let logoRect = CGRect(x: size.width - atlLogoW - margin,
                            y: size.height - safeBottom - atlLogoH,
                            width: atlLogoW, height: atlLogoH)
      UIGraphicsPushContext(context)
      atlImg.draw(in: logoRect)
      UIGraphicsPopContext()
    }

    // ─── 5. Timer display (right-aligned, above logo) ───
    let timerH: CGFloat = 110
    let timerY = size.height - safeBottom - atlLogoH - 8 - timerH
    let rightZoneW = max(atlLogoW, 400)  // right zone width for alignment
    let rightZoneX = size.width - rightZoneW - margin
    if state.showTimer && state.countdownValue <= 0 {
      drawText(context: context, text: state.timerDisplay,
               rect: CGRect(x: rightZoneX, y: timerY, width: rightZoneW, height: timerH),
               fontSize: 90, bold: false, color: .white, alignment: .center,
               weight: .medium, shadow: true, monospace: true)
    }

    // ─── 6. Timestamp (right zone, above timer) ───
    if !state.timestamp.isEmpty && state.showTimer && state.countdownValue <= 0 {
      drawText(context: context, text: state.timestamp,
               rect: CGRect(x: rightZoneX, y: timerY - 38, width: rightZoneW, height: 34),
               fontSize: 24, bold: false, color: UIColor.white.withAlphaComponent(0.8),
               alignment: .center, shadow: true)
    }

    // ─── 7. "AthleX" branded text (bottom left, Black Ops One) ───
    drawBrandText(context: context,
                  rect: CGRect(x: margin, y: size.height - safeBottom - 60, width: 300, height: 60),
                  fontSize: 48, color: .white, shadow: true)
  }

  // MARK: - Brand text (Black Ops One)

  private func drawBrandText(
    context: CGContext,
    rect: CGRect,
    fontSize: CGFloat,
    color: UIColor,
    shadow: Bool
  ) {
    let font: UIFont = blackOpsFont?.withSize(fontSize)
      ?? UIFont.boldSystemFont(ofSize: fontSize) // fallback

    let paragraphStyle = NSMutableParagraphStyle()
    paragraphStyle.alignment = .left
    paragraphStyle.lineBreakMode = .byClipping

    var attributes: [NSAttributedString.Key: Any] = [
      .font: font,
      .foregroundColor: color,
      .paragraphStyle: paragraphStyle,
    ]

    if shadow {
      let s = NSShadow()
      s.shadowColor = UIColor.black.withAlphaComponent(0.7)
      s.shadowOffset = CGSize(width: 2, height: 2)
      s.shadowBlurRadius = 6
      attributes[.shadow] = s
    }

    let attrString = NSAttributedString(string: "AthleX", attributes: attributes)

    UIGraphicsPushContext(context)
    attrString.draw(in: rect)
    UIGraphicsPopContext()
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
