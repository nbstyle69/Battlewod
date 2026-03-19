Pod::Spec.new do |s|
  s.name           = 'RealtimeRecorder'
  s.version        = '1.0.0'
  s.summary        = 'Real-time video recorder with overlay burning on each frame'
  s.description    = 'Expo native module that records video with AVCaptureSession and burns timer/overlay graphics on each frame using Core Graphics before writing to AVAssetWriter.'
  s.homepage       = 'https://github.com/nbstyle69/Battlewod'
  s.license        = 'MIT'
  s.author         = 'NBS'
  s.platform       = :ios, '15.1'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.{h,m,mm,swift}'
  s.resource_bundles = { 'RealtimeRecorderResources' => ['Resources/**/*.{png,jpg,ttf}'] }
end
