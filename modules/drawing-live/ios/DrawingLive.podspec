Pod::Spec.new do |s|
  s.name           = 'DrawingLive'
  s.version        = '1.0.0'
  s.summary        = 'Lets the MoodPals server start and update the Circle drawing Live Activity'
  s.description    = s.summary
  s.author         = 'MoodPals'
  s.homepage       = 'https://moodpals.com'
  s.license        = 'MIT'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks     = 'ActivityKit'
  s.source_files   = '**/*.swift'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
