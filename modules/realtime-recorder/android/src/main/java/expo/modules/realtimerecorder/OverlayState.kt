package expo.modules.realtimerecorder

data class OverlayState(
  var timerType: String = "",
  var timerDisplay: String = "",
  var title: String = "",
  var timestamp: String = "",
  var isRecording: Boolean = false,
  var countdownValue: Int = 0,
  var showTimer: Boolean = false,
  var boxLogoUrl: String = "",
  var competitionLogoUrl: String = ""
)
