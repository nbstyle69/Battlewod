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
 * - Competition logo: top left (rounded square)
 * - Title: top center (28pt bold)
 * - Box logo: top right (circle)
 * - Countdown: center screen (260pt bold)
 * - Bottom row (all vertically centered):
 *   - Left: ATHLEX logo (160px)
 *   - Center: Timer DS-Digital (180pt)
 *   - Right: Timestamp
 */
class OverlayRenderer(private val context: Context) {

  @Volatile private var cachedAthlexLogo: Bitmap? = null
  @Volatile private var cachedBoxLogo: Bitmap? = null
  @Volatile private var cachedBoxLogoUrl: String = ""
  @Volatile private var boxLogoLoading = false
  @Volatile private var cachedCompLogo: Bitmap? = null
  @Volatile private var cachedCompLogoUrl: String = ""
  @Volatile private var compLogoLoading = false
  private var dsDigitalTypeface: Typeface? = null

  // Pre-allocated objects to avoid GC pressure on every frame
  private val textPaint = TextPaint(Paint.ANTI_ALIAS_FLAG)
  private val bitmapPaint = Paint(Paint.FILTER_BITMAP_FLAG)
  private val reusableClipPath = Path()

  init {
    loadAthlexLogo()
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
    val isLandscape = width > height

    loadBoxLogoIfNeeded(state.boxLogoUrl)
    loadCompLogoIfNeeded(state.competitionLogoUrl)

    // Use min dimension as reference so elements stay the same physical size
    val refDim = minOf(width, height)
    val scale = refDim / 1080f
    val margin = 24f * scale
    val safeTop = if (isLandscape) 24f * scale else 60f * (height / 1920f)

    // ─── 0. Competition logo (top left — rounded square, no white bg) ───
    val logoSize = if (isLandscape) 120f * scale else 200f * scale
    cachedCompLogo?.let { compImg ->
      val logoRect = RectF(margin, safeTop, margin + logoSize, safeTop + logoSize)
      val cornerRadius = if (isLandscape) 20f * scale else 32f * scale

      canvas.save()
      reusableClipPath.reset()
      reusableClipPath.addRoundRect(logoRect, cornerRadius, cornerRadius, Path.Direction.CW)
      canvas.clipPath(reusableClipPath)
      canvas.drawBitmap(compImg, null, logoRect, bitmapPaint)
      canvas.restore()
    }

    // ─── 1. Title (top center, adjusted for logos) ───
    if (state.title.isNotEmpty()) {
      val titleLeft = if (cachedCompLogo != null) margin + logoSize + 12f * scale else margin
      val titleRight = if (cachedBoxLogo != null) width - logoSize - margin - 12f * scale else width - margin
      drawText(
        canvas, state.title,
        RectF(titleLeft, safeTop, titleRight, safeTop + 40f * scale),
        fontSize = 28f * scale, bold = true, color = Color.WHITE,
        alignment = Layout.Alignment.ALIGN_CENTER, shadow = true
      )
    }

    // ─── 2. Box logo (top right — circle, no background) ───
    cachedBoxLogo?.let { boxImg ->
      val logoRect = RectF(
        width - logoSize - margin, safeTop,
        width - margin, safeTop + logoSize
      )
      val cornerRadius = logoSize / 2f  // circle

      canvas.save()
      reusableClipPath.reset()
      reusableClipPath.addRoundRect(logoRect, cornerRadius, cornerRadius, Path.Direction.CW)
      canvas.clipPath(reusableClipPath)
      canvas.drawBitmap(boxImg, null, logoRect, bitmapPaint)
      canvas.restore()
    }

    // ─── 3. Countdown (center, extra large, bold) ───
    if (state.countdownValue > 0) {
      val cdStr = "${state.countdownValue}"
      val cdFontSize = if (isLandscape) 180f * scale else 260f * scale
      val cdH = if (isLandscape) 220f * scale else 320f * scale
      val cdY = (height - cdH) / 2f
      drawText(
        canvas, cdStr,
        RectF(0f, cdY, width, cdY + cdH),
        fontSize = cdFontSize, bold = true, color = Color.WHITE,
        alignment = Layout.Alignment.ALIGN_CENTER
      )
    }

    // ════════════════════════════════════════════
    //  BOTTOM ROW — AthleX logo (left) | Timer (center) | Timestamp (right)
    //  All elements vertically centered on the same row
    // ════════════════════════════════════════════
    val safeBottom = if (isLandscape) 40f * scale else 140f * scale

    // Row height driven by the timer (largest element)
    val timerFontSize = if (isLandscape) 140f * scale else 180f * scale
    val timerH = if (isLandscape) 170f * scale else 220f * scale
    val rowCenterY = height - safeBottom - timerH / 2f

    // ─── 4. AthleX logo (bottom-left, vertically centered) ───
    val atlLogoH = if (isLandscape) 120f * scale else 160f * scale
    cachedAthlexLogo?.let { atlImg ->
      val atlLogoW = atlLogoH * (atlImg.width.toFloat() / atlImg.height.toFloat())
      val logoY = rowCenterY - atlLogoH / 2f
      val logoRect = RectF(margin, logoY, margin + atlLogoW, logoY + atlLogoH)
      canvas.drawBitmap(atlImg, null, logoRect, bitmapPaint)
    }

    // ─── 5. Timer display (center, x2 size) ───
    if (state.showTimer && state.countdownValue <= 0) {
      val timerY = rowCenterY - timerH / 2f
      drawText(
        canvas, state.timerDisplay,
        RectF(0f, timerY, width, timerY + timerH),
        fontSize = timerFontSize, bold = false, color = Color.WHITE,
        alignment = Layout.Alignment.ALIGN_CENTER,
        shadow = true, dsDigital = true
      )
    }

    // ─── 6. Timestamp (right, vertically centered on same row) ───
    if (state.timestamp.isNotEmpty() && state.showTimer && state.countdownValue <= 0) {
      val tsW = 260f * scale
      val tsH = 34f * scale
      val tsY = rowCenterY - tsH / 2f
      drawText(
        canvas, state.timestamp,
        RectF(width - tsW - margin, tsY, width - margin, tsY + tsH),
        fontSize = 24f * scale, bold = false,
        color = Color.argb(204, 255, 255, 255),
        alignment = Layout.Alignment.ALIGN_OPPOSITE, shadow = true
      )
    }
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
    textPaint.reset()
    textPaint.isAntiAlias = true
    textPaint.color = color
    textPaint.textSize = fontSize
    textPaint.typeface = when {
      dsDigital -> dsDigitalTypeface ?: Typeface.create(Typeface.MONOSPACE, Typeface.NORMAL)
      monospace -> Typeface.create(Typeface.MONOSPACE, if (bold) Typeface.BOLD else Typeface.NORMAL)
      bold -> Typeface.DEFAULT_BOLD
      else -> Typeface.DEFAULT
    }
    if (shadow) {
      textPaint.setShadowLayer(4f, 1f, 1f, Color.argb(179, 0, 0, 0))
    }

    // Use StaticLayout for proper alignment
    val layoutWidth = (rect.right - rect.left).toInt().coerceAtLeast(1)

    @Suppress("DEPRECATION")
    val layout = StaticLayout(
      text, textPaint, layoutWidth,
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
