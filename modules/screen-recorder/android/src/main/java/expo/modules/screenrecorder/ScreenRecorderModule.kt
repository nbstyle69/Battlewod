package expo.modules.screenrecorder

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.os.Build
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ScreenRecorderModule : Module() {

  companion object {
    private const val REQUEST_CODE = 2001
  }

  private var startPromise: Promise? = null

  override fun definition() = ModuleDefinition {
    Name("ScreenRecorder")

    AsyncFunction("startRecording") { promise: Promise ->
      startPromise = promise
      val activity = appContext.currentActivity ?: run {
        promise.reject("NO_ACTIVITY", "No current activity", null)
        startPromise = null
        return@AsyncFunction
      }
      activity.runOnUiThread {
        val mpManager = activity.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        val intent = mpManager.createScreenCaptureIntent()
        activity.startActivityForResult(intent, REQUEST_CODE)
      }
    }

    AsyncFunction("stopRecording") { promise: Promise ->
      val service = ScreenRecorderService.instance ?: run {
        promise.reject("NOT_RECORDING", "No recording in progress", null)
        return@AsyncFunction
      }
      val uri = service.stopCapture()
      if (uri != null) {
        promise.resolve(mapOf("status" to "success", "uri" to uri))
      } else {
        promise.reject("STOP_FAILED", "Failed to stop recording", null)
      }
    }

    OnActivityResult { _, payload ->
      if (payload.requestCode == REQUEST_CODE) {
        if (payload.resultCode == Activity.RESULT_OK && payload.data != null) {
          ScreenRecorderService.resultCode = payload.resultCode
          ScreenRecorderService.resultData = payload.data

          val context = appContext.reactContext ?: run {
            startPromise?.reject("NO_CONTEXT", "No React context", null)
            startPromise = null
            return@OnActivityResult
          }

          val serviceIntent = Intent(context, ScreenRecorderService::class.java)
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(serviceIntent)
          } else {
            context.startService(serviceIntent)
          }

          startPromise?.resolve(null)
        } else {
          startPromise?.reject("PERMISSION_DENIED", "Screen recording permission denied", null)
        }
        startPromise = null
      }
    }
  }
}
