package expo.modules.realtimerecorder

import android.content.Context
import android.graphics.*
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.MediaMuxer
import android.media.MediaRecorder
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import android.util.Size
import android.view.Surface
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import java.io.File
import java.lang.ref.WeakReference
import java.nio.ByteBuffer
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Singleton engine that owns the CameraX session and handles recording
 * with overlay burning on each analyzed frame.
 *
 * Architecture:
 * - CameraX provides Preview (for live view) + ImageAnalysis (for frame capture)
 * - During recording: each frame from ImageAnalysis is converted to Bitmap,
 *   overlays are rendered, then encoded via MediaCodec + MediaMuxer into MP4
 * - Audio is captured via AudioRecord → MediaCodec AAC → MediaMuxer
 */
class RecorderEngine private constructor() {

  companion object {
    private const val TAG = "RealtimeRecorder"
    val shared = RecorderEngine()
  }

  // State
  var overlayState = OverlayState()
  val stateLock = Object()

  var currentFacing = CameraSelector.LENS_FACING_BACK
  private var renderer: OverlayRenderer? = null

  // CameraX
  private var cameraProvider: ProcessCameraProvider? = null
  private var preview: Preview? = null
  private var imageAnalysis: ImageAnalysis? = null
  private var camera: Camera? = null

  // Recording
  private val isRecording = AtomicBoolean(false)
  private var videoEncoder: MediaCodec? = null
  private var audioEncoder: MediaCodec? = null
  private var muxer: MediaMuxer? = null
  private var videoTrackIndex = -1
  private var audioTrackIndex = -1
  private var muxerStarted = false
  private var outputPath: String? = null
  private var inputSurface: Surface? = null

  // Audio recording
  private var audioRecord: android.media.AudioRecord? = null
  private var audioThread: Thread? = null
  private val audioRecording = AtomicBoolean(false)
  private var hasAudio = true

  // Threading
  private val analysisExecutor = Executors.newSingleThreadExecutor()
  private var encoderThread: HandlerThread? = null
  private var encoderHandler: Handler? = null

  // View reference
  var hostView: WeakReference<RealtimeRecorderHostView>? = null

  private var readyCallback: (() -> Unit)? = null

  fun setReadyCallback(cb: () -> Unit) {
    readyCallback = cb
  }

  // MARK: - Setup

  fun setupSession(context: Context) {
    if (renderer == null) {
      renderer = OverlayRenderer(context)
    }

    val cameraProviderFuture = ProcessCameraProvider.getInstance(context)
    cameraProviderFuture.addListener({
      try {
        val provider = cameraProviderFuture.get()
        cameraProvider = provider
        bindCameraUseCases(context, provider)
      } catch (e: Exception) {
        Log.e(TAG, "Camera provider failed", e)
      }
    }, ContextCompat.getMainExecutor(context))
  }

  private fun bindCameraUseCases(context: Context, provider: ProcessCameraProvider) {
    val lifecycleOwner = getLifecycleOwner(context)

    provider.unbindAll()

    val cameraSelector = CameraSelector.Builder()
      .requireLensFacing(currentFacing)
      .build()

    // Preview
    preview = Preview.Builder()
      .setTargetResolution(Size(1080, 1920))
      .build()

    // Attach preview to host view's PreviewView
    hostView?.get()?.let { view ->
      preview?.setSurfaceProvider(view.previewView.surfaceProvider)
    }

    // Image analysis for frame capture during recording
    imageAnalysis = ImageAnalysis.Builder()
      .setTargetResolution(Size(1080, 1920))
      .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
      .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888)
      .build()

    imageAnalysis?.setAnalyzer(analysisExecutor) { imageProxy ->
      if (isRecording.get()) {
        processFrame(imageProxy)
      }
      imageProxy.close()
    }

    try {
      camera = provider.bindToLifecycle(
        lifecycleOwner,
        cameraSelector,
        preview,
        imageAnalysis
      )
      Log.i(TAG, "Camera bound, facing: ${if (currentFacing == CameraSelector.LENS_FACING_BACK) "back" else "front"}")

      readyCallback?.invoke()
    } catch (e: Exception) {
      Log.e(TAG, "Use case binding failed", e)
    }
  }

  private fun getLifecycleOwner(context: Context): LifecycleOwner {
    return if (context is LifecycleOwner) context
    else ProcessLifecycleOwner.get()
  }

  // MARK: - Recording

  fun startRecording(path: String): Boolean {
    if (isRecording.get()) {
      Log.w(TAG, "Already recording")
      return false
    }

    outputPath = path

    // Delete existing file
    try { File(path).delete() } catch (_: Exception) {}

    try {
      setupVideoEncoder()
      setupMuxer(path)
      try {
        setupAudioEncoder()
        hasAudio = true
      } catch (e: Exception) {
        Log.w(TAG, "Audio encoder setup failed, recording without audio", e)
        hasAudio = false
      }
      isRecording.set(true)
      if (hasAudio) startAudioCapture()
      Log.i(TAG, "Recording started → $path (audio=$hasAudio)")
      return true
    } catch (e: Exception) {
      Log.e(TAG, "Failed to start recording", e)
      cleanupRecording()
      return false
    }
  }

  private fun setupVideoEncoder() {
    val format = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, 1080, 1920).apply {
      setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
      setInteger(MediaFormat.KEY_BIT_RATE, 6_000_000)
      setInteger(MediaFormat.KEY_FRAME_RATE, 30)
      setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1)
    }

    videoEncoder = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC).apply {
      configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
      inputSurface = createInputSurface()
      start()
    }

    // Start encoder drain thread
    encoderThread = HandlerThread("VideoEncoderThread").apply { start() }
    encoderHandler = Handler(encoderThread!!.looper)
  }

  private fun setupAudioEncoder() {
    val format = MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_AAC, 44100, 1).apply {
      setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
      setInteger(MediaFormat.KEY_BIT_RATE, 128000)
    }

    audioEncoder = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_AAC).apply {
      configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
      start()
    }
  }

  private fun setupMuxer(path: String) {
    muxer = MediaMuxer(path, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
    videoTrackIndex = -1
    audioTrackIndex = -1
    muxerStarted = false
  }

  private fun startAudioCapture() {
    val sampleRate = 44100
    val channelConfig = android.media.AudioFormat.CHANNEL_IN_MONO
    val encoding = android.media.AudioFormat.ENCODING_PCM_16BIT
    val bufferSize = android.media.AudioRecord.getMinBufferSize(sampleRate, channelConfig, encoding) * 2

    try {
      audioRecord = android.media.AudioRecord(
        MediaRecorder.AudioSource.MIC,
        sampleRate, channelConfig, encoding, bufferSize
      )

      if (audioRecord?.state != android.media.AudioRecord.STATE_INITIALIZED) {
        Log.w(TAG, "AudioRecord not initialized")
        audioRecord?.release()
        audioRecord = null
        return
      }

      audioRecording.set(true)
      audioRecord?.startRecording()

      audioThread = Thread {
        val buffer = ByteArray(bufferSize)
        val encoder = audioEncoder ?: return@Thread

        while (audioRecording.get()) {
          val read = audioRecord?.read(buffer, 0, buffer.size) ?: -1
          if (read > 0) {
            val inputIndex = encoder.dequeueInputBuffer(10000)
            if (inputIndex >= 0) {
              val inputBuffer = encoder.getInputBuffer(inputIndex)
              inputBuffer?.clear()
              inputBuffer?.put(buffer, 0, read)
              encoder.queueInputBuffer(inputIndex, 0, read, System.nanoTime() / 1000, 0)
            }
            drainAudioEncoder(false)
          }
        }

        // Signal end of stream
        val inputIndex = encoder.dequeueInputBuffer(10000)
        if (inputIndex >= 0) {
          encoder.queueInputBuffer(inputIndex, 0, 0, System.nanoTime() / 1000, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
        }
        drainAudioEncoder(true)
      }.apply {
        name = "AudioCaptureThread"
        start()
      }
    } catch (e: SecurityException) {
      Log.e(TAG, "Audio permission denied", e)
    }
  }

  // MARK: - Frame processing

  private fun processFrame(imageProxy: ImageProxy) {
    if (!isRecording.get()) return

    val surface = inputSurface ?: return

    try {
      // Convert ImageProxy to Bitmap
      val bitmap = imageProxyToBitmap(imageProxy)
      if (bitmap != null) {
        // Render overlays onto the bitmap
        val state: OverlayState
        synchronized(stateLock) {
          state = overlayState.copy()
        }
        renderer?.render(bitmap, state)

        // Draw bitmap to encoder input surface
        val canvas = surface.lockCanvas(null)
        canvas.drawBitmap(bitmap, 0f, 0f, null)
        surface.unlockCanvasAndPost(canvas)
        bitmap.recycle()

        // Drain video encoder
        drainVideoEncoder(false)
      }
    } catch (e: Exception) {
      Log.e(TAG, "Frame processing error", e)
    }
  }

  private fun imageProxyToBitmap(imageProxy: ImageProxy): Bitmap? {
    try {
      val planes = imageProxy.planes
      if (planes.isEmpty()) return null

      val buffer = planes[0].buffer
      val pixelStride = planes[0].pixelStride
      val rowStride = planes[0].rowStride
      val rowPadding = rowStride - pixelStride * imageProxy.width

      val bitmap = Bitmap.createBitmap(
        imageProxy.width + rowPadding / pixelStride,
        imageProxy.height,
        Bitmap.Config.ARGB_8888
      )
      buffer.rewind()
      bitmap.copyPixelsFromBuffer(buffer)

      // Crop to actual size if there was padding
      return if (rowPadding > 0) {
        val cropped = Bitmap.createBitmap(bitmap, 0, 0, imageProxy.width, imageProxy.height)
        bitmap.recycle()
        // Scale to target if needed
        if (cropped.width != 1080 || cropped.height != 1920) {
          val scaled = Bitmap.createScaledBitmap(cropped, 1080, 1920, true)
          cropped.recycle()
          // Handle rotation based on camera facing
          applyRotation(scaled, imageProxy.imageInfo.rotationDegrees)
        } else {
          applyRotation(cropped, imageProxy.imageInfo.rotationDegrees)
        }
      } else {
        if (bitmap.width != 1080 || bitmap.height != 1920) {
          val scaled = Bitmap.createScaledBitmap(bitmap, 1080, 1920, true)
          bitmap.recycle()
          applyRotation(scaled, imageProxy.imageInfo.rotationDegrees)
        } else {
          applyRotation(bitmap, imageProxy.imageInfo.rotationDegrees)
        }
      }
    } catch (e: Exception) {
      Log.e(TAG, "imageProxyToBitmap error", e)
      return null
    }
  }

  private fun applyRotation(bitmap: Bitmap, rotationDegrees: Int): Bitmap {
    val needsMirror = currentFacing == CameraSelector.LENS_FACING_FRONT
    if (rotationDegrees == 0 && !needsMirror) return bitmap
    val matrix = Matrix().apply {
      if (rotationDegrees != 0) postRotate(rotationDegrees.toFloat())
      if (needsMirror) {
        postScale(-1f, 1f, bitmap.width / 2f, bitmap.height / 2f)
      }
    }
    val rotated = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
    if (rotated != bitmap) bitmap.recycle()
    // Ensure output is 1080x1920
    return if (rotated.width != 1080 || rotated.height != 1920) {
      val scaled = Bitmap.createScaledBitmap(rotated, 1080, 1920, true)
      if (scaled != rotated) rotated.recycle()
      scaled
    } else {
      rotated
    }
  }

  // MARK: - Encoder draining

  private val muxerLock = Object()

  private fun drainVideoEncoder(endOfStream: Boolean) {
    val encoder = videoEncoder ?: return
    if (endOfStream) {
      encoder.signalEndOfInputStream()
    }

    val bufferInfo = MediaCodec.BufferInfo()
    while (true) {
      val outputIndex = encoder.dequeueOutputBuffer(bufferInfo, 10000)
      when {
        outputIndex == MediaCodec.INFO_TRY_AGAIN_LATER -> break
        outputIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
          synchronized(muxerLock) {
            videoTrackIndex = muxer?.addTrack(encoder.outputFormat) ?: -1
            maybeStartMuxer()
          }
        }
        outputIndex >= 0 -> {
          val buffer = encoder.getOutputBuffer(outputIndex) ?: continue
          if (bufferInfo.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0) {
            bufferInfo.size = 0
          }
          if (bufferInfo.size > 0) {
            synchronized(muxerLock) {
              if (muxerStarted && videoTrackIndex >= 0) {
                buffer.position(bufferInfo.offset)
                buffer.limit(bufferInfo.offset + bufferInfo.size)
                muxer?.writeSampleData(videoTrackIndex, buffer, bufferInfo)
              }
            }
          }
          encoder.releaseOutputBuffer(outputIndex, false)
          if (bufferInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) break
        }
      }
    }
  }

  private fun drainAudioEncoder(endOfStream: Boolean) {
    val encoder = audioEncoder ?: return
    val bufferInfo = MediaCodec.BufferInfo()

    while (true) {
      val outputIndex = encoder.dequeueOutputBuffer(bufferInfo, 10000)
      when {
        outputIndex == MediaCodec.INFO_TRY_AGAIN_LATER -> break
        outputIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
          synchronized(muxerLock) {
            audioTrackIndex = muxer?.addTrack(encoder.outputFormat) ?: -1
            maybeStartMuxer()
          }
        }
        outputIndex >= 0 -> {
          val buffer = encoder.getOutputBuffer(outputIndex) ?: continue
          if (bufferInfo.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0) {
            bufferInfo.size = 0
          }
          if (bufferInfo.size > 0) {
            synchronized(muxerLock) {
              if (muxerStarted && audioTrackIndex >= 0) {
                buffer.position(bufferInfo.offset)
                buffer.limit(bufferInfo.offset + bufferInfo.size)
                muxer?.writeSampleData(audioTrackIndex, buffer, bufferInfo)
              }
            }
          }
          encoder.releaseOutputBuffer(outputIndex, false)
          if (bufferInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) break
        }
      }
    }
  }

  private fun maybeStartMuxer() {
    if (muxerStarted) return
    val audioReady = !hasAudio || audioTrackIndex >= 0
    if (videoTrackIndex >= 0 && audioReady) {
      muxer?.start()
      muxerStarted = true
      Log.i(TAG, "Muxer started (video=$videoTrackIndex, audio=$audioTrackIndex, hasAudio=$hasAudio)")
    }
  }

  // MARK: - Stop recording

  fun stopRecording(callback: (Result<String>) -> Unit) {
    if (!isRecording.getAndSet(false)) {
      callback(Result.failure(Exception("Not recording")))
      return
    }

    Thread {
      try {
        // Stop audio
        audioRecording.set(false)
        audioThread?.join(3000)
        audioRecord?.stop()
        audioRecord?.release()
        audioRecord = null

        // Drain remaining video
        drainVideoEncoder(true)

        // Stop encoders
        try { videoEncoder?.stop() } catch (_: Exception) {}
        try { audioEncoder?.stop() } catch (_: Exception) {}

        // Stop muxer
        synchronized(muxerLock) {
          if (muxerStarted) {
            try { muxer?.stop() } catch (_: Exception) {}
          }
          try { muxer?.release() } catch (_: Exception) {}
        }

        // Release
        inputSurface?.release()
        inputSurface = null
        try { videoEncoder?.release() } catch (_: Exception) {}
        try { audioEncoder?.release() } catch (_: Exception) {}
        videoEncoder = null
        audioEncoder = null
        muxer = null
        muxerStarted = false

        encoderThread?.quitSafely()
        encoderThread = null
        encoderHandler = null

        val path = outputPath ?: ""
        Log.i(TAG, "Recording stopped: $path")
        callback(Result.success("file://$path"))
      } catch (e: Exception) {
        Log.e(TAG, "Stop recording error", e)
        callback(Result.failure(e))
      }
    }.start()
  }

  private fun cleanupRecording() {
    isRecording.set(false)
    audioRecording.set(false)
    try { audioRecord?.stop() } catch (_: Exception) {}
    try { audioRecord?.release() } catch (_: Exception) {}
    audioRecord = null
    try { inputSurface?.release() } catch (_: Exception) {}
    inputSurface = null
    try { videoEncoder?.stop() } catch (_: Exception) {}
    try { videoEncoder?.release() } catch (_: Exception) {}
    videoEncoder = null
    try { audioEncoder?.stop() } catch (_: Exception) {}
    try { audioEncoder?.release() } catch (_: Exception) {}
    audioEncoder = null
    synchronized(muxerLock) {
      try { muxer?.release() } catch (_: Exception) {}
      muxer = null
      muxerStarted = false
    }
    encoderThread?.quitSafely()
    encoderThread = null
    encoderHandler = null
  }
}
