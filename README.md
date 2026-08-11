# Brasta Online v0.3.0

Standalone, server-authoritative Brasta for local hot-seat or private online rooms.

## What changed in v0.3.0

### Build display fix
Builds are no longer rendered as a `<button>` containing card `<button>` elements. Nested buttons are invalid HTML and browsers were moving the build cards outside the build frame. The build is now an interactive `<div>`, so all cards stay inside the frame.

Build cards also have clipping/stacking protection so larger builds remain contained visually.

### First to 110 / 220
Every match now has a target score:

- **110 points** — default
- **220 points** — optional long game

The target is selected when creating an online room or starting a local hot-seat match. Online rooms store the target on the server and all clients receive the same setting.

At the end of each round:

- if one team has reached or passed the target and has the higher score, that team wins the match;
- if both teams are tied at or above the target, the match continues until a later round breaks the tie.

The current target is shown in the room lobby and in the match header.

## Run locally

Requires Node.js 20+.

Windows: double-click `start-brasta.bat`.

Or from a terminal:

```bash
npm run build
npm start
```

Then open:

```text
http://localhost:3000
```

For another device on the same network, browse to the host computer's LAN IP using port 3000.

## Tests

Rules regression suite:

```bash
npm run build
node dist/tests-bundle.js
```

Online integration suite:

```bash
npm test
```

v0.3.0 passes:

- **14/14 rules/engine regression tests**
- **15/15 online room integration checks**
