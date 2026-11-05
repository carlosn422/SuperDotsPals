# MoodPals Founding Members Giveaway

Two Apple Watch SE 3 prizes, two winners, a free entry for everyone. The 1,000 paid-member goal is a community
milestone shown as progress. It is **not** an entry requirement and does not change anyone's odds.

## How it fits together

| Piece | Where | What it does |
|---|---|---|
| Kill switches | Hostinger env vars, read by `website/giveaway.js` on every request | Nothing giveaway-related renders, answers or sends unless `GIVEAWAY_ENABLED` is exactly `true` |
| Homepage section, `/giveaway`, `/giveaway/rules` | `website/views/*.html`, injected by the server | Server-rendered with `Cache-Control: no-store`, so turning it off can't leave a cached copy |
| Public API | `GET /api/giveaway` | Aggregate numbers only (target, verified paid count, prize count, dates). Disabled → `{"campaign_enabled":false}` |
| Free entry | `POST /api/giveaway/entries` → `giveaway_enter()` | Flags checked on the server, then dates, approval, status and eligibility checked again in SQL. One entry per email |
| Paid-member count | RevenueCat → `revenuecat-webhook` → `plus_entitlements` | Reuses the existing path. Counts production App Store/Play/Stripe purchases with a paid period still running. Trials, promo grants, sandbox, refunds and expired subscriptions don't count. Turning off auto-renew keeps a member counted until their period ends |
| Event history | `subscription_events` | Every RevenueCat event once (keyed by event id). Late, out-of-order events are logged with `stale = true` and don't overwrite newer state |
| Emails | `email_events` outbox → `email-outbox` Edge Function → Resend | Duplicate-proof (`idempotency_key`), retried 3 times automatically, then `failed` (retry from admin). Giveaway emails send only while `https://moodpals.com/api/giveaway` reports the campaign enabled |
| Admin | `/admin/giveaway` | Supabase email + password sign-in, plus the `GIVEAWAY_ADMIN_EMAILS` allow-list, checked on the server |
| Drawing | `giveaway_draw()` | Admin-triggered only, after the entry period ends. Random by `sha256(seed ‖ entry id)`; the seed and a hash of the entry pool are saved for audit |

The promotion shows only when **all** of these are true: `GIVEAWAY_ENABLED=true`, a valid `GIVEAWAY_CAMPAIGN_ID`,
the campaign row has `approved_at` set (official rules approved) and its status isn't `draft` or `cancelled`.
Entries additionally need `GIVEAWAY_ENTRIES_ENABLED=true`, status `active` and the current time inside the start and end dates.
Nothing in the database or admin dashboard can turn on what Hostinger has turned off.

## Hostinger: turning it on and off

Variables (the defaults below are the safe state; missing or any value other than exactly `true` means off):

```env
GIVEAWAY_ENABLED=false
GIVEAWAY_ENTRIES_ENABLED=false
GIVEAWAY_CAMPAIGN_ID=founding-members-2026
GIVEAWAY_ADMIN_EMAILS=you@example.com        # comma-separated; empty = nobody can open the admin
SUPABASE_SERVICE_ROLE_KEY=...                # already used by the waitlist; without it the giveaway stays hidden
```

1. hPanel → **Websites** → moodpals.com → **Node.js** app settings → **Environment variables**.
2. Edit the values and save.
3. **Redeploy / restart** the Node.js app. Node reads environment variables when the process starts, so a running
   app keeps its old values until it restarts. The server re-reads them on every request after that.
4. Verify: open `https://moodpals.com/api/giveaway` (should show `"campaign_enabled": true` or `false`) and
   `/admin/giveaway`, which lists the exact values the server is using.

| Goal | Values | Result |
|---|---|---|
| Promotion only | `GIVEAWAY_ENABLED=true`, `GIVEAWAY_ENTRIES_ENABLED=false` | Homepage section, `/giveaway`, rules and progress show. Entry form says entries aren't open; the API rejects entries |
| Promotion and entries | `GIVEAWAY_ENABLED=true`, `GIVEAWAY_ENTRIES_ENABLED=true` | Entries accepted while the campaign is active and inside its dates |
| Emergency stop | `GIVEAWAY_ENABLED=false`, `GIVEAWAY_ENTRIES_ENABLED=false` | Everything hidden, `/giveaway` returns a neutral 404, entries blocked, giveaway emails held as `suppressed` |

The emergency stop keeps existing entries, subscriptions, Plus access and membership emails. It is a technical stop,
not a legal cancellation: the published Official Rules still apply, so talk to your lawyer before stopping a live giveaway.

If Cloudflare proxies moodpals.com, keep its default behavior of not caching HTML. The pages also send
`Cache-Control: no-store` and `CDN-Cache-Control: no-store`.

## Campaign settings (Supabase, table `giveaway_campaigns`)

Set these once the rules are final, then set `approved_at` last:

```sql
update giveaway_campaigns set
  start_date = '2026-12-01 00:00 America/Chicago', end_date = '2027-01-31 23:59 America/Chicago',
  drawing_date = '2027-02-03 12:00 America/Chicago', prize_value_usd = 249.00,
  sponsor_name = '<legal name>', sponsor_address = '<mailing address>',
  min_age = 18, eligible_countries = '{US}', excluded_regions = '{}',
  official_rules_url = null,            -- or a URL if your lawyer hosts the rules elsewhere
  status = 'active', approved_at = now(), approved_by = '<who approved the rules>'
where id = 'founding-members-2026';
```

The draft rules in `website/views/giveaway-rules.html` fill in these values. Have them reviewed before approval.

## Launch checklist

1. Lawyer reviews and edits the Official Rules (`website/views/giveaway-rules.html`), including any state registration or bonding requirements for the prize value.
2. Apply `supabase/migrations/20261113_giveaway.sql`, deploy `revenuecat-webhook` and `email-outbox` (`--no-verify-jwt`; it checks its own key from Vault). `RESEND_API_KEY` must be set as a function secret.
3. Fill in the campaign row (above) and set `approved_at`.
4. On Hostinger set `GIVEAWAY_ADMIN_EMAILS`, then `GIVEAWAY_ENABLED=true` (promotion only), redeploy and check the site.
5. When the entry period starts, set `GIVEAWAY_ENTRIES_ENABLED=true` and redeploy.

## After the entry period

1. Review entries in `/admin/giveaway`, marking any ineligible ones with a reason.
2. Run the drawing (2 winners + alternates). The seed and pool hash are recorded.
3. **Send winner email** for each winner (needs `GIVEAWAY_ENABLED=true`; otherwise email them yourself), then mark them verified and prize sent.
4. If a winner doesn't reply in time or isn't eligible, mark them forfeited and promote the next alternate.
5. Announce winners publicly only after they are verified and notified.

## Tests

- `cd website && npm test`: flag parsing, disabled-by-default, direct `/giveaway` and API bypass attempts, caching headers, entry validation and duplicates, unapproved/cancelled/database-down states, admin sign-in and allow-list, CSV escaping.
- SQL (run in a rolled-back transaction against the project): paid counting (trial, sandbox, refund, cancelled-but-paid), entry rules, duplicate emails, drawing before/after the end date, the prize-count limit, distinct winners, milestone email de-duplication, and that `anon`/`authenticated` cannot read the tables or call the functions.
- Local preview with demo data: `GIVEAWAY_LOCAL_DEMO=true GIVEAWAY_ENABLED=true GIVEAWAY_ENTRIES_ENABLED=true GIVEAWAY_CAMPAIGN_ID=founding-members-2026 npm start` (only works without a Supabase key).
