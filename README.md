# Brasta Online v0.4.3 — Vercel Edition

Standalone, server-authoritative Brasta with 1v1 and 2v2 private online rooms.

## Vercel architecture

- **Next.js shell + static Brasta UI** on Vercel
- **`/api/ws` WebSocket Vercel Function**
- **Redis (Upstash recommended)** for durable room/game state
- **Redis Pub/Sub** for cross-instance room updates
- **Automatic browser reconnects**
- Full hands/deck remain server-side; each player only receives their own card identities

## v0.4.3 build fix

The browser source archive is reconstructed from four verified Base64 text chunks during the Vercel build. This avoids Git transport/binary corruption of the previously committed ZIP file. The reconstructed archive is validated to exactly 22,992 bytes before extraction.

The project now targets **Node.js 24.x** on Vercel.

## Recent gameplay improvements

- Big 2 and Big 10 captures are announced like Brastas and Jack Sweeps.
- A persistent Last Move banner above the board shows only the most recent play.
- Invite URLs such as `/?room=ABCDE` show a simplified name + Join Room screen.
- Match target can be first to 110 or 220.

## Deploy on Vercel

1. Import the GitHub repository into Vercel.
2. Add Upstash Redis through Storage / Marketplace.
3. Confirm the project has a `REDIS_URL` environment variable.
4. Redeploy.

Vercel uses the repository's `npm run build` command automatically.

## Health check

Visit `/api/health` after deployment to confirm Redis status.

## Tests

```bash
npm run test:rules
```
