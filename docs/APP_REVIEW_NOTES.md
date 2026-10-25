# App Review notes: sign-in, subscriptions, account deletion

Paste the relevant parts into App Store Connect → App Review Information. Put the demo account password only in App Store Connect, never in this repo.

**Sign-in**
- MoodPals supports email and password, and Sign in with Apple (sign-in and create-account screens, under the main button).
- An existing email account can add Apple in Settings → Sign in with Apple. This links Apple to the same account, so all data, Circle, family watches and the subscription stay. Accounts are never merged just because the email addresses match.
- Guests can use the app without an account ("Get Started"). Circle needs an account.

**Subscription**
- MoodPals Free and MoodPals Plus (monthly or annual, Apple in-app purchase).
- Settings → MoodPals Plus → Manage Subscription opens Apple's subscription management. Restore Purchases is on the same screen and on the paywall.

**Account deletion**
- Settings → Delete account. The user signs in again (password, or Apple for Apple accounts), then types DELETE.
- This deletes the profile, mood and wellness history, Circle memberships, reactions and notifications, linked Apple Watches, and every family watch profile the account manages.
- Deleting the account does not cancel an Apple subscription. The delete screen says so and links to Manage Subscription.

**Family watches**
- Family Setup watches link as mood-only profiles under the owner's account. Owners remove one in Family → Manage → Remove Linked Profile (type DELETE). This signs the watch out and deletes only that profile.

**Demo account**
- Use an email/password account that has Circle friends, a linked family profile and mood history, so reviewers can see each feature.
