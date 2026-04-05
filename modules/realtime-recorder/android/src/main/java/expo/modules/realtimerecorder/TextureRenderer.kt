package expo.modules.realtimerecorder

// DEPRECATED — replaced by CameraTextureRenderer.kt
// This file can be safely deleted.

/*
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
 * GPU-accelerated renderer with two programs:
 * 1. OES program — draws the camera SurfaceTexture (GL_TEXTURE_EXTERNAL_OES) as a fullscreen quad.
 *    Zero-copy: the camera frame never touches CPU memory.
 * 2. 2D program  — draws the overlay bitmap (GL_TEXTURE_2D with alpha) on top of the camera.
 *    The overlay bitmap is only re-uploaded when its content changes (chrono/timestamp update).
 *
 * Usage per frame:
 *   drawFrame(cameraTexMatrix)   // draws camera + overlay to current EGLSurface
 */
class TextureRenderer {

  companion object {
    private const val TAG = "TextureRenderer"

    // Shared vertex shader for both programs
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

    // Fragment shader for camera texture (OES external)
    private const val FRAGMENT_SHADER_OES = """
      #extension GL_OES_EGL_image_external : require
      precision mediump float;
      varying vec2 vTextureCoord;
      uniform samplerExternalOES sTexture;
      void main() {
        gl_FragColor = texture2D(sTexture, vTextureCoord);
      }
    """

    // Fragment shader for overlay texture (standard 2D with alpha)
    private const val FRAGMENT_SHADER_2D = """
      precision mediump float;
      varying vec2 vTextureCoord;
      uniform sampler2D sTexture;
      void main() {
        gl_FragColor = texture2D(sTexture, vTextureCoord);
      }
    """

    // Fullscreen quad (triangle strip)
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

  // Texture IDs
  var cameraTextureId = 0; private set
  private var overlayTextureId = 0

  // Video dimensions
  private var videoWidth = 1080
  private var videoHeight = 1920

  // Overlay bitmap (re-drawn only when content changes)
  private var overlayBitmap: Bitmap? = null
  private var overlayDirty = true

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
   * Set or update the overlay bitmap. Call from any thread.
   * The bitmap will be uploaded to GPU on the next drawFrame() call.
   */
  fun setOverlayBitmap(bitmap: Bitmap?) {
    synchronized(this) {
      overlayBitmap?.recycle()
      overlayBitmap = bitmap
      overlayDirty = true
    }
  }

  /**
   * Draw a complete frame: camera background + overlay on top.
   * Must be called on the GL thread with EGL context current.
   *
   * @param cameraTexMatrix the transform matrix from SurfaceTexture.getTransformMatrix()
   * @param mirror if true, horizontally flip the camera (for front-facing)
   */
  fun drawFrame(cameraTexMatrix: FloatArray, mirror: Boolean = false) {
    GLES20.glViewport(0, 0, videoWidth, videoHeight)
    GLES20.glClearColor(0f, 0f, 0f, 1f)
    GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT)

    // 1. Draw camera texture (fullscreen, OES)
    drawCameraTexture(cameraTexMatrix, mirror)

    // 2. Draw overlay texture on top (with alpha blending)
    uploadOverlayIfDirty()
    drawOverlayTexture()
  }

  // ============================================================
  //  Camera texture (OES)
  // ============================================================

  private fun drawCameraTexture(texMatrix: FloatArray, mirror: Boolean) {
    GLES20.glUseProgram(programOES)

    val posHandle = GLES20.glGetAttribLocation(programOES, "aPosition")
    val texHandle = GLES20.glGetAttribLocation(programOES, "aTextureCoord")
    val mvpHandle = GLES20.glGetUniformLocation(programOES, "uMVPMatrix")
    val texMatHandle = GLES20.glGetUniformLocation(programOES, "uTexMatrix")

    GLES20.glEnableVertexAttribArray(posHandle)
    GLES20.glVertexAttribPointer(posHandle, 3, GLES20.GL_FLOAT, false, 0, vertexBuffer)

    GLES20.glEnableVertexAttribArray(texHandle)
    GLES20.glVertexAttribPointer(texHandle, 2, GLES20.GL_FLOAT, false, 0, texCoordBuffer)

    // MVP: identity or mirror
    val mvp = FloatArray(16)
    Matrix.setIdentityM(mvp, 0)
    if (mirror) {
      Matrix.scaleM(mvp, 0, -1f, 1f, 1f)
    }
    GLES20.glUniformMatrix4fv(mvpHandle, 1, false, mvp, 0)
    GLES20.glUniformMatrix4fv(texMatHandle, 1, false, texMatrix, 0)

    GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
    GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, cameraTextureId)

    GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)

    GLES20.glDisableVertexAttribArray(posHandle)
    GLES20.glDisableVertexAttribArray(texHandle)
  }

  // ============================================================
  //  Overlay texture (2D with alpha)
  // ============================================================

  private fun uploadOverlayIfDirty() {
    if (!overlayDirty) return
    val bmp: Bitmap?
    synchronized(this) {
      bmp = overlayBitmap
      if (bmp == null || bmp.isRecycled) return
      overlayDirty = false
    }

    GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, overlayTextureId)
    GLUtils.texImage2D(GLES20.GL_TEXTURE_2D, 0, bmp, 0)
  }

  private fun drawOverlayTexture() {
    if (overlayBitmap == null) return

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

    // Flip Y for bitmap coordinate system (bitmap top-left = GL bottom-left)
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
    synchronized(this) {
      overlayBitmap?.recycle()
      overlayBitmap = null
    }
    Log.i(TAG, "TextureRenderer released")
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
*/
