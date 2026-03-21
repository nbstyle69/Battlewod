package expo.modules.realtimerecorder

import android.content.Context
import android.graphics.*
import android.graphics.drawable.BitmapDrawable
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import java.net.URL

/**
 * Draws overlay graphics directly onto a Bitmap (video frame) using Android Canvas.
 * Mirrors the iOS OverlayRenderer.swift layout exactly:
 *
 * - Title: top center (28pt bold)
 * - Box logo: top right (240px rounded square)
 * - Countdown: center screen (180pt bold)
 * - Bottom row (160px height):
 *   - Left: "AthleX" text (Black Ops One font, 48pt)
 *   - Center: Timer monospace (90pt)
 *   - Right: ATHLEX logo (160px height)
 * - Timestamp: centered above bottom row
 */
class OverlayRenderer(private val context: Context) {

  private var cachedAthlexLogo: Bitmap? = null
  private var cachedBoxLogo: Bitmap? = null
  private var cachedBoxLogoUrl: String = ""
  @Volatile private var boxLogoLoading = false
  private var blackOpsTypeface: Typeface? = null

  init {
    loadAthlexLogo()
    loadBlackOpsFont()
  }

  // MARK: - Resource loading

  private fun loadAthlexLogo() {
    try {
      val inputStream = context.assets.open("realtime-recorder/logo.png")
      cachedAthlexLogo = BitmapFactory.decodeStream(inputStream)
      inputStream.close()
    } catch (e: Exception) {
      // Try raw resources
      try {
        val resId = context.resources.getIdentifier("logo", "drawable", context.packageName)
        if (resId != 0) {
          cachedAthlexLogo = BitmapFactory.decodeResource(context.resources, resId)
        }
      } catch (_: Exception) {}
    }
  }

  private fun loadBlackOpsFont() {
    try {
      blackOpsTypeface = Typeface.createFromAsset(context.assets, "realtime-recorder/BlackOpsOne.ttf")
    } catch (e: Exception) {
      // Fallback to bold system font
      blackOpsTypeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    }
  }

  private fun loadBoxLogoIfNeeded(url: String) {
    if (url.isEmpty() || url == cachedBoxLogoUrl || boxLogoLoading) return
    boxLogoLoading = true
    cachedBoxLogoUrl = url

    Thread {
      try {
        val stream = URL(url).openStream()
        val bmp = BitmapFactory.decodeStream(stream)
        stream.close()
        cachedBoxLogo = bmp
      } catch (_: Exception) {
      } finally {
        boxLogoLoading = false
      }
    }.start()
  }

  // MARK: - Main render

  /**
   * Draw all overlays onto the given Bitmap. Called from recording thread.
   */
  fun render(bitmap: Bitmap, state: OverlayState) {
    val canvas = Canvas(bitmap)
    val width = bitmap.width.toFloat()
    val height = bitmap.height.toFloat()

    loadBoxLogoIfNeeded(state.boxLogoUrl)

    val margin = 24f * (width / 1080f) // Scale margin to resolution
    val safeTop = 60f * (height / 1920f)
    val scale = width / 1080f // Reference: 1080x1920

    // ─── 1. Title (top center) ───
    if (state.title.isNotEmpty()) {
      drawText(
        canvas, state.title,
        RectF(margin, safeTop, width - margin, safeTop + 40f * scale),
        fontSize = 28f * scale, bold = true, color = Color.WHITE,
        alignment = Layout.Alignment.ALIGN_CENTER, shadow = true
      )
    }

    // ─── 2. Box logo (top right — rounded square) ───
    cachedBoxLogo?.let { boxImg ->
      val logoSize = 240f * scale
      val logoRect = RectF(
        width - logoSize - margin, safeTop,
        width - margin, safeTop + logoSize
      )
      val cornerRadius = 40f * scale

      // White background rounded rect
      val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.argb(230, 255, 255, 255) // 0.9 alpha
        style = Paint.Style.FILL
      }
      canvas.drawRoundRect(logoRect, cornerRadius, cornerRadius, bgPaint)

      // Draw logo inside with inset
      val inset = 16f * scale
      val logoInsetRect = RectF(
        logoRect.left + inset, logoRect.top + inset,
        logoRect.right - inset, logoRect.bottom - inset
      )
      canvas.save()
      val clipPath = Path().apply { addRoundRect(logoRect, cornerRadius, cornerRadius, Path.Direction.CW) }
      canvas.clipPath(clipPath)
      canvas.drawBitmap(boxImg, null, logoInsetRect, Paint(Paint.FILTER_BITMAP_FLAG))
      canvas.restore()
    }

    // ─── 3. Countdown (center, large, bold) ───
    if (state.countdownValue > 0) {
      val cdStr = "${state.countdownValue}"
      val cdFontSize = 180f * scale
      val cdY = (height - 220f * scale) / 2f
      drawText(
        canvas, cdStr,
        RectF(0f, cdY, width, cdY + 220f * scale),
        fontSize = cdFontSize, bold = true, color = Color.WHITE,
        alignment = Layout.Alignment.ALIGN_CENTER
      )
    }

    // ════════════════════════════════════════════
    //  BOTTOM ROW — same line:
    //    left:   "AthleX" (Black Ops One)
    //    center: timer
    //    right:  ATHLEX logo
    //  Timestamp centered above timer
    // ════════════════════════════════════════════
    val safeBottom = 40f * scale
    val rowH = 160f * scale
    val rowY = height - safeBottom - rowH

    // ─── 4. ATHLEX logo (bottom right) ───
    cachedAthlexLogo?.let { atlImg ->
      val atlLogoW = rowH * (atlImg.width.toFloat() / atlImg.height.toFloat())
      val logoRect = RectF(
        width - atlLogoW - margin, rowY,
        width - margin, rowY + rowH
      )
      canvas.drawBitmap(atlImg, null, logoRect, Paint(Paint.FILTER_BITMAP_FLAG))
    }

    // ─── 5. Timer display (bottom center, vertically centered in row) ───
    if (state.showTimer && state.countdownValue <= 0) {
      val timerH = 110f * scale
      val timerY = rowY + (rowH - timerH) / 2f
      drawText(
        canvas, state.timerDisplay,
        RectF(0f, timerY, width, timerY + timerH),
        fontSize = 90f * scale, bold = false, color = Color.WHITE,
        alignment = Layout.Alignment.ALIGN_CENTER,
        shadow = true, monospace = true
      )
    }

    // ─── 6. Timestamp (centered, above bottom row) ───
    if (state.timestamp.isNotEmpty() && state.showTimer && state.countdownValue <= 0) {
      val tsH = 34f * scale
      val tsY = rowY - 38f * scale
      drawText(
        canvas, state.timestamp,
        RectF(0f, tsY, width, tsY + tsH),
        fontSize = 24f * scale, bold = false,
        color = Color.argb(204, 255, 255, 255), // 0.8 alpha
        alignment = Layout.Alignment.ALIGN_CENTER, shadow = true
      )
    }

    // ─── 7. "AthleX" branded text (bottom left, vertically centered in row) ───
    val brandH = 60f * scale
    val brandY = rowY + (rowH - brandH) / 2f
    drawBrandText(
      canvas,
      RectF(margin, brandY, margin + 300f * scale, brandY + brandH),
      fontSize = 48f * scale, color = Color.WHITE, shadow = true
    )
  }

  // MARK: - Brand text (Black Ops One)

  private fun drawBrandText(
    canvas: Canvas, rect: RectF,
    fontSize: Float, color: Int, shadow: Boolean
  ) {
    val paint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
      this.color = color
      textSize = fontSize
      typeface = blackOpsTypeface ?: Typeface.DEFAULT_BOLD
      textAlign = Paint.Align.LEFT
      if (shadow) {
        setShadowLayer(6f, 2f, 2f, Color.argb(179, 0, 0, 0))
      }
    }

    // Vertically center in rect
    val fm = paint.fontMetrics
    val textH = fm.descent - fm.ascent
    val y = rect.top + (rect.height() - textH) / 2f - fm.ascent

    canvas.drawText("AthleX", rect.left, y, paint)
  }

  // MARK: - Text drawing helper

  private fun drawText(
    canvas: Canvas, text: String, rect: RectF,
    fontSize: Float, bold: Boolean, color: Int,
    alignment: Layout.Alignment,
    shadow: Boolean = false,
    monospace: Boolean = false
  ) {
    val paint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
      this.color = color
      textSize = fontSize
      typeface = when {
        monospace -> Typeface.create(Typeface.MONOSPACE, if (bold) Typeface.BOLD else Typeface.NORMAL)
        bold -> Typeface.DEFAULT_BOLD
        else -> Typeface.DEFAULT
      }
      if (shadow) {
        setShadowLayer(4f, 1f, 1f, Color.argb(179, 0, 0, 0))
      }
    }

    // Use StaticLayout for proper alignment
    val layoutWidth = (rect.right - rect.left).toInt().coerceAtLeast(1)

    @Suppress("DEPRECATION")
    val layout = StaticLayout(
      text, paint, layoutWidth,
      alignment, 1f, 0f, false
    )

    canvas.save()
    // Center vertically within rect
    val textHeight = layout.height.toFloat()
    val offsetY = rect.top + (rect.height() - textHeight) / 2f
    canvas.translate(rect.left, offsetY)
    layout.draw(canvas)
    canvas.restore()
  }
}
