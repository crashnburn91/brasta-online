# Brasta for Android

Brasta Android 0.1.0-beta.5 is a Capacitor 8 shell for the live Brasta service. It keeps the existing account, lobby, private, ranked, tournament, and realtime gameplay experience while adding:

- transient immersive mode with system bars available by edge swipe;
- light interaction haptics plus gameplay-specific success, warning, and impact patterns;
- Firebase Cloud Messaging notifications for friend invites, ranked matches, opening choices, and turns;
- notification and deep-link routing back into the matching Brasta room;
- Android Custom Tabs for Google, Apple, and Discord authentication.

The beta shell loads `https://brasta.app` by default so a test APK stays in sync with the web release. CI builds from `feature/android-app` use that branch's stable Vercel preview alias, which makes Android-specific bridge changes testable before they reach production. Preview WebView requests include Vercel's `x-vercel-skip-toolbar` header so preview controls are not injected into the Android app. The GitHub Actions variable `BRASTA_ANDROID_SERVER_URL` overrides either default. A store release should bundle a fixed, reviewed web client instead of relying on a remote server URL.

## Build an APK

Requirements for a local build:

- Node.js 24;
- Java 21;
- Android SDK Platform 36 and Build Tools 36.0.0.

Then run:

```bash
npm ci
npm run android:apk
```

The native source project lives in `android/`. The automatically signed debug APK is produced at `android/app/build/outputs/apk/debug/app-debug.apk`.

The `Android APK` GitHub Actions workflow runs the complete Brasta build and uploads an installable APK plus its SHA-256 checksum. CI generates a dedicated beta-only signing key at an explicit path and caches that exact file so subsequent test builds can update one another. The cache path used through beta 4 did not persist the generated key, so Android requires one final uninstall before installing beta 5; builds after that can update in place.

## Enable native authentication

Add `brasta://auth/callback` under Supabase **Authentication → URL Configuration → Redirect URLs**. Without that exact allowlist entry, Supabase rejects the native return URI and falls back to the Site URL, leaving the Custom Tab signed in but not the app.

The Android client keeps the PKCE verifier and flow identifier in the app WebView, receives the one-time authorization code through the `brasta://` deep link, closes the Custom Tab, and exchanges the code inside the app's own Supabase client. Authorization codes and verifier values are never placed in app logs.

Beta 4 and later also make Firebase capability explicit in the APK user agent. Builds without `google-services.json` omit the native push plugin and do not invoke FCM registration after sign-in, preventing Firebase's unconfigured default-app failure from terminating the process. When Firebase configuration is included, Capacitor sync includes the plugin, adds the `BrastaPush/1` capability marker, and notification registration proceeds normally.

## Enable push notifications

1. Create a Firebase Android app with package name `app.brasta`.
2. Download its `google-services.json`. For local builds, place it at `android/app/google-services.json`. For GitHub Actions, base64-encode it and save the result as the repository secret `GOOGLE_SERVICES_JSON_BASE64`.
3. Create a Firebase service account that can send Cloud Messaging messages. Save its JSON as `FIREBASE_SERVICE_ACCOUNT_JSON` in both Vercel and Railway. Raw JSON and base64-encoded JSON are supported.
4. Apply `supabase/migrations/20260906075022_android_push_subscriptions.sql` to the production Supabase project.
5. Deploy the frontend/API changes to Vercel and the realtime server changes to Railway before testing notifications against `https://brasta.app`.

The push registration table has row-level security enabled and grants no browser role direct access. Device tokens are created only through an authenticated `/api/push` request. Each device also holds a random revocation secret whose hash is stored by the server, allowing an offline sign-out to retry deletion later without retaining account credentials. Invalid FCM registrations are pruned after delivery failures, and registrations that have not refreshed in 45 days are not targeted.

## Install and test

On an Android 7 or newer device, allow installation from the browser or file manager used to open the APK, then install it. On Android 13 or newer, accept Brasta's notification permission after signing in.

Test at least these flows on a physical device:

1. Sign in by email code and by one configured social provider.
2. Swipe from an edge to reveal the system bars, then return to the app and confirm immersive mode resumes.
3. Confirm light tap feedback and distinct feedback for turns, burns, captures, round end, and match end.
4. Background the app; receive a private invite, ranked-match alert, and turn alert from another account/device.
5. Tap each notification and confirm it opens the correct room or Friends panel.
6. Sign out and confirm the device no longer receives notifications for that account.
