package expo.modules.realtimerecorder

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.SurfaceTexture
import android.hardware.camera2.*
import android.os.Handler
import android.util.Log
import android.util.Range
import android.util.Size
import android.view.Surface
import androidx.core.content.ContextCompat

/**
 * Camera2 API controller.
 *
 * Opens the camera, creates a capture session targeting the provided
 * [SurfaceTexture] (for the GL pipeline) and an optional preview [Surface],
 * and uses [CameraDevice.TEMPLATE_RECORD] for higher-quality capture.
 */
class CameraController {

  companion object {
    private const val TAG = "CameraController"
  }

  private var cameraDevice: CameraDevice? = null
  private var captureSession: CameraCaptureSession? = null
  private var currentCameraId: String? = null
  var isFrontFacing = false; private set

  var onCameraOpened: (() -> Unit)? = null
  var onCameraError: ((Exception) -> Unit)? = null

  /**
   * Open the camera and start a repeating capture request.
   *
   * @param context         application context
   * @param useFront        true for front-facing camera
   * @param surfaceTexture  GL pipeline target (must have defaultBufferSize set)
   * @param handler         handler on the GL thread for callbacks
   */
  fun openCamera(
    context: Context,
    useFront: Boolean,
    surfaceTexture: SurfaceTexture,
    handler: Handler
  ) {
    if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA)
        != PackageManager.PERMISSION_GRANTED) {
      onCameraError?.invoke(SecurityException("CAMERA permission not granted"))
      return
    }

    val manager = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
    val cameraId = chooseCameraId(manager, useFront)
    if (cameraId == null) {
      onCameraError?.invoke(RuntimeException("No suitable camera found (front=$useFront)"))
      return
    }

    isFrontFacing = useFront
    currentCameraId = cameraId

    // Pick best resolution for the SurfaceTexture
    val characteristics = manager.getCameraCharacteristics(cameraId)
    val bestSize = chooseBestSize(characteristics)
    surfaceTexture.setDefaultBufferSize(bestSize.width, bestSize.height)
    Log.i(TAG, "Camera $cameraId selected, output size: ${bestSize.width}x${bestSize.height}")

    try {
      manager.openCamera(cameraId, object : CameraDevice.StateCallback() {
        override fun onOpened(camera: CameraDevice) {
          cameraDevice = camera
          Log.i(TAG, "Camera opened: $cameraId")
          createCaptureSession(camera, surfaceTexture, handler, context)
        }

        override fun onDisconnected(camera: CameraDevice) {
          Log.w(TAG, "Camera disconnected")
          camera.close()
          cameraDevice = null
        }

        override fun onError(camera: CameraDevice, error: Int) {
          Log.e(TAG, "Camera error: $error")
          camera.close()
          cameraDevice = null
          onCameraError?.invoke(RuntimeException("Camera2 error code=$error"))
        }
      }, handler)
    } catch (e: SecurityException) {
      onCameraError?.invoke(e)
    }
  }

  private fun createCaptureSession(
    camera: CameraDevice,
    surfaceTexture: SurfaceTexture,
    handler: Handler,
    context: Context? = null
  ) {
    val glSurface = Surface(surfaceTexture)
    val targets = listOf(glSurface)

    try {
      camera.createCaptureSession(targets, object : CameraCaptureSession.StateCallback() {
        override fun onConfigured(session: CameraCaptureSession) {
          captureSession = session

          val fpsRange = chooseBestFpsRange(context, camera.id)
          val request = camera.createCaptureRequest(CameraDevice.TEMPLATE_RECORD).apply {
            addTarget(glSurface)
            set(CaptureRequest.CONTROL_MODE, CameraMetadata.CONTROL_MODE_AUTO)
            set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_VIDEO)
            set(CaptureRequest.CONTROL_AE_MODE, CaptureRequest.CONTROL_AE_MODE_ON)
            set(CaptureRequest.CONTROL_AE_TARGET_FPS_RANGE, fpsRange)
          }

          try {
            session.setRepeatingRequest(request.build(), null, handler)
            Log.i(TAG, "Capture session configured with TEMPLATE_RECORD")
            onCameraOpened?.invoke()
          } catch (e: CameraAccessException) {
            Log.e(TAG, "setRepeatingRequest failed", e)
            onCameraError?.invoke(e)
          }
        }

        override fun onConfigureFailed(session: CameraCaptureSession) {
          Log.e(TAG, "Capture session configuration failed")
          onCameraError?.invoke(RuntimeException("CaptureSession configuration failed"))
        }
      }, handler)
    } catch (e: CameraAccessException) {
      Log.e(TAG, "createCaptureSession failed", e)
      onCameraError?.invoke(e)
    }
  }

  /** Close the camera device and capture session. */
  fun closeCamera() {
    try { captureSession?.close() } catch (_: Exception) {}
    captureSession = null
    try { cameraDevice?.close() } catch (_: Exception) {}
    cameraDevice = null
    currentCameraId = null
    Log.i(TAG, "Camera closed")
  }

  // ================================================================
  //  Camera selection helpers
  // ================================================================

  private fun chooseCameraId(manager: CameraManager, useFront: Boolean): String? {
    val targetLensFacing = if (useFront) {
      CameraCharacteristics.LENS_FACING_FRONT
    } else {
      CameraCharacteristics.LENS_FACING_BACK
    }

    for (id in manager.cameraIdList) {
      val chars = manager.getCameraCharacteristics(id)
      val facing = chars.get(CameraCharacteristics.LENS_FACING)
      if (facing == targetLensFacing) return id
    }

    // Fallback: return first available camera
    return manager.cameraIdList.firstOrNull()
  }

  /**
   * Pick the best output size from the camera's stream configuration map.
   * Prefers 1080×1920; falls back to the largest available ≤ 1920px tall.
   */
  private fun chooseBestSize(characteristics: CameraCharacteristics): Size {
    val map = characteristics.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)
      ?: return Size(1080, 1920)

    val sizes = map.getOutputSizes(SurfaceTexture::class.java) ?: return Size(1080, 1920)

    // Prefer exact 1080×1920
    sizes.find { it.width == 1080 && it.height == 1920 }?.let { return it }
    // Or 1920×1080 (landscape, will be rotated)
    sizes.find { it.width == 1920 && it.height == 1080 }?.let { return it }

    // Otherwise pick the largest that fits within 1920px on the longer side
    return sizes
      .filter { maxOf(it.width, it.height) <= 1920 }
      .maxByOrNull { it.width.toLong() * it.height.toLong() }
      ?: sizes.first()
  }

  /**
   * Pick the best FPS range from device capabilities.
   * Prefers [30,30], then any range containing 30, then the highest available.
   */
  private fun chooseBestFpsRange(context: Context?, cameraId: String): Range<Int> {
    val fallback = Range(24, 30)
    if (context == null) return fallback
    try {
      val mgr = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
      val chars = mgr.getCameraCharacteristics(cameraId)
      val ranges = chars.get(CameraCharacteristics.CONTROL_AE_AVAILABLE_TARGET_FPS_RANGES)
        ?: return fallback

      // 1. Exact [30,30]
      ranges.find { it.lower == 30 && it.upper == 30 }?.let {
        Log.i(TAG, "FPS range: [30,30]")
        return it
      }
      // 2. Any range whose upper is 30 (e.g. [15,30], [24,30])
      val containing30 = ranges.filter { it.upper == 30 }
        .maxByOrNull { it.lower }
      if (containing30 != null) {
        Log.i(TAG, "FPS range: [${containing30.lower},${containing30.upper}]")
        return containing30
      }
      // 3. Highest upper FPS
      val best = ranges.maxByOrNull { it.upper }
      if (best != null) {
        Log.i(TAG, "FPS range fallback: [${best.lower},${best.upper}]")
        return best
      }
    } catch (e: Exception) {
      Log.w(TAG, "Failed to query FPS ranges", e)
    }
    return fallback
  }
}
