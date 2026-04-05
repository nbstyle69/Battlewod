package expo.modules.realtimerecorder

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log

/**
 * Foreground service that keeps the process alive during long recordings
 * (WODs can last 20+ minutes). Shows a persistent notification while
 * recording is in progress.
 *
 * Started by [VideoRecorderEngine.startRecording] and stopped by
 * [VideoRecorderEngine.stopRecording].
 */
class RecordingForegroundService : Service() {

  companion object {
    private const val TAG = "RecordingFgService"
    private const val CHANNEL_ID = "athlex_recording_channel"
    private const val NOTIFICATION_ID = 9001
  }

  override fun onCreate() {
    super.onCreate()
    createNotificationChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val notification = buildNotification()

    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
      Log.i(TAG, "Foreground service started")
    } catch (e: Exception) {
      Log.e(TAG, "startForeground failed", e)
    }

    return START_NOT_STICKY
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onDestroy() {
    Log.i(TAG, "Foreground service stopped")
    super.onDestroy()
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        CHANNEL_ID,
        "Enregistrement vidéo",
        NotificationManager.IMPORTANCE_LOW
      ).apply {
        description = "Notification affichée pendant l'enregistrement vidéo"
        setShowBadge(false)
      }

      val manager = getSystemService(NotificationManager::class.java)
      manager?.createNotificationChannel(channel)
    }
  }

  private fun buildNotification(): Notification {
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }

    return builder
      .setContentTitle("Enregistrement en cours")
      .setContentText("AthleX enregistre votre WOD")
      .setSmallIcon(android.R.drawable.ic_media_play)
      .setOngoing(true)
      .build()
  }
}
