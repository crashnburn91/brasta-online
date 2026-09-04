import fs from 'node:fs';
import path from 'node:path';

const file = path.join(process.cwd(), 'lib/brasta-server.ts');
let source = fs.readFileSync(file, 'utf8');

const replaceOnce = (from, to, label) => {
  if (!source.includes(from)) throw new Error(`Could not locate ${label} while applying match-history instrumentation.`);
  source = source.replace(from, to);
};

if (!source.includes("from './match-history';")) {
  replaceOnce(
    "} from './chat-moderation';\n",
    "} from './chat-moderation';\nimport { recordCompletedMatch, type MatchHistoryPlayerStats } from './match-history';\n",
    'match-history import location',
  );
}

if (!source.includes('type MatchRuntimeHistory =')) {
  replaceOnce(
`type StoredRoom = {
  code: string;
  mode: Brasta.Mode;
  targetScore: Brasta.TargetScore;
  createdAt: number;
  lastActivity: number;
  started: boolean;
  revision: number;
  hostToken: string;
  seats: Record<string, Participant>;
  spectators: Record<string, Spectator>;
  gameState: Brasta.GameState | null;
  callableBurn: CallableBurn | null;
};`,
`type MatchRuntimeEvent = {
  seq: number;
  round: number;
  seat: Brasta.Seat | null;
  eventType: string;
  points: number;
  payload: Record<string, unknown>;
};
type MatchRuntimeHistory = {
  startedAt: number;
  nextSeq: number;
  players: Record<string, MatchHistoryPlayerStats>;
  events: MatchRuntimeEvent[];
};
type StoredRoom = {
  code: string;
  mode: Brasta.Mode;
  targetScore: Brasta.TargetScore;
  createdAt: number;
  lastActivity: number;
  started: boolean;
  revision: number;
  hostToken: string;
  seats: Record<string, Participant>;
  spectators: Record<string, Spectator>;
  gameState: Brasta.GameState | null;
  callableBurn: CallableBurn | null;
  history?: MatchRuntimeHistory;
};`,
    'StoredRoom type',
  );
}

if (!source.includes('function ensureRuntimeHistory(')) {
  replaceOnce(
`function rankedMeta(room: StoredRoom): RankedRuntimeMeta | null {
  const ranked = (room as StoredRoom & { ranked?: RankedRuntimeMeta }).ranked;
  return ranked && typeof ranked === 'object' ? ranked : null;
}
`,
`function rankedMeta(room: StoredRoom): RankedRuntimeMeta | null {
  const ranked = (room as StoredRoom & { ranked?: RankedRuntimeMeta }).ranked;
  return ranked && typeof ranked === 'object' ? ranked : null;
}

function blankRuntimeStats(): MatchHistoryPlayerStats {
  return {
    brastas: 0,
    bigTenCaptures: 0,
    bigTwoCaptures: 0,
    jackSweeps: 0,
    jackBurns: 0,
    burnCalls: 0,
    buildsMade: 0,
    lastPickups: 0,
    cardsCaptured: 0,
  };
}

function ensureRuntimeHistory(room: StoredRoom, startedAt = Date.now()): MatchRuntimeHistory {
  if (!room.history) room.history = { startedAt, nextSeq: 1, players: {}, events: [] };
  for (const seat of activeSeats(room)) {
    if (!room.history.players[String(seat)]) room.history.players[String(seat)] = blankRuntimeStats();
  }
  return room.history;
}

function participantAccountId(player: Participant | undefined): string | null {
  if (!player) return null;
  const rankedId = (player as Participant & { authUserId?: string }).authUserId;
  return player.accountId || rankedId || null;
}

function runtimePlayer(room: StoredRoom, seat: Brasta.Seat): MatchHistoryPlayerStats {
  const history = ensureRuntimeHistory(room);
  if (!history.players[String(seat)]) history.players[String(seat)] = blankRuntimeStats();
  return history.players[String(seat)];
}

function addHistoryEvent(
  room: StoredRoom,
  seat: Brasta.Seat | null,
  eventType: string,
  round: number,
  points = 0,
  payload: Record<string, unknown> = {},
): void {
  const history = ensureRuntimeHistory(room);
  history.events.push({ seq: history.nextSeq++, round, seat, eventType, points, payload });
  if (history.events.length > 120) history.events.splice(0, history.events.length - 120);
}

function directCaptureIds(before: Brasta.GameState, command: Brasta.Command): Brasta.CardId[] {
  if (command.type === 'JACK_ACTION') return before.loose.length ? [...before.loose, command.cardId] : [];
  if (command.type === 'CAPTURE_LOOSE') return [...command.looseIds, command.cardId];
  if (command.type !== 'CAPTURE_BUILD') return [];
  const build = before.builds.find((candidate) => candidate.id === command.buildId);
  const buildIds = build ? [...build.groups.flat(), ...build.modifiers] : [];
  return [...buildIds, ...command.looseIds, command.cardId];
}

function recordCaptureSpecials(
  room: StoredRoom,
  before: Brasta.GameState,
  after: Brasta.GameState,
  seat: Brasta.Seat,
  capturedIds: Brasta.CardId[],
): void {
  if (!capturedIds.length) return;
  const stats = runtimePlayer(room, seat);
  const team = Brasta.teamForSeat(before.mode, seat);
  stats.cardsCaptured += capturedIds.length;
  const bigTen = capturedIds.some((id) => before.cards[id]?.rank === '10' && before.cards[id]?.suit === 'diamonds');
  const bigTwo = capturedIds.some((id) => before.cards[id]?.rank === '2' && before.cards[id]?.suit === 'clubs');
  if (bigTen) {
    stats.bigTenCaptures += 1;
    addHistoryEvent(room, seat, 'big_10', before.round, 10, { team });
  }
  if (bigTwo) {
    stats.bigTwoCaptures += 1;
    addHistoryEvent(room, seat, 'big_2', before.round, 10, { team });
  }
  const brastaDelta = Math.max(0, (after.roundStats?.brastas?.[team] || 0) - (before.roundStats?.brastas?.[team] || 0));
  if (brastaDelta) {
    stats.brastas += brastaDelta;
    for (let i = 0; i < brastaDelta; i++) addHistoryEvent(room, seat, 'brasta', before.round, 10, { team });
  }
}

function recordRoundFinish(room: StoredRoom, before: Brasta.GameState, after: Brasta.GameState): void {
  if (before.phase !== 'play' || (after.phase !== 'roundEnd' && after.phase !== 'matchEnd')) return;
  const seat = after.lastPickupSeat;
  if (!seat) return;
  runtimePlayer(room, seat).lastPickups += 1;
  addHistoryEvent(room, seat, 'last_pickup', before.round, 10, { team: after.lastPickupTeam });
}

function recordCommandHistory(room: StoredRoom, before: Brasta.GameState, after: Brasta.GameState, command: Brasta.Command): void {
  ensureRuntimeHistory(room);
  const seat = command.seat;
  const stats = runtimePlayer(room, seat);
  if (command.type === 'MAKE_BUILD') stats.buildsMade += 1;
  if (command.type === 'JACK_ACTION') {
    if (before.loose.length) {
      stats.jackSweeps += 1;
      addHistoryEvent(room, seat, 'jack_sweep', before.round, 0, { cards: before.loose.length });
    } else {
      stats.jackBurns += 1;
      addHistoryEvent(room, seat, 'jack_burn', before.round, -10, {});
    }
  }
  recordCaptureSpecials(room, before, after, seat, directCaptureIds(before, command));
  recordRoundFinish(room, before, after);
}

function burnCaptureIds(before: Brasta.GameState, burn: CallableBurn, option: BurnPickupOption): Brasta.CardId[] {
  const ids: Brasta.CardId[] = [];
  if (burn.includePlayedCard !== false) ids.push(burn.cardId);
  ids.push(...option.looseIds);
  if (option.kind === 'build') {
    const build = before.builds.find((candidate) => candidate.id === option.buildId);
    if (build) ids.push(...build.groups.flat(), ...build.modifiers);
  }
  return [...new Set(ids)];
}

function recordBurnHistory(
  room: StoredRoom,
  before: Brasta.GameState,
  after: Brasta.GameState,
  callerSeat: Brasta.Seat,
  burn: CallableBurn,
  option: BurnPickupOption,
): void {
  const stats = runtimePlayer(room, callerSeat);
  stats.burnCalls += 1;
  addHistoryEvent(room, callerSeat, 'burn_call', before.round, 0, {
    offenderSeat: burn.offenderSeat,
    pickup: option.label,
  });
  recordCaptureSpecials(room, before, after, callerSeat, burnCaptureIds(before, burn, option));
}

async function persistCompletedRoomHistory(room: StoredRoom): Promise<void> {
  const state = room.gameState;
  if (!state || state.phase !== 'matchEnd') return;
  const signedIn = Object.values(room.seats).some((player) => !!participantAccountId(player));
  if (!signedIn) return;
  const history = ensureRuntimeHistory(room, room.createdAt);
  const winnerTeam: Brasta.Team | null = state.score.A === state.score.B ? null : state.score.A > state.score.B ? 'A' : 'B';
  const ranked = (room as StoredRoom & { ranked?: { matchId?: string } }).ranked;
  const rankedMatchId = ranked?.matchId || null;
  const matchType = rankedMatchId ? 'ranked' : roomHasBot(room) ? 'bot' : 'private';
  const completedAt = Date.now();
  const targetReached = state.score.A >= state.targetScore || state.score.B >= state.targetScore;

  await recordCompletedMatch({
    matchKey: rankedMatchId ? `ranked:${rankedMatchId}` : `${matchType}:${room.code}:${room.createdAt}`,
    rankedMatchId,
    roomCode: room.code,
    mode: room.mode,
    matchType,
    targetScore: room.targetScore,
    winnerTeam,
    scoreA: state.score.A,
    scoreB: state.score.B,
    roundsPlayed: Math.max(1, state.round || 1),
    startedAt: new Date(history.startedAt || room.createdAt).toISOString(),
    completedAt: new Date(completedAt).toISOString(),
    completionReason: targetReached && winnerTeam ? 'completed' : 'ended_by_host',
    players: activeSeats(room).map((seat) => {
      const participant = room.seats[String(seat)];
      const team = Brasta.teamForSeat(room.mode, seat);
      const stats = history.players[String(seat)] || blankRuntimeStats();
      return {
        playerId: participantAccountId(participant),
        seat,
        team,
        username: participant?.name || `Seat ${seat}`,
        result: !winnerTeam ? 'draw' : winnerTeam === team ? 'win' : 'loss',
        ...stats,
      };
    }),
    events: history.events.map((event) => ({
      ...event,
      playerId: event.seat ? participantAccountId(room.seats[String(event.seat)]) : null,
    })),
  });
}
`,
    'rankedMeta helper',
  );
}

if (!source.includes('recordBurnHistory(room, beforeBurn')) {
  replaceOnce(
`function resolveBurn(room: StoredRoom, burn: CallableBurn, callerSeat: Brasta.Seat, option: BurnPickupOption): void {
  const state = room.gameState;
  if (!state || state.phase !== 'play') throw new Error('There is no active burn to resolve.');`,
`function resolveBurn(room: StoredRoom, burn: CallableBurn, callerSeat: Brasta.Seat, option: BurnPickupOption): void {
  const state = room.gameState;
  if (!state || state.phase !== 'play') throw new Error('There is no active burn to resolve.');
  const beforeBurn = clone(state);`,
    'burn snapshot',
  );
  replaceOnce(
`  state.event = \`BURN! \${callerName} caught \${offenderName}\${suffix ? \` • \${suffix}\` : ''}\`;
  state.lastMove = \`\${callerName} called burn on \${offenderName} and took \${option.label}.\`;
}`,
`  state.event = \`BURN! \${callerName} caught \${offenderName}\${suffix ? \` • \${suffix}\` : ''}\`;
  state.lastMove = \`\${callerName} called burn on \${offenderName} and took \${option.label}.\`;
  recordBurnHistory(room, beforeBurn, state, callerSeat, burn, option);
}`,
    'burn history hook',
  );
}

if (!source.includes('ensureRuntimeHistory(room, Date.now());\n        return null;')) {
  replaceOnce(
`        room.gameState = Brasta.startMatch(room.mode, crypto.randomInt(1, 0x7fffffff), room.targetScore);
        room.callableBurn = null;
        applyNames(room); room.started = true; room.revision++;
        return null;`,
`        room.gameState = Brasta.startMatch(room.mode, crypto.randomInt(1, 0x7fffffff), room.targetScore);
        room.callableBurn = null;
        ensureRuntimeHistory(room, Date.now());
        applyNames(room); room.started = true; room.revision++;
        return null;`,
    'private match start history hook',
  );
}

const commandNeedle = `        const result = Brasta.applyCommand(room.gameState, safe);
        if (!result.ok) throw new Error(result.error || 'Move rejected.');

        room.callableBurn = null;`;
if (source.includes(commandNeedle)) {
  source = source.replace(commandNeedle, `        const result = Brasta.applyCommand(room.gameState, safe);
        if (!result.ok) throw new Error(result.error || 'Move rejected.');
        recordCommandHistory(room, before, result.state, safe);

        room.callableBurn = null;`);
}

const timeoutNeedle = `        const result = Brasta.applyCommand(room.gameState, safe);
        if (!result.ok) throw new Error(result.error || 'Could not auto-play the timed-out turn.');

        room.callableBurn = null;`;
if (source.includes(timeoutNeedle)) {
  source = source.replace(timeoutNeedle, `        const result = Brasta.applyCommand(room.gameState, safe);
        if (!result.ok) throw new Error(result.error || 'Could not auto-play the timed-out turn.');
        recordCommandHistory(room, before, result.state, safe);

        room.callableBurn = null;`);
}

if (!source.includes('persistCompletedRoomHistory(changed.room)')) {
  replaceOnce(
`    if (changed.room.gameState?.phase === 'matchEnd') await clearRoomActiveMatches(changed.room);`,
`    if (changed.room.gameState?.phase === 'matchEnd') {
      await clearRoomActiveMatches(changed.room);
      try {
        await persistCompletedRoomHistory(changed.room);
      } catch (error) {
        // History must never block or roll back a completed authoritative match.
        console.error('[brasta match history persist]', error);
      }
    }`,
    'completed match persistence hook',
  );
}

fs.writeFileSync(file, source);
console.log('Patched realtime server with authoritative match history/stat tracking');
