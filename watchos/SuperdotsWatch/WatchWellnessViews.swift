import SwiftUI

private let violet=Color(red:0.43,green:0.32,blue:0.85)
private let moodNames=["Joyful","Calm","Sad","Angry","Anxious","Tired"]

struct WatchCheckIn:View {
 @ObservedObject var sync:WatchThemeSync
 @EnvironmentObject var store:WatchStore
 @State private var mood=""
 @State private var questions:[[String:Any]]=[]
 @State private var answers:[String:String]=[:]
 @State private var index=0
 @State private var phase=0
 @State private var loading=false
 @State private var errorMessage=""
 @State private var result:[String:Any]=[:]
 var body:some View {
  ScrollView {
   VStack(spacing:10) {
    if !sync.connected {
     Text("Connect your Superdots account first to save a check-in.").font(.caption)
    } else if phase==0 {
     Text("How do you feel?").font(.headline)
     LazyVGrid(columns:[GridItem(.flexible()),GridItem(.flexible())],spacing:7) {
      ForEach(moodNames,id:\.self){m in
       Button {mood=m;Task {await loadQuestions()}} label:{
        VStack(spacing:2) {
         AnimatedMoodMascot(mood:m,size:48)
         Text(m).font(.caption2)
        }.padding(4).frame(maxWidth:.infinity)
       }.buttonStyle(.plain).background(mood==m ? violet.opacity(0.4):Color.white.opacity(0.1),in:RoundedRectangle(cornerRadius:10))
      }
     }
    } else if phase==1 {
     AnimatedMoodMascot(mood:mood,size:65)
     Text("Question \(index+1) of \(questions.count)").font(.caption2).foregroundStyle(.secondary)
     if questions.indices.contains(index) {
      let q=questions[index]
      let question=q["question"] as? String ?? "How are you feeling?"
      Text(question).font(.headline).multilineTextAlignment(.center)
      ForEach((q["choices"] as? [String] ?? [])+["Prefer not to say"],id:\.self){choice in
       Button {
        answers[question]=choice
        if index+1<questions.count {index+=1} else {Task {await finish()}}
       } label:{Text(choice).font(.caption).frame(maxWidth:.infinity,alignment:.leading)}
      }
     }
     Button("Skip to verse"){Task {await finish()}}.font(.caption2)
    } else if phase==2 {
     Text("A verse for you").font(.headline)
     AnimatedMoodMascot(mood:mood,size:65)
     if let passage=result["passage"] as? [String:Any] {
      Text(passage["reference"] as? String ?? "").font(.headline).foregroundStyle(violet)
      Text(passage["verse_text"] as? String ?? "").font(.caption)
      Text(result["reflection"] as? String ?? "").font(.caption2).foregroundStyle(.secondary)
      Button("♡ Save favorite"){Task {await save(passage)}}.tint(violet)
     }
     Button("New check-in"){phase=0;index=0;answers=[:];result=[:]}
    }
    if loading {ProgressView("Finding encouragement…").font(.caption2)}
    if !errorMessage.isEmpty {Text(errorMessage).font(.caption2).foregroundStyle(.orange)}
   }.padding(.horizontal,4)
  }.navigationTitle("Check in")
 }
 private func loadQuestions() async {
  loading=true;errorMessage=""
  do {
   questions=try await sync.questions(for:mood)
   if questions.isEmpty { throw NSError(domain:"Superdots",code:1,userInfo:[NSLocalizedDescriptionKey:"No questions available"]) }
   answers=[:];index=0;phase=1
  }catch {errorMessage=error.localizedDescription}
  loading=false
 }
 private func finish() async {
  loading=true;errorMessage=""
  do {
   try await sync.submitMood(mood,answers:answers,store:store)
   result=try await sync.recommend(for:mood,answers:answers)
   phase=2
  }catch {errorMessage=error.localizedDescription}
  loading=false
 }
 private func save(_ p:[String:Any]) async {
  guard let id=p["id"] as? Int else {return}
  do {try await sync.saveVerse(id);errorMessage="Saved to favorites"}
  catch {errorMessage=error.localizedDescription}
 }
}

struct WatchFavorites:View {
 @ObservedObject var sync:WatchThemeSync
 @State private var verses:[[String:Any]]=[]
 @State private var status=""
 var body:some View {
  ScrollView {VStack(alignment:.leading,spacing:10) {
   Text("Saved Scripture").font(.headline)
   if verses.isEmpty {Text(status.isEmpty ? "No favorites saved yet.":"\(status)").font(.caption)}
   ForEach(Array(verses.enumerated()),id:\.offset){_,row in
    if let verse=row["scripture_passages"] as? [String:Any] {
     VStack(alignment:.leading,spacing:4) {
      Text(verse["reference"] as? String ?? "").font(.headline).foregroundStyle(violet)
      Text(verse["verse_text"] as? String ?? "").font(.caption)
     }.padding(10).background(.white.opacity(0.08),in:RoundedRectangle(cornerRadius:12))
    }
   }
  }}.navigationTitle("Favorites")
  .task {do {verses=try await sync.savedVerses()}catch{status=error.localizedDescription}}
 }
}

struct WatchHealth:View {
 @EnvironmentObject var store:WatchStore
 var body:some View {
  ScrollView {VStack(spacing:10) {
   Text("Your health").font(.headline)
   metric("HRV",store.latestHRV.map{String(Int($0.rounded()))+" ms"})
   metric("Resting heart rate",store.latestRestingHeartRate.map{String(Int($0.rounded()))+" bpm"})
   Text("Synced measurements from your iPhone's Apple Health. Missing data is not estimated.").font(.caption2).foregroundStyle(.secondary)
  }}.navigationTitle("Health")
 }
 private func metric(_ title:String,_ value:String?)->some View {
  HStack {Text(title).font(.caption);Spacer();Text(value ?? "No data").font(.caption).bold()}
   .padding(10).background(.white.opacity(0.08),in:RoundedRectangle(cornerRadius:12))
 }
}

struct WatchJournal:View {
 @ObservedObject var sync:WatchThemeSync
 @State private var note=""
 @State private var status=""
 var body:some View {
  ScrollView {VStack(spacing:9){
   Text("Quick journal").font(.headline)
   TextField("What's on your mind?",text:$note,axis:.vertical).lineLimit(3...6)
   Button("Save reflection"){Task {
    do {try await sync.journal(note);note="";status="Saved privately"}
    catch {status=error.localizedDescription}
   }}.disabled(note.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty)
   Text(status).font(.caption2).foregroundStyle(.secondary)
  }}.navigationTitle("Journal")
 }
}

struct WatchMoodInsights:View {
 @ObservedObject var sync:WatchThemeSync
 @State private var entries:[[String:Any]]=[]
 @State private var message=""
 var body:some View {
  ScrollView {VStack(alignment:.leading,spacing:8) {
   Text("Recent feelings").font(.headline)
   if entries.isEmpty {Text(message.isEmpty ? "No check-ins yet":message).font(.caption)}
   ForEach(Array(entries.enumerated()),id:\.offset){_,entry in
    HStack {
     AnimatedMoodMascot(mood:entry["mood"] as? String ?? "Calm",size:32,isActive:false)
     Text(entry["mood"] as? String ?? "Mood").font(.caption)
     Spacer()
     Text(String((entry["occurred_at"] as? String ?? "").prefix(10))).font(.system(size:9)).foregroundStyle(.secondary)
    }
   }
  }}.navigationTitle("Insights").task {
   do{entries=try await sync.moodHistory()}catch{message=error.localizedDescription}
  }
 }
}
