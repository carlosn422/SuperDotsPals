import SwiftUI

private let violet=Color(red:0.47,green:0.38,blue:0.91)
private let moodNames=["Joyful","Calm","Sad","Angry","Anxious","Tired"]
private func displayMood(_ value:String) -> String {
 let mood=value.trimmingCharacters(in:.whitespacesAndNewlines)
 return mood.lowercased()=="disgust" || mood.lowercased()=="disgusted" ? "Calm" : mood
}

struct WatchCheckIn:View {
 @ObservedObject var sync:WatchThemeSync
 @EnvironmentObject var store:WatchStore
 @Environment(\.dismiss) private var dismiss
 @State private var isFavoriteSaved=false
 @State private var savingFavorite=false
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
     Text("Connect your MoodPals account first to save a check-in.").font(.caption)
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
      Text(question)
       .font(.system(size:16,weight:.semibold))
       .foregroundStyle(.white)
       .multilineTextAlignment(.center)
       .fixedSize(horizontal:false,vertical:true)
       .frame(maxWidth:.infinity)
       .padding(.horizontal,6)
       .padding(.bottom,5)
      ForEach((q["choices"] as? [String] ?? [])+["Prefer not to say"],id:\.self){choice in
       Button {
        answers[question]=choice
        if index+1<questions.count {index+=1} else {Task {await finish()}}
       } label:{
        Text(choice)
         .font(.system(size:15,weight:.semibold))
         .foregroundStyle(.white)
         .multilineTextAlignment(.leading)
         .fixedSize(horizontal:false,vertical:true)
         .frame(maxWidth:.infinity,minHeight:30,alignment:.leading)
         .padding(.horizontal,13)
         .padding(.vertical,10)
         .background(Color(red:0.24,green:0.16,blue:0.39),in:RoundedRectangle(cornerRadius:14))
       }
       .buttonStyle(.plain)
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
      Button {
       Task {await save(passage)}
      } label: {
       Label(isFavoriteSaved ? "Saved favorite" : "Save favorite",
             systemImage:isFavoriteSaved ? "heart.fill" : "heart")
      }
      .tint(isFavoriteSaved ? .pink : violet)
      .disabled(isFavoriteSaved || savingFavorite)
     }
     Button("Close"){dismiss()}
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
   if questions.isEmpty { throw NSError(domain:"MoodPals",code:1,userInfo:[NSLocalizedDescriptionKey:"No questions available"]) }
   answers=[:];index=0;phase=1
  }catch {errorMessage=error.localizedDescription}
  loading=false
 }
 private func finish() async {
  loading=true;errorMessage=""
  do {
   try await sync.submitMood(mood,answers:answers,store:store)
   result=try await sync.recommend(for:mood,answers:answers)
   isFavoriteSaved=false
   phase=2
  }catch {errorMessage=error.localizedDescription}
  loading=false
 }
 private func save(_ p:[String:Any]) async {
  guard let id=p["id"] as? Int, !isFavoriteSaved, !savingFavorite else {return}
  savingFavorite=true
  defer {savingFavorite=false}
  do {try await sync.saveVerse(id);isFavoriteSaved=true;errorMessage=""}
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
   metric("Steps",store.latestSteps.map{String(Int($0.rounded()))})
   metric("Sleep",store.latestSleepMinutes.map{String(Int($0.rounded()))+" min"})
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
 @State private var selectedDate=Date()
 @State private var showingCalendar=false
 private let calendar=Calendar.current

 private var dailyEntries:[[String:Any]] {
  entries.filter { entry in
   guard let raw=entry["occurred_at"] as? String,
         let date=parseDate(raw) else {return false}
   return calendar.isDate(date,inSameDayAs:selectedDate)
  }
 }
 private func parseDate(_ text:String)->Date? {
  let fractional=ISO8601DateFormatter()
  fractional.formatOptions=[.withInternetDateTime,.withFractionalSeconds]
  if let date=fractional.date(from:text) {return date}
  let plain=ISO8601DateFormatter()
  return plain.date(from:text)
 }
 private var isToday:Bool {calendar.isDateInToday(selectedDate)}

 var body:some View {
  ScrollView(.vertical) {
   VStack(alignment:.leading,spacing:10) {
    HStack {
     Text(isToday ? "Today" : selectedDate.formatted(.dateTime.month(.abbreviated).day()))
      .font(.headline)
     Spacer(minLength:3)
     Button { showingCalendar.toggle() } label: {
      Image(systemName:"calendar")
       .font(.system(size:15,weight:.semibold))
       .foregroundStyle(.white)
     }
     .buttonStyle(.plain)
     .accessibilityLabel("Choose a date")
    }
    Text("Swipe sideways to choose a date")
     .font(.system(size:10)).foregroundStyle(.secondary)
    if showingCalendar {
     DatePicker("View date",selection:$selectedDate,in:...Date(),displayedComponents:.date)
      .datePickerStyle(.wheel)
      .labelsHidden()
      .tint(violet)
     Button("Done"){showingCalendar=false}
      .font(.caption2)
    }
    if dailyEntries.isEmpty {
     Text(message.isEmpty ? "No feelings recorded for this day." : message)
      .font(.caption).foregroundStyle(.secondary)
      .fixedSize(horizontal:false,vertical:true)
    }
    ForEach(Array(dailyEntries.enumerated()),id:\.offset){_,entry in
     HStack(spacing:9) {
      AnimatedMoodMascot(mood:displayMood(entry["mood"] as? String ?? "Calm"),size:34,isActive:false)
      Text(displayMood(entry["mood"] as? String ?? "Mood"))
       .font(.system(size:14,weight:.medium))
       .fixedSize(horizontal:false,vertical:true)
      Spacer(minLength:2)
      if let raw=entry["occurred_at"] as? String,let date=parseDate(raw) {
       Text(date,format:.dateTime.hour().minute())
        .font(.system(size:9)).foregroundStyle(.secondary)
      }
     }
     .padding(.vertical,3)
    }
   }
   .padding(.horizontal,5)
  }
  .simultaneousGesture(DragGesture(minimumDistance:28).onEnded { motion in
   if abs(motion.translation.width)>55 &&
      abs(motion.translation.width)>abs(motion.translation.height)*1.5 {
    showingCalendar=true
   }
  })
  .navigationTitle("Insights")
  .task {
   do {entries=try await sync.moodHistory()}
   catch {message=error.localizedDescription}
  }
 }
}
