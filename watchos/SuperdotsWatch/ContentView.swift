import SwiftUI

/// The watch app's mascot-first home. A true system watch face requires
/// Apple's watch-face/complication APIs and cannot be replaced by a third-party app.
struct ContentView: View {
 @EnvironmentObject private var store: WatchStore
 @StateObject private var sync = WatchThemeSync()
 @Environment(\.scenePhase) private var scenePhase
 @State private var choosingMood = false
 @State private var savingMood = false
 @State private var moodError: String?
 private let purple = Color(red:0.43,green:0.32,blue:0.85)
 private let moods = ["Joyful","Angry","Anxious","Sad","Tired","Disgusted"]

 var body: some View {
  NavigationStack {
   VStack(spacing:8) {
    if !sync.connected {
     Spacer(minLength:4)
     AnimatedMoodMascot(mood:"Joyful",size:120,isActive:scenePhase == .active)
     NavigationLink { WatchSyncView(sync:sync) } label: {
      Label("Connect Account",systemImage:"link").frame(maxWidth:.infinity)
     }.buttonStyle(.borderedProminent).tint(purple)
     Spacer(minLength:4)
    } else {
     Spacer(minLength:2)
     if !choosingMood {
      Button { withAnimation(.easeInOut(duration:0.2)) {choosingMood = true} } label: {
       AnimatedMoodMascot(mood:store.currentMood,size:132,isActive:scenePhase == .active)
      }
      .buttonStyle(.plain)
      .accessibilityLabel("Change mood. Current mood: \(store.currentMood)")
      .accessibilityHint("Double tap to choose a mood")
     } else {
      ScrollView(.horizontal) {
       HStack(spacing:10) {
        ForEach(moods,id:\.self) { mood in
         Button {Task {await choose(mood)}} label: {
          AnimatedMoodMascot(mood:mood,size:74,isActive:scenePhase == .active)
           .padding(3)
           .background(store.currentMood == mood ? purple.opacity(0.3) : Color.clear,
                       in:RoundedRectangle(cornerRadius:14))
         }
         .buttonStyle(.plain)
         .accessibilityLabel(mood)
         .disabled(savingMood)
        }
       }
      }
      .scrollIndicators(.hidden)
      Button("Cancel") {withAnimation {choosingMood = false}}
       .font(.caption2).buttonStyle(.plain).foregroundStyle(.secondary)
     }
     if savingMood { ProgressView().controlSize(.small) }
     if let moodError {
      Text(moodError).font(.caption2).foregroundStyle(.red).multilineTextAlignment(.center)
     }
     Spacer(minLength:2)
    }
   }
   .padding(.horizontal,8)
   .navigationBarTitleDisplayMode(.inline)
  }
  .task {
   await sync.refresh(store:store)
   while !Task.isCancelled {
    try? await Task.sleep(for:.seconds(10))
    if Task.isCancelled {break}
    if scenePhase == .active && !savingMood {await sync.refreshMood(store:store)}
   }
  }
  .onChange(of:scenePhase) {_,phase in
   if phase == .active {Task {await sync.refresh(store:store)}}
  }
 }
 private func choose(_ mood:String) async {
  guard !savingMood else {return}
  savingMood=true
  moodError=nil
  do {
   try await sync.submitMood(mood,store:store)
   withAnimation {choosingMood=false}
  } catch {
   moodError="Unable to save mood. Try again."
  }
  savingMood=false
 }
}
