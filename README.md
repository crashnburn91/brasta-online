# Brasta Online v0.4.0 — Vercel Edition

Standalone, server-authoritative Brasta with 1v1 and 2v2 private online rooms.

## Vercel architecture

- **Next.js shell + static Brasta UI** on Vercel
- **`/api/ws` WebSocket Vercel Function** using `experimental_upgradeWebSocket`
- **Redis (Upstash recommended through the Vercel Marketplace)** for durable room/game state
- **Redis Pub/Sub** to relay room updates between Vercel Function instances
- **Automatic browser reconnect** when a Vercel Function reaches its maximum lifetime
- Full hands/deck remain server-side; each player only receives their own card identities

The canonical browser sources are packaged in `vendor/brasta-client-source.zip` and extracted during the build; the canonical rules engine remains `src/game.ts` after extraction. `scripts/sync-server-engine.mjs` generates the server-importable `lib/game-engine.ts` from the same source before each build, so browser and server rules stay in sync.

## Deploy on Vercel

1. Import the GitHub repository into Vercel.
2. In the Vercel project, open **Storage / Marketplace** and add **Upstash Redis**.
3. Make sure the integration provides a `REDIS_URL` environment variable.
4. Redeploy after Redis is connected.

No custom build command should be necessary: Vercel uses `npm run build` from `package.json`.

### Local Vercel-compatible development

Install dependencies and the Vercel CLI:

```bash
npm install
npm install -g vercel
```

Create `.env.local` with `REDIS_URL`, or connect Upstash through Vercel and run:

```bash
vercel link
vercel env pull
vercel dev
```

Use `vercel dev` for the WebSocket route; the Vercel WebSocket upgrade API is injected by the Vercel runtime.

## Health check

`/api/health` reports whether Redis is configured and reachable.

## Match rules implemented

- 1v1 and 2v2
- first to 110 (default) or 220
- clockwise rotating round starter
- Keep / Put opening
- opening Jacks returned, shuffled, and replaced until the board has no Jack
- loose captures, Jack sweeps/burns, Brastas, last pickup, scoring
- numeric builds, Q/K builds, add-to-build, raise-build, build capture
- server-authoritative commands with seat spoof prevention
- reconnect tokens and private opponent hands

## Tests

Rules regression suite:

```bash
npm run test:rules
```

## Notes

The Vercel deployment uses the WebSocket Function in `app/api/ws/route.ts`; there is no long-running Node server process to manage.

For production online rooms, configure Redis. The no-Redis fallback is intended only for a single local `vercel dev` process and is not durable across Vercel Function instances.
