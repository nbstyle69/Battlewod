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
  private var cachedCompLogo: Bitmap? = null
  private var cachedCompLogoUrl: String = ""
  @Volatile private var compLogoLoading = false
  private var blackOpsTypeface: Typeface? = null
  private var dsDigitalTypeface: Typeface? = null

  init {
    loadAthlexLogo()
    loadBlackOpsFont()
    loadDSDigitalFont()
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
      blackOpsTypeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    }
  }

  private fun loadDSDigitalFont() {
    try {
      dsDigitalTypeface = Typeface.createFromAsset(context.assets, "realtime-recorder/DS-Digital.ttf")
    } catch (e: Exception) {
      dsDigitalTypeface = Typeface.create(Typeface.MONOSPACE, Typeface.NORMAL)
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

  private fun loadCompLogoIfNeeded(url: String) {
    if (url.isEmpty() || url == cachedCompLogoUrl || compLogoLoading) return
    compLogoLoading = true
    cachedCompLogoUrl = url

    Thread {
      try {
        val stream = URL(url).openStream()
        val bmp = BitmapFactory.decodeStream(stream)
        stream.close()
        cachedCompLogo = bmp
      } catch (_: Exception) {
      } finally {
        compLogoLoading = false
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
    loadCompLogoIfNeeded(state.competitionLogoUrl)

    val margin = 24f * (width / 1080f) // Scale margin to resolution
    val safeTop = 60f * (height / 1920f)
    val scale = width / 1080f // Reference: 1080x1920

    // ─── 0. Competition logo (top left — rounded square, no white bg) ───
    cachedCompLogo?.let { compImg ->
      val logoSize = 200f * scale
      val logoRect = RectF(margin, safeTop, margin + logoSize, safeTop + logoSize)
      val cornerRadius = 32f * scale

      canvas.save()
      val clipPath = Path().apply { addRoundRect(logoRect, cornerRadius, cornerRadius, Path.Direction.CW) }
      canvas.clipPath(clipPath)
      canvas.drawBitmap(compImg, null, logoRect, Paint(Paint.FILTER_BITMAP_FLAG))
      canvas.restore()
    }

    // ─── 1. Title (top center, adjusted for logos) ───
    if (state.title.isNotEmpty()) {
      val titleLeft = if (cachedCompLogo != null) margin + 200f * scale + 12f * scale else margin
      val titleRight = if (cachedBoxLogo != null) width - 200f * scale - margin - 12f * scale else width - margin
      drawText(
        canvas, state.title,
        RectF(titleLeft, safeTop, titleRight, safeTop + 40f * scale),
        fontSize = 28f * scale, bold = true, color = Color.WHITE,
        alignment = Layout.Alignment.ALIGN_CENTER, shadow = true
      )
    }

    // ─── 2. Box logo (top right — circle, 200px) ───
    cachedBoxLogo?.let { boxImg ->
      val logoSize = 200f * scale
      val logoRect = RectF(
        width - logoSize - margin, safeTop,
        width - margin, safeTop + logoSize
      )
      val cornerRadius = logoSize / 2f  // circle

      val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.argb(230, 255, 255, 255)
        style = Paint.Style.FILL
      }
      canvas.drawRoundRect(logoRect, cornerRadius, cornerRadius, bgPaint)

      val inset = 12f * scale
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

    // ─── 3. Countdown (center, extra large, bold) ───
    if (state.countdownValue > 0) {
      val cdStr = "${state.countdownValue}"
      val cdFontSize = 260f * scale
      val cdH = 320f * scale
      val cdY = (height - cdH) / 2f
      drawText(
        canvas, cdStr,
        RectF(0f, cdY, width, cdY + cdH),
        fontSize = cdFontSize, bold = true, color = Color.WHITE,
        alignment = Layout.Alignment.ALIGN_CENTER
      )
    }

    // ════════════════════════════════════════════
    //  BOTTOM ROW — AthleX (left) | Timer (center) | Timestamp (right)
    //  Logo centered above "AthleX" text
    // ════════════════════════════════════════════
    val safeBottom = 140f * scale

    // ─── 6. "AthleX" branded text — reference baseline for bottom row ───
    val brandH = 50f * scale
    val brandY = height - safeBottom - brandH
    val brandTextW = 160f * scale  // estimated "AthleX" width at 40pt
    drawBrandText(
      canvas,
      RectF(margin, brandY, margin + 280f * scale, brandY + brandH),
      fontSize = 40f * scale, color = Color.WHITE, shadow = true
    )

    // ─── 5. ATHLEX logo (centered horizontally above "AthleX" text) ───
    val atlLogoH = 120f * scale
    val atlLogoY = brandY - atlLogoH - 4f * scale
    cachedAthlexLogo?.let { atlImg ->
      val atlLogoW = atlLogoH * (atlImg.width.toFloat() / atlImg.height.toFloat())
      val brandCenterX = margin + brandTextW / 2f
      val logoX = brandCenterX - atlLogoW / 2f
      val logoRect = RectF(logoX, atlLogoY, logoX + atlLogoW, atlLogoY + atlLogoH)
      canvas.drawBitmap(atlImg, null, logoRect, Paint(Paint.FILTER_BITMAP_FLAG))
    }

    // ─── 4. Timer display (center, same row as AthleX text) ───
    if (state.showTimer && state.countdownValue <= 0) {
      val timerH = 110f * scale
      val timerCenterY = brandY + brandH / 2f
      val timerY = timerCenterY - timerH / 2f
      drawText(
        canvas, state.timerDisplay,
        RectF(0f, timerY, width, timerY + timerH),
        fontSize = 90f * scale, bold = false, color = Color.WHITE,
        alignment = Layout.Alignment.ALIGN_CENTER,
        shadow = true, dsDigital = true
      )
    }

    // ─── 7. Timestamp (right, same row as AthleX text) ───
    if (state.timestamp.isNotEmpty() && state.showTimer && state.countdownValue <= 0) {
      val tsW = 260f * scale
      val tsH = 34f * scale
      val tsCenterY = brandY + brandH / 2f
      val tsY = tsCenterY - tsH / 2f
      drawText(
        canvas, state.timestamp,
        RectF(width - tsW - margin, tsY, width - margin, tsY + tsH),
        fontSize = 24f * scale, bold = false,
        color = Color.argb(204, 255, 255, 255),
        alignment = Layout.Alignment.ALIGN_OPPOSITE, shadow = true
      )
    }
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
    monospace: Boolean = false,
    dsDigital: Boolean = false
  ) {
    val paint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
      this.color = color
      textSize = fontSize
      typeface = when {
        dsDigital -> dsDigitalTypeface ?: Typeface.create(Typeface.MONOSPACE, Typeface.NORMAL)
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
