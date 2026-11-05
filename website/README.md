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
| `GIVEAWAY_ENABLED` / `GIVEAWAY_ENTRIES_ENABLED` | unset → giveaway off (only `true` turns it on) |
| `GIVEAWAY_CAMPAIGN_ID` | unset → giveaway off |
| `GIVEAWAY_ADMIN_EMAILS` | unset → nobody can open `/admin/giveaway` |

Giveaway setup, Hostinger on/off steps and the launch checklist: [`docs/giveaway.md`](../docs/giveaway.md). Tests: `npm test`.

iPhone screenshots live in `public/img/screens/` (`today.png`, `actions.png`, `diary.png`, `ask.png`). Until they exist the phones show HTML previews of those screens.
