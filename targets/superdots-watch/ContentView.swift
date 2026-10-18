import SwiftUI

struct ContentView: View {
 @EnvironmentObject var store: WatchStore
 @StateObject private var sync = WatchThemeSync()
 @Environment(\.scenePhase) private var scenePhase
 @State private var contentBottom: CGFloat = .greatestFiniteMagnitude
 private let purple = Color(red:0.47,green:0.38,blue:0.91)
 private let mascotSize: CGFloat = 105 // Joyful is the canonical mascot display size.

 var body: some View {
  NavigationStack {
   GeometryReader { viewport in
    ScrollView {
     VStack(spacing:14) {
     if !sync.connected {
      ProgressView().frame(width:mascotSize,height:mascotSize)
      wellnessTrack(score:nil)
      NavigationLink {WatchSyncView(sync:sync)} label: {
       Label("Connect Account",systemImage:"link").frame(maxWidth:.infinity)
      }.buttonStyle(.borderedProminent).tint(purple)
     } else {
      if sync.moodLoaded {
       AnimatedMoodMascot(mood:store.wellnessMood,size:mascotSize,isActive:scenePhase == .active)
      } else {
       ProgressView().frame(width:mascotSize,height:mascotSize)
      }
      VStack(spacing:2) {
       if let hrv=store.latestHRV, hrv.isFinite, hrv >= 0 {
        Text("HRV · \\(Int(hrv.rounded())) ms")
         .font(.headline).foregroundStyle(purple)
        if let measuredAt=store.hrvHistory.max(by: { $0.date < $1.date })?.date {
         Text("Last read \\(measuredAt, format:.dateTime.month(.abbreviated).day().hour().minute())")
          .font(.system(size:9)).foregroundStyle(.secondary)
        }
       }
      }
      if let score=store.strainScore {
       Text(store.strainLabel).font(.caption).foregroundStyle(.secondary)
       wellnessTrack(score:score)
      } else {
       wellnessTrack(score:nil)
      }
      Text("How are you feeling today?")
       .font(.headline).multilineTextAlignment(.center)
       .padding(.top,18)
      NavigationLink {WatchCheckIn(sync:sync)} label: {
       Label("Check In",systemImage:"heart.text.square.fill").frame(maxWidth:.infinity)
      }.buttonStyle(.borderedProminent).tint(purple)
      NavigationLink {WatchFavorites(sync:sync)} label: {Label("Favorite verses",systemImage:"book.closed.fill")}
      NavigationLink {WatchHealth()} label: {Label("Health snapshot",systemImage:"heart.fill")}
      NavigationLink {WatchJournal(sync:sync)} label: {Label("Quick journal",systemImage:"square.and.pencil")}
      NavigationLink {WatchMoodInsights(sync:sync)} label: {Label("Mood insights",systemImage:"chart.line.uptrend.xyaxis")}
      NavigationLink {WatchSyncView(sync:sync)} label: {
       Label("Account & sync",systemImage:"person.crop.circle")
      }
      Color.clear.frame(height:1)
       .background(GeometryReader { marker in
        Color.clear.preference(key:WatchContentBottomKey.self,
         value:marker.frame(in:.named("wellnessScroll")).maxY)
       })
     }
     }.padding(.horizontal,4)
    }
    .coordinateSpace(name:"wellnessScroll")
    .onPreferenceChange(WatchContentBottomKey.self) { contentBottom = $0 }
    .overlay(alignment:.bottom) {
     if sync.connected && contentBottom.isFinite && contentBottom > viewport.size.height + 5 {
      Image(systemName:"chevron.down")
       .font(.system(size:12,weight:.bold))
       .foregroundStyle(.white.opacity(0.85))
       .frame(maxWidth:.infinity)
       .frame(height:16)
       .offset(y:0)
       .allowsHitTesting(false)
       .accessibilityLabel("Scroll down for more options")
     }
    }
   }
   .navigationBarTitleDisplayMode(.inline)
  }
  .task {await sync.refresh(store:store)}
  .onChange(of:scenePhase) {_,phase in
   if phase == .active {Task {await sync.refresh(store:store)}}
  }
 }
 private func wellnessTrack(score:Double?) -> some View {
  GeometryReader { geometry in
   ZStack(alignment:.leading) {
    LinearGradient(colors:[.green,.cyan,.purple,.orange,.pink],startPoint:.leading,endPoint:.trailing)
     .frame(height:9).clipShape(Capsule())
    if let score {
     Circle().fill(.white).frame(width:14,height:14)
      .offset(x:max(0,(geometry.size.width-14)*min(100,max(0,score))/100))
    }
   }
  }.frame(height:16).padding(.bottom,16).offset(y:-9).accessibilityLabel(score == nil ? "Wellness meter awaiting data" : "Estimated wellness meter")
 }
}

private struct WatchContentBottomKey: PreferenceKey {
 static var defaultValue: CGFloat = .greatestFiniteMagnitude
 static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = nextValue() }
}
