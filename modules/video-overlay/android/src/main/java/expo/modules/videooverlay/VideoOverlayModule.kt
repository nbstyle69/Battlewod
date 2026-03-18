package expo.modules.videooverlay

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ImageFormat
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.Typeface
import android.graphics.YuvImage
import android.media.Image
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMuxer
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import java.io.ByteArrayOutputStream
import java.io.File
import java.nio.ByteBuffer
import kotlin.concurrent.thread
import kotlin.math.ceil
import kotlin.math.max

class VideoOverlayModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("VideoOverlay")

    AsyncFunction("burnOverlays") { options: Map<String, Any?>, promise: Promise ->
      val inputPath = options["inputPath"] as? String ?: run {
        promise.reject("ERR", "Missing inputPath", null); return@AsyncFunction
      }
      val outputPath = options["outputPath"] as? String ?: run {
        promise.reject("ERR", "Missing outputPath", null); return@AsyncFunction
      }
      val timerType = options["timerType"] as? String ?: ""
      val timerStartMs = (options["timerStartOffsetMs"] as? Number)?.toDouble() ?: 0.0
      val timerStopMs = (options["timerStopOffsetMs"] as? Number)?.toDouble() ?: 0.0
      val countdownDuration = (options["countdownDuration"] as? Number)?.toDouble() ?: 0.0
      val videoTitle = options["videoTitle"] as? String
      val timestamp = options["timestamp"] as? String

      thread {
        try {
          processVideo(inputPath, outputPath, timerType, timerStartMs, timerStopMs,
            countdownDuration, videoTitle, timestamp)
          promise.resolve(outputPath)
        } catch (e: Exception) {
          promise.reject("ERR", e.message ?: "Processing failed", e)
        }
      }
    }
  }

  private fun processVideo(
    inputPath: String, outputPath: String, timerType: String,
    timerStartMs: Double, timerStopMs: Double, countdownDuration: Double,
    videoTitle: String?, timestamp: String?
  ) {
    File(outputPath).delete()
    val extractor = MediaExtractor()
    extractor.setDataSource(inputPath)

    var videoTrackIdx = -1; var audioTrackIdx = -1
    var videoFormat: MediaFormat? = null; var audioFormat: MediaFormat? = null
    for (i in 0 until extractor.trackCount) {
      val fmt = extractor.getTrackFormat(i)
      val mime = fmt.getString(MediaFormat.KEY_MIME) ?: continue
      if (mime.startsWith("video/") && videoTrackIdx == -1) { videoTrackIdx = i; videoFormat = fmt }
      else if (mime.startsWith("audio/") && audioTrackIdx == -1) { audioTrackIdx = i; audioFormat = fmt }
    }
    if (videoTrackIdx == -1 || videoFormat == null) throw Exception("No video track")

    val width = videoFormat.getInteger(MediaFormat.KEY_WIDTH)
    val height = videoFormat.getInteger(MediaFormat.KEY_HEIGHT)
    val durationUs = videoFormat.getLong(MediaFormat.KEY_DURATION)
    val frameRate = if (videoFormat.containsKey(MediaFormat.KEY_FRAME_RATE))
      videoFormat.getInteger(MediaFormat.KEY_FRAME_RATE) else 30
    val bitRate = if (videoFormat.containsKey(MediaFormat.KEY_BIT_RATE))
      videoFormat.getInteger(MediaFormat.KEY_BIT_RATE) else (width * height * 4)

    val timerStartSec = timerStartMs / 1000.0
    val timerStopSec = if (timerStopMs > 0) timerStopMs / 1000.0 else durationUs / 1_000_000.0
    val typeLabel = timerType.uppercase().replace("-", " ")

    // Decoder in BUFFER mode (no surface) to get Image objects
    val inputMime = videoFormat.getString(MediaFormat.KEY_MIME)!!
    val decoder = MediaCodec.createDecoderByType(inputMime)
    decoder.configure(videoFormat, null, null, 0)
    decoder.start()

    // Encoder with input Surface
    val encFormat = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, width, height).apply {
      setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
      setInteger(MediaFormat.KEY_BIT_RATE, bitRate)
      setInteger(MediaFormat.KEY_FRAME_RATE, frameRate)
      setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1)
    }
    val encoder = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC)
    encoder.configure(encFormat, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
    val encSurface = encoder.createInputSurface()
    encoder.start()

    val muxer = MediaMuxer(outputPath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
    var muxVideoTrack = -1; var muxAudioTrack = -1; var muxStarted = false

    // Pre-create paint objects
    val scale = (height / 1920f).coerceAtLeast(0.5f)
    val paints = createPaints(scale)

    // Frame timestamps for encoder output override
    val frameTimestamps = mutableListOf<Long>()

    extractor.selectTrack(videoTrackIdx)
    val decInfo = MediaCodec.BufferInfo()
    val encInfo = MediaCodec.BufferInfo()
    var inputDone = false; var decoderDone = false; var outputDone = false

    while (!outputDone) {
      // 1. Feed decoder input
      if (!inputDone) {
        val inIdx = decoder.dequeueInputBuffer(5_000)
        if (inIdx >= 0) {
          val buf = decoder.getInputBuffer(inIdx)!!
          val sz = extractor.readSampleData(buf, 0)
          if (sz < 0) {
            decoder.queueInputBuffer(inIdx, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
            inputDone = true
          } else {
            decoder.queueInputBuffer(inIdx, 0, sz, extractor.sampleTime, 0)
            extractor.advance()
          }
        }
      }

      // 2. Get decoded frame → draw overlays → submit to encoder surface
      if (!decoderDone) {
        val outIdx = decoder.dequeueOutputBuffer(decInfo, 5_000)
        if (outIdx >= 0) {
          val eos = (decInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0
          if (!eos && decInfo.size > 0) {
            val timeSec = decInfo.presentationTimeUs / 1_000_000.0
            frameTimestamps.add(decInfo.presentationTimeUs)

            // Decode YUV Image → Bitmap
            val image = decoder.getOutputImage(outIdx)
            if (image != null) {
              val bitmap = yuvImageToBitmap(image, width, height)
              // Draw overlays on bitmap
              val canvas = Canvas(bitmap)
              drawOverlays(canvas, width, height, timeSec, typeLabel,
                timerStartSec, timerStopSec, countdownDuration,
                videoTitle, timestamp, paints, scale)

              // Render composited bitmap to encoder surface
              val encCanvas = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
                encSurface.lockHardwareCanvas() else encSurface.lockCanvas(null)
              encCanvas.drawBitmap(bitmap, 0f, 0f, null)
              encSurface.unlockCanvasAndPost(encCanvas)
              bitmap.recycle()
            }
          }
          decoder.releaseOutputBuffer(outIdx, false)
          if (eos) {
            encoder.signalEndOfInputStream()
            decoderDone = true
          }
        }
      }

      // 3. Drain encoder → muxer
      drainEncoder(encoder, encInfo, muxer, frameTimestamps,
        { track -> muxVideoTrack = track
          if (audioTrackIdx >= 0 && audioFormat != null) muxAudioTrack = muxer.addTrack(audioFormat)
          muxer.start(); muxStarted = true },
        { muxVideoTrack }, { muxStarted }, { outputDone = true })
    }

    // Copy audio track
    if (audioTrackIdx >= 0 && muxAudioTrack >= 0 && muxStarted) {
      extractor.unselectTrack(videoTrackIdx)
      extractor.selectTrack(audioTrackIdx)
      extractor.seekTo(0, MediaExtractor.SEEK_TO_CLOSEST_SYNC)
      val audioBuf = ByteBuffer.allocate(1024 * 1024)
      val ai = MediaCodec.BufferInfo()
      while (true) {
        val sz = extractor.readSampleData(audioBuf, 0)
        if (sz < 0) break
        ai.set(0, sz, extractor.sampleTime,
          if (extractor.sampleFlags and MediaExtractor.SAMPLE_FLAG_SYNC != 0)
            MediaCodec.BUFFER_FLAG_KEY_FRAME else 0)
        muxer.writeSampleData(muxAudioTrack, audioBuf, ai)
        extractor.advance()
      }
    }

    decoder.stop(); decoder.release()
    encoder.stop(); encoder.release()
    if (muxStarted) muxer.stop()
    muxer.release(); extractor.release(); encSurface.release()
  }

  private fun drainEncoder(
    encoder: MediaCodec, info: MediaCodec.BufferInfo, muxer: MediaMuxer,
    timestamps: MutableList<Long>,
    onFormatChanged: (Int) -> Unit, getTrack: () -> Int,
    isMuxStarted: () -> Boolean, onDone: () -> Unit
  ) {
    var frameIdx = 0
    while (true) {
      val idx = encoder.dequeueOutputBuffer(info, 0)
      if (idx == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
        onFormatChanged(muxer.addTrack(encoder.outputFormat))
      } else if (idx >= 0) {
        val buf = encoder.getOutputBuffer(idx)!!
        if (info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0) info.size = 0
        if (info.size > 0 && isMuxStarted()) {
          // Override with original frame timestamp for A/V sync
          if (frameIdx < timestamps.size) info.presentationTimeUs = timestamps[frameIdx]
          frameIdx++
          buf.position(info.offset); buf.limit(info.offset + info.size)
          muxer.writeSampleData(getTrack(), buf, info)
        }
        encoder.releaseOutputBuffer(idx, false)
        if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) { onDone(); break }
      } else break
    }
  }

  private fun yuvImageToBitmap(image: Image, width: Int, height: Int): Bitmap {
    val yPlane = image.planes[0]
    val uPlane = image.planes[1]
    val vPlane = image.planes[2]
    val yBuf = yPlane.buffer; val uBuf = uPlane.buffer; val vBuf = vPlane.buffer
    val yRowStride = yPlane.rowStride; val uvRowStride = uPlane.rowStride
    val uvPixelStride = uPlane.pixelStride

    val nv21 = ByteArray(width * height * 3 / 2)
    // Copy Y plane
    if (yRowStride == width) {
      yBuf.position(0); yBuf.get(nv21, 0, width * height)
    } else {
      for (row in 0 until height) {
        yBuf.position(row * yRowStride); yBuf.get(nv21, row * width, width)
      }
    }
    // Copy VU planes (NV21: V first, then U)
    val uvOffset = width * height
    for (row in 0 until height / 2) {
      for (col in 0 until width / 2) {
        val uvPos = row * uvRowStride + col * uvPixelStride
        vBuf.position(uvPos); nv21[uvOffset + row * width + col * 2] = vBuf.get()
        uBuf.position(uvPos); nv21[uvOffset + row * width + col * 2 + 1] = uBuf.get()
      }
    }
    // NV21 → JPEG → Bitmap
    val yuvImg = YuvImage(nv21, ImageFormat.NV21, width, height, null)
    val baos = ByteArrayOutputStream()
    yuvImg.compressToJpeg(Rect(0, 0, width, height), 95, baos)
    val bmp = BitmapFactory.decodeByteArray(baos.toByteArray(), 0, baos.size())
    return bmp.copy(Bitmap.Config.ARGB_8888, true)
  }

  data class OverlayPaints(
    val bar: Paint, val type: Paint, val rec: Paint, val timer: Paint,
    val countdown: Paint, val title: Paint, val ts: Paint, val watermark: Paint
  )

  private fun createPaints(scale: Float): OverlayPaints {
    fun p(size: Float, color: Int, bold: Boolean = false, align: Paint.Align = Paint.Align.LEFT,
           shadow: Boolean = false) = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      this.color = color; textSize = size * scale
      typeface = if (bold) Typeface.DEFAULT_BOLD else Typeface.DEFAULT
      textAlign = align
      if (shadow) setShadowLayer(4f, 1f, 1f, Color.argb(180, 0, 0, 0))
    }
    return OverlayPaints(
      bar = Paint().apply { color = Color.argb(128, 0, 0, 0); style = Paint.Style.FILL },
      type = p(28f, Color.WHITE, bold = true),
      rec = p(22f, Color.RED, bold = true),
      timer = p(72f, Color.WHITE, shadow = true),
      countdown = p(120f, Color.WHITE, align = Paint.Align.CENTER),
      title = p(22f, Color.WHITE, bold = true, shadow = true),
      ts = p(16f, Color.argb(200, 255, 255, 255), shadow = true),
      watermark = p(18f, Color.argb(150, 255, 255, 255), bold = true, align = Paint.Align.RIGHT)
    )
  }

  private fun drawOverlays(
    canvas: Canvas, w: Int, h: Int, timeSec: Double, typeLabel: String,
    timerStartSec: Double, timerStopSec: Double, countdownDuration: Double,
    videoTitle: String?, timestamp: String?, p: OverlayPaints, scale: Float
  ) {
    val pad = 20f * scale
    canvas.drawRect(0f, 0f, w.toFloat(), 80f * scale, p.bar)
    canvas.drawText(typeLabel, pad, 50f * scale, p.type)
    val recW = p.rec.measureText("● REC")
    canvas.drawText("● REC", w - recW - pad, 50f * scale, p.rec)

    val cdStart = max(0.0, timerStartSec - countdownDuration)
    if (countdownDuration > 0 && timeSec >= cdStart && timeSec < timerStartSec) {
      canvas.drawText("${ceil(timerStartSec - timeSec).toInt()}", w / 2f, h / 2f + 40f * scale, p.countdown)
    }
    if (timeSec >= timerStartSec) {
      val elapsed = if (timeSec >= timerStopSec) timerStopSec - timerStartSec else timeSec - timerStartSec
      val str = String.format("%02d:%02d", (elapsed / 60).toInt(), (elapsed % 60).toInt())
      canvas.drawText(str, (w - p.timer.measureText(str)) / 2f, h / 2f + 24f * scale, p.timer)
    }
    if (!videoTitle.isNullOrEmpty()) canvas.drawText(videoTitle, pad, h - 70f * scale, p.title)
    if (!timestamp.isNullOrEmpty()) canvas.drawText(timestamp, pad, h - 40f * scale, p.ts)
    canvas.drawText("ATHLEX", w - pad, h - 40f * scale, p.watermark)
  }
}
