import SwiftUI
import Security

/// Authenticated direct sync for the standalone watchOS prototype.
/// The publishable key is public; tokens are stored in the user's Keychain.
@MainActor
final class WatchThemeSync: ObservableObject {
    @Published var connected = false
    @Published var busy = false
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
            message = "Connected to Superdots."
            await refresh(store:store)
        } catch { message = "Sign-in failed: \(error.localizedDescription)" }
    }

    func refresh(store: WatchStore) async {
        guard connected else { return }
        busy = true
        defer { busy = false }
        do {
            try await renewIfNeeded()
            let data = try await request("/rest/v1/wellness_journal?select=mood,occurred_at&user_id=eq.\(userId)&mood=not.is.null&order=occurred_at.desc&limit=1",method:"GET")
            let rows = try JSONSerialization.jsonObject(with:data) as? [[String:Any]] ?? []
            store.currentMood = (rows.first?["mood"] as? String) ?? "Calm"
            let healthData = try await request("/rest/v1/wellness_readings?select=metric,value,recorded_at&user_id=eq.\(userId)&source=eq.healthkit&metric=in.(hrv,resting_heart_rate)&order=recorded_at.desc&limit=100",method:"GET")
            let healthRows = try JSONSerialization.jsonObject(with:healthData) as? [[String:Any]] ?? []
            store.latestHRV = nil
            store.latestRestingHeartRate = nil
            for reading in healthRows {
                guard let metric = reading["metric"] as? String else { continue }
                let raw = reading["value"]
                let number = (raw as? NSNumber)?.doubleValue ?? Double(String(describing: raw ?? ""))
                guard let number else { continue }
                if metric == "hrv" && store.latestHRV == nil { store.latestHRV = number }
                if metric == "resting_heart_rate" && store.latestRestingHeartRate == nil { store.latestRestingHeartRate = number }
            }
            message = "Mood synced: \(store.currentMood)."
        } catch { message = "Sync failed: \(error.localizedDescription)" }
    }

    func signOut() {
        for key in ["watch_access","watch_refresh","watch_user"] { storeSecret(nil,for:key) }
        accessToken = ""; refreshToken = ""; userId = ""; connected = false
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
        let data=try await request("/rest/v1/wellness_journal?select=mood,occurred_at&user_id=eq.\(userId)&mood=not.is.null&order=occurred_at.desc&limit=14",method:"GET")
        return try JSONSerialization.jsonObject(with:data) as? [[String:Any]] ?? []
    }

    private func spiritualCall(_ object:[String:Any]) async throws -> Data {
        try await renewIfNeeded()
        return try await request("/functions/v1/spiritual-reading",method:"POST",body:JSONSerialization.data(withJSONObject:object))
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
            throw SyncError.server((response as? HTTPURLResponse)?.statusCode ?? 0)
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
        case notSignedIn,badResponse,server(Int)
        var errorDescription:String? {
            switch self {
            case .notSignedIn: return "Please sign in on the watch."
            case .badResponse: return "Unexpected response."
            case .server(let status): return "Server error \(status)."
            }
        }
    }
}

struct WatchSyncView: View {
    @ObservedObject var sync: WatchThemeSync
    @EnvironmentObject var store: WatchStore
    @State private var email=""
    @State private var password=""
    var body: some View {
        ScrollView {
            VStack(spacing:12) {
                if sync.connected {
                    Text("Connected").font(.headline)
                    Text(sync.message).font(.caption2).multilineTextAlignment(.center)
                    Button("Sync wellness now") { Task { await sync.refresh(store:store) } }
                    Button("Disconnect",role:.destructive) { sync.signOut() }
                } else {
                    Text("Sign in to sync").font(.headline)
                    TextField("Email",text:$email).textInputAutocapitalization(.never)
                    SecureField("Password",text:$password)
                    Button("Connect") { Task { await sync.signIn(email:email,password:password,store:store); password="" } }
                    Text(sync.message).font(.caption2).multilineTextAlignment(.center)
                }
                if sync.busy { ProgressView() }
                Text("Your password is not saved. A secure session token is stored in this watch's Keychain.")
                    .font(.system(size:10)).foregroundStyle(.secondary)
            }
        }.navigationTitle("Cloud sync")
    }
}
