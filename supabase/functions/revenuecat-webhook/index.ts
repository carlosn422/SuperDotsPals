import { createClient } from "npm:@supabase/supabase-js@2";

// RevenueCat → Supabase: keeps public.plus_entitlements in sync with the "plus" entitlement.
// RevenueCat sends a fixed Authorization header. It is checked against the REVENUECAT_WEBHOOK_AUTH
// function secret, or else against its SHA-256 stored in public.server_secrets.
const ENTITLEMENT = "plus";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sha256(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function authorized(db: ReturnType<typeof createClient>, token: string) {
  const secret = Deno.env.get("REVENUECAT_WEBHOOK_AUTH");
  if (secret) return safeEqual(token, secret.replace(/^Bearer\s+/i, ""));
  const { data } = await db.from("server_secrets").select("value").eq("name", "revenuecat_webhook_auth_sha256").maybeSingle();
  return !!data?.value && safeEqual(await sha256(token), data.value);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const got = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!got || !(await authorized(db, got))) return json({ error: "Unauthorized" }, 401);

  const event = (await req.json().catch(() => null))?.event;
  if (!event?.type) return json({ error: "Missing event" }, 400);
  const eventAt = event.event_timestamp_ms ? new Date(event.event_timestamp_ms).toISOString() : new Date().toISOString();

  if (event.type === "TRANSFER") {
    const from = ((event.transferred_from || []) as string[]).filter((id) => UUID.test(id));
    if (from.length) {
      const { error } = await db.from("plus_entitlements").update({
        is_active: false, last_event_type: event.type, last_event_id: event.id, last_event_at: eventAt, updated_at: new Date().toISOString(),
      }).in("user_id", from);
      if (error) return json({ error: error.message }, 500);
    }
    return json({ ok: true });
  }

  const ids = [event.app_user_id, event.original_app_user_id, ...(event.aliases || [])].filter((id: unknown) => typeof id === "string" && UUID.test(id));
  const userId = ids[0];
  const entitlements: string[] = event.entitlement_ids || (event.entitlement_id ? [event.entitlement_id] : []);
  if (!userId || !entitlements.includes(ENTITLEMENT)) return json({ ok: true, ignored: true });

  const expiresAt = event.expiration_at_ms ? new Date(event.expiration_at_ms).toISOString() : null;
  const isActive = event.type !== "EXPIRATION" && (expiresAt === null || new Date(expiresAt) > new Date());

  const { data: existing } = await db.from("plus_entitlements").select("last_event_at").eq("user_id", userId).maybeSingle();
  if (existing?.last_event_at && new Date(existing.last_event_at) > new Date(eventAt)) return json({ ok: true, stale: true });

  const { error } = await db.from("plus_entitlements").upsert({
    user_id: userId,
    is_active: isActive,
    product_id: event.product_id ?? null,
    store: event.store ?? null,
    environment: event.environment ?? null,
    expires_at: expiresAt,
    last_event_type: event.type,
    last_event_id: event.id ?? null,
    last_event_at: eventAt,
    updated_at: new Date().toISOString(),
  });
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
});
