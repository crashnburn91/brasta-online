# Brasta Online v0.4.4 — Spectator Mode

Standalone, server-authoritative Brasta with 1v1 and 2v2 private online rooms.

## Spectating

Every room now supports spectators without assigning them a player seat.

- Player invite: `/?room=ABCDE`
- Spectator invite: `/?spectate=ABCDE`
- Spectators can join before or after the game starts.
- Spectators see the public table, builds, scores, player names, current turn, announcements, Last Move banner, round results, match results, and each player's hand count.
- Spectators never receive the identity of any player's cards or undealt deck cards.
- Spectator sessions reconnect automatically.
- The server rejects gameplay commands sent by spectator sessions.
- Rooms show the current spectator count and provide a **Copy Spectate Link** control.

## Other recent gameplay improvements

- Big 2 and Big 10 captures are announced like Brastas and Jack Sweeps.
- A persistent Last Move banner above the board shows only the most recent play.
- Player invite URLs show a simplified name + Join Room screen.
- Match target can be first to 110 or 220.

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

v0.4.4 validation completed locally:

- 17/17 rules regression tests passed
- 6/6 spectator server integration checks passed
- Browser TypeScript compilation passed
