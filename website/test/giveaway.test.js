const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server');
const { flags, demoStore, toCsv } = require('../giveaway');

const ON = { GIVEAWAY_ENABLED: 'true', GIVEAWAY_ENTRIES_ENABLED: 'true', GIVEAWAY_CAMPAIGN_ID: 'founding-members-2026', GIVEAWAY_ADMIN_EMAILS: 'admin@moodpals.com' };
const ENTRY = { firstName: 'Ana', lastName: 'Lee', email: 'ana@example.com', region: 'TX', ageConfirmed: true, rulesAccepted: true };
const USERS = {
  admin: { email: 'admin@moodpals.com', email_confirmed_at: '2026-01-01' },
  member: { email: 'member@example.com', email_confirmed_at: '2026-01-01' },
  unconfirmed: { email: 'admin@moodpals.com', email_confirmed_at: null },
};

async function start({ env = {}, store = demoStore() } = {}) {
  const app = createApp({ env, store, getUser: async (t) => USERS[t] || null });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const req = async (path, { method = 'GET', body, token } = {}) => {
    const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body && JSON.stringify(body) });
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch {}
    return { status: res.status, headers: res.headers, text, json };
  };
  return { req, env, close: () => new Promise((r) => server.close(r)) };
}

test('flags: only the exact value "true" switches anything on', () => {
  assert.equal(flags({}).enabled, false);
  for (const v of ['TRUE', 'True', ' true', 'true ', '1', 'yes', 'on', '', 'false']) {
    assert.equal(flags({ ...ON, GIVEAWAY_ENABLED: v }).enabled, false, v);
    assert.equal(flags({ ...ON, GIVEAWAY_ENTRIES_ENABLED: v }).entries, false, v);
  }
  assert.equal(flags({ ...ON, GIVEAWAY_CAMPAIGN_ID: '' }).enabled, false);
  assert.equal(flags({ ...ON, GIVEAWAY_CAMPAIGN_ID: 'Bad ID!' }).enabled, false);
  assert.equal(flags({ ...ON, GIVEAWAY_ENABLED: 'false' }).entries, false, 'entries need the main switch');
  assert.deepEqual([flags(ON).enabled, flags(ON).entries], [true, true]);
});

test('disabled by default: no promotion anywhere and entries rejected', async () => {
  const s = await start();
  try {
    const home = await s.req('/');
    assert.equal(home.status, 200);
    assert.doesNotMatch(home.text, /giveaway|Apple Watches\. Two Winners/i);
    assert.match(home.headers.get('cache-control'), /no-store/);
    for (const p of ['/giveaway', '/giveaway/rules', '/giveaway/']) {
      const r = await s.req(p);
      assert.equal(r.status, 404, p);
      assert.doesNotMatch(r.text, /Apple Watch|Enter Giveaway|members/i, p);
      assert.match(r.headers.get('cache-control'), /no-store/);
    }
    const api = await s.req('/api/giveaway');
    assert.deepEqual(api.json, { campaign_enabled: false });
    const post = await s.req('/api/giveaway/entries', { method: 'POST', body: ENTRY });
    assert.equal(post.status, 403);
    for (const p of ['/index.html', '/index', '/views/giveaway-page.html', '/giveaway-page.html']) {
      const r = await s.req(p);
      assert.doesNotMatch(r.text, /Apple Watches\. Two Winners|gw-card/, p);
    }
  } finally { await s.close(); }
});

test('promotion on, entries off: pages show, the API blocks entries', async () => {
  const s = await start({ env: { ...ON, GIVEAWAY_ENTRIES_ENABLED: 'false' } });
  try {
    const home = await s.req('/');
    assert.match(home.text, /Two Apple Watches\. Two Winners\. One Growing Community\./);
    assert.match(home.text, /Our Goal: 1,000 Premium Members/);
    assert.match(home.text, /684<\/b> verified paid members/);
    assert.match(home.text, /href="\/giveaway">Giveaway<\/a>/);
    const page = await s.req('/giveaway');
    assert.equal(page.status, 200);
    assert.match(page.text, /We're Giving Away 2 Apple Watch SE 3 Devices!/);
    assert.match(page.text, /data-state="closed"|data-state="soon"/);
    assert.match(page.text, /Apple is not a participant in or sponsor/);
    const api = await s.req('/api/giveaway');
    assert.equal(api.json.campaign_enabled, true);
    assert.equal(api.json.entries_open, false);
    assert.deepEqual(Object.keys(api.json).sort(), ['campaign_enabled', 'current_paid_members', 'drawing_date', 'end_date', 'entries_open', 'prize_count', 'start_date', 'status', 'target_members']);
    assert.equal((await s.req('/api/giveaway/entries', { method: 'POST', body: ENTRY })).status, 403);
  } finally { await s.close(); }
});

test('entries on: one free entry per email, validation, then switching off takes effect on the next request', async () => {
  const s = await start({ env: { ...ON } });
  try {
    assert.match((await s.req('/giveaway')).text, /data-state="open"/);
    const ok = await s.req('/api/giveaway/entries', { method: 'POST', body: ENTRY });
    assert.equal(ok.json.status, 'entered');
    const dup = await s.req('/api/giveaway/entries', { method: 'POST', body: { ...ENTRY, email: 'ANA@example.com' } });
    assert.equal(dup.json.status, 'duplicate');
    for (const bad of [{ ageConfirmed: false }, { rulesAccepted: false }, { region: 'ZZ' }, { email: 'nope' }, { firstName: '' }, { ageConfirmed: 'true' }]) {
      assert.equal((await s.req('/api/giveaway/entries', { method: 'POST', body: { ...ENTRY, email: 'x@example.com', ...bad } })).status, 400, JSON.stringify(bad));
    }
    s.env.GIVEAWAY_ENABLED = 'false';
    assert.equal((await s.req('/giveaway')).status, 404);
    assert.doesNotMatch((await s.req('/')).text, /gw-card/);
    assert.equal((await s.req('/api/giveaway/entries', { method: 'POST', body: { ...ENTRY, email: 'later@example.com' } })).status, 403);
    assert.deepEqual((await s.req('/api/giveaway')).json, { campaign_enabled: false });
  } finally { await s.close(); }
});

test('flag on but rules not approved, cancelled, or database down: stays hidden', async () => {
  const cases = [
    { ...demoStore(), campaign: async () => ({ ...(await demoStore().campaign('founding-members-2026')), approved: false }) },
    { ...demoStore(), campaign: async () => ({ ...(await demoStore().campaign('founding-members-2026')), status: 'cancelled' }) },
    { ...demoStore(), campaign: async () => { throw new Error('db down'); } },
    { ...demoStore(), campaign: async () => null },
  ];
  for (const store of cases) {
    const s = await start({ env: { ...ON }, store });
    try {
      assert.equal((await s.req('/giveaway')).status, 404);
      assert.deepEqual((await s.req('/api/giveaway')).json, { campaign_enabled: false });
      assert.equal((await s.req('/api/giveaway/entries', { method: 'POST', body: ENTRY })).status, 403);
    } finally { await s.close(); }
  }
  const s = await start({ env: { ...ON }, store: null });
  try { assert.equal((await s.req('/giveaway')).status, 404); } finally { await s.close(); }
});

test('admin API: sign-in and allow-list required; disabled flag shows a warning and blocks winner emails', async () => {
  const s = await start({ env: { ...ON, GIVEAWAY_ENABLED: 'false' } });
  try {
    assert.equal((await s.req('/api/admin/giveaway/summary')).status, 401);
    assert.equal((await s.req('/api/admin/giveaway/summary', { token: 'bogus' })).status, 401);
    assert.equal((await s.req('/api/admin/giveaway/summary', { token: 'member' })).status, 403);
    assert.equal((await s.req('/api/admin/giveaway/summary', { token: 'unconfirmed' })).status, 403);
    assert.equal((await s.req('/api/admin/giveaway/entries.csv', { token: 'member' })).status, 403);
    const sum = await s.req('/api/admin/giveaway/summary', { token: 'admin' });
    assert.equal(sum.status, 200);
    assert.equal(sum.json.flags.effective_enabled, false);
    assert.match(sum.json.warnings.join(' '), /GIVEAWAY_ENABLED is not "true"/);
    assert.equal(sum.json.public_visible, false);
    const notify = await s.req('/api/admin/giveaway/winners/7f0f7a5e-6c1b-4d2c-9d7e-0a0b0c0d0e0f', { method: 'POST', token: 'admin', body: { notify: true } });
    assert.equal(notify.status, 409);
    assert.equal((await s.req('/api/admin/giveaway/draw', { method: 'POST', token: 'admin', body: { winners: 2, alternates: 3 } })).status, 400);
    const page = await s.req('/admin/giveaway');
    assert.equal(page.status, 200);
    assert.match(page.headers.get('x-robots-tag'), /noindex/);
    assert.doesNotMatch(page.text, /service_role|SUPABASE_SERVICE/);
  } finally { await s.close(); }
  const none = await start({ env: { ...ON, GIVEAWAY_ADMIN_EMAILS: '' } });
  try { assert.equal((await none.req('/api/admin/giveaway/summary', { token: 'admin' })).status, 403); } finally { await none.close(); }
});

test('CSV export escapes quotes and spreadsheet formulas', () => {
  const csv = toCsv([{ a: '=HYPERLINK("x")', b: 'Lee, Ana', c: '+1' }], ['a', 'b', 'c']);
  assert.equal(csv, 'a,b,c\n"\'=HYPERLINK(""x"")","Lee, Ana",\'+1');
});
