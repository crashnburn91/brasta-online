import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const file = path.join(root, 'lib/brasta-server.ts');
let source = fs.readFileSync(file, 'utf8');
const snippet = fs.readFileSync(path.join(root, 'scripts/match-history-server-snippet.txt'), 'utf8').trim();

function replaceRequired(from, to, label) {
  if (!source.includes(from)) throw new Error('Could not locate ' + label + ' while applying match-history instrumentation.');
  source = source.replace(from, to);
}

if (!source.includes("from './match-history';")) {
  replaceRequired(
    "} from './chat-moderation';\n",
    "} from './chat-moderation';\nimport { recordCompletedMatch, type MatchHistoryPlayerStats } from './match-history';\n",
    'match-history import location',
  );
}

if (!source.includes('type MatchRuntimeHistory =')) {
  const oldRoom = [
    'type StoredRoom = {',
    '  code: string;',
    '  mode: Brasta.Mode;',
    '  targetScore: Brasta.TargetScore;',
    '  createdAt: number;',
    '  lastActivity: number;',
    '  started: boolean;',
    '  revision: number;',
    '  hostToken: string;',
    '  seats: Record<string, Participant>;',
    '  spectators: Record<string, Spectator>;',
    '  gameState: Brasta.GameState | null;',
    '  callableBurn: CallableBurn | null;',
    '};',
  ].join('\n');
  const newRoom = [
    'type MatchRuntimeEvent = {',
    '  seq: number;',
    '  round: number;',
    '  seat: Brasta.Seat | null;',
    '  eventType: string;',
    '  points: number;',
    '  payload: Record<string, unknown>;',
    '};',
    'type MatchRuntimeHistory = {',
    '  startedAt: number;',
    '  nextSeq: number;',
    '  players: Record<string, MatchHistoryPlayerStats>;',
    '  events: MatchRuntimeEvent[];',
    '};',
    oldRoom.slice(0, -2),
    '  history?: MatchRuntimeHistory;',
    '};',
  ].join('\n');
  replaceRequired(oldRoom, newRoom, 'StoredRoom type');
}

if (!source.includes('function ensureRuntimeHistory(')) {
  const rankedMeta = [
    'function rankedMeta(room: StoredRoom): RankedRuntimeMeta | null {',
    '  const ranked = (room as StoredRoom & { ranked?: RankedRuntimeMeta }).ranked;',
    "  return ranked && typeof ranked === 'object' ? ranked : null;",
    '}',
  ].join('\n');
  replaceRequired(rankedMeta, rankedMeta + '\n\n' + snippet, 'ranked metadata helper');
}

if (!source.includes('const beforeBurn = clone(state);')) {
  const burnStart = "function resolveBurn(room: StoredRoom, burn: CallableBurn, callerSeat: Brasta.Seat, option: BurnPickupOption): void {\n  const state = room.gameState;\n  if (!state || state.phase !== 'play') throw new Error('There is no active burn to resolve.');";
  replaceRequired(burnStart, burnStart + '\n  const beforeBurn = clone(state);', 'burn snapshot');
}

if (!source.includes('recordBurnHistory(room, beforeBurn, state, callerSeat, burn, option);')) {
  const lastMove = '  state.lastMove = `${callerName} called burn on ${offenderName} and took ${option.label}.`;';
  replaceRequired(lastMove, lastMove + '\n  recordBurnHistory(room, beforeBurn, state, callerSeat, burn, option);', 'burn history hook');
}

if (!source.includes('ensureRuntimeHistory(room, Date.now());')) {
  const start = [
    '        room.gameState = Brasta.startMatch(room.mode, crypto.randomInt(1, 0x7fffffff), room.targetScore);',
    '        room.callableBurn = null;',
    '        applyNames(room); room.started = true; room.revision++;',
  ].join('\n');
  replaceRequired(start, [
    '        room.gameState = Brasta.startMatch(room.mode, crypto.randomInt(1, 0x7fffffff), room.targetScore);',
    '        room.callableBurn = null;',
    '        ensureRuntimeHistory(room, Date.now());',
    '        applyNames(room); room.started = true; room.revision++;',
  ].join('\n'), 'private match start hook');
}

const commandNeedle = [
  '        const result = Brasta.applyCommand(room.gameState, safe);',
  "        if (!result.ok) throw new Error(result.error || 'Move rejected.');",
  '',
  '        room.callableBurn = null;',
].join('\n');
if (source.includes(commandNeedle)) {
  source = source.replace(commandNeedle, [
    '        const result = Brasta.applyCommand(room.gameState, safe);',
    "        if (!result.ok) throw new Error(result.error || 'Move rejected.');",
    '        recordCommandHistory(room, before, result.state, safe);',
    '',
    '        room.callableBurn = null;',
  ].join('\n'));
}

const timeoutNeedle = [
  '        const result = Brasta.applyCommand(room.gameState, safe);',
  "        if (!result.ok) throw new Error(result.error || 'Could not auto-play the timed-out turn.');",
  '',
  '        room.callableBurn = null;',
].join('\n');
if (source.includes(timeoutNeedle)) {
  source = source.replace(timeoutNeedle, [
    '        const result = Brasta.applyCommand(room.gameState, safe);',
    "        if (!result.ok) throw new Error(result.error || 'Could not auto-play the timed-out turn.');",
    '        recordCommandHistory(room, before, result.state, safe);',
    '',
    '        room.callableBurn = null;',
  ].join('\n'));
}

if (!source.includes('persistCompletedRoomHistory(changed.room)')) {
  const finish = "    if (changed.room.gameState?.phase === 'matchEnd') await clearRoomActiveMatches(changed.room);";
  replaceRequired(finish, [
    "    if (changed.room.gameState?.phase === 'matchEnd') {",
    '      await clearRoomActiveMatches(changed.room);',
    '      try {',
    '        await persistCompletedRoomHistory(changed.room);',
    '      } catch (error) {',
    "        console.error('[brasta match history persist]', error);",
    '      }',
    '    }',
  ].join('\n'), 'completed match persistence hook');
}

fs.writeFileSync(file, source);
console.log('Patched realtime server with authoritative match history/stat tracking');
