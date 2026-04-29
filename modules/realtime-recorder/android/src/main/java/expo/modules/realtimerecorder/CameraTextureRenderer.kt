package expo.modules.realtimerecorder

import android.graphics.Bitmap
import android.opengl.GLES11Ext
import android.opengl.GLES20
import android.opengl.GLUtils
import android.opengl.Matrix
import android.util.Log
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer

/**
 * GPU-accelerated renderer with two shader programs:
 *
 * 1. **OES program** — draws the camera SurfaceTexture (GL_TEXTURE_EXTERNAL_OES)
 *    as a fullscreen quad. Zero-copy: the camera frame never touches CPU memory.
 *
 * 2. **2D program** — draws the overlay bitmap (GL_TEXTURE_2D with alpha) on top
 *    of the camera frame using alpha blending. The overlay bitmap is only
 *    re-uploaded when its content changes (chrono/timestamp update).
 *
 * Usage per frame:
 *   drawFrame(cameraTexMatrix, mirror)   // draws camera + overlay to current EGLSurface
 */
class CameraTextureRenderer {

  companion object {
    private const val TAG = "CameraTextureRenderer"

    private const val VERTEX_SHADER = """
      uniform mat4 uMVPMatrix;
      uniform mat4 uTexMatrix;
      attribute vec4 aPosition;
      attribute vec4 aTextureCoord;
      varying vec2 vTextureCoord;
      void main() {
        gl_Position = uMVPMatrix * aPosition;
        vTextureCoord = (uTexMatrix * aTextureCoord).xy;
      }
    """

    private const val FRAGMENT_SHADER_OES = """
      #extension GL_OES_EGL_image_external : require
      precision mediump float;
      varying vec2 vTextureCoord;
      uniform samplerExternalOES sTexture;
      void main() {
        gl_FragColor = texture2D(sTexture, vTextureCoord);
      }
    """

    private const val FRAGMENT_SHADER_2D = """
      precision mediump float;
      varying vec2 vTextureCoord;
      uniform sampler2D sTexture;
      void main() {
        gl_FragColor = texture2D(sTexture, vTextureCoord);
      }
    """

    private val QUAD_COORDS = floatArrayOf(
      -1f, -1f, 0f,
       1f, -1f, 0f,
      -1f,  1f, 0f,
       1f,  1f, 0f,
    )

    private val QUAD_TEX_COORDS = floatArrayOf(
      0f, 0f,
      1f, 0f,
      0f, 1f,
      1f, 1f,
    )
  }

  private var programOES = 0
  private var program2D = 0

  private val vertexBuffer: FloatBuffer = createFloatBuffer(QUAD_COORDS)
  private val texCoordBuffer: FloatBuffer = createFloatBuffer(QUAD_TEX_COORDS)

  var cameraTextureId = 0; private set
  private var overlayTextureId = 0

  private var videoWidth = 1080
  private var videoHeight = 1920

  private var overlayTextureInitialized = false
  private var hasOverlay = false

  /**
   * Must be called on the GL thread after EGL context is current.
   */
  fun initialize(width: Int = 1080, height: Int = 1920) {
    videoWidth = width
    videoHeight = height

    programOES = createProgram(VERTEX_SHADER, FRAGMENT_SHADER_OES)
    program2D = createProgram(VERTEX_SHADER, FRAGMENT_SHADER_2D)

    // Create OES texture for camera
    val texIds = IntArray(1)
    GLES20.glGenTextures(1, texIds, 0)
    cameraTextureId = texIds[0]
    GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, cameraTextureId)
    GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR)
    GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR)
    GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE)
    GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE)

    // Create 2D texture for overlay
    val overlayTexIds = IntArray(1)
    GLES20.glGenTextures(1, overlayTexIds, 0)
    overlayTextureId = overlayTexIds[0]
    GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, overlayTextureId)
    GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR)
    GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR)
    GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE)
    GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE)

    Log.i(TAG, "Initialized (OES=$programOES, 2D=$program2D, camTex=$cameraTextureId, overlayTex=$overlayTextureId)")
  }

  /**
   * Upload overlay bitmap to GPU. First call uses glTexImage2D (full alloc),
   * subsequent calls use glTexSubImage2D (fast update, no GPU realloc).
   * Must be called on the GL thread.
   */
  fun updateOverlayTexture(bitmap: Bitmap) {
    GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, overlayTextureId)
    if (!overlayTextureInitialized) {
      GLUtils.texImage2D(GLES20.GL_TEXTURE_2D, 0, bitmap, 0)
      overlayTextureInitialized = true
    } else {
      GLUtils.texSubImage2D(GLES20.GL_TEXTURE_2D, 0, 0, 0, bitmap)
    }
    hasOverlay = true
  }

  /**
   * Draw a complete frame: camera background + overlay on top.
   * Must be called on the GL thread with EGL context current.
   * @param drawOverlay false for preview (RN draws its own UI), true for encoder (burn overlay)
   * @param displayRotationDegrees current device display rotation (0/90/180/270).
   *        Camera2's texMatrix always produces an upright-portrait image, so
   *        when the device is in landscape we apply a compensating UV rotation
   *        (different sign for landscape-left vs landscape-right).
   */
  fun drawFrame(cameraTexMatrix: FloatArray, mirror: Boolean = false, drawOverlay: Boolean = true,
                viewportWidth: Int = videoWidth, viewportHeight: Int = videoHeight,
                displayRotationDegrees: Int = 0,
                cameraBufferWidth: Int = 0, cameraBufferHeight: Int = 0) {
    GLES20.glViewport(0, 0, viewportWidth, viewportHeight)
    GLES20.glClearColor(0f, 0f, 0f, 1f)
    GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT)

    // Map display rotation to the UV rotation needed to keep the image upright
    // in the viewport. 90° works for landscape-left; landscape-right needs -90°.
    val extraRotation = when (displayRotationDegrees) {
      90  -> 90f    // landscape-left (top of device on the left)
      180 -> 180f   // reverse portrait
      270 -> -90f   // landscape-right (top of device on the right)
      else -> 0f    // portrait upright
    }

    // Aspect-ratio "contain" fit — scale the camera quad so the full camera
    // frame is visible without distortion (no zoom/crop).  The small black
    // bars at the edges are hidden by UI overlay elements (header + buttons).
    // This matches the iOS CameraView behaviour on tall screens.
    var coverScaleX = 1f
    var coverScaleY = 1f
    if (cameraBufferWidth > 0 && cameraBufferHeight > 0) {
      val isPortrait = displayRotationDegrees == 0 || displayRotationDegrees == 180
      val camDispW = (if (isPortrait) cameraBufferHeight else cameraBufferWidth).toFloat()
      val camDispH = (if (isPortrait) cameraBufferWidth else cameraBufferHeight).toFloat()
      val camAR = camDispW / camDispH
      val viewAR = viewportWidth.toFloat() / viewportHeight.toFloat()
      if (camAR > viewAR) {
        // Camera wider than viewport → fit width, letterbox top/bottom
        coverScaleY = viewAR / camAR
      } else {
        // Camera taller than viewport → fit height, pillarbox sides
        coverScaleX = camAR / viewAR
      }
    }

    drawCameraTexture(cameraTexMatrix, mirror, extraRotation, coverScaleX, coverScaleY)
    if (drawOverlay && hasOverlay) {
      drawOverlayTexture()
    }
  }

  // ============================================================
  //  Camera texture (OES)
  // ============================================================

  private fun drawCameraTexture(texMatrix: FloatArray, mirror: Boolean, extraRotationDegrees: Float = 0f,
                                coverScaleX: Float = 1f, coverScaleY: Float = 1f) {
    GLES20.glUseProgram(programOES)

    val posHandle = GLES20.glGetAttribLocation(programOES, "aPosition")
    val texHandle = GLES20.glGetAttribLocation(programOES, "aTextureCoord")
    val mvpHandle = GLES20.glGetUniformLocation(programOES, "uMVPMatrix")
    val texMatHandle = GLES20.glGetUniformLocation(programOES, "uTexMatrix")

    GLES20.glEnableVertexAttribArray(posHandle)
    GLES20.glVertexAttribPointer(posHandle, 3, GLES20.GL_FLOAT, false, 0, vertexBuffer)

    GLES20.glEnableVertexAttribArray(texHandle)
    GLES20.glVertexAttribPointer(texHandle, 2, GLES20.GL_FLOAT, false, 0, texCoordBuffer)

    val mvp = FloatArray(16)
    Matrix.setIdentityM(mvp, 0)
    if (coverScaleX != 1f || coverScaleY != 1f) {
      Matrix.scaleM(mvp, 0, coverScaleX, coverScaleY, 1f)
    }
    if (mirror) {
      Matrix.scaleM(mvp, 0, -1f, 1f, 1f)
    }
    GLES20.glUniformMatrix4fv(mvpHandle, 1, false, mvp, 0)

    // Apply an extra rotation to the UV sampling when the buffer and viewport
    // orientations don't match (portrait camera frames drawn to a landscape
    // TextureView, or vice versa). Rotates around the center of texture space.
    val finalTexMatrix = if (extraRotationDegrees != 0f) {
      val rot = FloatArray(16)
      Matrix.setIdentityM(rot, 0)
      Matrix.translateM(rot, 0, 0.5f, 0.5f, 0f)
      Matrix.rotateM(rot, 0, extraRotationDegrees, 0f, 0f, 1f)
      Matrix.translateM(rot, 0, -0.5f, -0.5f, 0f)
      val combined = FloatArray(16)
      Matrix.multiplyMM(combined, 0, rot, 0, texMatrix, 0)
      combined
    } else {
      texMatrix
    }
    GLES20.glUniformMatrix4fv(texMatHandle, 1, false, finalTexMatrix, 0)

    GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
    GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, cameraTextureId)

    GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)

    GLES20.glDisableVertexAttribArray(posHandle)
    GLES20.glDisableVertexAttribArray(texHandle)
  }

  // ============================================================
  //  Overlay texture (2D with alpha)
  // ============================================================

  private fun drawOverlayTexture() {

    GLES20.glEnable(GLES20.GL_BLEND)
    GLES20.glBlendFunc(GLES20.GL_SRC_ALPHA, GLES20.GL_ONE_MINUS_SRC_ALPHA)

    GLES20.glUseProgram(program2D)

    val posHandle = GLES20.glGetAttribLocation(program2D, "aPosition")
    val texHandle = GLES20.glGetAttribLocation(program2D, "aTextureCoord")
    val mvpHandle = GLES20.glGetUniformLocation(program2D, "uMVPMatrix")
    val texMatHandle = GLES20.glGetUniformLocation(program2D, "uTexMatrix")

    GLES20.glEnableVertexAttribArray(posHandle)
    GLES20.glVertexAttribPointer(posHandle, 3, GLES20.GL_FLOAT, false, 0, vertexBuffer)

    GLES20.glEnableVertexAttribArray(texHandle)
    GLES20.glVertexAttribPointer(texHandle, 2, GLES20.GL_FLOAT, false, 0, texCoordBuffer)

    val identity = FloatArray(16)
    Matrix.setIdentityM(identity, 0)
    GLES20.glUniformMatrix4fv(mvpHandle, 1, false, identity, 0)

    // Flip Y for bitmap coordinate system
    val texMatrix = FloatArray(16)
    Matrix.setIdentityM(texMatrix, 0)
    Matrix.scaleM(texMatrix, 0, 1f, -1f, 1f)
    Matrix.translateM(texMatrix, 0, 0f, -1f, 0f)
    GLES20.glUniformMatrix4fv(texMatHandle, 1, false, texMatrix, 0)

    GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
    GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, overlayTextureId)

    GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)

    GLES20.glDisableVertexAttribArray(posHandle)
    GLES20.glDisableVertexAttribArray(texHandle)
    GLES20.glDisable(GLES20.GL_BLEND)
  }

  // ============================================================
  //  Cleanup
  // ============================================================

  fun release() {
    val texIds = intArrayOf(cameraTextureId, overlayTextureId)
    GLES20.glDeleteTextures(2, texIds, 0)
    cameraTextureId = 0
    overlayTextureId = 0
    if (programOES != 0) { GLES20.glDeleteProgram(programOES); programOES = 0 }
    if (program2D != 0) { GLES20.glDeleteProgram(program2D); program2D = 0 }
    overlayTextureInitialized = false
    hasOverlay = false
    Log.i(TAG, "CameraTextureRenderer released")
  }

  // ============================================================
  //  Utils
  // ============================================================

  private fun createProgram(vertexSource: String, fragmentSource: String): Int {
    val vertexShader = loadShader(GLES20.GL_VERTEX_SHADER, vertexSource)
    val fragmentShader = loadShader(GLES20.GL_FRAGMENT_SHADER, fragmentSource)
    val prog = GLES20.glCreateProgram()
    GLES20.glAttachShader(prog, vertexShader)
    GLES20.glAttachShader(prog, fragmentShader)
    GLES20.glLinkProgram(prog)
    val linkStatus = IntArray(1)
    GLES20.glGetProgramiv(prog, GLES20.GL_LINK_STATUS, linkStatus, 0)
    if (linkStatus[0] != GLES20.GL_TRUE) {
      val log = GLES20.glGetProgramInfoLog(prog)
      GLES20.glDeleteProgram(prog)
      throw RuntimeException("Program link failed: $log")
    }
    return prog
  }

  private fun loadShader(type: Int, source: String): Int {
    val shader = GLES20.glCreateShader(type)
    GLES20.glShaderSource(shader, source)
    GLES20.glCompileShader(shader)
    val compileStatus = IntArray(1)
    GLES20.glGetShaderiv(shader, GLES20.GL_COMPILE_STATUS, compileStatus, 0)
    if (compileStatus[0] != GLES20.GL_TRUE) {
      val log = GLES20.glGetShaderInfoLog(shader)
      GLES20.glDeleteShader(shader)
      throw RuntimeException("Shader compile failed: $log")
    }
    return shader
  }

  private fun createFloatBuffer(data: FloatArray): FloatBuffer {
    return ByteBuffer.allocateDirect(data.size * 4)
      .order(ByteOrder.nativeOrder())
      .asFloatBuffer()
      .apply { put(data); position(0) }
  }
}
