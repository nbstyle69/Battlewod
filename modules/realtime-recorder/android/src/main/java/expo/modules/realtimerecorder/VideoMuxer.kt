package expo.modules.realtimerecorder

import android.media.MediaCodec
import android.media.MediaFormat
import android.media.MediaMuxer
import android.util.Log
import java.nio.ByteBuffer

/**
 * Thread-safe wrapper around [MediaMuxer].
 *
 * Tracks are added by the video and audio encoders on potentially different
 * threads. The muxer auto-starts once all expected tracks have been added.
 *
 * All public methods are synchronized on [lock].
 */
class VideoMuxer {

  companion object {
    private const val TAG = "VideoMuxer"
  }

  private val lock = Object()
  private var muxer: MediaMuxer? = null
  private var started = false
  private var expectedTracks = 1 // 1 = video only, 2 = video + audio
  private var addedTracks = 0

  var videoTrackIndex = -1; private set
  var audioTrackIndex = -1; private set

  /**
   * Create the muxer for the given output path.
   * @param hasAudio if true, the muxer waits for 2 tracks before starting.
   */
  fun initialize(path: String, hasAudio: Boolean) {
    synchronized(lock) {
      muxer = MediaMuxer(path, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
      started = false
      expectedTracks = if (hasAudio) 2 else 1
      addedTracks = 0
      videoTrackIndex = -1
      audioTrackIndex = -1
    }
    Log.i(TAG, "Initialized → $path (audio=$hasAudio)")
  }

  /** Add the video track. Returns the track index. */
  fun addVideoTrack(format: MediaFormat): Int {
    synchronized(lock) {
      videoTrackIndex = muxer?.addTrack(format) ?: -1
      addedTracks++
      maybeStartLocked()
      return videoTrackIndex
    }
  }

  /** Add the audio track. Returns the track index. */
  fun addAudioTrack(format: MediaFormat): Int {
    synchronized(lock) {
      audioTrackIndex = muxer?.addTrack(format) ?: -1
      addedTracks++
      maybeStartLocked()
      return audioTrackIndex
    }
  }

  fun isStarted(): Boolean {
    synchronized(lock) { return started }
  }

  /** Write encoded data to the specified track. */
  fun writeSampleData(trackIndex: Int, buffer: ByteBuffer, info: MediaCodec.BufferInfo) {
    synchronized(lock) {
      if (!started || trackIndex < 0) return
      try {
        muxer?.writeSampleData(trackIndex, buffer, info)
      } catch (e: Exception) {
        Log.w(TAG, "writeSampleData failed", e)
      }
    }
  }

  /** Stop and release the muxer. Safe to call multiple times. */
  fun stop() {
    synchronized(lock) {
      if (started) {
        try { muxer?.stop() } catch (e: Exception) { Log.w(TAG, "Muxer stop failed", e) }
      }
      try { muxer?.release() } catch (_: Exception) {}
      muxer = null
      started = false
      Log.i(TAG, "Stopped and released")
    }
  }

  // Must be called while holding lock
  private fun maybeStartLocked() {
    if (started) return
    if (addedTracks >= expectedTracks) {
      muxer?.start()
      started = true
      Log.i(TAG, "Muxer started (video=$videoTrackIndex, audio=$audioTrackIndex)")
    }
  }
}
