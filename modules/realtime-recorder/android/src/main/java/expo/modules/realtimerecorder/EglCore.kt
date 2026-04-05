package expo.modules.realtimerecorder

import android.opengl.EGL14
import android.opengl.EGLConfig
import android.opengl.EGLContext
import android.opengl.EGLDisplay
import android.opengl.EGLExt
import android.opengl.EGLSurface
import android.util.Log
import android.view.Surface

/**
 * Manages an EGL14 display/context/config, following the Grafika pattern.
 *
 * Provides helpers to create window surfaces (for preview TextureView and
 * MediaCodec encoder input), set presentation timestamps, swap buffers, and
 * clean everything up in the correct order.
 *
 * Thread-safety: all public methods must be called from the same GL thread
 * (except release(), which can be called from any thread after the GL thread
 * has finished using the context).
 */
class EglCore {

  companion object {
    private const val TAG = "EglCore"
    private const val EGL_RECORDABLE_ANDROID = 0x3142
  }

  var eglDisplay: EGLDisplay = EGL14.EGL_NO_DISPLAY; private set
  var eglContext: EGLContext = EGL14.EGL_NO_CONTEXT; private set
  var eglConfig: EGLConfig? = null; private set

  /**
   * Initialise EGL: display, config (with EGL_RECORDABLE_ANDROID), context (GLES 2.0).
   * A temporary 1×1 pbuffer is created and made current so that subsequent GL
   * calls (texture creation, shader compilation) succeed before any real
   * surface exists.
   */
  fun initialize() {
    // 1. Get display
    eglDisplay = EGL14.eglGetDisplay(EGL14.EGL_DEFAULT_DISPLAY)
    if (eglDisplay == EGL14.EGL_NO_DISPLAY) throw RuntimeException("eglGetDisplay failed")

    val version = IntArray(2)
    if (!EGL14.eglInitialize(eglDisplay, version, 0, version, 1)) {
      throw RuntimeException("eglInitialize failed")
    }

    // 2. Choose config
    val attribList = intArrayOf(
      EGL14.EGL_RED_SIZE, 8,
      EGL14.EGL_GREEN_SIZE, 8,
      EGL14.EGL_BLUE_SIZE, 8,
      EGL14.EGL_ALPHA_SIZE, 8,
      EGL14.EGL_RENDERABLE_TYPE, EGL14.EGL_OPENGL_ES2_BIT,
      EGL_RECORDABLE_ANDROID, 1,
      EGL14.EGL_NONE
    )
    val configs = arrayOfNulls<EGLConfig>(1)
    val numConfigs = IntArray(1)
    if (!EGL14.eglChooseConfig(eglDisplay, attribList, 0, configs, 0, 1, numConfigs, 0)) {
      throw RuntimeException("eglChooseConfig failed")
    }
    eglConfig = configs[0] ?: throw RuntimeException("No suitable EGL config found")

    // 3. Create context (GLES 2.0)
    val contextAttribs = intArrayOf(EGL14.EGL_CONTEXT_CLIENT_VERSION, 2, EGL14.EGL_NONE)
    eglContext = EGL14.eglCreateContext(eglDisplay, eglConfig, EGL14.EGL_NO_CONTEXT, contextAttribs, 0)
    if (eglContext == EGL14.EGL_NO_CONTEXT) {
      throw RuntimeException("eglCreateContext failed")
    }

    // 4. Temp pbuffer so context can be made current immediately
    val pbufferAttribs = intArrayOf(EGL14.EGL_WIDTH, 1, EGL14.EGL_HEIGHT, 1, EGL14.EGL_NONE)
    val tmpSurface = EGL14.eglCreatePbufferSurface(eglDisplay, eglConfig, pbufferAttribs, 0)
    EGL14.eglMakeCurrent(eglDisplay, tmpSurface, tmpSurface, eglContext)

    Log.i(TAG, "EGL initialized (version ${version[0]}.${version[1]})")
  }

  /**
   * Create a window-backed EGLSurface from a native [Surface]
   * (TextureView surface or MediaCodec input surface).
   */
  fun createWindowSurface(surface: Surface): EGLSurface {
    val attribs = intArrayOf(EGL14.EGL_NONE)
    val eglSurface = EGL14.eglCreateWindowSurface(eglDisplay, eglConfig, surface, attribs, 0)
    if (eglSurface == EGL14.EGL_NO_SURFACE) {
      throw RuntimeException("eglCreateWindowSurface failed")
    }
    return eglSurface
  }

  /** Make the given surface current for drawing. */
  fun makeCurrent(surface: EGLSurface) {
    if (!EGL14.eglMakeCurrent(eglDisplay, surface, surface, eglContext)) {
      throw RuntimeException("eglMakeCurrent failed")
    }
  }

  /** Set the presentation timestamp (nanoseconds) for the current surface.
   *  CRITICAL for correct A/V sync in the recorded file. */
  fun setPresentationTime(surface: EGLSurface, nsecs: Long) {
    EGLExt.eglPresentationTimeANDROID(eglDisplay, surface, nsecs)
  }

  /** Swap buffers on the given surface (posts the frame). */
  fun swapBuffers(surface: EGLSurface): Boolean {
    return EGL14.eglSwapBuffers(eglDisplay, surface)
  }

  /** Destroy a single EGLSurface. Returns EGL_NO_SURFACE for convenience. */
  fun destroySurface(surface: EGLSurface): EGLSurface {
    if (surface != EGL14.EGL_NO_SURFACE) {
      EGL14.eglDestroySurface(eglDisplay, surface)
    }
    return EGL14.EGL_NO_SURFACE
  }

  /** Release all EGL resources. Safe to call multiple times. */
  fun release() {
    if (eglDisplay != EGL14.EGL_NO_DISPLAY) {
      EGL14.eglMakeCurrent(eglDisplay, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_CONTEXT)
      if (eglContext != EGL14.EGL_NO_CONTEXT) {
        EGL14.eglDestroyContext(eglDisplay, eglContext)
      }
      EGL14.eglTerminate(eglDisplay)
    }
    eglDisplay = EGL14.EGL_NO_DISPLAY
    eglContext = EGL14.EGL_NO_CONTEXT
    eglConfig = null
    Log.i(TAG, "EGL released")
  }
}
