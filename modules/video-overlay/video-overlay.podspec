Pod::Spec.new do |s|
  s.name           = 'video-overlay'
  s.version        = '1.0.0'
  s.summary        = 'Native video overlay module for burning timer/countdown overlays into videos'
  s.description    = 'Expo module that burns timer, countdown, title and watermark overlays into recorded videos using AVFoundation.'
  s.homepage       = 'https://github.com/nbstyle69/Battlewod'
  s.license        = 'MIT'
  s.author         = 'NBS'
  s.platform       = :ios, '15.1'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = 'ios/**/*.{h,m,mm,swift}'
end
