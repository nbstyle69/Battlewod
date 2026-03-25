package expo.modules.realtimerecorder

import android.content.Context
import android.widget.FrameLayout
import androidx.camera.view.PreviewView
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import java.lang.ref.WeakReference

class RealtimeRecorderHostView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {

  private val onReady by EventDispatcher()

  val previewView: PreviewView = PreviewView(context).apply {
    layoutParams = FrameLayout.LayoutParams(
      FrameLayout.LayoutParams.MATCH_PARENT,
      FrameLayout.LayoutParams.MATCH_PARENT
    )
    implementationMode = PreviewView.ImplementationMode.COMPATIBLE  // TextureView — works with RN view hierarchy
    scaleType = PreviewView.ScaleType.FILL_CENTER
  }

  init {
    addView(previewView)
  }

  fun markReady() {
    onReady(mapOf<String, Any>())
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    val engine = RecorderEngine.shared
    engine.hostView = WeakReference(this)
    engine.setReadyCallback { 
      post { markReady() }
    }
    engine.setupSession(context)
  }
}
