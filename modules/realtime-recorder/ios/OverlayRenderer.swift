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
  var competitionLogoUrl: String = "" // URL of competition logo (top-left overlay)
}

/// Draws overlay graphics directly onto a CVPixelBuffer using Core Graphics
final class OverlayRenderer {

  // Cached images
  private var cachedAthlexLogo: UIImage?
  private var cachedBoxLogo: UIImage?
  private var cachedBoxLogoUrl: String = ""
  private var boxLogoLoading = false
  private var cachedCompLogo: UIImage?
  private var cachedCompLogoUrl: String = ""
  private var compLogoLoading = false
  private var blackOpsFont: UIFont?
  private var dsDigitalFont: UIFont?

  init() {
    loadAthlexLogo()
    loadBlackOpsFont()
    loadDSDigitalFont()
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

  private func loadDSDigitalFont() {
    let bundleName = "RealtimeRecorderResources"
    guard let bundleURL = Bundle.main.url(forResource: bundleName, withExtension: "bundle"),
          let resBundle = Bundle(url: bundleURL),
          let fontURL = resBundle.url(forResource: "DS-Digital", withExtension: "ttf") else {
      print("[OverlayRenderer] DS-Digital.ttf not found in resource bundle")
      return
    }
    var errorRef: Unmanaged<CFError>?
    CTFontManagerRegisterFontsForURL(fontURL as CFURL, .process, &errorRef)
    if let err = errorRef?.takeRetainedValue() {
      let desc = CFErrorGetDomain(err) as String
      if !desc.contains("already registered") {
        print("[OverlayRenderer] DS-Digital font registration error: \(err)")
      }
    }
    // PostScript name for DS-Digital is "DS-Digital"
    if let font = UIFont(name: "DS-Digital", size: 48) {
      dsDigitalFont = font
    } else {
      print("[OverlayRenderer] DS-Digital font not available after registration")
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

  private func loadCompLogoIfNeeded(url: String) {
    guard !url.isEmpty, url != cachedCompLogoUrl, !compLogoLoading else { return }
    compLogoLoading = true
    cachedCompLogoUrl = url

    DispatchQueue.global(qos: .utility).async { [weak self] in
      guard let self = self, let imgURL = URL(string: url),
            let data = try? Data(contentsOf: imgURL),
            let img = UIImage(data: data) else {
        self?.compLogoLoading = false
        return
      }
      self.cachedCompLogo = img
      self.compLogoLoading = false
    }
  }

  // MARK: - Main render

  /// Draw all overlays onto the given pixel buffer. Thread-safe — called from capture queue.
  func render(onto pixelBuffer: CVPixelBuffer, state: OverlayState) {
    let width = CVPixelBufferGetWidth(pixelBuffer)
    let height = CVPixelBufferGetHeight(pixelBuffer)
    let size = CGSize(width: CGFloat(width), height: CGFloat(height))
    let isLandscape = size.width > size.height

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

    // Load logos in background if URL changed
    loadBoxLogoIfNeeded(url: state.boxLogoUrl)
    loadCompLogoIfNeeded(url: state.competitionLogoUrl)

    // Use min dimension as reference so elements stay the same physical size
    let refDim = min(size.width, size.height)
    let scale = refDim / 1080.0
    let margin: CGFloat = 24 * scale
    let safeTop: CGFloat = isLandscape ? 24 * scale : 60 * (size.height / 1920.0)

    // ─── 0. Competition logo (top left — rounded square, no white bg) ───
    let logoSize: CGFloat = isLandscape ? 120 * scale : 200 * scale
    if let compImg = cachedCompLogo {
      let logoRect = CGRect(x: margin, y: safeTop, width: logoSize, height: logoSize)
      let cornerRadius: CGFloat = isLandscape ? 20 * scale : 32 * scale
      UIGraphicsPushContext(context)
      context.saveGState()
      let path = UIBezierPath(roundedRect: logoRect, cornerRadius: cornerRadius)
      path.addClip()
      compImg.draw(in: logoRect)
      context.restoreGState()
      UIGraphicsPopContext()
    }

    // ─── 1. Title (top center) ───
    if !state.title.isEmpty {
      let titleX = cachedCompLogo != nil ? (margin + logoSize + 12 * scale) : margin
      let titleW = size.width - titleX - (cachedBoxLogo != nil ? (logoSize + margin + 12 * scale) : margin)
      drawText(context: context, text: state.title,
               rect: CGRect(x: titleX, y: safeTop, width: titleW, height: 40 * scale),
               fontSize: 28 * scale, bold: true, color: .white, alignment: .center, shadow: true)
    }

    // ─── 2. Box logo (top right — circle, no background) ───
    if let boxImg = cachedBoxLogo {
      let logoRect = CGRect(x: size.width - logoSize - margin, y: safeTop, width: logoSize, height: logoSize)
      let cornerRadius: CGFloat = logoSize / 2  // circle
      UIGraphicsPushContext(context)
      context.saveGState()
      let path = UIBezierPath(roundedRect: logoRect, cornerRadius: cornerRadius)
      path.addClip()
      boxImg.draw(in: logoRect)
      context.restoreGState()
      UIGraphicsPopContext()
    }

    // ─── 3. Countdown (center, extra large, bold) ───
    if state.countdownValue > 0 {
      let cdStr = "\(state.countdownValue)"
      let cdFontSize: CGFloat = isLandscape ? 180 * scale : 260 * scale
      let cdH: CGFloat = isLandscape ? 220 * scale : 320 * scale
      drawText(context: context, text: cdStr,
               rect: CGRect(x: 0, y: (size.height - cdH) / 2, width: size.width, height: cdH),
               fontSize: cdFontSize, bold: true, color: .white, alignment: .center, weight: .bold)
    }

    // ════════════════════════════════════════════
    //  BOTTOM ROW — AthleX (left) | Timer (center) | Timestamp (right)
    //  Logo centered above "AthleX" text
    // ════════════════════════════════════════════
    let safeBottom: CGFloat = isLandscape ? 40 * scale : 140 * scale

    // ─── 6. "AthleX" branded text — reference baseline for bottom row ───
    let brandH: CGFloat = isLandscape ? 40 * scale : 50 * scale
    let brandY = size.height - safeBottom - brandH
    let brandFontSize: CGFloat = isLandscape ? 30 * scale : 40 * scale
    let brandTextW: CGFloat = isLandscape ? 120 * scale : 160 * scale
    drawBrandText(context: context,
                  rect: CGRect(x: margin, y: brandY, width: 280 * scale, height: brandH),
                  fontSize: brandFontSize, color: .white, shadow: true)

    // ─── 5. ATHLEX logo (centered horizontally above "AthleX" text) ───
    let atlLogoH: CGFloat = isLandscape ? 80 * scale : 120 * scale
    let atlLogoY = brandY - atlLogoH - 4 * scale
    if let atlImg = cachedAthlexLogo {
      let atlLogoW = atlLogoH * (atlImg.size.width / atlImg.size.height)
      let brandCenterX = margin + brandTextW / 2
      let logoX = brandCenterX - atlLogoW / 2
      let logoRect = CGRect(x: logoX, y: atlLogoY, width: atlLogoW, height: atlLogoH)
      UIGraphicsPushContext(context)
      atlImg.draw(in: logoRect)
      UIGraphicsPopContext()
    }

    // ─── 4. Timer display (center, same row as AthleX text) ───
    if state.showTimer && state.countdownValue <= 0 {
      let timerFontSize: CGFloat = isLandscape ? 70 * scale : 90 * scale
      let timerH: CGFloat = isLandscape ? 85 * scale : 110 * scale
      let timerCenterY = brandY + brandH / 2
      let timerY = timerCenterY - timerH / 2
      drawText(context: context, text: state.timerDisplay,
               rect: CGRect(x: 0, y: timerY, width: size.width, height: timerH),
               fontSize: timerFontSize, bold: false, color: .white, alignment: .center,
               weight: .medium, shadow: true, dsDigital: true)
    }

    // ─── 7. Timestamp (right, same row as AthleX text) ───
    if !state.timestamp.isEmpty && state.showTimer && state.countdownValue <= 0 {
      let tsW: CGFloat = 260 * scale
      let tsH: CGFloat = 34 * scale
      let tsCenterY = brandY + brandH / 2
      let tsY = tsCenterY - tsH / 2
      drawText(context: context, text: state.timestamp,
               rect: CGRect(x: size.width - tsW - margin, y: tsY, width: tsW, height: tsH),
               fontSize: 24 * scale, bold: false, color: UIColor.white.withAlphaComponent(0.8),
               alignment: .right, shadow: true)
    }
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
    monospace: Bool = false,
    dsDigital: Bool = false
  ) {
    let font: UIFont
    if dsDigital, let dsFont = dsDigitalFont?.withSize(fontSize) {
      font = dsFont
    } else if monospace {
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
