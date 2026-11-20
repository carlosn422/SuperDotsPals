Pod::Spec.new do |s|
  s.name           = 'WatchLink'
  s.version        = '1.0.0'
  s.summary        = 'MoodPals Apple Watch link (WatchConnectivity) and Family Screen Break (Screen Time APIs)'
  s.description    = s.summary
  s.author         = 'MoodPals'
  s.homepage       = 'https://moodpals.com'
  s.license        = 'MIT'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks     = 'WatchConnectivity', 'FamilyControls', 'DeviceActivity', 'ManagedSettings', 'UserNotifications', 'SwiftUI'
  s.source_files   = '**/*.swift'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
