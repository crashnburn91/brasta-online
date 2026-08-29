# Brasta Live Traffic

The live traffic feature records short-lived browser presence in Redis and exposes it only through the authenticated admin dashboard at `/admin/live`.

## What is recorded

- Anonymous browser session ID generated locally and stored in localStorage
- Signed-in / guest status
- Brasta display name or username for signed-in users
- Current app activity: home, lobby, match, spectating, auth, or admin
- Room code when the browser is in a room
- Mobile / tablet / desktop classification
- Browser family
- Visible vs background tab
- First-seen and last-seen timestamps

IP addresses and full user-agent strings are not persisted.

Active presence expires automatically. The dashboard treats a session as online when its last heartbeat is within 90 seconds. Browser presence keys expire after 15 minutes.

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
