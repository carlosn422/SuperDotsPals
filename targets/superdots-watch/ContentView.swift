import SwiftUI

struct ContentView: View {
 @EnvironmentObject var store: WatchStore
 @StateObject private var sync = WatchThemeSync()
 @Environment(\.scenePhase) private var scenePhase
 private let purple = Color(red:0.43,green:0.32,blue:0.85)
 private let mascotSize: CGFloat = 105 // Joyful is the canonical mascot display size.

 var body: some View {
  NavigationStack {
   ScrollView {
    VStack(spacing:10) {
     if !sync.connected {
      AnimatedMoodMascot(mood:"Calm",size:mascotSize,isActive:scenePhase == .active)
      NavigationLink {WatchSyncView(sync:sync)} label: {
       Label("Connect Account",systemImage:"link").frame(maxWidth:.infinity)
      }.buttonStyle(.borderedProminent).tint(purple)
     } else {
      AnimatedMoodMascot(mood:store.wellnessMood,size:mascotSize,isActive:scenePhase == .active)
      if let score=store.strainScore {
       VStack(spacing:5) {
        HStack {
         Text(store.strainLabel).font(.headline)
         Spacer()
         Text("Estimated strain").font(.system(size:10)).foregroundStyle(.secondary)
        }
        GeometryReader { geometry in
         ZStack(alignment:.leading) {
          LinearGradient(colors:[.green,.cyan,.purple,.orange,.pink],startPoint:.leading,endPoint:.trailing)
           .frame(height:9).clipShape(Capsule())
          Circle().fill(.white).frame(width:14,height:14)
           .shadow(radius:2)
           .offset(x:max(0,(geometry.size.width-14)*score/100))
         }
        }.frame(height:16)
        Text("Based on synced HRV and resting heart rate, not a stress diagnosis")
         .font(.system(size:9)).foregroundStyle(.secondary).multilineTextAlignment(.center)
       }.padding(8).background(.white.opacity(0.08),in:RoundedRectangle(cornerRadius:12))
      } else {
       Text("Wellness meter waiting for enough Apple Health history")
        .font(.caption2).foregroundStyle(.secondary).multilineTextAlignment(.center)
      }
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
       Label("Account & sync",systemImage:"person.crop.circle")
      }
     }
    }.padding(.horizontal,4)
   }
   .navigationBarTitleDisplayMode(.inline)
  }
  .task {await sync.refresh(store:store)}
  .onChange(of:scenePhase) {_,phase in
   if phase == .active {Task {await sync.refresh(store:store)}}
  }
 }
}
