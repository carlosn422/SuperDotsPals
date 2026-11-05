import { createClient } from "npm:@supabase/supabase-js@2";

// Sends queued rows from public.email_events through Resend. Called every minute by pg_cron (x-outbox-key from Vault).
// Giveaway emails are sent only while https://moodpals.com/api/giveaway reports the campaign enabled, so the
// Hostinger GIVEAWAY_ENABLED switch also stops them. Membership emails are never affected by the giveaway switch.
const FROM = "MoodPals <hello@moodpals.com>";
const SITE = "https://moodpals.com";
const STATUS_URL = Deno.env.get("GIVEAWAY_STATUS_URL") || `${SITE}/api/giveaway`;
const GIVEAWAY_TYPES = ["giveaway_entry", "giveaway_winner"];
const MAX_AUTO_ATTEMPTS = 3;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const day = (d: unknown) => d ? new Date(String(d)).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Chicago" }) : "";

type Mail = { subject: string; heading: string; lines: string[]; cta?: [string, string] };

function compose(type: string, p: Record<string, unknown>): Mail {
  const hi = p.first_name ? `Hi ${esc(p.first_name)},` : "Hi there,";
  switch (type) {
    case "purchase_welcome":
      return { subject: "Welcome to MoodPals Premium! 💚", heading: "Welcome to MoodPals Plus!", lines: [
        "Hi there,",
        `Thank you for joining MoodPals Plus. Your purchase of the <b>${esc(p.plan)}</b> plan is confirmed${p.purchased_at ? ` (${day(p.purchased_at)})` : ""}, and your Premium features are active now.`,
        "Advanced trends, full history, extra watch themes, unlimited Circle groups and up to 4 family watches are all unlocked in the app.",
        "You can manage or cancel your subscription any time in your Apple Account settings.",
      ], cta: ["Open MoodPals", SITE] };
    case "membership_30_days":
      return { subject: "30 Days Together with MoodPals! 💚", heading: "30 days together!", lines: [
        "Hi there,",
        "You've been a MoodPals Plus member for 30 days. Thank you for growing with us and for helping build a calmer, kinder community.",
        "Keep checking in, sharing with your Circle and looking after yourself. We're glad you're here.",
      ], cta: ["Open MoodPals", SITE] };
    case "membership_expired":
      return { subject: "Your MoodPals Plus membership has ended", heading: "Your Plus membership has ended", lines: [
        "Hi there,",
        `Your MoodPals Plus ${esc(p.plan)} membership ended${p.expired_at ? ` on ${day(p.expired_at)}` : ""}. Your account and mood history are safe, and MoodPals keeps working on the Free plan.`,
        "If you'd like Plus again, you can resubscribe any time from the Upgrade screen in the app.",
      ], cta: ["Visit MoodPals", SITE] };
    case "giveaway_entry":
      return { subject: "You're Entered in the MoodPals Giveaway! 💚", heading: "You're entered!", lines: [
        hi,
        `Thanks for entering the ${esc(p.campaign_name)}. Your entry is confirmed. Each person can enter once, and every entry has the same chance to win.`,
        `Entries close ${day(p.end_date)}.${p.drawing_date ? ` Winners will be drawn at random on or about ${day(p.drawing_date)} and contacted by email.` : " Winners will be drawn at random and contacted by email."}`,
        "No purchase necessary. A purchase does not improve your chances of winning. Apple is not a sponsor of, and is not involved in, this giveaway.",
      ], cta: ["Official Rules", `${SITE}/giveaway/rules`] };
    case "giveaway_winner":
      return { subject: "You've been selected in the MoodPals Giveaway! 💚", heading: "Congratulations!", lines: [
        hi,
        `You've been selected as a potential winner of an ${esc(p.prize)} in the ${esc(p.campaign_name)}.`,
        `To claim your prize, reply to this email by <b>${day(p.respond_by)}</b> to confirm your eligibility and shipping details. If we don't hear from you by then, the prize may go to an alternate as described in the Official Rules.`,
        "We'll never ask you for a payment or card details to claim a prize.",
      ], cta: ["Official Rules", `${SITE}/giveaway/rules`] };
    default:
      throw new Error(`Unknown email type ${type}`);
  }
}

function html(m: Mail) {
  const button = m.cta ? `<p style="margin:26px 0 8px"><a href="${m.cta[1]}" style="background:#FF9A2E;color:#fff;text-decoration:none;font-weight:700;padding:13px 24px;border-radius:14px;display:inline-block">${m.cta[0]}</a></p>` : "";
  return `<!doctype html><html><body style="margin:0;background:#E4F6EA;font-family:Nunito,Arial,sans-serif;color:#2B1E45">
<div style="max-width:560px;margin:0 auto;padding:28px 18px"><div style="background:#fff;border-radius:24px;padding:30px 26px">
<img src="${SITE}/img/mascots/joy.png" alt="" width="64" height="64" style="display:block;margin-bottom:8px">
<h1 style="font-size:24px;margin:0 0 14px">${m.heading}</h1>
${m.lines.map((l) => `<p style="font-size:16px;line-height:1.55;margin:0 0 12px;color:#4A3F63">${l}</p>`).join("")}${button}
</div><p style="font-size:12px;color:#6E6488;text-align:center;margin:16px 0 0">MoodPals · <a href="mailto:hello@moodpals.com" style="color:#1F9E8F">hello@moodpals.com</a></p></div></body></html>`;
}

const text = (m: Mail) => [m.heading, ...m.lines.map((l) => l.replace(/<[^>]+>/g, "")), m.cta ? `${m.cta[0]}: ${m.cta[1]}` : ""].join("\n\n");

async function giveawayEnabled(): Promise<boolean | null> {
  try {
    const res = await fetch(STATUS_URL, { headers: { "Cache-Control": "no-cache" }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return res.status === 404 ? false : null;
    return (await res.json())?.campaign_enabled === true;
  } catch {
    return null; // unknown: hold giveaway emails, send nothing
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const key = req.headers.get("x-outbox-key") || "";
  const { data: ok } = key ? await db.rpc("email_outbox_key_ok", { p_key: key }) : { data: false };
  if (!ok) return json({ error: "Unauthorized" }, 401);
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) return json({ error: "RESEND_API_KEY is not set" }, 500);

  const { data: rows, error } = await db.rpc("claim_email_events", { p_limit: 20 });
  if (error) return json({ error: error.message }, 500);
  let giveawayOn: boolean | null | undefined;
  const result = { sent: 0, failed: 0, suppressed: 0, held: 0 };
  const update = (id: string, patch: Record<string, unknown>) =>
    db.from("email_events").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);

  for (const row of rows ?? []) {
    if (GIVEAWAY_TYPES.includes(row.email_type)) {
      if (giveawayOn === undefined) giveawayOn = await giveawayEnabled();
      if (giveawayOn === null) { await update(row.id, { delivery_status: "queued", attempts: row.attempts - 1 }); result.held++; continue; }
      if (!giveawayOn) { await update(row.id, { delivery_status: "suppressed", last_error: "Giveaway disabled (GIVEAWAY_ENABLED is not true)" }); result.suppressed++; continue; }
    }
    let to = row.to_email as string | null;
    if (!to && row.user_id) {
      const { data } = await db.auth.admin.getUserById(row.user_id);
      to = data?.user?.email ?? null;
    }
    if (!to) { await update(row.id, { delivery_status: "suppressed", last_error: "No email address on the account" }); result.suppressed++; continue; }
    try {
      const mail = compose(row.email_type, row.payload || {});
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json", "Idempotency-Key": row.idempotency_key.slice(0, 256) },
        body: JSON.stringify({ from: FROM, to: [to], reply_to: "hello@moodpals.com", subject: mail.subject, html: html(mail), text: text(mail) }),
        signal: AbortSignal.timeout(10000),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`Resend ${res.status}: ${body?.message || "error"}`);
      await update(row.id, { delivery_status: "sent", provider_message_id: body.id ?? null, sent_at: new Date().toISOString(), last_error: null });
      result.sent++;
    } catch (e) {
      const retry = row.attempts < MAX_AUTO_ATTEMPTS;
      await update(row.id, { delivery_status: retry ? "queued" : "failed", last_error: String((e as Error).message).slice(0, 500) });
      result.failed++;
    }
  }
  return json({ ok: true, ...result });
});
