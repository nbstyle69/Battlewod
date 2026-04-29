package expo.modules.realtimerecorder

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.SurfaceTexture
import android.opengl.EGL14
import android.opengl.EGLSurface
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import android.view.Surface
import android.view.TextureView
import android.view.WindowManager
import java.io.File
import java.lang.ref.WeakReference
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Orchestrates the full recording pipeline:
 *
 *   Camera2 → SurfaceTexture (OES) → GL thread 30 FPS
 *       → dual render: preview TextureView + encoder EGLSurface
 *       → H.264 HW encoder → MediaMuxer → MP4
 *       + AudioRecord → AAC → same MediaMuxer
 *
 * Coordinates [EglCore], [CameraTextureRenderer], [OverlayRenderer],
 * [CameraController], [VideoEncoder], [AudioEncoder], and [VideoMuxer].
 */
class VideoRecorderEngine private constructor() {

  companion object {
    private const val TAG = "RealtimeRecorder"
    private const val BASE_SHORT = 1080
    private const val BASE_LONG = 1920
    private const val FPS = 30
    private const val FRAME_INTERVAL_NS = 1_000_000_000L / FPS

    val shared = VideoRecorderEngine()
  }

  // Landscape mode — set before startRecording, swaps encoder dimensions
  var isLandscape = false

  private val videoWidth: Int get() = if (isLandscape) BASE_LONG else BASE_SHORT
  private val videoHeight: Int get() = if (isLandscape) BASE_SHORT else BASE_LONG

  // Overlay state (updated from JS thread)
  var overlayState = OverlayState()
  val stateLock = Object()

  @Volatile var useFrontCamera = false
  private var overlayRenderer: OverlayRenderer? = null

  // Sub-components
  private var eglCore: EglCore? = null
  private var renderer: CameraTextureRenderer? = null
  private var cameraController: CameraController? = null
  private var videoEncoder: VideoEncoder? = null
  private var audioEncoder: AudioEncoder? = null
  private var muxer: VideoMuxer? = null

  // GL pipeline
  private var glThread: HandlerThread? = null
  private var glHandler: Handler? = null
  private var cameraSurfaceTexture: SurfaceTexture? = null
  private var cameraSurface: Surface? = null

  // EGL surfaces
  private var eglPreviewSurface: EGLSurface = EGL14.EGL_NO_SURFACE
  private var eglEncoderSurface: EGLSurface = EGL14.EGL_NO_SURFACE

  // Preview
  private var previewSurface: Surface? = null

  // Recording state
  private val isRecording = AtomicBoolean(false)

  fun isRecordingActive(): Boolean = isRecording.get()
  private var recordingStartNanos = 0L
  private var outputPath: String? = null
  private var hasAudio = true

  // View reference
  var hostView: WeakReference<RealtimeRecorderHostView>? = null
  private var readyCallback: (() -> Unit)? = null
  private val sessionActive = AtomicBoolean(false)
  private val setupLock = Object()

  // Render loop
  private val frameAvailable = AtomicBoolean(false)
  private val renderLoopRunning = AtomicBoolean(false)

  // Overlay bitmap cache
  private var lastOverlayState: OverlayState? = null
  private var overlayBitmap: Bitmap? = null
  private var overlayDirty = AtomicBoolean(false)

  // Encoder drain thread — keeps GL thread free
  private var drainThread: HandlerThread? = null
  private var drainHandler: Handler? = null

  // Context ref for foreground service
  private var appContext: WeakReference<Context>? = null

  fun setReadyCallback(cb: (() -> Unit)?) {
    readyCallback = cb
  }

  // ================================================================
  //  SESSION SETUP
  // ================================================================

  fun setupSession(context: Context) {
    synchronized(setupLock) {
      if (sessionActive.get()) {
        Log.i(TAG, "Releasing previous session before setup")
        releaseSessionInternal()
      }

      appContext = WeakReference(context)

      if (overlayRenderer == null) {
        try {
          overlayRenderer = OverlayRenderer(context)
        } catch (e: Exception) {
          Log.e(TAG, "OverlayRenderer init failed", e)
        }
      }

      sessionActive.set(true)
    }

    initGLAndBindCamera(context)
  }

  fun releaseSession() {
    synchronized(setupLock) {
      releaseSessionInternal()
    }
  }

  private fun releaseSessionInternal() {
    sessionActive.set(false)
    renderLoopRunning.set(false)

    cameraController?.closeCamera()
    cameraController = null

    // Capture local refs BEFORE posting — prevents race condition on camera switch
    val oldHandler = glHandler
    val oldThread = glThread
    glHandler = null
    glThread = null

    if (oldHandler != null) {
      val latch = CountDownLatch(1)
      oldHandler.post {
        releaseGL()
        latch.countDown()
      }
      latch.await(2, TimeUnit.SECONDS)
      oldThread?.quitSafely()
    } else {
      releaseGL()
    }

    Log.i(TAG, "Session released")
  }

  // ================================================================
  //  GL + CAMERA INIT
  // ================================================================

  private fun initGLAndBindCamera(context: Context) {
    if (!sessionActive.get()) return

    glThread = HandlerThread("GLVideoThread").apply { start() }
    glHandler = Handler(glThread!!.looper)

    glHandler?.post {
      try {
        initEGL()
        initPreviewSurface()
        initRenderer()
        openCamera(context)
        startRenderLoop()
      } catch (e: Exception) {
        Log.e(TAG, "GL + Camera init failed", e)
        releaseGL()
      }
    }
  }

  private fun initEGL() {
    eglCore = EglCore().apply { initialize() }
    Log.i(TAG, "EGL initialized")
  }

  private fun initPreviewSurface() {
    val view = hostView?.get() ?: return
    val textureView = view.textureView

    if (textureView.isAvailable) {
      createPreviewEGLSurface(Surface(textureView.surfaceTexture))
    }

    textureView.surfaceTextureListener = object : TextureView.SurfaceTextureListener {
      override fun onSurfaceTextureAvailable(st: SurfaceTexture, w: Int, h: Int) {
        glHandler?.post { createPreviewEGLSurface(Surface(st)) }
      }
      override fun onSurfaceTextureSizeChanged(st: SurfaceTexture, w: Int, h: Int) {}
      override fun onSurfaceTextureDestroyed(st: SurfaceTexture): Boolean {
        glHandler?.post { destroyPreviewEGLSurface() }
        return true
      }
      override fun onSurfaceTextureUpdated(st: SurfaceTexture) {}
    }
  }

  private fun createPreviewEGLSurface(surface: Surface) {
    destroyPreviewEGLSurface()
    previewSurface = surface
    eglPreviewSurface = eglCore?.createWindowSurface(surface) ?: EGL14.EGL_NO_SURFACE
    Log.i(TAG, "Preview EGLSurface created")
  }

  private fun destroyPreviewEGLSurface() {
    if (eglPreviewSurface != EGL14.EGL_NO_SURFACE) {
      eglPreviewSurface = eglCore?.destroySurface(eglPreviewSurface) ?: EGL14.EGL_NO_SURFACE
    }
    previewSurface?.release()
    previewSurface = null
  }

  private fun initRenderer() {
    renderer = CameraTextureRenderer().apply { initialize(videoWidth, videoHeight) }

    cameraSurfaceTexture = SurfaceTexture(renderer!!.cameraTextureId).apply {
      setDefaultBufferSize(videoWidth, videoHeight)
      setOnFrameAvailableListener { frameAvailable.set(true) }
    }
    cameraSurface = Surface(cameraSurfaceTexture)

    Log.i(TAG, "Renderer + SurfaceTexture initialized")
  }

  /** Current display rotation in degrees (0/90/180/270), read from WindowManager. */
  private fun currentDisplayRotationDegrees(): Int {
    val ctx = appContext?.get() ?: return 0
    return try {
      val wm = ctx.getSystemService(Context.WINDOW_SERVICE) as? WindowManager ?: return 0
      @Suppress("DEPRECATION")
      when (wm.defaultDisplay.rotation) {
        Surface.ROTATION_90 -> 90
        Surface.ROTATION_180 -> 180
        Surface.ROTATION_270 -> 270
        else -> 0
      }
    } catch (e: Exception) { 0 }
  }

  private fun openCamera(context: Context) {
    val handler = glHandler ?: return

    cameraController = CameraController().apply {
      onCameraOpened = {
        Log.i(TAG, "Camera opened (front=$useFrontCamera)")
        val ctx = appContext?.get()
        if (ctx != null) {
          // Notify JS on main thread
          android.os.Handler(android.os.Looper.getMainLooper()).post {
            readyCallback?.invoke()
          }
        }
      }
      onCameraError = { e ->
        Log.e(TAG, "Camera error", e)
      }
    }

    val st = cameraSurfaceTexture ?: return
    cameraController?.openCamera(context, useFrontCamera, st, handler, isLandscape)
  }

  // ================================================================
  //  RENDER LOOP (30 FPS)
  // ================================================================

  private fun startRenderLoop() {
    renderLoopRunning.set(true)
    renderFrame()
    Log.i(TAG, "Render loop started")
  }

  private fun renderFrame() {
    if (!renderLoopRunning.get()) return
    val frameStart = System.nanoTime()

    try {
      if (frameAvailable.getAndSet(false)) {
        cameraSurfaceTexture?.updateTexImage()
      }

      val texMatrix = FloatArray(16)
      cameraSurfaceTexture?.getTransformMatrix(texMatrix)

      // Detect if the texture matrix already includes a horizontal mirror.
      // Camera2 front cameras on some devices (OnePlus, Samsung, etc.) include
      // a reflection in getTransformMatrix(). The 2D determinant tells us:
      // negative → transform includes a mirror/reflection.
      val isFront = cameraController?.isFrontFacing ?: useFrontCamera
      val texDet = texMatrix[0] * texMatrix[5] - texMatrix[4] * texMatrix[1]
      val texAlreadyMirrored = texDet < 0
      val mirror = if (isFront) !texAlreadyMirrored else false

      updateOverlayBitmap()

      val rotationDeg = currentDisplayRotationDegrees()
      val camBufW = cameraController?.bufferWidth ?: 0
      val camBufH = cameraController?.bufferHeight ?: 0

      // --- Render to preview surface (NO overlay — RN draws its own UI) ---
      if (eglPreviewSurface != EGL14.EGL_NO_SURFACE) {
        eglCore?.makeCurrent(eglPreviewSurface)
        val view = hostView?.get()
        val pw = view?.textureView?.width ?: videoWidth
        val ph = view?.textureView?.height ?: videoHeight
        renderer?.drawFrame(texMatrix, mirror, drawOverlay = false,
          viewportWidth = pw, viewportHeight = ph,
          displayRotationDegrees = rotationDeg,
          cameraBufferWidth = camBufW, cameraBufferHeight = camBufH)
        eglCore?.swapBuffers(eglPreviewSurface)
      }

      // --- Render to encoder surface (WITH overlay burned in) ---
      if (isRecording.get() && eglEncoderSurface != EGL14.EGL_NO_SURFACE) {
        eglCore?.makeCurrent(eglEncoderSurface)
        renderer?.drawFrame(texMatrix, mirror, drawOverlay = true,
          displayRotationDegrees = rotationDeg,
          cameraBufferWidth = camBufW, cameraBufferHeight = camBufH)

        val ptsNanos = System.nanoTime() - recordingStartNanos
        eglCore?.setPresentationTime(eglEncoderSurface, ptsNanos)
        eglCore?.swapBuffers(eglEncoderSurface)

        // Drain encoder on a separate thread to keep GL thread free
        drainHandler?.post { drainVideoEncoder(false) }
      }
    } catch (e: Exception) {
      Log.e(TAG, "renderFrame error", e)
    }

    val elapsed = System.nanoTime() - frameStart
    val delayMs = maxOf(1L, (FRAME_INTERVAL_NS - elapsed) / 1_000_000)
    glHandler?.postDelayed({ renderFrame() }, delayMs)
  }

  private fun updateOverlayBitmap() {
    val state: OverlayState
    synchronized(stateLock) {
      state = overlayState.copy()
    }

    if (state == lastOverlayState) return
    lastOverlayState = state

    val or = overlayRenderer ?: return

    // Render overlay at half resolution — GPU upscales via linear filtering.
    // Cuts eraseColor + glTexSubImage2D cost by 4× (8MB → 2MB) with no visible loss
    // (overlay is just text + icons with shadows).
    val overlayW = videoWidth / 2
    val overlayH = videoHeight / 2

    // Reuse the same bitmap — allocate only once
    var bmp = overlayBitmap
    if (bmp == null || bmp.width != overlayW || bmp.height != overlayH) {
      bmp?.recycle()
      bmp = Bitmap.createBitmap(overlayW, overlayH, Bitmap.Config.ARGB_8888)
      overlayBitmap = bmp
    } else {
      bmp.eraseColor(android.graphics.Color.TRANSPARENT)
    }

    or.render(bmp, state)
    overlayDirty.set(true)
    renderer?.updateOverlayTexture(bmp)
  }

  // ================================================================
  //  RECORDING
  // ================================================================

  fun startRecording(path: String): Boolean {
    if (isRecording.get()) {
      Log.w(TAG, "Already recording")
      return false
    }

    outputPath = path
    try { File(path).delete() } catch (_: Exception) {}

    try {
      // 1. Video encoder (landscape swaps dimensions)
      videoEncoder = VideoEncoder().apply { configure(width = videoWidth, height = videoHeight) }

      // 2. Muxer
      muxer = VideoMuxer()

      // 3. Audio encoder (optional)
      hasAudio = true
      audioEncoder = try {
        AudioEncoder().apply { configure() }
      } catch (e: Exception) {
        Log.w(TAG, "Audio encoder setup failed, recording without audio", e)
        hasAudio = false
        null
      }

      muxer?.initialize(path, hasAudio)

      // Wire audio encoder callbacks to muxer
      audioEncoder?.onOutputFormat = { format ->
        muxer?.addAudioTrack(format)
      }
      audioEncoder?.onOutputData = { buffer, info ->
        val m = muxer
        if (m != null) {
          m.writeSampleData(m.audioTrackIndex, buffer, info)
        }
      }

      // Wire video encoder callbacks to muxer
      // (called from drainVideoEncoder on GL thread)

      // 4. Start encoder drain thread
      drainThread = HandlerThread("EncoderDrainThread").apply { start() }
      drainHandler = Handler(drainThread!!.looper)

      // 5. Create encoder EGLSurface on GL thread
      val latch = CountDownLatch(1)
      glHandler?.post {
        try {
          val encoderInputSurface = videoEncoder?.inputSurface
            ?: throw RuntimeException("No encoder input surface")
          eglEncoderSurface = eglCore?.createWindowSurface(encoderInputSurface)
            ?: throw RuntimeException("createWindowSurface for encoder failed")
          videoEncoder?.start()
          Log.i(TAG, "Encoder EGLSurface created")
        } catch (e: Exception) {
          Log.e(TAG, "Encoder surface creation failed", e)
        }
        latch.countDown()
      }
      latch.await(2, TimeUnit.SECONDS)

      // 6. Start recording
      isRecording.set(true)
      recordingStartNanos = System.nanoTime()

      if (hasAudio) {
        audioEncoder?.start(recordingStartNanos)
      }

      setKeepScreenOn(true)
      startForegroundService()

      Log.i(TAG, "Recording started → $path (audio=$hasAudio)")
      return true
    } catch (e: Exception) {
      Log.e(TAG, "Failed to start recording", e)
      cleanupRecording()
      return false
    }
  }

  private val drainLock = Object()

  private fun drainVideoEncoder(endOfStream: Boolean) {
    synchronized(drainLock) {
      videoEncoder?.drainOutput(
        endOfStream = endOfStream,
        onFormat = { format ->
          muxer?.addVideoTrack(format)
        },
        onData = { buffer, info ->
          val m = muxer ?: return@drainOutput
          m.writeSampleData(m.videoTrackIndex, buffer, info)
        }
      )
    }
  }

  // ================================================================
  //  STOP RECORDING
  // ================================================================

  fun stopRecording(callback: (Result<String>) -> Unit) {
    if (!isRecording.getAndSet(false)) {
      callback(Result.failure(Exception("Not recording")))
      return
    }

    setKeepScreenOn(false)

    Thread {
      try {
        // 1. Stop audio
        audioEncoder?.stop()

        // 2. Signal EOS on GL thread, then drain on drain thread
        val signalLatch = CountDownLatch(1)
        glHandler?.post {
          try {
            if (eglEncoderSurface != EGL14.EGL_NO_SURFACE) {
              eglCore?.makeCurrent(eglEncoderSurface)
              videoEncoder?.signalEndOfInputStream()
              eglEncoderSurface = eglCore?.destroySurface(eglEncoderSurface) ?: EGL14.EGL_NO_SURFACE
            }
          } catch (_: Exception) {}
          signalLatch.countDown()
        } ?: signalLatch.countDown()
        signalLatch.await(2, TimeUnit.SECONDS)

        // Final drain on drain thread (blocking)
        val drainLatch = CountDownLatch(1)
        val dh = drainHandler
        if (dh != null) {
          dh.post {
            drainVideoEncoder(true)
            drainLatch.countDown()
          }
          drainLatch.await(3, TimeUnit.SECONDS)
        } else {
          drainVideoEncoder(true)
        }

        // 3. Stop encoders
        videoEncoder?.stop()

        // 4. Stop muxer
        muxer?.stop()

        // 5. Release
        videoEncoder?.release()
        videoEncoder = null
        audioEncoder?.release()
        audioEncoder = null
        muxer = null

        // 6. Stop drain thread
        drainThread?.quitSafely()
        drainThread = null
        drainHandler = null

        stopForegroundService()

        val path = outputPath ?: ""
        Log.i(TAG, "Recording stopped: $path")
        callback(Result.success("file://$path"))
      } catch (e: Exception) {
        Log.e(TAG, "Stop recording error", e)
        callback(Result.failure(e))
      }
    }.start()
  }

  // ================================================================
  //  GL CLEANUP
  // ================================================================

  private fun releaseGL() {
    try { renderer?.release() } catch (_: Exception) {}
    renderer = null

    try { cameraSurface?.release() } catch (_: Exception) {}
    cameraSurface = null
    try { cameraSurfaceTexture?.release() } catch (_: Exception) {}
    cameraSurfaceTexture = null

    destroyPreviewEGLSurface()

    if (eglEncoderSurface != EGL14.EGL_NO_SURFACE) {
      eglEncoderSurface = eglCore?.destroySurface(eglEncoderSurface) ?: EGL14.EGL_NO_SURFACE
    }

    overlayBitmap?.recycle()
    overlayBitmap = null
    lastOverlayState = null

    eglCore?.release()
    eglCore = null

    Log.i(TAG, "GL resources released")
  }

  // ================================================================
  //  FOREGROUND SERVICE
  // ================================================================

  private fun startForegroundService() {
    val ctx = appContext?.get() ?: return
    try {
      val intent = Intent(ctx, RecordingForegroundService::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        ctx.startForegroundService(intent)
      } else {
        ctx.startService(intent)
      }
    } catch (e: Exception) {
      Log.w(TAG, "Failed to start foreground service", e)
    }
  }

  private fun stopForegroundService() {
    val ctx = appContext?.get() ?: return
    try {
      val intent = Intent(ctx, RecordingForegroundService::class.java)
      ctx.stopService(intent)
    } catch (e: Exception) {
      Log.w(TAG, "Failed to stop foreground service", e)
    }
  }

  // ================================================================
  //  HELPERS
  // ================================================================

  private fun setKeepScreenOn(on: Boolean) {
    val view = hostView?.get() ?: return
    val activity = view.context as? android.app.Activity ?: return
    activity.runOnUiThread {
      if (on) {
        activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
      } else {
        activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
      }
    }
  }

  private fun cleanupRecording() {
    isRecording.set(false)
    audioEncoder?.release()
    audioEncoder = null
    videoEncoder?.release()
    videoEncoder = null
    muxer?.stop()
    muxer = null
    drainThread?.quitSafely()
    drainThread = null
    drainHandler = null
    stopForegroundService()
  }
}
