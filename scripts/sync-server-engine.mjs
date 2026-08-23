import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const source = fs.readFileSync(path.join(root, 'src/game.ts'), 'utf8');
const buildRules = fs.readFileSync(path.join(root, 'src/build-rules-server.ts'), 'utf8');
const marker = '\n\n\n// Browser builds use the global Brasta namespace.';
let body = source.split(marker)[0];
if (!body.startsWith('namespace Brasta {')) throw new Error('Unexpected src/game.ts wrapper');
body = body.slice('namespace Brasta {'.length);
const pos = body.lastIndexOf('\n}');
if (pos < 0) throw new Error('Could not locate namespace closing brace');
body = body.slice(0, pos) + body.slice(pos + 2);

const oldOpening = `  export function resolveOpening(state: GameState, choice: 'keep' | 'put'): ApplyResult {
    if (state.phase !== 'openingChoice') return { ok: false, state, error: 'Opening choice is not active.' };
    const next = cloneState(state);
    const starter = getPlayer(next, next.starterSeat);
    if (choice === 'put') {
      next.loose.push(...starter.hand);
      starter.hand = [];
    } else {
      next.loose.push(...draw(next, 4));
    }
    sanitizeOpeningBoard(next);
    if (choice === 'put') {
      dealAllActive(next, 4);
    } else {
      for (const seat of activeSeats(next.mode)) if (seat !== next.starterSeat) dealToSeat(next, seat, 4);
    }
    const badHand = next.players.find((p) => p.hand.length !== 4);
    if (next.loose.length !== 4 || badHand) {
      return { ok: false, state, error: 'Opening validation failed; expected four board cards and four cards per active hand.' };
    }
    next.phase = 'play';
    next.currentSeat = next.starterSeat;
    next.message = \`Seat \${next.currentSeat}'s turn.\`;
    return { ok: true, state: next };
  }`;

const newOpening = `  export function resolveOpening(state: GameState, choice: 'keep' | 'put'): ApplyResult {
    if (state.phase !== 'openingChoice') return { ok: false, state, error: 'Opening choice is not active.' };
    const next = cloneState(state);
    const starter = getPlayer(next, next.starterSeat);
    const seats = activeSeats(next.mode);
    const starterIndex = seats.indexOf(next.starterSeat);
    const otherSeats = seats.slice(starterIndex + 1).concat(seats.slice(0, starterIndex));

    if (choice === 'put') {
      // Starter's first four become the board. Clean the opening board first,
      // then deal every other player clockwise, and the starter replacement last.
      next.loose.push(...starter.hand);
      starter.hand = [];
      sanitizeOpeningBoard(next);
      for (const seat of otherSeats) dealToSeat(next, seat, 4);
      dealToSeat(next, next.starterSeat, 4);
    } else {
      // Starter keeps the first four. Deal every other player clockwise first,
      // then deal and sanitize the four-card opening board last.
      for (const seat of otherSeats) dealToSeat(next, seat, 4);
      next.loose.push(...draw(next, 4));
      sanitizeOpeningBoard(next);
    }

    const badHand = next.players.find((p) => p.hand.length !== 4);
    if (next.loose.length !== 4 || badHand) {
      return { ok: false, state, error: 'Opening validation failed; expected four board cards and four cards per active hand.' };
    }
    next.phase = 'play';
    next.currentSeat = next.starterSeat;
    next.message = \`Seat \${next.currentSeat}'s turn.\`;
    return { ok: true, state: next };
  }`;

if (!body.includes(oldOpening)) throw new Error('Could not locate resolveOpening for opening-order patch');
body = body.replace(oldOpening, newOpening);

const oldCards = "    if (cardsA > cardsB) A.cardsMajority = 2;\n    else if (cardsB > cardsA) B.cardsMajority = 2;";
const newCards = "    if (cardsA > cardsB) A.cardsMajority = 2;\n    else if (cardsB > cardsA) B.cardsMajority = 2;\n    else { A.cardsMajority = 1; B.cardsMajority = 1; }";
if (!body.includes(oldCards)) throw new Error('Could not locate captured-card majority rule for tie-split patch');
body = body.replace(oldCards, newCards);

const exportedWrappers = [
  ['export function getBuildDeclarationOptions(', 'function getBuildDeclarationOptionsBase('],
  ['export function legalActionsForCard(', 'function legalActionsForCardBase('],
  ['export function applyCommand(', 'function applyCommandBase('],
];
for (const [from, to] of exportedWrappers) {
  if (!body.includes(from)) throw new Error(`Could not locate ${from} for build-rules wrapper`);
  body = body.replace(from, to);
}

fs.mkdirSync(path.join(root, 'lib'), { recursive: true });
fs.writeFileSync(
  path.join(root, 'lib/game-engine.ts'),
  '// GENERATED from src/game.ts. Do not hand-edit.\n' + body.trimStart() + '\n\n' + buildRules.trim() + '\n',
);
console.log('Synced lib/game-engine.ts with opening order, tie scoring, and build ownership rules');
