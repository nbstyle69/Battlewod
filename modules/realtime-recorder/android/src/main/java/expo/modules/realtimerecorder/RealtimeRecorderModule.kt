package expo.modules.realtimerecorder

import android.util.Log
import androidx.camera.core.CameraSelector
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise

class RealtimeRecorderModule : Module() {

  companion object {
    private const val TAG = "RealtimeRecorder"
  }

  private val engine: RecorderEngine get() = RecorderEngine.shared

  override fun definition() = ModuleDefinition {
    Name("RealtimeRecorder")

    Function("updateOverlayState") { dict: Map<String, Any?> ->
      synchronized(engine.stateLock) {
        (dict["timerType"] as? String)?.let { engine.overlayState.timerType = it }
        (dict["timerDisplay"] as? String)?.let { engine.overlayState.timerDisplay = it }
        (dict["title"] as? String)?.let { engine.overlayState.title = it }
        (dict["timestamp"] as? String)?.let { engine.overlayState.timestamp = it }
        (dict["isRecording"] as? Boolean)?.let { engine.overlayState.isRecording = it }
        (dict["countdownValue"] as? Double)?.let { engine.overlayState.countdownValue = it.toInt() }
        (dict["showTimer"] as? Boolean)?.let { engine.overlayState.showTimer = it }
        (dict["boxLogoUrl"] as? String)?.let { engine.overlayState.boxLogoUrl = it }
      }
    }

    AsyncFunction("startRecording") { options: Map<String, Any?>, promise: Promise ->
      val outputPath = options["outputPath"] as? String ?: ""
      val facing = options["facing"] as? String ?: "back"

      if (outputPath.isEmpty()) {
        promise.reject("ERR", "outputPath is required", null)
        return@AsyncFunction
      }

      engine.currentFacing = if (facing == "front") {
        CameraSelector.LENS_FACING_FRONT
      } else {
        CameraSelector.LENS_FACING_BACK
      }

      // Clean path (remove file:// prefix if present)
      val cleanPath = if (outputPath.startsWith("file://")) {
        outputPath.removePrefix("file://")
      } else {
        outputPath
      }

      val context = appContext.currentActivity ?: appContext.reactContext ?: run {
        promise.reject("ERR", "No context available", null)
        return@AsyncFunction
      }

      // Ensure session is running
      if (engine.hostView?.get() == null) {
        engine.setupSession(context)
        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
          val success = engine.startRecording(cleanPath)
          if (success) {
            promise.resolve(null)
          } else {
            promise.reject("ERR", "Failed to start recording", null)
          }
        }, 500)
      } else {
        val success = engine.startRecording(cleanPath)
        if (success) {
          promise.resolve(null)
        } else {
          promise.reject("ERR", "Failed to start recording", null)
        }
      }
    }

    AsyncFunction("stopRecording") { promise: Promise ->
      engine.stopRecording { result ->
        result.fold(
          onSuccess = { path -> promise.resolve(path) },
          onFailure = { err -> promise.reject("ERR", err.message ?: "Unknown error", err) }
        )
      }
    }

    Function("switchCamera") {
      val context = appContext.currentActivity ?: appContext.reactContext ?: return@Function
      engine.currentFacing = if (engine.currentFacing == CameraSelector.LENS_FACING_BACK) {
        CameraSelector.LENS_FACING_FRONT
      } else {
        CameraSelector.LENS_FACING_BACK
      }
      engine.setupSession(context)
    }

    View(RealtimeRecorderHostView::class) {
      Events("onReady")

      Prop("facing") { view: RealtimeRecorderHostView, facing: String ->
        val newFacing = if (facing == "front") {
          CameraSelector.LENS_FACING_FRONT
        } else {
          CameraSelector.LENS_FACING_BACK
        }
        if (newFacing != engine.currentFacing) {
          engine.currentFacing = newFacing
          engine.setupSession(view.context)
        }
      }
    }
  }
}
