import UIKit
import CoreGraphics
import CoreMedia

/// Holds the current overlay state pushed from JS
struct OverlayState {
  var timerType: String = ""
  var timerDisplay: String = ""
  var title: String = ""
  var timestamp: String = ""
  var isRecording: Bool = false
  var countdownValue: Int = 0       // >0 means countdown is visible
  var showTimer: Bool = false       // true when chrono is running/frozen
}

/// Draws overlay graphics directly onto a CVPixelBuffer using Core Graphics
final class OverlayRenderer {

  private let scale: CGFloat = UIScreen.main.scale

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
    // Flip to UIKit coordinates so text draws naturally.
    context.translateBy(x: 0, y: size.height)
    context.scaleBy(x: 1, y: -1)

    // ─── 1. Top bar background ───
    let topBarH: CGFloat = 80
    context.setFillColor(UIColor.black.withAlphaComponent(0.5).cgColor)
    context.fill(CGRect(x: 0, y: 0, width: size.width, height: topBarH))

    // ─── 2. Timer type label (top-left) ───
    let typeStr = state.timerType.uppercased().replacingOccurrences(of: "-", with: " ")
    drawText(context: context, text: typeStr,
             rect: CGRect(x: 20, y: 22, width: 300, height: 40),
             fontSize: 28, bold: true, color: .white, alignment: .left)

    // ─── 3. REC badge (top-right) ───
    if state.isRecording {
      drawText(context: context, text: "● REC",
               rect: CGRect(x: size.width - 130, y: 25, width: 120, height: 30),
               fontSize: 22, bold: true, color: .red, alignment: .right)
    }

    // ─── 4. Countdown (center, large) ───
    if state.countdownValue > 0 {
      let cdStr = "\(state.countdownValue)"
      drawText(context: context, text: cdStr,
               rect: CGRect(x: 0, y: (size.height - 140) / 2, width: size.width, height: 140),
               fontSize: 120, bold: false, color: .white, alignment: .center, weight: .ultraLight)
    }

    // ─── 5. Timer display (center) ───
    if state.showTimer && state.countdownValue <= 0 {
      drawText(context: context, text: state.timerDisplay,
               rect: CGRect(x: 0, y: (size.height - 90) / 2, width: size.width, height: 90),
               fontSize: 72, bold: false, color: .white, alignment: .center, weight: .ultraLight,
               shadow: true)
    }

    // ─── 6. Title (bottom-left) ───
    if !state.title.isEmpty {
      drawText(context: context, text: state.title,
               rect: CGRect(x: 20, y: size.height - 80, width: size.width - 40, height: 30),
               fontSize: 22, bold: true, color: .white, alignment: .left, shadow: true)
    }

    // ─── 7. Timestamp (bottom-left, below title) ───
    if !state.timestamp.isEmpty {
      drawText(context: context, text: state.timestamp,
               rect: CGRect(x: 20, y: size.height - 50, width: size.width - 40, height: 24),
               fontSize: 16, bold: false, color: UIColor.white.withAlphaComponent(0.8),
               alignment: .left, shadow: true)
    }

    // ─── 8. ATHLEX watermark (bottom-right) ───
    drawText(context: context, text: "ATHLEX",
             rect: CGRect(x: size.width - 110, y: size.height - 50, width: 100, height: 24),
             fontSize: 18, bold: true, color: UIColor.white.withAlphaComponent(0.6),
             alignment: .right)
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
    shadow: Bool = false
  ) {
    let font: UIFont
    if let w = weight {
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
      s.shadowBlurRadius = 3
      attributes[.shadow] = s
    }

    let attrString = NSAttributedString(string: text, attributes: attributes)

    // Push graphics state for UIKit string drawing
    UIGraphicsPushContext(context)
    attrString.draw(in: rect)
    UIGraphicsPopContext()
  }
}
