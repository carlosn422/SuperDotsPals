// MoodPals Founding Members Giveaway: runtime kill switches, public pages/API, free entry and the admin API.
// Everything is off unless GIVEAWAY_ENABLED is exactly "true". Flags are read from process.env on every request.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const VIEWS = path.join(__dirname, 'views');
const view = (name) => fs.readFileSync(path.join(VIEWS, name), 'utf8');
const TEMPLATES = Object.fromEntries(['giveaway-section', 'giveaway-page', 'giveaway-rules', 'giveaway-unavailable', 'admin-giveaway']
  .map((n) => [n, view(`${n}.html`)]));
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
const CAMPAIGN_ID = /^[a-z0-9-]{1,64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];
const STATS_TTL_MS = 60 * 1000;
const NO_STORE = 'no-store, max-age=0';

function flags(env = process.env) {
  const id = String(env.GIVEAWAY_CAMPAIGN_ID ?? '').trim();
  const campaignId = CAMPAIGN_ID.test(id) ? id : null;
  const enabled = env.GIVEAWAY_ENABLED === 'true' && !!campaignId;
  return {
    enabled,
    entries: enabled && env.GIVEAWAY_ENTRIES_ENABLED === 'true',
    campaignId,
    raw: {
      GIVEAWAY_ENABLED: env.GIVEAWAY_ENABLED ?? null,
      GIVEAWAY_ENTRIES_ENABLED: env.GIVEAWAY_ENTRIES_ENABLED ?? null,
      GIVEAWAY_CAMPAIGN_ID: env.GIVEAWAY_CAMPAIGN_ID ?? null,
    },
  };
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const render = (tpl, vars) => tpl
  .replace(/\{\{\{(\w+)\}\}\}/g, (_, k) => String(vars[k] ?? ''))
  .replace(/\{\{(\w+)\}\}/g, (_, k) => esc(vars[k]));
const TZ = 'America/Chicago';
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: TZ }) : 'To be announced');
const fmtDateTime = (d) => (d ? `${fmtDate(d)} at ${new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ })} CT` : 'To be announced');
const csvCell = (v) => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // stop spreadsheet formula injection
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (rows, cols) => [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n');

function eligibilityText(c) {
  const where = (c.eligible_countries || ['US']).join(',') === 'US' ? 'legal residents of the 50 United States and the District of Columbia' : `legal residents of ${(c.eligible_countries || []).join(', ')}`;
  const excluded = (c.excluded_regions || []).length ? ` (excluding ${c.excluded_regions.join(', ')})` : '';
  return `Open to ${where}${excluded} who are at least ${c.min_age || 18} years old (or the age of majority where they live, if older) when they enter.`;
}

function supabaseStore({ url, key }) {
  const rest = async (p, { timeout = 5000, headers, ...opts } = {}) => {
    const res = await fetch(`${url}/rest/v1/${p}`, {
      ...opts,
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...headers },
      signal: AbortSignal.timeout(timeout),
    });
    const body = await res.text();
    if (!res.ok) {
      const err = new Error(`Supabase ${res.status}: ${body.slice(0, 300)}`);
      try { err.detail = JSON.parse(body).message; } catch {}
      throw err;
    }
    return body ? JSON.parse(body) : null;
  };
  const rpc = (fn, args, opts) => rest(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(args), ...opts });
  const patch = (p, body) => rest(p, { method: 'PATCH', body: JSON.stringify(body), headers: { Prefer: 'return=representation' } });
  const q = encodeURIComponent;
  return {
    campaign: (id) => rpc('giveaway_public_stats', { p_campaign: id }, { timeout: 2500 }),
    enter: (id, e) => rpc('giveaway_enter', {
      p_campaign: id, p_email: e.email, p_first_name: e.firstName, p_last_name: e.lastName, p_region: e.region,
      p_country: e.country, p_age_confirmed: e.ageConfirmed, p_rules_accepted: e.rulesAccepted, p_ip_hash: e.ipHash,
    }),
    adminStats: (id) => rpc('giveaway_admin_stats', { p_campaign: id }),
    campaignRow: async (id) => (await rest(`giveaway_campaigns?id=eq.${q(id)}&select=*`))[0] || null,
    entries: (id) => rest(`giveaway_entries?campaign_id=eq.${q(id)}&select=id,email,first_name,last_name,region,country,entry_method,eligibility_status,eligibility_note,entered_at,entrant_id&order=entered_at.asc&limit=10000`),
    setEntryStatus: (id, status, note) => patch(`giveaway_entries?id=eq.${q(id)}`, { eligibility_status: status, eligibility_note: note }),
    payments: () => rest('subscription_events?select=id,user_id,event_type,product_id,store,environment,period_type,cancel_reason,price_usd,event_at,stale&order=event_at.desc&limit=1000'),
    emails: (status) => rest(`email_events?select=id,user_id,to_email,email_type,delivery_status,attempts,last_error,created_at,sent_at${status ? `&delivery_status=eq.${q(status)}` : ''}&order=created_at.desc&limit=500`),
    retryEmail: (id) => patch(`email_events?id=eq.${q(id)}&delivery_status=in.(failed,suppressed)`, { delivery_status: 'queued', attempts: 0, last_error: null, updated_at: new Date().toISOString() }),
    draw: (id, winners, alternates, by, notes) => rpc('giveaway_draw', { p_campaign: id, p_winners: winners, p_alternates: alternates, p_by: by, p_notes: notes || null }),
    drawings: (id) => rest(`giveaway_drawings?campaign_id=eq.${q(id)}&order=drawn_at.asc`),
    winners: (id) => rest(`giveaway_winners?campaign_id=eq.${q(id)}&select=id,role,draw_order,status,notes,updated_at,updated_by,drawing_id,entry:giveaway_entries(id,email,first_name,last_name,region)&order=drawing_id.asc,draw_order.asc`),
    setWinner: (id, body) => patch(`giveaway_winners?id=eq.${q(id)}`, body),
    queueEmail: (row) => rest('email_events?on_conflict=idempotency_key', { method: 'POST', body: JSON.stringify(row), headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' } }),
  };
}

// Local preview only (no Supabase key and GIVEAWAY_LOCAL_DEMO=true): an approved demo campaign kept in memory.
function demoStore() {
  const now = Date.now();
  const campaign = {
    id: 'founding-members-2026', name: 'MoodPals Founding Members Giveaway', status: 'active', approved: true, entries_open: true,
    target_members: 1000, current_paid_members: 684, prize_count: 2, prize_description: 'Apple Watch SE 3', prize_value_usd: 249,
    start_date: new Date(now - 864e5).toISOString(), end_date: new Date(now + 30 * 864e5).toISOString(), drawing_date: new Date(now + 33 * 864e5).toISOString(),
    min_age: 18, eligible_countries: ['US'], excluded_regions: [], sponsor_name: 'MoodPals (demo sponsor)', sponsor_address: '123 Example St, Austin, TX 78701', official_rules_url: null,
  };
  const entries = [];
  return {
    campaign: async (id) => (id === campaign.id ? { ...campaign } : null),
    enter: async (id, e) => {
      if (id !== campaign.id || !campaign.entries_open) return 'closed';
      if (!e.ageConfirmed || !e.rulesAccepted || e.country !== 'US') return 'ineligible';
      if (entries.some((x) => x.email === e.email)) return 'duplicate';
      entries.push({ id: crypto.randomUUID(), campaign_id: id, email: e.email, first_name: e.firstName, last_name: e.lastName, region: e.region, country: e.country, entry_method: 'free_online', eligibility_status: 'eligible', entered_at: new Date().toISOString() });
      return 'entered';
    },
    adminStats: async () => ({ registered_accounts: 1840, guest_accounts: 312, active_paid_members: 684, monthly_members: 431, annual_members: 253, cancelled_still_paid: 22, new_purchases_30d: 96, trial_starts_30d: 0, renewals_30d: 388, cancellations_30d: 31, refunds_30d: 2, expirations_30d: 17, estimated_mrr_usd: 1279.17, entries_total: entries.length, entries_valid: entries.filter((e) => e.eligibility_status === 'eligible').length, winners: 0, winners_verified: 0, alternates: 0, emails_failed: 0, emails_queued: 0 }),
    campaignRow: async () => ({ ...campaign, approved_at: new Date(now - 2 * 864e5).toISOString(), approved_by: 'demo' }),
    entries: async () => entries,
    setEntryStatus: async (id, status, note) => entries.filter((e) => e.id === id).map((e) => Object.assign(e, { eligibility_status: status, eligibility_note: note })),
    payments: async () => [],
    emails: async () => [],
    retryEmail: async () => [],
    draw: async () => { throw Object.assign(new Error('demo'), { detail: 'The entry period has not ended' }); },
    drawings: async () => [],
    winners: async () => [],
    setWinner: async () => [],
    queueEmail: async () => null,
  };
}

function defaultStore(env = process.env) {
  if (env.SUPABASE_SERVICE_ROLE_KEY) return supabaseStore({ url: env.SUPABASE_URL || 'https://hzoauxxpvrgahlavxmvp.supabase.co', key: env.SUPABASE_SERVICE_ROLE_KEY });
  if (env.GIVEAWAY_LOCAL_DEMO === 'true') return demoStore();
  return null; // no database: the giveaway stays hidden
}

async function supabaseUser(token, env = process.env) {
  const url = env.SUPABASE_URL || 'https://hzoauxxpvrgahlavxmvp.supabase.co';
  const res = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY || PUBLISHABLE_KEY, Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(5000),
  });
  return res.ok ? res.json() : null;
}
const PUBLISHABLE_KEY = 'sb_publishable_pPPqosRo1SqwrbW-8MWURA_UxTED6Vs';

function mount(app, { store = defaultStore(), getUser = supabaseUser, env = process.env, limited = () => false } = {}) {
  let cache = { id: null, at: 0, data: null };
  async function campaign(id) {
    if (cache.id === id && Date.now() - cache.at < STATS_TTL_MS) return cache.data;
    const data = await store.campaign(id);
    cache = { id, at: Date.now(), data };
    return data;
  }
  // The promotion shows only when the Hostinger flag is on AND the campaign's official rules are approved.
  async function state() {
    const f = flags(env);
    if (!f.enabled || !store) return { f, visible: false };
    let c = null;
    try { c = await campaign(f.campaignId); } catch (err) { console.error('giveaway campaign:', err.message); }
    const visible = !!c && c.approved === true && !['draft', 'cancelled'].includes(c.status);
    return { f, c, visible, entriesOpen: visible && f.entries && c.entries_open === true };
  }
  const noStore = (res) => res.set({ 'Cache-Control': NO_STORE, 'CDN-Cache-Control': 'no-store', Vary: '*' });

  function vars(c, entriesOpen) {
    const pct = Math.min(100, Math.round((c.current_paid_members / c.target_members) * 100));
    const opens = new Date(c.start_date) > new Date();
    return {
      name: c.name, prize: c.prize_description, prizeCount: c.prize_count,
      target: c.target_members.toLocaleString('en-US'), current: c.current_paid_members.toLocaleString('en-US'), pct, pctLabel: `${pct}%`,
      startDate: fmtDate(c.start_date), endDate: fmtDate(c.end_date), endDateTime: fmtDateTime(c.end_date), startDateTime: fmtDateTime(c.start_date),
      drawingDate: fmtDate(c.drawing_date), minAge: c.min_age || 18, eligibility: eligibilityText(c),
      prizeValue: c.prize_value_usd ? `$${Number(c.prize_value_usd).toFixed(2)}` : 'To be announced',
      totalValue: c.prize_value_usd ? `$${(Number(c.prize_value_usd) * c.prize_count).toFixed(2)}` : 'To be announced',
      sponsorName: c.sponsor_name || 'MoodPals', sponsorAddress: c.sponsor_address || 'To be announced',
      rulesUrl: c.official_rules_url || '/giveaway/rules',
      entryState: entriesOpen ? 'open' : opens ? 'soon' : 'closed',
      entryNote: entriesOpen ? `Entries close ${fmtDateTime(c.end_date)}.` : opens ? `Entries open ${fmtDateTime(c.start_date)}.` : 'Entries are closed. Thank you to everyone who entered!',
      goal: `<div class="gw-goal"><div class="gw-goal-head"><b>Our Goal: ${esc(c.target_members.toLocaleString('en-US'))} Premium Members</b><span>${pct}%</span></div><div class="gw-bar" role="progressbar" aria-label="Verified paid members" aria-valuemin="0" aria-valuemax="${c.target_members}" aria-valuenow="${Math.min(c.current_paid_members, c.target_members)}"><i style="width:${pct}%"></i></div><p class="gw-count"><b>${esc(c.current_paid_members.toLocaleString('en-US'))}</b> verified paid members so far</p></div>`,
      watches: `<div class="gw-prizes">${[['joy', 'Joy'], ['disgust', 'Calm']].map(([img, mood], i) => `<figure class="gw-prize${i ? ' alt' : ''}"><div class="watch big gw-watch" aria-hidden="true"><div class="band top"></div><div class="case"><div class="face"><img src="/img/mascots/${img}.webp" alt=""><div class="mood">${mood}</div><div class="hint">Prize ${i + 1}</div></div></div><div class="band bottom"></div></div><figcaption><b>Winner ${i + 1}</b>${esc(c.prize_description)}</figcaption></figure>`).join('')}<span class="gw-badge">${esc(c.prize_count)} Winners</span></div>`,
      stateOptions: US_STATES.map((s) => `<option value="${s}">${s}</option>`).join(''),
    };
  }

  const unavailable = (res) => noStore(res).status(404).set('X-Robots-Tag', 'noindex').type('html').send(TEMPLATES['giveaway-unavailable']);

  // Homepage: inject the giveaway section and nav link only while enabled.
  const index = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  app.get(['/', '/index.html'], async (_req, res) => {
    const s = await state();
    let html = index.replace('<!--giveaway-nav-->', '').replace('<!--giveaway-section-->', '');
    if (s.visible) {
      html = index
        .replace('<!--giveaway-nav-->', '<a href="/giveaway">Giveaway</a>')
        .replace('<!--giveaway-section-->', render(TEMPLATES['giveaway-section'], vars(s.c, s.entriesOpen)));
    }
    noStore(res).type('html').send(html);
  });

  app.get('/giveaway', async (_req, res) => {
    const s = await state();
    if (!s.visible) return unavailable(res);
    noStore(res).type('html').send(render(TEMPLATES['giveaway-page'], vars(s.c, s.entriesOpen)));
  });

  app.get('/giveaway/rules', async (_req, res) => {
    const s = await state();
    if (!s.visible) return unavailable(res);
    noStore(res).type('html').send(render(TEMPLATES['giveaway-rules'], vars(s.c, s.entriesOpen)));
  });

  // Public aggregate numbers only.
  app.get('/api/giveaway', async (_req, res) => {
    const s = await state();
    noStore(res);
    if (!s.visible) return res.json({ campaign_enabled: false });
    res.json({
      campaign_enabled: true, entries_open: s.entriesOpen, status: s.c.status,
      target_members: s.c.target_members, current_paid_members: s.c.current_paid_members, prize_count: s.c.prize_count,
      start_date: s.c.start_date, end_date: s.c.end_date, drawing_date: s.c.drawing_date,
    });
  });

  app.post('/api/giveaway/entries', async (req, res) => {
    noStore(res);
    const s = await state();
    if (!s.entriesOpen) return res.status(403).json({ error: 'Giveaway entries are not open right now.' });
    const b = req.body || {};
    if (b.company) return res.json({ ok: true, status: 'entered' }); // honeypot
    if (limited(req.ip)) return res.status(429).json({ error: 'Too many attempts. Please try again in a few minutes.' });
    const entry = {
      email: String(b.email || '').trim().toLowerCase(),
      firstName: String(b.firstName || '').trim().slice(0, 80),
      lastName: String(b.lastName || '').trim().slice(0, 80),
      region: String(b.region || '').trim().toUpperCase(),
      country: 'US',
      ageConfirmed: b.ageConfirmed === true,
      rulesAccepted: b.rulesAccepted === true,
      ipHash: crypto.createHash('sha256').update(`giveaway:${req.ip}`).digest('hex').slice(0, 32),
    };
    if (!entry.firstName || !entry.lastName) return res.status(400).json({ error: 'Please enter your first and last name.' });
    if (!EMAIL.test(entry.email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
    if (!US_STATES.includes(entry.region)) return res.status(400).json({ error: 'Please choose your state.' });
    if (!entry.ageConfirmed || !entry.rulesAccepted) return res.status(400).json({ error: `Please confirm you are ${s.c.min_age || 18} or older and agree to the Official Rules.` });
    try {
      const result = await store.enter(s.f.campaignId, entry);
      if (result === 'entered') return res.json({ ok: true, status: 'entered', message: "You're entered! Check your inbox for a confirmation email." });
      if (result === 'duplicate') return res.json({ ok: true, status: 'duplicate', message: "You're already entered. Each person can enter once." });
      if (result === 'ineligible') return res.status(400).json({ error: 'Sorry, you are not eligible for this giveaway. See the Official Rules.' });
      return res.status(403).json({ error: 'Giveaway entries are not open right now.' });
    } catch (err) {
      console.error('giveaway entry:', err.message);
      return res.status(500).json({ error: 'We could not save your entry right now. Please try again.' });
    }
  });

  // ---------- Admin ----------
  app.get('/admin/giveaway', (_req, res) => {
    noStore(res).set('X-Robots-Tag', 'noindex').type('html').send(render(TEMPLATES['admin-giveaway'], {
      supabaseUrl: env.SUPABASE_URL || 'https://hzoauxxpvrgahlavxmvp.supabase.co',
      publishableKey: env.SUPABASE_PUBLISHABLE_KEY || PUBLISHABLE_KEY,
    }));
  });

  const userCache = new Map();
  async function requireAdmin(req, res, next) {
    noStore(res).set('X-Robots-Tag', 'noindex');
    const token = (req.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
    if (!token) return res.status(401).json({ error: 'Sign in required.' });
    const admins = String(env.GIVEAWAY_ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
    let user = userCache.get(token);
    if (!user || Date.now() - user.at > 60000) {
      try { user = { at: Date.now(), u: await getUser(token, env) }; } catch { user = { at: 0, u: null }; }
      if (user.u) userCache.set(token, user);
      if (userCache.size > 200) userCache.delete(userCache.keys().next().value);
    }
    const u = user.u;
    if (!u) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
    const email = String(u.email || '').toLowerCase();
    if (!email || !u.email_confirmed_at || u.is_anonymous || !admins.includes(email)) return res.status(403).json({ error: 'This account is not a giveaway administrator.' });
    if (!store) return res.status(503).json({ error: 'The database is not configured on this server.' });
    req.admin = email;
    next();
  }
  const admin = (handler) => [requireAdmin, async (req, res) => {
    try { await handler(req, res, flags(env)); } catch (err) {
      console.error('giveaway admin:', err.message);
      res.status(err.detail ? 400 : 500).json({ error: err.detail || 'Something went wrong.' });
    }
  }];
  const cid = (f) => f.campaignId || 'founding-members-2026';

  app.get('/api/admin/giveaway/summary', ...admin(async (req, res, f) => {
    const [stats, campaignRow, winners, drawings] = await Promise.all([store.adminStats(cid(f)), store.campaignRow(cid(f)), store.winners(cid(f)), store.drawings(cid(f))]);
    const s = await state();
    const warnings = [];
    if (!f.enabled) warnings.push('GIVEAWAY_ENABLED is not "true" on Hostinger: the giveaway is hidden, entries are blocked and giveaway emails are held back. Nothing here can override that.');
    else if (!f.entries) warnings.push('GIVEAWAY_ENTRIES_ENABLED is not "true": the promotion can show but entries are blocked.');
    if (!campaignRow?.approved_at) warnings.push('Official rules are not approved (giveaway_campaigns.approved_at is empty), so the promotion stays hidden.');
    if (f.enabled && campaignRow?.approved_at && !s.visible) warnings.push(`Campaign status is "${campaignRow.status}", so the promotion is hidden.`);
    res.json({ flags: { ...f.raw, effective_enabled: f.enabled, effective_entries: f.entries }, public_visible: !!s.visible, entries_open: !!s.entriesOpen, campaign: campaignRow, stats, winners, drawings, warnings, admin: req.admin });
  }));

  app.get('/api/admin/giveaway/entries', ...admin(async (_req, res, f) => res.json(await store.entries(cid(f)))));
  app.get('/api/admin/giveaway/entries.csv', ...admin(async (_req, res, f) => {
    const rows = await store.entries(cid(f));
    res.type('text/csv').attachment(`${cid(f)}-entries.csv`).send(toCsv(rows, ['id', 'entered_at', 'first_name', 'last_name', 'email', 'region', 'country', 'entry_method', 'eligibility_status', 'eligibility_note']));
  }));
  app.post('/api/admin/giveaway/entries/:id/status', ...admin(async (req, res) => {
    const status = req.body?.status;
    if (!UUID.test(req.params.id) || !['eligible', 'ineligible', 'disqualified'].includes(status)) return res.status(400).json({ error: 'Invalid entry or status.' });
    res.json(await store.setEntryStatus(req.params.id, status, String(req.body?.note || '').slice(0, 300) || null));
  }));
  app.get('/api/admin/giveaway/payments', ...admin(async (_req, res) => res.json(await store.payments())));
  app.get('/api/admin/giveaway/payments.csv', ...admin(async (_req, res) => {
    res.type('text/csv').attachment('subscription-events.csv').send(toCsv(await store.payments(), ['event_at', 'event_type', 'user_id', 'product_id', 'store', 'environment', 'period_type', 'cancel_reason', 'price_usd', 'stale', 'id']));
  }));
  app.get('/api/admin/giveaway/emails', ...admin(async (req, res) => {
    const status = ['queued', 'sending', 'sent', 'failed', 'suppressed'].includes(req.query.status) ? req.query.status : null;
    res.json(await store.emails(status));
  }));
  app.post('/api/admin/giveaway/emails/:id/retry', ...admin(async (req, res) => {
    if (!UUID.test(req.params.id)) return res.status(400).json({ error: 'Invalid email id.' });
    const rows = await store.retryEmail(req.params.id);
    if (!rows?.length) return res.status(409).json({ error: 'Only failed or suppressed emails can be retried.' });
    res.json({ ok: true });
  }));
  app.post('/api/admin/giveaway/draw', ...admin(async (req, res, f) => {
    const winners = Number(req.body?.winners), alternates = Number(req.body?.alternates);
    if (req.body?.confirm !== 'DRAW') return res.status(400).json({ error: 'Type DRAW to confirm.' });
    if (![winners, alternates].every((n) => Number.isInteger(n) && n >= 0 && n <= 10)) return res.status(400).json({ error: 'Invalid numbers.' });
    const drawingId = await store.draw(cid(f), winners, alternates, req.admin, String(req.body?.notes || '').slice(0, 500));
    res.json({ ok: true, drawing_id: drawingId });
  }));
  app.post('/api/admin/giveaway/winners/:id', ...admin(async (req, res, f) => {
    const { status, notes, notify } = req.body || {};
    if (!UUID.test(req.params.id)) return res.status(400).json({ error: 'Invalid winner id.' });
    if (notify) {
      if (!f.enabled) return res.status(409).json({ error: 'GIVEAWAY_ENABLED is not "true", so giveaway emails are turned off. Notify the winner directly by email instead.' });
      const winner = (await store.winners(cid(f))).find((w) => w.id === req.params.id);
      if (!winner || winner.role !== 'winner') return res.status(400).json({ error: 'Only selected winners can be notified. Promote an alternate first.' });
      const c = await store.campaignRow(cid(f));
      await store.queueEmail({
        to_email: winner.entry.email, email_type: 'giveaway_winner', idempotency_key: `giveaway_winner:${winner.id}`,
        payload: { first_name: winner.entry.first_name, prize: c.prize_description, campaign_name: c.name, respond_by: new Date(Date.now() + 7 * 864e5).toISOString() },
      });
      return res.json(await store.setWinner(req.params.id, { status: 'notified', updated_by: req.admin, updated_at: new Date().toISOString() }));
    }
    const patch = { updated_by: req.admin, updated_at: new Date().toISOString() };
    if (status) {
      if (!['selected', 'notified', 'verified', 'declined', 'forfeited', 'awarded'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });
      patch.status = status;
    }
    if (req.body?.role === 'winner') patch.role = 'winner'; // promote an alternate after a forfeit
    if (notes !== undefined) patch.notes = String(notes).slice(0, 500);
    if (patch.role) {
      const all = await store.winners(cid(f));
      const c = await store.campaignRow(cid(f));
      const active = all.filter((w) => w.role === 'winner' && !['declined', 'forfeited'].includes(w.status)).length;
      if (active >= c.prize_count) return res.status(409).json({ error: `There are already ${c.prize_count} active winners. Mark one as declined or forfeited first.` });
    }
    res.json(await store.setWinner(req.params.id, patch));
  }));
}

module.exports = { mount, flags, demoStore, supabaseStore, render, toCsv };
