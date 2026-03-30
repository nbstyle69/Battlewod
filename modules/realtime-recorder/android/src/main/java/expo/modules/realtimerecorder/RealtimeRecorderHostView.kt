package expo.modules.realtimerecorder

import android.content.Context
import android.util.Log
import android.widget.LinearLayout
import androidx.camera.view.PreviewView
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import java.lang.ref.WeakReference

class RealtimeRecorderHostView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {

  companion object {
    private const val TAG = "RealtimeRecorder"
  }

  private val onReady by EventDispatcher()

  val previewView: PreviewView = PreviewView(context).apply {
    layoutParams = LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.MATCH_PARENT,
      LinearLayout.LayoutParams.MATCH_PARENT
    )
    implementationMode = PreviewView.ImplementationMode.COMPATIBLE  // TextureView — works with RN view hierarchy
    scaleType = PreviewView.ScaleType.FILL_CENTER
  }

  init {
    // Ensure the LinearLayout fills its parent and stacks correctly
    orientation = VERTICAL
    addView(previewView)
  }

  fun markReady() {
    try {
      onReady(mapOf<String, Any>())
    } catch (e: Exception) {
      Log.e(TAG, "markReady failed", e)
    }
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    Log.i(TAG, "View attached to window")
    try {
      val engine = RecorderEngine.shared
      engine.hostView = WeakReference(this)
      engine.setReadyCallback {
        post { markReady() }
      }
      engine.setupSession(context)
    } catch (e: Exception) {
      Log.e(TAG, "onAttachedToWindow failed", e)
    }
  }

  override fun onDetachedFromWindow() {
    Log.i(TAG, "View detached from window")
    try {
      val engine = RecorderEngine.shared
      engine.releaseSession()
      engine.hostView = null
      engine.setReadyCallback(null)
    } catch (e: Exception) {
      Log.e(TAG, "onDetachedFromWindow cleanup failed", e)
    }
    super.onDetachedFromWindow()
  }
}
