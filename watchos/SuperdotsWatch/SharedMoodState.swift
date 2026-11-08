import Foundation
import WidgetKit

/// Latest confirmed mood, shared by the watch app (writer) and its watch-face complications (reader)
/// through the watch App Group. Holds only what the complication renders: never tokens or account data.
/// Keep byte-identical copies in targets/stress-complication, targets/superdots-watch and watchos/SuperdotsWatch.
struct SharedMoodState: Codable, Equatable {
    let mood: String
    let updatedAt: Date
    /// Increases on every write; lets a backend read skip its result when a newer mood landed meanwhile.
    let version: Int
}

enum SharedMoodStore {
    static let appGroup = "group.com.superdotspals.wellnest.watch"
    /// Widget kinds in StressComplication.swift that draw the MoodPal.
    static let moodWidgetKinds = ["MoodPalsMoodComplication", "MoodPalsStressComplication"]
    /// A picked mood holds for an hour (StressEngine.ts); after that the MoodPal follows the latest stress score.
    static let manualHold: TimeInterval = 3600

    enum Condition: Equatable {
        /// Mood just confirmed by the backend from this watch.
        case always
        /// Delivered from elsewhere (iPhone): only when newer than the cached mood.
        case newer
        /// Backend read: only when nothing was written since the read started.
        case unchangedSince(version: Int)
    }

    private static let key = "sharedMoodState"
    private static let legacyMood = "currentMood"
    private static let legacyDate = "currentMoodUpdated"
    private static let healthKey = "healthMoodAt"
    private static var defaults: UserDefaults? { UserDefaults(suiteName: appGroup) }

    /// Last time the MoodPal was set to follow Apple Health (the iPhone's refresh on Today). Ends the hold on moods picked before it.
    static var healthAt: Date? { (defaults?.object(forKey: healthKey) as? Double).map { Date(timeIntervalSince1970: $0) } }

    /// Stores a newer follow-Apple-Health time and reloads the mood complications. Returns false when stale.
    @discardableResult
    static func followHealth(at date: Date) -> Bool {
        guard let d = defaults else { return false }
        if let current = healthAt, date <= current { return false }
        d.set(date.timeIntervalSince1970, forKey: healthKey)
        reloadWidgets()
        return true
    }

    static func load() -> SharedMoodState? {
        guard let d = defaults else { return nil }
        if let data = d.data(forKey: key), let state = try? JSONDecoder().decode(SharedMoodState.self, from: data) {
            return state
        }
        // Builds before SharedMoodState stored two loose keys.
        guard let mood = d.string(forKey: legacyMood), !mood.isEmpty else { return nil }
        return SharedMoodState(mood: MoodArt.canonical(mood), updatedAt: Date(timeIntervalSince1970: d.double(forKey: legacyDate)), version: 0)
    }

    static var version: Int { load()?.version ?? 0 }

    /// Stores the mood when `condition` allows it and asks WidgetKit to reload the mood complications.
    /// Returns the new state, or nil when the update was stale or unchanged.
    @discardableResult
    static func save(_ mood: String, at date: Date, if condition: Condition) -> SharedMoodState? {
        let mood = MoodArt.canonical(mood)
        guard !mood.isEmpty, let d = defaults else { return nil }
        let current = load()
        switch condition {
        case .always: break
        case .newer: if let current, date <= current.updatedAt { return nil }
        case .unchangedSince(let version): if (current?.version ?? 0) != version { return nil }
        }
        if let current, current.mood == mood, current.updatedAt == date { return nil }
        let next = SharedMoodState(mood: mood, updatedAt: date, version: (current?.version ?? 0) + 1)
        guard let data = try? JSONEncoder().encode(next) else { return nil }
        d.set(data, forKey: key)
        // Kept for builds that still read the loose keys.
        d.set(mood, forKey: legacyMood)
        d.set(date.timeIntervalSince1970, forKey: legacyDate)
        reloadWidgets()
        return next
    }

    static func clear() {
        for k in [key, legacyMood, legacyDate, healthKey] { defaults?.removeObject(forKey: k) }
        reloadWidgets()
    }

    static func reloadWidgets() {
        for kind in moodWidgetKinds { WidgetCenter.shared.reloadTimelines(ofKind: kind) }
    }

    static func isManual(_ setAt: Date, now: Date = Date()) -> Bool {
        if let healthAt, healthAt >= setAt { return false }
        return now.timeIntervalSince(setAt) < manualHold
    }

    /// The MoodPal to show: the picked mood for an hour, then the stress-based mood if a reading from the last day exists.
    static func display(manual: String, setAt: Date, stressScore: Int?, stressAt: Date?, now: Date = Date()) -> String {
        if isManual(setAt, now: now) { return manual }
        guard let stressScore, let stressAt, now.timeIntervalSince(stressAt) < 24 * 3600 else { return manual }
        return MoodArt.stressMood(stressScore)
    }
}

/// Mood names (watch picker, iPhone and older records) to the bundled MoodPal artwork.
enum MoodArt {
    /// Artwork family: joy, anger, fear, tired, sadness, or disgust (the green Calm MoodPal).
    static func emotion(_ mood: String) -> String {
        let value = mood.lowercased()
        if ["happy","good","great","joy","excited","proud"].contains(where: value.contains) { return "joy" }
        if ["anger","angry","stressed","frustrated","mad","irritated"].contains(where: value.contains) { return "anger" }
        if ["fear","anxious","stress","worried","nervous","overwhelmed"].contains(where: value.contains) { return "fear" }
        if ["tired","sleepy","exhausted","fatigued"].contains(where: value.contains) { return "tired" }
        if ["sad","down","depressed","lonely"].contains(where: value.contains) { return "sadness" }
        return "disgust"
    }

    /// Stored mood name; older rows saved the Calm artwork's name.
    static func canonical(_ mood: String) -> String {
        let trimmed = mood.trimmingCharacters(in: .whitespacesAndNewlines)
        return ["disgust", "disgusted"].contains(trimmed.lowercased()) ? "Calm" : trimmed
    }

    /// Same bands as StressEngine.ts STRESS_LEVELS.
    static func stressMood(_ score: Int) -> String {
        score < 35 ? "Calm" : score < 60 ? "Joyful" : score < 80 ? "Anxious" : "Angry"
    }
}

/// "Angry" stays the stored mood id (older apps and the server use it); it is shown as "Stressed".
enum MoodLabel {
    static func display(_ mood: String) -> String { mood.lowercased() == "angry" ? "Stressed" : mood }
}
