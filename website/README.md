# MoodPals website

Landing page + early-subscriber waitlist (Node.js / Express).

```bash
cd website
npm install
npm start            # http://localhost:3000
```

Subscribers are stored in Supabase table `waitlist_subscribers` when `SUPABASE_SERVICE_ROLE_KEY` is set
(apply `supabase/migrations/20261022_waitlist_subscribers.sql` first). Without it they go to `website/data/subscribers.json` (git-ignored) for local testing.

| Env var | Default |
|---|---|
| `PORT` | `3000` |
| `SUPABASE_URL` | MoodPals project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | unset → local JSON file |

iPhone screenshots live in `public/img/screens/` (`today.png`, `actions.png`, `diary.png`, `ask.png`). Until they exist the phones show HTML previews of those screens.

## Analytics

`public/app.js` sends a cookie-free `pageview` on load and an `appstore_click` (with `placement`: nav, hero, faq, cta) to `POST /api/event`; `server.js` also records `waitlist_signup`. Rows go to Supabase `site_events` (migration `20261123_site_events.sql`) only when `SUPABASE_SERVICE_ROLE_KEY` is set. No IPs, cookies or identifiers are stored.

```sql
select created_at::date day, count(*) filter (where event='pageview') views,
       count(*) filter (where event='appstore_click') appstore_clicks
from site_events group by 1 order by 1 desc;
```
