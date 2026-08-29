# Brasta Live Traffic

The live traffic feature records short-lived browser presence in Redis and exposes it only through the authenticated admin dashboard at `/admin/live`.

## What is recorded

- Anonymous browser session ID generated locally and stored in localStorage
- Signed-in / guest status
- Brasta display name or username for signed-in users
- Current app activity: home, lobby, match, spectating, auth, or admin
- Room code when the browser is in a room
- Mobile / tablet / desktop classification
- Browser family and version
- Operating system and version when available
- Device model when browser client hints or the user agent expose one
- Screen and viewport dimensions plus device pixel ratio
- Browser language / locale and timezone
- Referring hostname
- Installed / standalone PWA status
- Public IP address seen by Vercel
- Approximate IP-derived city, region, country, and timezone
- Visible vs background tab
- First-seen and last-seen timestamps

The browser does not expose MAC addresses, serial numbers, or stable hardware IDs. Exact phone models are not always available, especially on iOS.

## Privacy and retention

The live presence record is operational data, not a long-term visitor history.

- Presence heartbeats run about every 20 seconds.
- A session is considered online when its last heartbeat is within 90 seconds.
- The full presence record, including IP address and device/network details, expires automatically about 15 minutes after the browser stops reporting.
- IP addresses are not copied into the daily visitor or page-view counters.
- Full user-agent strings are used transiently to derive browser / OS details and are not persisted.
- Referrers are reduced to their hostname so URL paths and query parameters are not stored.
- Vercel geolocation is IP-derived and approximate; it is not GPS or precise device location.

## Dashboard authorization

At least one of these Vercel environment variables must be configured:

- `BRASTA_ADMIN_EMAILS` — comma-separated Brasta account email addresses
- `BRASTA_ADMIN_USER_IDS` — comma-separated Supabase auth user IDs

The API verifies the caller's Supabase access token and denies dashboard data unless the verified identity is on one of those allowlists.

## Traffic counters

Redis keeps:

- online sessions
- guest vs signed-in sessions
- playing and spectating sessions
- unique active room count
- sessions seen in the last 10 minutes
- unique browser sessions today
- page views today

Daily visitor/page-view keys expire after eight days. This is intended for lightweight operational visibility; Vercel Web Analytics can still be enabled separately for longer-term acquisition and referrer analytics.
