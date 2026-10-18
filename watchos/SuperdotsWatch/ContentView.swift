import SwiftUI

struct ContentView: View {
 @EnvironmentObject var store:WatchStore
 @StateObject private var sync=WatchThemeSync()
 @Environment(\.scenePhase) private var scenePhase
 private let purple=Color(red:0.43,green:0.32,blue:0.85)
 var body:some View {
  NavigationStack {
   ScrollView {
    VStack(spacing:10) {
     if !sync.connected {
      AnimatedMoodMascot(mood:"Calm",size:105,isActive:scenePhase == .active)
      NavigationLink {WatchSyncView(sync:sync)} label: {
       Label("Connect Account",systemImage:"link").frame(maxWidth:.infinity)
      }.buttonStyle(.borderedProminent).tint(purple)
     } else {
     AnimatedMoodMascot(mood:store.currentMood,size:88,isActive:scenePhase == .active)
     Text("How are you feeling today?").font(.headline).multilineTextAlignment(.center)
     NavigationLink {WatchCheckIn(sync:sync)} label: {
      Label("Check In",systemImage:"heart.text.square.fill").frame(maxWidth:.infinity)
     }.buttonStyle(.borderedProminent).tint(purple)
     NavigationLink {WatchFavorites(sync:sync)} label: {Label("Favorite verses",systemImage:"book.closed.fill")}
     NavigationLink {WatchHealth()} label: {Label("Health snapshot",systemImage:"heart.fill")}
     NavigationLink {WatchJournal(sync:sync)} label: {Label("Quick journal",systemImage:"square.and.pencil")}
     NavigationLink {WatchMoodInsights(sync:sync)} label: {Label("Mood insights",systemImage:"chart.line.uptrend.xyaxis")}
     if let hrv=store.latestHRV {
      Text("Latest HRV: \(Int(hrv.rounded())) ms").font(.caption2).foregroundStyle(.secondary)
     }
     NavigationLink {WatchSyncView(sync:sync)} label: {
      Label(sync.connected ? "Account & sync":"Connect account",systemImage:"person.crop.circle")
     }
     }
    }.padding(.horizontal,4)
   }
   .navigationBarTitleDisplayMode(.inline)
  }
  .task {
   await sync.refresh(store:store)
   // watchOS cannot rely on silent push for instant UI updates. Refresh only
   // while the home screen is active; stop automatically in the background.
   while !Task.isCancelled {
    try? await Task.sleep(for:.seconds(10))
    if Task.isCancelled {break}
    if scenePhase == .active {await sync.refreshMood(store:store)}
   }
  }
  .onChange(of:scenePhase) {_,phase in
   if phase == .active {Task {await sync.refresh(store:store)}}
  }
 }
}
