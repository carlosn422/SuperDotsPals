const express = require('express');
const fs = require('fs/promises');
const path = require('path');

const PORT = Number(process.env.PORT) || 3000;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hzoauxxpvrgahlavxmvp.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LOCAL_FILE = path.join(__dirname, 'data', 'subscribers.json');
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
const INTERESTS = ['stress', 'sleep', 'journaling', 'scripture', 'watch', 'inner-circle'];

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public'), {
  extensions: ['html'],
  setHeaders: (res, file) => {
    // Always revalidate page code so visitors never see a stale mix of HTML/JS/CSS; images can cache.
    res.setHeader('Cache-Control', /\.(html|js|css)$/.test(file) ? 'no-cache' : 'public, max-age=3600');
  },
}));

// Small per-IP limiter so the public form can't be used to flood the list.
const hits = new Map(), eventHits = new Map();
function limited(ip, map = hits, max = 8) {
  const now = Date.now();
  const recent = (map.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  recent.push(now);
  map.set(ip, recent);
  return recent.length > max;
}

async function saveToSupabase(row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/waitlist_subscribers?on_conflict=email`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=ignore-duplicates,return=minimal',
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`Supabase insert failed (${res.status}): ${await res.text()}`);
}

// Cookie-free analytics (table site_events): no IPs, cookies or identifiers are stored.
const EVENTS = ['pageview', 'appstore_click'];
const text = (v, n) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);
async function recordEvent(row) {
  if (!SUPABASE_KEY) return;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/site_events`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(row),
  });
  if (!res.ok) console.error(`site_events insert failed (${res.status})`);
}

app.post('/api/event', (req, res) => {
  res.status(204).end();
  const b = req.body || {};
  if (!EVENTS.includes(b.event) || limited(req.ip, eventHits, 120)) return;
  let referrer = null;
  try { referrer = b.referrer ? new URL(b.referrer).hostname.replace(/^www\./, '') : null; } catch {}
  if (referrer === 'moodpals.com') referrer = null;
  recordEvent({
    event: b.event, path: text(b.path, 200), referrer_host: text(referrer, 120), placement: text(b.placement, 40),
    utm_source: text(b.utm_source, 80), utm_medium: text(b.utm_medium, 80), utm_campaign: text(b.utm_campaign, 80),
    device: b.device === 'mobile' ? 'mobile' : 'desktop',
  }).catch(() => {});
});

async function saveLocally(row) {
  let list = [];
  try { list = JSON.parse(await fs.readFile(LOCAL_FILE, 'utf8')); } catch {}
  if (!list.some((s) => s.email === row.email)) list.push({ ...row, created_at: new Date().toISOString() });
  await fs.mkdir(path.dirname(LOCAL_FILE), { recursive: true });
  await fs.writeFile(LOCAL_FILE, JSON.stringify(list, null, 2));
}

app.post('/api/subscribe', async (req, res) => {
  const { email, firstName, interests, company } = req.body || {};
  if (company) return res.json({ ok: true }); // honeypot field filled in by bots
  if (limited(req.ip)) return res.status(429).json({ error: 'Too many attempts. Please try again in a few minutes.' });
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!EMAIL.test(cleanEmail)) return res.status(400).json({ error: 'Please enter a valid email address.' });
  const row = {
    email: cleanEmail,
    first_name: String(firstName || '').trim().slice(0, 80) || null,
    interests: Array.isArray(interests) ? interests.filter((i) => INTERESTS.includes(i)).slice(0, 5) : [],
    source: 'website',
  };
  try {
    if (SUPABASE_KEY) await saveToSupabase(row);
    else await saveLocally(row);
    recordEvent({ event: 'waitlist_signup', path: '/' }).catch(() => {});
    res.json({ ok: true });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'We could not save your spot right now. Please try again.' });
  }
});

app.get('/healthz', (_req, res) => res.json({ ok: true, storage: SUPABASE_KEY ? 'supabase' : 'local-file' }));

app.listen(PORT, () => {
  console.log(`MoodPals website on http://localhost:${PORT} (subscribers -> ${SUPABASE_KEY ? 'Supabase' : LOCAL_FILE})`);
});
