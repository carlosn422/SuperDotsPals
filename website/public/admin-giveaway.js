// /admin/giveaway: signs in with Supabase (email + password) and calls the server's admin API with the access token.
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const when = (d) => (d ? new Date(d).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const { supabaseUrl, publishableKey } = document.body.dataset;
let token = sessionStorage.getItem('gwAdminToken');

async function api(path, opts = {}) {
  const res = await fetch(`/api/admin/giveaway${path}`, { ...opts, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...opts.headers } });
  if (res.status === 401) { signOut(); throw new Error('Please sign in again.'); }
  const out = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
  if (!res.ok) throw new Error(out.error || 'Request failed');
  return out;
}
const table = (rows, cols) => rows.length
  ? `<div class="ga-scroll"><table><tr>${cols.map(([, h]) => `<th>${h}</th>`).join('')}</tr>${rows.map((r) => `<tr>${cols.map(([k, , f]) => `<td>${f ? f(r) : esc(r[k])}</td>`).join('')}</tr>`).join('')}</table></div>`
  : '<p class="fine">Nothing here yet.</p>';

function signOut() { sessionStorage.removeItem('gwAdminToken'); token = null; $('.ga-app').hidden = true; $('.ga-login').hidden = false; $('.ga-out').hidden = true; $('.ga-who').textContent = ''; }
$('.ga-out').addEventListener('click', signOut);

$('.ga-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const d = new FormData(e.target), msg = e.target.querySelector('.form-msg');
  msg.className = 'form-msg'; msg.textContent = 'Signing in…';
  const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: publishableKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: d.get('email'), password: d.get('password') }) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) { msg.className = 'form-msg err'; msg.textContent = out.error_description || out.msg || 'Sign in failed.'; return; }
  token = out.access_token; sessionStorage.setItem('gwAdminToken', token);
  load().catch((err) => { msg.className = 'form-msg err'; msg.textContent = err.message; });
});

let entries = [];
function renderEntries() {
  const q = $('.ga-filter').value.trim().toLowerCase();
  const rows = entries.filter((r) => !q || `${r.first_name} ${r.last_name} ${r.email} ${r.region} ${r.eligibility_status}`.toLowerCase().includes(q));
  $('.ga-entries').innerHTML = `<p class="fine">${rows.length} of ${entries.length} entries</p>` + table(rows, [
    ['entered_at', 'Entered', (r) => when(r.entered_at)], ['first_name', 'Name', (r) => esc(`${r.first_name} ${r.last_name}`)], ['email', 'Email'], ['region', 'State'],
    ['entry_method', 'Method'], ['eligibility_status', 'Status', (r) => `<select data-entry="${r.id}">${['eligible', 'ineligible', 'disqualified'].map((s) => `<option${s === r.eligibility_status ? ' selected' : ''}>${s}</option>`).join('')}</select>`],
    ['eligibility_note', 'Note'],
  ]);
}
$('.ga-filter').addEventListener('input', renderEntries);
$('.ga-entries').addEventListener('change', async (e) => {
  const id = e.target.dataset.entry; if (!id) return;
  const note = e.target.value === 'eligible' ? '' : prompt('Reason (kept for the audit record):') || '';
  try { await api(`/entries/${id}/status`, { method: 'POST', body: JSON.stringify({ status: e.target.value, note }) }); await load(); } catch (err) { alert(err.message); }
});

async function loadEmails() {
  const status = $('.ga-email-status').value;
  const rows = await api(`/emails${status ? `?status=${status}` : ''}`);
  $('.ga-emails').innerHTML = table(rows, [['created_at', 'Created', (r) => when(r.created_at)], ['email_type', 'Type'], ['to_email', 'To', (r) => esc(r.to_email || r.user_id)], ['delivery_status', 'Status'], ['attempts', 'Tries'], ['last_error', 'Error'],
    ['id', '', (r) => ['failed', 'suppressed'].includes(r.delivery_status) ? `<button class="btn btn-sm" data-retry="${r.id}">Retry</button>` : '']]);
}
$('.ga-email-status').addEventListener('change', () => loadEmails().catch((e) => alert(e.message)));
$('.ga-emails').addEventListener('click', async (e) => {
  const id = e.target.dataset.retry; if (!id) return;
  try { await api(`/emails/${id}/retry`, { method: 'POST' }); await loadEmails(); } catch (err) { alert(err.message); }
});

document.querySelectorAll('.ga-dl').forEach((a) => a.addEventListener('click', async (e) => {
  e.preventDefault();
  try {
    const csv = await api(`/${a.dataset.csv}`);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    Object.assign(document.createElement('a'), { href: url, download: a.dataset.csv }).click();
    URL.revokeObjectURL(url);
  } catch (err) { alert(err.message); }
}));

$('.ga-draw').addEventListener('submit', async (e) => {
  e.preventDefault();
  const d = new FormData(e.target);
  if (!confirm('Run the random drawing now? This is recorded and cannot be undone.')) return;
  try { await api('/draw', { method: 'POST', body: JSON.stringify({ winners: Number(d.get('winners')), alternates: Number(d.get('alternates')), confirm: d.get('confirm'), notes: d.get('notes') }) }); e.target.reset(); await load(); } catch (err) { alert(err.message); }
});
$('.ga-winners').addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-w]'); if (!b) return;
  const body = b.dataset.action === 'notify' ? { notify: true } : b.dataset.action === 'promote' ? { role: 'winner' } : { status: b.dataset.action };
  if (!confirm(`${b.textContent}?`)) return;
  try { await api(`/winners/${b.dataset.w}`, { method: 'POST', body: JSON.stringify(body) }); await load(); } catch (err) { alert(err.message); }
});

async function load() {
  const s = await api('/summary');
  $('.ga-login').hidden = true; $('.ga-app').hidden = false; $('.ga-out').hidden = false; $('.ga-who').textContent = s.admin;
  $('.ga-warnings').innerHTML = s.warnings.map((w) => `<p class="ga-warn">${esc(w)}</p>`).join('');
  const st = s.stats || {}, c = s.campaign || {};
  const card = (label, v) => `<div class="ga-stat"><span>${label}</span><b>${esc(v)}</b></div>`;
  $('.ga-stats').innerHTML = [
    ['Paid progress', `${st.active_paid_members ?? 0} / ${c.target_members ?? 1000}`], ['Registered accounts', st.registered_accounts], ['Guest accounts', st.guest_accounts],
    ['Active paid members', st.active_paid_members], ['Monthly', st.monthly_members], ['Annual', st.annual_members], ['Est. MRR', `$${Number(st.estimated_mrr_usd || 0).toFixed(2)}`],
    ['New purchases (30d)', st.new_purchases_30d], ['Renewals (30d)', st.renewals_30d], ['Cancellations (30d)', st.cancellations_30d], ['Cancelled, still paid', st.cancelled_still_paid],
    ['Expirations (30d)', st.expirations_30d], ['Refunds (30d)', st.refunds_30d], ['Valid entries', `${st.entries_valid ?? 0} of ${st.entries_total ?? 0}`],
    ['Winners', `${st.winners ?? 0} drawn, ${st.winners_verified ?? 0} verified`], ['Failed emails', st.emails_failed],
  ].map(([l, v]) => card(l, v ?? 0)).join('');
  const f = s.flags;
  $('.ga-flags').innerHTML = table([
    { k: 'GIVEAWAY_ENABLED', v: f.GIVEAWAY_ENABLED, e: f.effective_enabled }, { k: 'GIVEAWAY_ENTRIES_ENABLED', v: f.GIVEAWAY_ENTRIES_ENABLED, e: f.effective_entries }, { k: 'GIVEAWAY_CAMPAIGN_ID', v: f.GIVEAWAY_CAMPAIGN_ID, e: !!f.GIVEAWAY_CAMPAIGN_ID },
  ], [['k', 'Variable'], ['v', 'Value on server', (r) => r.v == null ? '<i>not set</i>' : `<code>${esc(r.v)}</code>`], ['e', 'Effect', (r) => (r.e ? 'On' : 'Off')]])
    + `<p>Public promotion: <b>${s.public_visible ? 'showing' : 'hidden'}</b>. Entries: <b>${s.entries_open ? 'open' : 'closed'}</b>.</p>`;
  $('.ga-campaign').innerHTML = table([
    ['Campaign', `${c.name} (${c.id})`], ['Status', c.status], ['Rules approved', c.approved_at ? `${when(c.approved_at)} by ${c.approved_by || '—'}` : 'Not approved'],
    ['Opens', when(c.start_date)], ['Closes', when(c.end_date)], ['Drawing', when(c.drawing_date)], ['Target', c.target_members], ['Prizes', `${c.prize_count} × ${c.prize_description}`],
    ['Eligibility', `${c.min_age}+, ${(c.eligible_countries || []).join(', ')}${(c.excluded_regions || []).length ? `, excluding ${c.excluded_regions.join(', ')}` : ''}`], ['Rules URL', c.official_rules_url || '/giveaway/rules'],
  ].map(([k, v]) => ({ k, v })), [['k', 'Setting'], ['v', 'Value']]) + '<p class="fine">Campaign settings are edited in Supabase (table giveaway_campaigns). They can never turn on a giveaway that Hostinger has turned off.</p>';
  $('.ga-winners').innerHTML = (s.drawings || []).map((d) => `<p class="fine">Drawing ${when(d.drawn_at)} by ${esc(d.drawn_by)} · pool ${d.pool_size} · seed <code>${esc(d.seed)}</code> · pool hash <code>${esc(d.pool_sha256.slice(0, 16))}…</code></p>`).join('') + table(s.winners || [], [
    ['draw_order', '#'], ['role', 'Role'], ['entry', 'Entrant', (w) => esc(`${w.entry.first_name} ${w.entry.last_name} · ${w.entry.email} · ${w.entry.region}`)], ['status', 'Status'], ['updated_by', 'Updated', (w) => `${esc(w.updated_by)}<br>${when(w.updated_at)}`],
    ['id', 'Actions', (w) => (w.role === 'winner'
      ? [['notify', 'Send winner email'], ['verified', 'Mark verified'], ['awarded', 'Mark prize sent'], ['forfeited', 'Mark forfeited'], ['declined', 'Mark declined']]
      : [['promote', 'Promote to winner']]).map(([a, l]) => `<button class="btn btn-sm" data-w="${w.id}" data-action="${a}">${l}</button>`).join(' ')],
  ]);
  entries = await api('/entries'); renderEntries();
  await loadEmails();
  const pay = await api('/payments');
  $('.ga-payments').innerHTML = table(pay.slice(0, 200), [['event_at', 'When', (r) => when(r.event_at)], ['event_type', 'Event'], ['product_id', 'Product'], ['environment', 'Env'], ['store', 'Store'], ['period_type', 'Period'], ['cancel_reason', 'Reason'], ['price_usd', 'USD'], ['user_id', 'User']]);
}
if (token) load().catch(() => signOut());
