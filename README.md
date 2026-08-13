# Brasta Online v0.4.5 — Startup Diagnostics

Standalone, server-authoritative Brasta with 1v1, 2v2, and spectator support.

## v0.4.5 startup hardening

This milestone adds diagnostics without changing Brasta gameplay or the realtime reconnect policy.

- The server-rendered page now shows a real **Loading Brasta…** screen immediately instead of an empty app container.
- If the client does not render within 8 seconds, the loading screen becomes a retry/error screen instead of remaining blank.
- Startup diagnostics record:
  - DOM ready and window load
  - `game.js`, `network.js`, and `app.js` resource timing
  - Brasta and BrastaNet bundle readiness
  - first successful app render
  - JavaScript errors and unhandled promise rejections
  - browser online/offline state
  - `pageshow`, `pagehide`, and visibility changes for iPhone/Safari lifecycle testing
  - WebSocket request, open, error, close code/reason, session receipt, and first room-state receipt
- The most recent five startup attempts are retained locally in the browser so a failed first attempt can still be inspected after a successful reload.
- Use `?debug=1` on any Brasta URL to show a **Boot diagnostics** button.
- The failure screen also provides **Diagnostics** and **Copy Diagnostics** controls.
- Static client URLs are versioned with `v=0.4.5` to reduce stale mixed-version browser caching during deployment testing.
- The mobile viewport explicitly uses `viewport-fit=cover` for iPhone safe-area behavior.

Example diagnostic URLs:

- Homepage: `/?debug=1`
- Player invite: `/?room=ABCDE&debug=1`
- Spectator invite: `/?spectate=ABCDE&debug=1`

## Spectating

Every room supports spectators without assigning them a player seat.

- Player invite: `/?room=ABCDE`
- Spectator invite: `/?spectate=ABCDE`
- Spectators can join before or after the game starts.
- Spectators see the public table, builds, scores, player names, current turn, announcements, Last Move banner, round results, match results, and each player's hand count.
- Spectators never receive the identity of any player's cards or undealt deck cards.
- Spectator sessions reconnect automatically.
- The server rejects gameplay commands sent by spectator sessions.

## Vercel architecture

- Next.js frontend on Vercel
- `/api/ws` WebSocket Vercel Function
- Redis/Upstash for durable room state
- Redis Pub/Sub for cross-instance room updates
- Automatic WebSocket reconnects
- Node.js 24.x

## Deploy on Vercel

1. Import this GitHub repository into Vercel.
2. Add Upstash Redis through Storage / Marketplace.
3. Confirm the project has a `REDIS_URL` environment variable.
4. Redeploy.

Vercel uses the repository's `npm run build` command automatically.

## Health check

Visit `/api/health` after deployment to confirm Redis status.

## Tests

Rules regression suite:

```bash
npm run test:rules
```

v0.4.4 gameplay validation before this diagnostics-only milestone:

- 17/17 rules regression tests passed
- 6/6 spectator server integration checks passed
- Browser TypeScript compilation passed
