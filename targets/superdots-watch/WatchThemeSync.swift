import SwiftUI
import Security
import WatchKit

/// Authenticated direct sync for the standalone watchOS prototype.
/// The publishable key is public; tokens are stored in the user's Keychain.
@MainActor
final class WatchThemeSync: ObservableObject {
    static let shared = WatchThemeSync()
    @Published var connected = false
    @Published var busy = false
    @Published var moodLoaded = false
    @Published var sessionVerified = false
    @Published var needsReconnect = false
    @Published var syncWarning: String? = nil
    @Published var message = "Connect your account to sync mood and health readings."
    private let base = URL(string: "https://hzoauxxpvrgahlavxmvp.supabase.co")!
    private let publishableKey = "sb_publishable_pPPqosRo1SqwrbW-8MWURA_UxTED6Vs"
    private var accessToken = ""
    private var refreshToken = ""
    private var userId = ""

    init() {
        accessToken = secret("watch_access") ?? ""
        refreshToken = secret("watch_refresh") ?? ""
        userId = secret("watch_user") ?? ""
        pairingId = secret("watch_pairing_id") ?? ""
        connected = !refreshToken.isEmpty && !userId.isEmpty
    }

    func signIn(email: String, password: String, store: WatchStore) async {
        busy = true
        defer { busy = false }
        do {
            let payload = try JSONSerialization.data(withJSONObject: ["email":email,"password":password])
            let response = try await request("/auth/v1/token?grant_type=password",method:"POST",body:payload,authenticated:false)
            try loadSession(response)
            connected = true
            message = "Connected to MoodPals."
            await refresh(store:store)
        } catch { message = "Sign-in failed: \(error.localizedDescription)" }
    }

    func refresh(store: WatchStore) async {
        guard connected, !busy else { return }
        busy = true
        defer { busy = false }
        syncWarning = nil
        // Auth success is independent of journal, health or pairing API health.
        do {
            try await renewIfNeeded()
            let profile = try await request("/auth/v1/user",method:"GET")
            let identity = try JSONSerialization.jsonObject(with:profile) as? [String:Any]
            guard let verifiedID = identity?["id"] as? String, verifiedID == userId else {
                throw SyncError.badResponse
            }
            sessionVerified = true
            needsReconnect = false
        } catch {
            sessionVerified = false
            if case SyncError.server(let status, let endpoint, let detail) = error,
               endpoint.contains("/auth/v1/token"),
               (status == 400 || status == 401),
               (detail.contains("refresh_token_not_found") || detail.contains("invalid_grant") || detail.contains("Invalid Refresh Token")) {
                needsReconnect = true
                connected = false
                message = "Session expired. Reconnect using a new QR code."
                NSLog("[WatchSync] Stored refresh token expired; new pairing required")
                return
            }
            syncWarning = "Account verification failed: \(error.localizedDescription)"
            message = syncWarning ?? "Account verification failed"
            NSLog("[WatchSync] Auth verification failed: %@", error.localizedDescription)
            return
        }
        if !pairingId.isEmpty {
            do {
                let body = try JSONSerialization.data(withJSONObject:["action":"status","id":pairingId])
                let statusData = try await request("/functions/v1/watch-pairing",method:"POST",body:body)
                let status = try JSONSerialization.jsonObject(with:statusData) as? [String:Any]
                if status?["active"] as? Bool == false {
                    // Only an explicit inactive response is a revocation.
                    signOut()
                    message = "This watch was disconnected from your iPhone."
                    return
                }
            } catch {
                NSLog("[WatchSync] Pairing status unavailable: %@", error.localizedDescription)
                syncWarning = "Pairing check: \(error.localizedDescription)"
            }
        }
        do {
            let data = try await request("/rest/v1/wellness_journal?select=mood,occurred_at&user_id=eq.\(userId)&mood=not.is.null&order=occurred_at.desc&limit=1",method:"GET")
            let rows = try JSONSerialization.jsonObject(with:data) as? [[String:Any]] ?? []
            let savedMood = (rows.first?["mood"] as? String) ?? store.currentMood
            NSLog("[WatchSync] Latest mood from account: %@", savedMood)
            store.currentMood = ["disgust","disgusted"].contains(savedMood.lowercased()) ? "Calm" : savedMood
            moodLoaded = true
        } catch {
            NSLog("[WatchSync] Mood sync failed: %@", error.localizedDescription)
            syncWarning = [syncWarning, "Mood: \(error.localizedDescription)"].compactMap{$0}.joined(separator:"; ")
        }
        do {
            let data = try await request("/rest/v1/user_settings?select=watch_theme&user_id=eq.\(userId)&limit=1",method:"GET")
            let rows = try JSONSerialization.jsonObject(with:data) as? [[String:Any]] ?? []
            if let id = rows.first?["watch_theme"] as? String, id != store.theme.id { store.applyTheme(id) }
        } catch {
            NSLog("[WatchSync] Theme sync failed: %@", error.localizedDescription)
        }
        do {
                let healthData = try await request("/rest/v1/wellness_readings?select=metric,value,recorded_at&user_id=eq.\(userId)&source=eq.healthkit&metric=in.(hrv,resting_heart_rate,steps,sleep_minutes)&order=recorded_at.desc&limit=500",method:"GET")
                let healthRows = try JSONSerialization.jsonObject(with:healthData) as? [[String:Any]] ?? []
                store.hrvHistory = []
                store.restingHeartHistory = []
                store.latestHRV = nil
                store.latestRestingHeartRate = nil
                store.latestSteps = nil
                store.latestSleepMinutes = nil
                for reading in healthRows {
                    guard let metric = reading["metric"] as? String else { continue }
                    let raw = reading["value"]
                    let number = (raw as? NSNumber)?.doubleValue ?? Double(String(describing: raw ?? ""))
                    guard let number else { continue }
                    if let dateText = reading["recorded_at"] as? String {
                        let formatter = ISO8601DateFormatter()
                        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
                        let timestamp = formatter.date(from: dateText)
                            ?? ISO8601DateFormatter().date(from: dateText)
                        if let date = timestamp {
                            if metric == "hrv" { store.hrvHistory.append((value:number,date:date)) }
                            if metric == "resting_heart_rate" { store.restingHeartHistory.append((value:number,date:date)) }
                        }
                    }
                    if metric == "hrv" && store.latestHRV == nil { store.latestHRV = number }
                    if metric == "resting_heart_rate" && store.latestRestingHeartRate == nil { store.latestRestingHeartRate = number }
                    if metric == "steps" && store.latestSteps == nil { store.latestSteps = number }
                    if metric == "sleep_minutes" && store.latestSleepMinutes == nil { store.latestSleepMinutes = number }
                }
                // Apple Watch keeps only about a week of HealthKit history, so the 21-day baseline
                // also uses the iPhone's synced HealthKit readings.
                WatchStressStore.saveHistory(hrv: store.hrvHistory.map { HealthPoint(value: $0.value, date: $0.date) },
                                             rhr: store.restingHeartHistory.map { HealthPoint(value: $0.value, date: $0.date) })
    
        } catch {
            NSLog("[WatchSync] Health sync failed: %@", error.localizedDescription)
            syncWarning = [syncWarning, "Health: \(error.localizedDescription)"].compactMap{$0}.joined(separator:"; ")
        }
        do {
            // Latest iPhone-computed (or previously uploaded watch) score; the newest reading wins.
            let data = try await request("/rest/v1/wellness_readings?select=value,recorded_at&user_id=eq.\(userId)&source=eq.computed&metric=eq.stress_score&order=recorded_at.desc&limit=1",method:"GET")
            let rows = try JSONSerialization.jsonObject(with:data) as? [[String:Any]] ?? []
            if let row = rows.first, let text = row["recorded_at"] as? String, let at = Self.parseDate(text) {
                let raw = row["value"]
                if let value = (raw as? NSNumber)?.doubleValue ?? Double(String(describing: raw ?? "")) {
                    WatchStressStore.offer(StressReading(score: Int(value.rounded()), at: at, source: .iphone))
                }
            }
        } catch {
            NSLog("[WatchSync] Stress sync failed: %@", error.localizedDescription)
        }
        await HealthStressMonitor.shared.recompute(upload: true)
        store.reloadStress()
        message = syncWarning.map { "Account verified. Sync issue: \($0)" } ?? "Connected and synced: \(store.currentMood)."
    }

    func signOut() {
        for key in ["watch_access","watch_refresh","watch_user","watch_pairing_id"] { storeSecret(nil,for:key) }
        accessToken = ""; refreshToken = ""; userId = ""; pairingId = ""; pairingSecret = ""; pairingURL = ""; pairingActive = false; pairingConnecting = false; connected = false; moodLoaded = false; sessionVerified = false; needsReconnect = false; syncWarning = nil
        message = "Disconnected. Your watch will show local defaults."
    }

    // All requests use the current watch user's token; Supabase RLS restricts records.
    func submitMood(_ mood:String, answers:[String:String] = [:], store:WatchStore) async throws {
        try await renewIfNeeded()
        let payload = try JSONSerialization.data(withJSONObject:[
            "user_id":userId, "entry_type":"reflection", "body":"Watch mood check-in",
            "mood":mood, "reflection_answers":answers, "stress_factors":[]] as [String:Any])
        _ = try await request("/rest/v1/wellness_journal", method:"POST", body:payload)
        store.currentMood = mood
        moodLoaded = true
    }

    /// Saves a theme picked on the watch so the iPhone shows the same choice.
    func saveTheme(_ id: String) async throws {
        guard connected, !userId.isEmpty else { return }
        try await renewIfNeeded()
        let payload = try JSONSerialization.data(withJSONObject: ["watch_theme": id])
        _ = try await request("/rest/v1/user_settings?user_id=eq.\(userId)", method: "PATCH", body: payload)
    }

    /// Uploads a watch-computed score as a `computed` stress_score row. Idempotent via source_record_key.
    func uploadStress(score:Int, at:Date, key:String) async {
        guard connected, !userId.isEmpty, !refreshToken.isEmpty else { return }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let row:[String:Any] = ["user_id":userId,"metric":"stress_score","value":score,"source":"computed",
                                "source_record_key":key,"recorded_at":formatter.string(from:at)]
        let path = "/rest/v1/wellness_readings?on_conflict=user_id,source,metric,source_record_key"
        let headers = ["Prefer":"resolution=ignore-duplicates,return=minimal"]
        do {
            let body = try JSONSerialization.data(withJSONObject:[row])
            do { _ = try await request(path,method:"POST",body:body,extraHeaders:headers) }
            catch SyncError.server(401, _, _) {
                try await renewIfNeeded()
                _ = try await request(path,method:"POST",body:body,extraHeaders:headers)
            }
            NSLog("[WatchSync] Uploaded stress_score %ld (%@)", score, key)
        } catch {
            NSLog("[WatchSync] Stress upload failed: %@", error.localizedDescription)
        }
    }

    static func parseDate(_ text:String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from:text) ?? ISO8601DateFormatter().date(from:text)
    }

    func questions(for mood:String) async throws -> [[String:Any]] {
        let data = try await spiritualCall(["action":"questions", "mood":mood, "useHistory":false])
        let obj = try JSONSerialization.jsonObject(with:data) as? [String:Any] ?? [:]
        return obj["items"] as? [[String:Any]] ?? []
    }

    func recommend(for mood:String, answers:[String:String]) async throws -> [String:Any] {
        let data = try await spiritualCall(["action":"recommend", "mood":mood, "answers":answers, "useHistory":false])
        return try JSONSerialization.jsonObject(with:data) as? [String:Any] ?? [:]
    }

    func savedVerses() async throws -> [[String:Any]] {
        try await renewIfNeeded()
        let path="/rest/v1/scripture_favorites?select=passage_id,scripture_passages(id,reference,verse_text,translation,source_url)&user_id=eq.\(userId)&order=created_at.desc&limit=30"
        let data=try await request(path, method:"GET")
        return try JSONSerialization.jsonObject(with:data) as? [[String:Any]] ?? []
    }

    func saveVerse(_ passageId:Int) async throws {
        try await renewIfNeeded()
        let payload=try JSONSerialization.data(withJSONObject:["user_id":userId,"passage_id":passageId])
        _ = try await request("/rest/v1/scripture_favorites?on_conflict=user_id,passage_id",method:"POST",body:payload,extraHeaders:["Prefer":"resolution=merge-duplicates"])
    }

    func latestVerse() async throws -> [String:Any]? {
        let saved=try await savedVerses()
        if let row=saved.first,let p=row["scripture_passages"] as? [String:Any] { return p }
        return nil
    }

    func journal(_ note:String) async throws {
        try await renewIfNeeded()
        let payload=try JSONSerialization.data(withJSONObject:["user_id":userId,"entry_type":"reflection","body":String(note.prefix(1000))])
        _ = try await request("/rest/v1/wellness_journal",method:"POST",body:payload)
    }

    func moodHistory() async throws -> [[String:Any]] {
        try await renewIfNeeded()
        let data=try await request("/rest/v1/wellness_journal?select=mood,occurred_at&user_id=eq.\(userId)&mood=not.is.null&order=occurred_at.desc&limit=365",method:"GET")
        return try JSONSerialization.jsonObject(with:data) as? [[String:Any]] ?? []
    }

    private func spiritualCall(_ object:[String:Any]) async throws -> Data {
        try await renewIfNeeded()
        return try await request("/functions/v1/spiritual-reading",method:"POST",body:JSONSerialization.data(withJSONObject:object))
    }

    @Published var pairingURL = ""
    @Published var pairingActive = false
    @Published var pairingConnecting = false
    private var pairingId = ""
    private var pairingSecret = ""

    func startPairing() async {
        busy=true
        defer {busy=false}
        do {
            let body=try JSONSerialization.data(withJSONObject:["action":"start","deviceName":WKInterfaceDevice.current().name.isEmpty ? "Apple Watch" : WKInterfaceDevice.current().name])
            let data=try await request("/functions/v1/watch-pairing",method:"POST",body:body,authenticated:false)
            guard let obj=try JSONSerialization.jsonObject(with:data) as? [String:Any],
              let id=obj["id"] as? String,let secret=obj["secret"] as? String else {throw SyncError.badResponse}
            pairingId=id;pairingSecret=secret
            needsReconnect=false
            pairingConnecting=false
            pairingURL="superdots://pair?id=\(id)&secret=\(secret)"
            pairingActive=true
            message="Scan with MoodPals on your iPhone."
        }catch{message="Pairing failed: \(error.localizedDescription)"}
    }

    func pollPairing(store:WatchStore) async {
        guard pairingActive,!pairingId.isEmpty else{return}
        do {
            let body=try JSONSerialization.data(withJSONObject:["action":"poll","id":pairingId,"secret":pairingSecret])
            let data=try await request("/functions/v1/watch-pairing",method:"POST",body:body,authenticated:false)
            guard let obj=try JSONSerialization.jsonObject(with:data) as? [String:Any] else{return}
            let status=obj["status"] as? String ?? ""
            if status=="expired" {pairingActive=false;message="QR expired. Generate a new code.";return}
            if status=="approved",let hash=obj["tokenHash"] as? String {
                pairingConnecting=true
                message="Connecting your watch…"
                let started=Date()
                let verify=try JSONSerialization.data(withJSONObject:["token_hash":hash,"type":"magiclink"])
                let session=try await request("/auth/v1/verify",method:"POST",body:verify,authenticated:false)
                try loadSession(session)
                connected=true
                sessionVerified=true
                needsReconnect=false
                storeSecret(pairingId,for:"watch_pairing_id")
                pairingActive=false
                let completed=try JSONSerialization.data(withJSONObject:["action":"complete","id":pairingId,"secret":pairingSecret])
                _ = try? await request("/functions/v1/watch-pairing",method:"POST",body:completed)
                pairingURL="";pairingSecret=""
                message="Watch connected to your MoodPals account."
                // The root view owns refreshing after the pairing screen disappears.
                // Refreshing here inherits cancellation from the QR polling task.
                let remaining=3.0-Date().timeIntervalSince(started)
                if remaining>0 {try? await Task.sleep(for:.seconds(remaining))}
                pairingConnecting=false
            }
        }catch{
            pairingConnecting=false
            message="Pairing still pending: \(error.localizedDescription)"
        }
    }

    private func renewIfNeeded() async throws {
        guard !refreshToken.isEmpty else { throw SyncError.notSignedIn }
        let payload = try JSONSerialization.data(withJSONObject:["refresh_token":refreshToken])
        let response = try await request("/auth/v1/token?grant_type=refresh_token",method:"POST",body:payload,authenticated:false)
        try loadSession(response)
    }

    private func loadSession(_ data: Data) throws {
        guard let json = try JSONSerialization.jsonObject(with:data) as? [String:Any],
              let access = json["access_token"] as? String,
              let refresh = json["refresh_token"] as? String,
              let user = json["user"] as? [String:Any],
              let id = user["id"] as? String else { throw SyncError.badResponse }
        accessToken = access; refreshToken = refresh; userId = id
        storeSecret(access,for:"watch_access")
        storeSecret(refresh,for:"watch_refresh")
        storeSecret(id,for:"watch_user")
    }

    private func request(_ path: String,method: String,body: Data? = nil,authenticated: Bool = true,extraHeaders:[String:String] = [:]) async throws -> Data {
        guard let url = URL(string: path,relativeTo:base) else { throw SyncError.badResponse }
        var req = URLRequest(url:url)
        req.httpMethod = method
        req.setValue(publishableKey,forHTTPHeaderField:"apikey")
        req.setValue("application/json",forHTTPHeaderField:"Content-Type")
        if authenticated {
            guard !accessToken.isEmpty else { throw SyncError.notSignedIn }
            req.setValue("Bearer \(accessToken)",forHTTPHeaderField:"Authorization")
        }
        for (name,value) in extraHeaders { req.setValue(value,forHTTPHeaderField:name) }
        req.httpBody = body
        let (data,response) = try await URLSession.shared.data(for:req)
        guard let http = response as? HTTPURLResponse,(200...299).contains(http.statusCode) else {
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            let detail = String(data:data,encoding:.utf8) ?? ""
            NSLog("[WatchSync] HTTP %ld %@ %@: %@", status, method, path.components(separatedBy:"?")[0], String(detail.prefix(350)))
            throw SyncError.server(status, path.components(separatedBy:"?")[0], String(detail.prefix(120)))
        }
        return data
    }

    private func secret(_ key:String) -> String? {
        let query:[String:Any] = [kSecClass as String:kSecClassGenericPassword,kSecAttrAccount as String:key,kSecReturnData as String:true,kSecMatchLimit as String:kSecMatchLimitOne]
        var result:CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary,&result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return String(data:data,encoding:.utf8)
    }

    private func storeSecret(_ value:String?,for key:String) {
        let query:[String:Any] = [kSecClass as String:kSecClassGenericPassword,kSecAttrAccount as String:key]
        SecItemDelete(query as CFDictionary)
        if let value,let data=value.data(using:.utf8) {
            var add=query
            add[kSecValueData as String]=data
            add[kSecAttrAccessible as String]=kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            SecItemAdd(add as CFDictionary,nil)
        }
    }

    enum SyncError:LocalizedError {
        case notSignedIn,badResponse,server(Int,String,String)
        var errorDescription:String? {
            switch self {
            case .notSignedIn: return "Please sign in on the watch."
            case .badResponse: return "Unexpected response."
            case .server(let status,let path,let detail): return "\(path) HTTP \(status): \(detail)"
            }
        }
    }
}

struct WatchSyncView: View {
 @ObservedObject var sync:WatchThemeSync
 @EnvironmentObject var store:WatchStore
 @Environment(\.dismiss) private var dismiss
 private var qrImageURL:URL? {
  guard let components=URLComponents(string:sync.pairingURL),let query=components.percentEncodedQuery else{return nil}
  return URL(string:"https://hzoauxxpvrgahlavxmvp.supabase.co/functions/v1/watch-pairing?"+query)
 }
 var body:some View {
  ScrollView {
   VStack(spacing:12) {
    if sync.pairingConnecting {
     ProgressView().controlSize(.small).tint(.purple)
     Text("Connecting…").font(.caption).multilineTextAlignment(.center)
    } else if sync.connected && !sync.pairingActive {
     Image(systemName:sync.needsReconnect ? "exclamationmark.triangle.fill" : "checkmark.circle.fill")
       .font(.largeTitle).foregroundStyle(sync.needsReconnect ? .orange : .green)
     Text(sync.needsReconnect ? "Session expired" : (sync.sessionVerified ? "Account verified" : "Account saved · checking")).font(.headline)
     Text(sync.message).font(.caption2).multilineTextAlignment(.center)
     if sync.needsReconnect {
       Button("Reconnect iPhone") {Task {await sync.startPairing()}}
        .buttonStyle(.borderedProminent).tint(Color(red:0.47,green:0.38,blue:0.91))
     } else {
       Button("Continue") {dismiss()}.buttonStyle(.borderedProminent)
       Button("Sync again") {Task {await sync.refresh(store:store)}}.disabled(sync.busy)
     }
     Button("Disconnect",role:.destructive){sync.signOut()}
    } else {
     Text("Pair with iPhone").font(.headline)
     Text("MoodPals → Devices → Scan")
       .font(.system(size:10)).foregroundStyle(.secondary).multilineTextAlignment(.center)
     if let qrImageURL {
      AsyncImage(url:qrImageURL){phase in
       switch phase {
       case .success(let image): image.resizable().interpolation(.none).scaledToFit()
       case .failure: Image(systemName:"exclamationmark.triangle").foregroundStyle(.orange)
       default: ProgressView()
       }
      }.frame(width:118,height:118).padding(4).background(.white,in:RoundedRectangle(cornerRadius:8))
     }
     if !sync.pairingActive {
      Button("Show linking QR"){Task {await sync.startPairing()}}
     } else {
      Text("Code expires in 5 minutes").font(.system(size:10)).foregroundStyle(.secondary)
      Button("New QR code"){Task {await sync.startPairing()}}
     }
     if !sync.pairingActive { Text(sync.message).font(.caption2).multilineTextAlignment(.center) }
    }
    if sync.busy {ProgressView()}
   }
  }.navigationTitle("Pair Watch")
   .task(id: sync.pairingActive) {
    if (!sync.connected || sync.needsReconnect) && !sync.pairingActive {await sync.startPairing()}
    while !Task.isCancelled && sync.pairingActive {
     await sync.pollPairing(store:store)
     try? await Task.sleep(for:.seconds(3))
    }
   }
 }
}
