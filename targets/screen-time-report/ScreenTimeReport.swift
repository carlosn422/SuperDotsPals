import DeviceActivity
import ExtensionKit
import SwiftUI

// Apple Screen Time usage for the Insights screen. Data stays inside this extension: it is only drawn here,
// never sent to MoodPals, React Native or Supabase.

extension DeviceActivityReport.Context {
  static let screenTime = Self("moodpals.screenTime")
}

@main
struct MoodPalsScreenTimeReport: DeviceActivityReportExtension {
  var body: some DeviceActivityReportScene {
    ScreenTimeReportScene { summary in ScreenTimeSummaryView(summary: summary) }
  }
}

struct ScreenTimeBucket: Identifiable {
  let id: Int
  let label: String
  var seconds: TimeInterval
}

struct ScreenTimeSummary {
  var period = "day"
  var total: TimeInterval = 0
  var previous: TimeInterval = 0
  var dailyAverage: TimeInterval = 0
  var buckets: [ScreenTimeBucket] = []
  /// Device activity in hours that overlap one of the child's Screen Break sessions (Day view only).
  var sessionHours: TimeInterval?
  var childName = ""
  var hasData = false
}

struct ScreenTimeReportScene: DeviceActivityReportScene {
  let context: DeviceActivityReport.Context = .screenTime
  let content: (ScreenTimeSummary) -> ScreenTimeSummaryView

  func makeConfiguration(representing data: DeviceActivityResults<DeviceActivityData>) async -> ScreenTimeSummary {
    // Written by the app (ScreenTimeReportView) right before it shows this report.
    let request = UserDefaults(suiteName: "group.com.superdotspals.wellnest")?.dictionary(forKey: "screenBreak.reportRequest") ?? [:]
    let period = request["period"] as? String ?? "day"
    let windows = (request["windows"] as? [[Double]] ?? []).compactMap { pair -> DateInterval? in
      guard pair.count == 2, pair[1] > pair[0] else { return nil }
      return DateInterval(start: Date(timeIntervalSince1970: pair[0]), end: Date(timeIntervalSince1970: pair[1]))
    }
    let calendar = Calendar.current
    var summary = ScreenTimeSummary(period: period, buckets: Self.emptyBuckets(period), childName: request["childName"] as? String ?? "")
    var start = (request["start"] as? Double).map { Date(timeIntervalSince1970: $0) }
    var sessionHours: TimeInterval = 0

    for await device in data {
      for await segment in device.activitySegments {
        let interval = segment.dateInterval
        let seconds = segment.totalActivityDuration
        // Without a request (shouldn't happen) the whole filter counts as the current period.
        if start == nil { start = interval.start }
        guard let currentStart = start else { continue }
        if interval.start < currentStart {
          summary.previous += seconds
          continue
        }
        summary.total += seconds
        if seconds > 0 { summary.hasData = true }
        if let index = Self.bucketIndex(period, date: interval.start, start: currentStart, calendar: calendar), summary.buckets.indices.contains(index) {
          summary.buckets[index].seconds += seconds
        }
        if period == "day", windows.contains(where: { $0.intersects(interval) && $0.intersection(with: interval)?.duration ?? 0 > 0 }) {
          sessionHours += seconds
        }
      }
    }
    if period == "day" && !windows.isEmpty { summary.sessionHours = sessionHours }
    if let currentStart = start {
      let end = min(Date(), (request["end"] as? Double).map { Date(timeIntervalSince1970: $0) } ?? Date())
      let days = max(1, Int(ceil(end.timeIntervalSince(currentStart) / 86400)))
      summary.dailyAverage = summary.total / Double(days)
    }
    return summary
  }

  static func emptyBuckets(_ period: String) -> [ScreenTimeBucket] {
    switch period {
    case "day": return (0..<24).map { ScreenTimeBucket(id: $0, label: $0 % 6 == 0 ? hourLabel($0) : "", seconds: 0) }
    case "week": return ["M", "T", "W", "T", "F", "S", "S"].enumerated().map { ScreenTimeBucket(id: $0.offset, label: $0.element, seconds: 0) }
    case "month": return (0..<5).map { ScreenTimeBucket(id: $0, label: "Wk \($0 + 1)", seconds: 0) }
    default: return ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"].enumerated().map { ScreenTimeBucket(id: $0.offset, label: $0.element, seconds: 0) }
    }
  }

  static func hourLabel(_ hour: Int) -> String {
    hour == 0 ? "12a" : hour < 12 ? "\(hour)a" : hour == 12 ? "12p" : "\(hour - 12)p"
  }

  static func bucketIndex(_ period: String, date: Date, start: Date, calendar: Calendar) -> Int? {
    switch period {
    case "day": return calendar.component(.hour, from: date)
    case "week": return calendar.dateComponents([.day], from: calendar.startOfDay(for: start), to: calendar.startOfDay(for: date)).day
    case "month": return (calendar.dateComponents([.day], from: calendar.startOfDay(for: start), to: calendar.startOfDay(for: date)).day ?? 0) / 7
    default: return calendar.component(.month, from: date) - 1
    }
  }
}

struct ScreenTimeSummaryView: View {
  let summary: ScreenTimeSummary
  @State private var selected: Int?
  private let ink = Color(red: 0x1D / 255, green: 0x2B / 255, blue: 0x33 / 255)
  private let muted = Color(red: 0x6E / 255, green: 0x7D / 255, blue: 0x86 / 255)
  private let green = Color(red: 0x34 / 255, green: 0xB3 / 255, blue: 0x7E / 255)
  private let soft = Color(red: 0xE4 / 255, green: 0xF6 / 255, blue: 0xEA / 255)

  private var previousLabel: String {
    switch summary.period {
    case "day": return "yesterday"
    case "week": return "last week"
    case "month": return "last month"
    default: return "last year"
    }
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text("TOTAL SCREEN USAGE").font(.system(size: 12, weight: .heavy)).foregroundColor(muted)
      if summary.hasData {
        Text(Self.format(summary.total)).font(.system(size: 30, weight: .heavy)).foregroundColor(ink)
        Text("Daily average \(Self.format(summary.dailyAverage))").font(.system(size: 13, weight: .semibold)).foregroundColor(ink)
        if summary.previous > 0 {
          let diff = summary.total - summary.previous
          let percent = Int((abs(diff) / summary.previous * 100).rounded())
          Text("\(diff >= 0 ? "+" : "−")\(Self.format(abs(diff))) (\(percent)%) vs \(previousLabel)")
            .font(.system(size: 13, weight: .semibold)).foregroundColor(muted)
        }
        chart
        if let id = selected, let bucket = summary.buckets.first(where: { $0.id == id }) {
          Text("\(Self.bucketName(summary.period, bucket)) · \(Self.format(bucket.seconds))").font(.system(size: 13, weight: .heavy)).foregroundColor(green)
        } else if let top = summary.buckets.max(by: { $0.seconds < $1.seconds }), top.seconds > 0, summary.period != "day" {
          Text("Highest: \(Self.bucketName(summary.period, top)) · \(Self.format(top.seconds))").font(.system(size: 12, weight: .semibold)).foregroundColor(ink)
        }
        if let hours = summary.sessionHours {
          Text("\(Self.format(hours)) in hours with \(summary.childName.isEmpty ? "a" : summary.childName + "'s") Screen Break session")
            .font(.system(size: 12, weight: .semibold)).foregroundColor(ink)
        }
      } else {
        Text("No Screen Time data from Apple for this period.").font(.system(size: 14, weight: .semibold)).foregroundColor(ink)
      }
      Text(summary.period == "year"
           ? "Device activity on this iPhone from Apple Screen Time, for everyone who used it. Apple keeps limited history, so earlier months may be missing."
           : "Device activity on this iPhone from Apple Screen Time, for everyone who used it. It can't tell who was holding the phone.")
        .font(.system(size: 11)).foregroundColor(muted).fixedSize(horizontal: false, vertical: true)
    }
    .padding(16)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(RoundedRectangle(cornerRadius: 20).fill(Color.white))
  }

  private var chart: some View {
    let peak = max(summary.buckets.map(\.seconds).max() ?? 0, 1)
    return HStack(alignment: .bottom, spacing: summary.period == "day" ? 2 : 6) {
      ForEach(summary.buckets) { bucket in
        VStack(spacing: 3) {
          RoundedRectangle(cornerRadius: 3)
            .fill(bucket.seconds > 0 ? (selected == nil || selected == bucket.id ? green : green.opacity(0.35)) : soft)
            .frame(height: max(3, CGFloat(bucket.seconds / peak) * 70))
          Text(bucket.label).font(.system(size: 9, weight: .bold)).foregroundColor(muted).lineLimit(1).fixedSize()
        }
        .frame(maxWidth: .infinity)
        .contentShape(Rectangle())
        .onTapGesture { selected = selected == bucket.id ? nil : bucket.id }
      }
    }
    .frame(height: 90, alignment: .bottom)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("Screen usage chart")
  }

  static func bucketName(_ period: String, _ bucket: ScreenTimeBucket) -> String {
    switch period {
    case "week": return ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][min(bucket.id, 6)]
    case "month": return "Week \(bucket.id + 1)"
    case "year": return Calendar.current.monthSymbols[min(bucket.id, 11)]
    default: return bucket.label
    }
  }

  static func format(_ seconds: TimeInterval) -> String {
    let minutes = Int((seconds / 60).rounded())
    if minutes < 60 { return "\(minutes)m" }
    return minutes % 60 == 0 ? "\(minutes / 60)h" : "\(minutes / 60)h \(minutes % 60)m"
  }
}
