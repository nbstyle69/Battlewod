package expo.modules.realtimerecorder

import android.content.Context
import android.util.Log
import android.view.TextureView
import android.widget.LinearLayout
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import java.lang.ref.WeakReference

class RealtimeRecorderHostView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {

  companion object {
    private const val TAG = "RealtimeRecorder"
  }

  private val onReady by EventDispatcher()

  val textureView: TextureView = TextureView(context).apply {
    layoutParams = LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.MATCH_PARENT,
      LinearLayout.LayoutParams.MATCH_PARENT
    )
  }

  init {
    orientation = VERTICAL
    addView(textureView)
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
      val engine = VideoRecorderEngine.shared
      engine.hostView = WeakReference(this)
      engine.setReadyCallback {
        post { markReady() }
      }
      engine.setupSession(context)
    } catch (e: Exception) {
      Log.e(TAG, "onAttachedToWindow failed", e)
    }
  }

  override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
    super.onLayout(changed, l, t, r, b)
    // Force TextureView to fill the entire ExpoView bounds
    // React Native's Yoga layout engine may not properly propagate dimensions
    // to native child views, causing the TextureView to have 0 size (black screen)
    val w = r - l
    val h = b - t
    if (w > 0 && h > 0) {
      textureView.layout(0, 0, w, h)
    }
  }

  override fun onDetachedFromWindow() {
    Log.i(TAG, "View detached from window")
    try {
      val engine = VideoRecorderEngine.shared
      engine.releaseSession()
      engine.hostView = null
      engine.setReadyCallback(null)
    } catch (e: Exception) {
      Log.e(TAG, "onDetachedFromWindow cleanup failed", e)
    }
    super.onDetachedFromWindow()
  }
}
