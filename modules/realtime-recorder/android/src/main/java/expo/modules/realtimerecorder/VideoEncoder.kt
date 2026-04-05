package expo.modules.realtimerecorder

import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.util.Log
import android.view.Surface
import java.nio.ByteBuffer

/**
 * Wraps a MediaCodec H.264 hardware encoder configured for Surface input.
 *
 * The caller obtains [inputSurface] and renders GL frames onto it.
 * After each frame, call [drainOutput] to pull encoded NAL units and
 * forward them to the muxer.
 */
class VideoEncoder {

  companion object {
    private const val TAG = "VideoEncoder"
    private const val MIME = MediaFormat.MIMETYPE_VIDEO_AVC
  }

  private var encoder: MediaCodec? = null
  var inputSurface: Surface? = null; private set
  private var isStarted = false

  /**
   * Configure and prepare the encoder. Does NOT start it yet —
   * call [start] after creating the EGLSurface from [inputSurface].
   */
  fun configure(
    width: Int = 1080,
    height: Int = 1920,
    bitrate: Int = 10_000_000,
    fps: Int = 30,
    iFrameInterval: Int = 1
  ) {
    val format = MediaFormat.createVideoFormat(MIME, width, height).apply {
      setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
      setInteger(MediaFormat.KEY_BIT_RATE, bitrate)
      setInteger(MediaFormat.KEY_FRAME_RATE, fps)
      setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, iFrameInterval)
    }

    encoder = MediaCodec.createEncoderByType(MIME).apply {
      configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
    }

    inputSurface = encoder!!.createInputSurface()
    Log.i(TAG, "Configured ${width}x${height} @ ${bitrate / 1_000_000}Mbps, ${fps}fps")
  }

  fun start() {
    encoder?.start()
    isStarted = true
    Log.i(TAG, "Encoder started")
  }

  /**
   * Signal end of input stream. Must be called from the GL thread
   * (or after the last frame has been rendered to the input surface).
   */
  fun signalEndOfInputStream() {
    try {
      encoder?.signalEndOfInputStream()
    } catch (e: Exception) {
      Log.w(TAG, "signalEndOfInputStream failed", e)
    }
  }

  /**
   * Drain available output buffers from the encoder.
   *
   * @param endOfStream if true, blocks longer waiting for the EOS buffer.
   * @param onFormat called once when the encoder emits its output format (SPS/PPS).
   * @param onData called for each encoded access unit.
   */
  fun drainOutput(
    endOfStream: Boolean = false,
    onFormat: ((MediaFormat) -> Unit)? = null,
    onData: ((ByteBuffer, MediaCodec.BufferInfo) -> Unit)? = null
  ) {
    val enc = encoder ?: return
    val bufferInfo = MediaCodec.BufferInfo()
    val timeoutUs = if (endOfStream) 10_000L else 0L

    while (true) {
      val index = enc.dequeueOutputBuffer(bufferInfo, timeoutUs)
      when {
        index == MediaCodec.INFO_TRY_AGAIN_LATER -> break

        index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
          onFormat?.invoke(enc.outputFormat)
        }

        index >= 0 -> {
          val buffer = enc.getOutputBuffer(index) ?: run {
            enc.releaseOutputBuffer(index, false)
            continue
          }

          // Skip codec-config buffers (SPS/PPS are in the format)
          if (bufferInfo.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0) {
            bufferInfo.size = 0
          }

          if (bufferInfo.size > 0) {
            buffer.position(bufferInfo.offset)
            buffer.limit(bufferInfo.offset + bufferInfo.size)
            onData?.invoke(buffer, bufferInfo)
          }

          enc.releaseOutputBuffer(index, false)

          if (bufferInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) break
        }
      }
    }
  }

  fun stop() {
    if (isStarted) {
      try { encoder?.stop() } catch (_: Exception) {}
      isStarted = false
    }
  }

  fun release() {
    stop()
    try { inputSurface?.release() } catch (_: Exception) {}
    inputSurface = null
    try { encoder?.release() } catch (_: Exception) {}
    encoder = null
    Log.i(TAG, "Released")
  }
}
