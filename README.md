# Brasta Online v0.4.9 — Post-Hydration Bootstrap

Standalone, server-authoritative Brasta with 1v1, 2v2, and spectator support.

## v0.4.9 startup architecture

Diagnostics from iPhone Safari showed React error #418 immediately after the legacy Brasta client rendered. All Brasta bundles had loaded successfully, indicating that the intermittent first-load failure was a React/Next hydration collision rather than a missing script or network failure.

v0.4.9 changes the startup order:

1. Next renders the Brasta loading shell and an empty `#app` mount.
2. React hydrates that stable markup.
3. A Client Component `useEffect` runs only after hydration.
4. The legacy scripts load sequentially: `game.js`, then `network.js`, then `app.js`.
5. The legacy Brasta UI is allowed to populate `#app` only after React hydration is complete.

The legacy scripts are no longer included as deferred scripts in the server-rendered layout.

For compatibility with the existing standalone client, if `app.js` loads after the browser's native `DOMContentLoaded` event and has not rendered, the bootstrap replays that event once for the legacy startup listener.

The loading shell retains an 8-second failure state with Retry, Diagnostics, and Copy Diagnostics. Bootstrap diagnostics retain the latest five attempts locally and report script timing, JavaScript errors, browser state, and whether the Brasta globals initialized.

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

Gameplay validation from the current rules engine:

- 17/17 rules regression tests passed
- 6/6 spectator server integration checks passed
