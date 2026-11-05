import { createClient } from "npm:@supabase/supabase-js@2";

// RevenueCat → Supabase: keeps public.plus_entitlements in sync with the "plus" entitlement, logs every event
// in public.subscription_events (once per RevenueCat event id) and queues membership emails in public.email_events.
// RevenueCat sends a fixed Authorization header. It is checked against the REVENUECAT_WEBHOOK_AUTH
// function secret, or else against its SHA-256 stored in public.server_secrets.
const ENTITLEMENT = "plus";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAID_STORES = ["APP_STORE", "MAC_APP_STORE", "PLAY_STORE", "STRIPE"];
const PAID_EVENTS = ["INITIAL_PURCHASE", "RENEWAL", "PRODUCT_CHANGE", "UNCANCELLATION", "NON_RENEWING_PURCHASE"];
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const iso = (ms?: number | null) => (ms ? new Date(ms).toISOString() : null);

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

const planName = (productId?: string | null) => (/annual|year/i.test(productId || "") ? "Annual" : "Monthly");

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
  const ids = [event.app_user_id, event.original_app_user_id, ...(event.aliases || [])].filter((id: unknown) => typeof id === "string" && UUID.test(id));
  const userId: string | undefined = ids[0];
  const eventId: string | null = typeof event.id === "string" ? event.id : null;

  // Same event delivered twice: skip it once it has been fully processed.
  if (eventId) {
    const { error } = await db.from("subscription_events").upsert({
      id: eventId,
      user_id: userId ?? null,
      event_type: event.type,
      product_id: event.product_id ?? null,
      store: event.store ?? null,
      environment: event.environment ?? null,
      period_type: event.period_type ?? null,
      transaction_id: event.transaction_id ?? null,
      original_transaction_id: event.original_transaction_id ?? null,
      cancel_reason: event.cancel_reason ?? event.expiration_reason ?? null,
      price_usd: typeof event.price === "number" ? event.price : null,
      purchased_at: iso(event.purchased_at_ms),
      expires_at: iso(event.expiration_at_ms),
      event_at: eventAt,
    }, { onConflict: "id", ignoreDuplicates: true });
    if (error) return json({ error: error.message }, 500);
    const { data: logged } = await db.from("subscription_events").select("processed_at").eq("id", eventId).maybeSingle();
    if (logged?.processed_at) return json({ ok: true, duplicate: true });
  }
  const done = async (body: Record<string, unknown>, stale = false) => {
    if (eventId) await db.from("subscription_events").update({ processed_at: new Date().toISOString(), stale }).eq("id", eventId);
    return json(body);
  };

  if (event.type === "TRANSFER") {
    const from = ((event.transferred_from || []) as string[]).filter((id) => UUID.test(id));
    if (from.length) {
      const { error } = await db.from("plus_entitlements").update({
        is_active: false, last_event_type: event.type, last_event_id: event.id, last_event_at: eventAt, updated_at: new Date().toISOString(),
      }).in("user_id", from);
      if (error) return json({ error: error.message }, 500);
    }
    return done({ ok: true });
  }

  const entitlements: string[] = event.entitlement_ids || (event.entitlement_id ? [event.entitlement_id] : []);
  if (!userId || !entitlements.includes(ENTITLEMENT)) return done({ ok: true, ignored: true });

  const expiresAt = iso(event.expiration_at_ms);
  // RevenueCat reports an App Store refund as a CANCELLATION with cancel_reason CUSTOMER_SUPPORT.
  const refunded = event.type === "CANCELLATION" && event.cancel_reason === "CUSTOMER_SUPPORT";
  // Turning off auto-renew keeps access until the paid period ends.
  const isActive = event.type !== "EXPIRATION" && !refunded && (expiresAt === null || new Date(expiresAt) > new Date());

  const { data: existing } = await db.from("plus_entitlements").select("last_event_at, first_paid_at, refunded_at").eq("user_id", userId).maybeSingle();
  if (existing?.last_event_at && new Date(existing.last_event_at) > new Date(eventAt)) return done({ ok: true, stale: true }, true);

  const production = event.environment === "PRODUCTION";
  const paidEvent = production && PAID_STORES.includes(event.store) && PAID_EVENTS.includes(event.type) &&
    !["TRIAL", "PROMOTIONAL"].includes(event.period_type);
  const firstPaidAt = !isActive ? null : existing?.first_paid_at ?? (paidEvent ? eventAt : null);

  const { error } = await db.from("plus_entitlements").upsert({
    user_id: userId,
    is_active: isActive,
    product_id: event.product_id ?? null,
    store: event.store ?? null,
    environment: event.environment ?? null,
    expires_at: expiresAt,
    period_type: event.period_type ?? null,
    original_transaction_id: event.original_transaction_id ?? null,
    will_renew: event.type === "CANCELLATION" || event.type === "EXPIRATION" ? false
      : ["INITIAL_PURCHASE", "RENEWAL", "UNCANCELLATION", "PRODUCT_CHANGE"].includes(event.type) ? true : null,
    refunded_at: refunded ? eventAt : PAID_EVENTS.includes(event.type) ? null : existing?.refunded_at ?? null,
    first_paid_at: firstPaidAt,
    last_event_type: event.type,
    last_event_id: event.id ?? null,
    last_event_at: eventAt,
    updated_at: new Date().toISOString(),
  });
  if (error) return json({ error: error.message }, 500);

  // Membership emails (never for sandbox or test purchases). The unique idempotency key stops duplicates.
  const emails: Record<string, unknown>[] = [];
  const startsPaid = event.type === "INITIAL_PURCHASE" || event.type === "NON_RENEWING_PURCHASE" || (event.type === "RENEWAL" && event.is_trial_conversion === true);
  if (paidEvent && startsPaid && !existing?.first_paid_at) {
    emails.push({
      user_id: userId, email_type: "purchase_welcome",
      idempotency_key: `purchase_welcome:${event.original_transaction_id || userId}`,
      payload: { plan: planName(event.product_id), product_id: event.product_id, purchased_at: iso(event.purchased_at_ms) ?? eventAt, expires_at: expiresAt },
    });
  }
  if (production && event.type === "EXPIRATION") {
    emails.push({
      user_id: userId, email_type: "membership_expired",
      idempotency_key: `membership_expired:${userId}:${expiresAt ?? eventAt}`,
      payload: { plan: planName(event.product_id), expired_at: expiresAt ?? eventAt },
    });
  }
  if (emails.length) {
    const { error: mailError } = await db.from("email_events").upsert(emails, { onConflict: "idempotency_key", ignoreDuplicates: true });
    if (mailError) return json({ error: mailError.message }, 500);
  }
  return done({ ok: true });
});
