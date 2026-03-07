package expo.modules.screenrecorder

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.MediaRecorder
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.IBinder
import android.view.WindowManager
import androidx.core.app.NotificationCompat

class ScreenRecorderService : Service() {

  private var mediaProjection: MediaProjection? = null
  private var mediaRecorder: MediaRecorder? = null
  private var virtualDisplay: VirtualDisplay? = null
  var outputPath: String? = null

  companion object {
    var instance: ScreenRecorderService? = null
    var resultCode: Int = 0
    var resultData: Intent? = null
    private const val CHANNEL_ID = "BattleWODRecorder"
    private const val NOTIFICATION_ID = 7001
  }

  override fun onCreate() {
    super.onCreate()
    instance = this
  }

  override fun onDestroy() {
    super.onDestroy()
    instance = null
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    createNotificationChannel()
    val notification = NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("BattleWOD")
      .setContentText("Enregistrement en cours…")
      .setSmallIcon(android.R.drawable.ic_menu_camera)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .build()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }

    startCapture()
    return START_NOT_STICKY
  }

  private fun startCapture() {
    val wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
    val width: Int
    val height: Int
    val dpi: Int

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      val bounds = wm.currentWindowMetrics.bounds
      width = bounds.width()
      height = bounds.height()
      dpi = resources.configuration.densityDpi
    } else {
      val metrics = android.util.DisplayMetrics()
      @Suppress("DEPRECATION")
      wm.defaultDisplay.getMetrics(metrics)
      width = metrics.widthPixels
      height = metrics.heightPixels
      dpi = metrics.densityDpi
    }

    outputPath = "${getExternalFilesDir(null)}/battlewod_${System.currentTimeMillis()}.mp4"

    mediaRecorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      MediaRecorder(this)
    } else {
      @Suppress("DEPRECATION")
      MediaRecorder()
    }

    mediaRecorder?.apply {
      setAudioSource(MediaRecorder.AudioSource.MIC)
      setVideoSource(MediaRecorder.VideoSource.SURFACE)
      setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
      setVideoEncoder(MediaRecorder.VideoEncoder.H264)
      setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
      setVideoSize(width, height)
      setVideoFrameRate(30)
      setVideoEncodingBitRate(5 * 1024 * 1024)
      setAudioSamplingRate(44100)
      setOutputFile(outputPath)
      prepare()
    }

    val mpManager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
    mediaProjection = mpManager.getMediaProjection(resultCode, resultData!!)

    virtualDisplay = mediaProjection?.createVirtualDisplay(
      "BattleWODScreen",
      width, height, dpi,
      DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
      mediaRecorder?.surface,
      null, null
    )

    mediaRecorder?.start()
  }

  fun stopCapture(): String? {
    try {
      mediaRecorder?.stop()
    } catch (e: RuntimeException) {
      outputPath = null
    }
    mediaRecorder?.release()
    mediaRecorder = null
    virtualDisplay?.release()
    virtualDisplay = null
    mediaProjection?.stop()
    mediaProjection = null

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
    stopSelf()
    return outputPath
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        CHANNEL_ID,
        "Enregistrement d'écran",
        NotificationManager.IMPORTANCE_LOW
      )
      getSystemService(NotificationManager::class.java)?.createNotificationChannel(channel)
    }
  }
}
