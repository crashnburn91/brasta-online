import crypto from 'node:crypto';
import * as Brasta from './game-engine';
import { redis, duplicateRedis } from './redis';
import { verifyBrastaAccessToken } from './supabase-auth';
import { clearActiveMatch, getActiveMatch, setActiveMatch } from './account-active-match';

const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_TTL_SECONDS = 24 * 60 * 60;
const PRESENCE_MS = 45_000;
const EVENT_CHANNEL = 'brasta:room-events';
const EMOTE_CHANNEL = 'brasta:room-emotes';
const EMOTE_RATE_MS = 2_000;
const ALLOWED_EMOTES = new Set(['wink','nod','thumbs_up','thumbs_down','eyebrow','laugh','wow','thinking']);
const BURN_CLAIM_MS = 30_000;
const memoryRooms = new Map<string, StoredRoom>();
const localConnections = new Set<Connection>();
let subscriberStarted = false;

export type WireSocket = {
  send(data: string): void;
  close(code?: number, reason?: string): void;
};

type Participant = { seat: Brasta.Seat; name: string; token: string; connectionId: string; lastSeen: number; rankName?: string; accountId?: string };
type Spectator = { name: string; token: string; connectionId: string; lastSeen: number };
type BurnPickupOption = {
  id: string;
  label: string;
  kind: 'loose' | 'build';
  looseIds: Brasta.CardId[];
  buildId?: string;
  captureCount: number;
};
type CallableBurn = {
  id: string;
  offenderSeat: Brasta.Seat;
  cardId: Brasta.CardId;
  options: BurnPickupOption[];
  // PLAY_LOOSE burns include the offender's played card in the pickup.
  // Incomplete-capture burns only award the board cards that were left behind.
  includePlayedCard?: boolean;
  claimedBySeat: Brasta.Seat | null;
  claimedAt: number | null;
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
};
export type ConnectionRole = 'player' | 'spectator' | null;
export type Connection = {
  id: string;
  ws: WireSocket;
  closed: boolean;
  roomCode: string | null;
  seat: Brasta.Seat | null;
  token: string | null;
  role: ConnectionRole;
  lastEmoteAt: number;
};

const cleanName = (v: unknown) => String(v || '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24);
const cleanCode = (v: unknown) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
const makeToken = () => crypto.randomBytes(24).toString('hex');
const roomKey = (code: string) => `brasta:room:${code}`;
const lockKey = (code: string) => `brasta:lock:${code}`;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

function normalizeRoom(room: StoredRoom): StoredRoom {
  if (!room.spectators) room.spectators = {};
  if (room.callableBurn === undefined) room.callableBurn = null;
  return room;
}
function rankedMeta(room: StoredRoom): { roundEndedAt?: number } | null {
  const ranked = (room as StoredRoom & { ranked?: { roundEndedAt?: number } }).ranked;
  return ranked && typeof ranked === 'object' ? ranked : null;
}
function activeSeats(room: StoredRoom): Brasta.Seat[] { return Brasta.activeSeats(room.mode); }
function participantForToken(room: StoredRoom, token: string): Participant | null {
  return Object.values(room.seats).find((p) => p.token === token) || null;
}
function participantForAccount(room: StoredRoom, accountId: string): Participant | null {
  return Object.values(room.seats).find((p) => p.accountId === accountId) || null;
}
function spectatorForToken(room: StoredRoom, token: string): Spectator | null {
  return room.spectators?.[token] || null;
}
function hostParticipant(room: StoredRoom): Participant | null { return participantForToken(room, room.hostToken); }
function visibleStateForSeat(gameState: Brasta.GameState, seat: Brasta.Seat): Brasta.GameState {
  const view = clone(gameState);
  view.deck = gameState.deck.map((_, i) => `hidden-deck-${i}`);
  view.players = gameState.players.map((p) => ({ ...clone(p), hand: p.seat === seat ? [...p.hand] : p.hand.map((_, i) => `hidden-seat-${p.seat}-${i}`) }));
  return view;
}
function visibleStateForSpectator(gameState: Brasta.GameState): Brasta.GameState {
  const view = clone(gameState);
  view.deck = gameState.deck.map((_, i) => `hidden-deck-${i}`);
  view.players = gameState.players.map((p) => ({ ...clone(p), hand: p.hand.map((_, i) => `hidden-seat-${p.seat}-${i}`) }));
  return view;
}
function roomSnapshot(room: StoredRoom) {
  normalizeRoom(room);
  const now = Date.now();
  const seats = activeSeats(room);
  const host = hostParticipant(room);
  const players = seats.map((seat) => {
    const p = room.seats[String(seat)];
    return p
      ? { seat, name: p.name, connected: now - p.lastSeen < PRESENCE_MS, occupied: true, rankName: p.rankName || null }
      : { seat, name: '', connected: false, occupied: false, rankName: null };
  });
  const spectators = Object.values(room.spectators)
    .map((s) => ({ name: s.name, connected: now - s.lastSeen < PRESENCE_MS }))
    .filter((s) => s.connected);
  return {
    code: room.code,
    mode: room.mode,
    targetScore: room.targetScore,
    started: room.started,
    revision: room.revision,
    hostSeat: host?.seat || seats[0],
    players,
    spectators,
    spectatorCount: spectators.length,
    full: seats.every((s) => !!room.seats[String(s)]),
  };
}
function applyNames(room: StoredRoom) {
  if (!room.gameState) return;
  for (const player of room.gameState.players) {
    const p = room.seats[String(player.seat)];
    if (p) player.name = p.name;
  }
}

function cardIdsInBuild(build: Brasta.Build): Brasta.CardId[] {
  return [...build.groups.flat(), ...build.modifiers];
}
function cardListLabel(state: Brasta.GameState, ids: Brasta.CardId[]): string {
  return ids.map((id) => Brasta.cardLabel(state.cards[id])).join(' + ');
}
function maximalNumericLooseSets(state: Brasta.GameState, target: number): Brasta.CardId[][] {
  const sets = Brasta.findNumericSubsets(state, state.loose, target);
  if (!sets.length) return [];

  let bestSize = 0;
  const best = new Map<string, Brasta.CardId[]>();
  const search = (start: number, used: Set<Brasta.CardId>) => {
    if (used.size > bestSize) {
      bestSize = used.size;
      best.clear();
    }
    if (used.size === bestSize && used.size > 0) {
      const ids = [...used].sort();
      best.set(ids.join('|'), ids);
    }
    for (let i = start; i < sets.length; i++) {
      const set = sets[i];
      if (set.some((id) => used.has(id))) continue;
      const next = new Set(used);
      set.forEach((id) => next.add(id));
      search(i + 1, next);
    }
  };
  search(0, new Set());
  return [...best.values()];
}
function maximalLooseSetsForCard(state: Brasta.GameState, cardId: Brasta.CardId): Brasta.CardId[][] {
  const card = state.cards[cardId];
  if (!card) return [];
  if (card.value != null) return maximalNumericLooseSets(state, card.value);
  if (card.rank === 'Q' || card.rank === 'K') {
    const ids = state.loose.filter((id) => state.cards[id]?.rank === card.rank);
    return ids.length ? [ids] : [];
  }
  return [];
}
function looseSetsForBuild(state: Brasta.GameState, build: Brasta.Build): Brasta.CardId[][] {
  if (build.kind === 'numeric' && build.declaredValue != null) {
    const sets = maximalNumericLooseSets(state, build.declaredValue);
    return sets.length ? sets : [[]];
  }
  const rank = build.declaredRank;
  if (rank === 'Q' || rank === 'K') {
    const ids = state.loose.filter((id) => state.cards[id]?.rank === rank);
    return [ids];
  }
  return [[]];
}
function burnPickupOptions(state: Brasta.GameState, offenderSeat: Brasta.Seat, cardId: Brasta.CardId): BurnPickupOption[] {
  // Derive burn eligibility from concrete capture commands against the
  // authoritative board before the offender played the card loose. This avoids
  // false negatives from the higher-level legal-action summary.
  const raw: Omit<BurnPickupOption, 'id'>[] = [];

  for (const looseIds of maximalLooseSetsForCard(state, cardId)) {
    if (!looseIds.length) continue;
    const command: Brasta.Command = { type: 'CAPTURE_LOOSE', seat: offenderSeat, cardId, looseIds };
    if (!Brasta.applyCommand(state, command).ok) continue;
    raw.push({
      label: `Loose: ${cardListLabel(state, looseIds)}`,
      kind: 'loose',
      looseIds,
      captureCount: looseIds.length + 1,
    });
  }

  for (const build of Brasta.getCapturableBuilds(state, cardId)) {
    for (const looseIds of looseSetsForBuild(state, build)) {
      const command: Brasta.Command = { type: 'CAPTURE_BUILD', seat: offenderSeat, cardId, buildId: build.id, looseIds };
      if (!Brasta.applyCommand(state, command).ok) continue;
      const extra = looseIds.length ? ` + ${cardListLabel(state, looseIds)}` : '';
      raw.push({
        label: `${Brasta.buildLabel(build)}${extra}`,
        kind: 'build',
        buildId: build.id,
        looseIds,
        captureCount: cardIdsInBuild(build).length + looseIds.length + 1,
      });
    }
  }

  const deduped = new Map<string, Omit<BurnPickupOption, 'id'>>();
  for (const option of raw) {
    const key = `${option.kind}:${option.buildId || ''}:${[...option.looseIds].sort().join(',')}`;
    deduped.set(key, option);
  }
  return [...deduped.values()]
    .sort((a, b) => b.captureCount - a.captureCount || a.label.localeCompare(b.label))
    .slice(0, 12)
    .map((option, index) => ({ ...option, id: `burn-option-${index + 1}` }));
}

function burnOptionBoardIds(state: Brasta.GameState, option: BurnPickupOption): Brasta.CardId[] {
  const ids = [...option.looseIds];
  if (option.kind === 'build' && option.buildId) {
    const build = state.builds.find((candidate) => candidate.id === option.buildId);
    if (build) ids.push(...cardIdsInBuild(build));
  }
  return ids;
}

function missedCaptureBurnOptions(
  before: Brasta.GameState,
  after: Brasta.GameState,
  command: Extract<Brasta.Command, { type: 'CAPTURE_LOOSE' | 'CAPTURE_BUILD' }>,
): BurnPickupOption[] {
  const actualBoardIds = new Set<Brasta.CardId>(command.looseIds);
  const actualBuildId = command.type === 'CAPTURE_BUILD' ? command.buildId : null;

  if (actualBuildId) {
    const actualBuild = before.builds.find((build) => build.id === actualBuildId);
    if (actualBuild) cardIdsInBuild(actualBuild).forEach((id) => actualBoardIds.add(id));
  }

  const raw: Omit<BurnPickupOption, 'id'>[] = [];
  for (const candidate of burnPickupOptions(before, command.seat, command.cardId)) {
    const expectedBoardIds = burnOptionBoardIds(before, candidate);

    // A burn for an incomplete pickup only exists when the player's actual
    // pickup is a strict subset of a larger legal pickup with the same card.
    if (![...actualBoardIds].every((id) => expectedBoardIds.includes(id))) continue;

    const missingLoose = candidate.looseIds.filter(
      (id) => !actualBoardIds.has(id) && after.loose.includes(id),
    );

    const missedBuild = candidate.kind === 'build'
      && !!candidate.buildId
      && candidate.buildId !== actualBuildId
      ? after.builds.find((build) => build.id === candidate.buildId)
      : undefined;

    const captureCount = missingLoose.length + (missedBuild ? cardIdsInBuild(missedBuild).length : 0);
    if (!captureCount) continue;

    const extra = missingLoose.length ? cardListLabel(after, missingLoose) : '';
    raw.push({
      label: missedBuild
        ? `${Brasta.buildLabel(missedBuild)}${extra ? ` + ${extra}` : ''}`
        : `Loose: ${extra}`,
      kind: missedBuild ? 'build' : 'loose',
      buildId: missedBuild?.id,
      looseIds: missingLoose,
      captureCount,
    });
  }

  const deduped = new Map<string, Omit<BurnPickupOption, 'id'>>();
  for (const option of raw) {
    const key = `${option.kind}:${option.buildId || ''}:${[...option.looseIds].sort().join(',')}`;
    deduped.set(key, option);
  }

  return [...deduped.values()]
    .sort((a, b) => b.captureCount - a.captureCount || a.label.localeCompare(b.label))
    .slice(0, 12)
    .map((option, index) => ({ ...option, id: `burn-option-${index + 1}` }));
}

function specialCaptureAnnouncement(state: Brasta.GameState, team: Brasta.Team, ids: Brasta.CardId[]): string | null {
  const big2 = ids.some((id) => state.cards[id]?.rank === '2' && state.cards[id]?.suit === 'clubs');
  const big10 = ids.some((id) => state.cards[id]?.rank === '10' && state.cards[id]?.suit === 'diamonds');
  if (big2 && big10) return `BIG 2 + BIG 10! Team ${team}`;
  if (big2) return `BIG 2! Team ${team}`;
  if (big10) return `BIG 10! Team ${team}`;
  return null;
}
function resolveBurn(room: StoredRoom, burn: CallableBurn, callerSeat: Brasta.Seat, option: BurnPickupOption): void {
  const state = room.gameState;
  if (!state || state.phase !== 'play') throw new Error('There is no active burn to resolve.');
  const includePlayedCard = burn.includePlayedCard !== false;
  if (includePlayedCard && !state.loose.includes(burn.cardId)) throw new Error('The burned card is no longer on the table.');
  if (!option.looseIds.every((id) => state.loose.includes(id))) throw new Error('That burn pickup is no longer available.');

  const captured: Brasta.CardId[] = [];
  const looseToRemove = new Set<Brasta.CardId>(option.looseIds);
  if (includePlayedCard) {
    captured.push(burn.cardId);
    looseToRemove.add(burn.cardId);
  }
  captured.push(...option.looseIds);

  if (option.kind === 'build') {
    const buildIndex = state.builds.findIndex((build) => build.id === option.buildId);
    if (buildIndex < 0) throw new Error('That build is no longer available.');
    captured.push(...cardIdsInBuild(state.builds[buildIndex]));
    state.builds.splice(buildIndex, 1);
  }

  state.loose = state.loose.filter((id) => !looseToRemove.has(id));
  const team = Brasta.teamForSeat(state.mode, callerSeat);
  state.captured[team].push(...captured);
  state.lastPickupSeat = callerSeat;
  state.lastPickupTeam = team;

  const callerName = state.players.find((player) => player.seat === callerSeat)?.name || `Seat ${callerSeat}`;
  const offenderName = state.players.find((player) => player.seat === burn.offenderSeat)?.name || `Seat ${burn.offenderSeat}`;
  const brasta = state.loose.length === 0 && state.builds.length === 0;
  if (brasta) state.roundStats.brastas[team] += 1;
  const special = specialCaptureAnnouncement(state, team, captured);
  const suffix = [brasta ? `BRASTA! Team ${team} +10` : null, special].filter(Boolean).join(' • ');
  state.event = `BURN! ${callerName} caught ${offenderName}${suffix ? ` • ${suffix}` : ''}`;
  state.lastMove = `${callerName} called burn on ${offenderName} and took ${option.label}.`;
}

async function loadRoom(code: string): Promise<StoredRoom | null> {
  if (!redis) {
    const room = memoryRooms.get(code) || null;
    return room ? normalizeRoom(room) : null;
  }
  const raw = await redis.get(roomKey(code));
  if (!raw) return null;
  try { return normalizeRoom(JSON.parse(raw) as StoredRoom); } catch { return null; }
}
async function saveRoom(room: StoredRoom): Promise<void> {
  normalizeRoom(room);
  room.lastActivity = Date.now();
  if (!redis) { memoryRooms.set(room.code, clone(room)); return; }
  await redis.set(roomKey(room.code), JSON.stringify(room), 'EX', ROOM_TTL_SECONDS);
}
async function createRoomIfAbsent(room: StoredRoom): Promise<boolean> {
  normalizeRoom(room);
  if (!redis) {
    if (memoryRooms.has(room.code)) return false;
    memoryRooms.set(room.code, clone(room));
    return true;
  }
  const ok = await redis.set(roomKey(room.code), JSON.stringify(room), 'EX', ROOM_TTL_SECONDS, 'NX');
  return ok === 'OK';
}
async function deleteRoom(code: string): Promise<void> {
  if (!redis) { memoryRooms.delete(code); return; }
  await redis.del(roomKey(code));
}

async function bindParticipantActiveMatch(room: StoredRoom, p: Participant): Promise<void> {
  if (!p.accountId) return;
  await setActiveMatch(p.accountId, {
    roomCode: room.code,
    seat: p.seat,
    mode: room.mode,
    updatedAt: Date.now(),
  });
}

async function clearRoomActiveMatches(room: StoredRoom): Promise<void> {
  await Promise.all(Object.values(room.seats)
    .filter((p) => !!p.accountId)
    .map((p) => clearActiveMatch(p.accountId!, room.code)));
}

async function verifiedAccountId(accessToken: unknown): Promise<string | null> {
  if (typeof accessToken !== 'string' || accessToken.length < 20) return null;
  const identity = await verifyBrastaAccessToken(accessToken);
  return identity?.userId || null;
}
async function bindVerifiedAccountToSeat(
  roomCode: string,
  seat: Brasta.Seat,
  seatToken: string,
  accessToken: unknown,
): Promise<void> {
  const accountId = await verifiedAccountId(accessToken);
  if (!accountId) return;

  const changed = await mutateRoom(roomCode, (room) => {
    const p = room.seats[String(seat)];
    if (!p || p.token !== seatToken) return null;
    if (p.accountId && p.accountId !== accountId) return null;
    p.accountId = accountId;
    return p;
  }, false);

  if (changed?.result) {
    await bindParticipantActiveMatch(changed.room, changed.result);
    await publishRoom(changed.room.code);
  }
}


async function rankedAssignmentRoom(userId: string): Promise<string | null> {
  if (!redis || !userId) return null;
  const [oneVOne, twoVTwo] = await Promise.all([
    redis.get(`brasta:ranked:assignment:${userId}`),
    redis.get(`brasta:ranked:assignment:2v2:${userId}`),
  ]);
  for (const raw of [oneVOne, twoVTwo]) {
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as { roomCode?: string };
      const roomCode = cleanCode(parsed.roomCode);
      if (roomCode) return roomCode;
    } catch {}
  }
  return null;
}

export async function claimActiveMatchForAccount(userId: string, roomCode: string, playerToken: string) {
  const code = cleanCode(roomCode);
  if (!userId || !code || !playerToken) return null;

  const changed = await mutateRoom(code, (room) => {
    const p = participantForToken(room, playerToken);
    if (!p) return null;
    if (p.accountId && p.accountId !== userId) return null;
    p.accountId = userId;
    return p;
  }, false);

  if (!changed?.result) return null;
  await bindParticipantActiveMatch(changed.room, changed.result);
  await publishRoom(changed.room.code);

  return {
    roomCode: changed.room.code,
    mode: changed.room.mode,
    seat: changed.result.seat,
    started: changed.room.started,
  };
}

export async function getActiveMatchForAccount(userId: string) {
  const ref = await getActiveMatch(userId);
  if (!ref) return null;
  const room = await loadRoom(ref.roomCode);
  if (!room) {
    await clearActiveMatch(userId, ref.roomCode);
    return null;
  }
  const p = participantForAccount(room, userId);
  if (!p) {
    await clearActiveMatch(userId, ref.roomCode);
    return null;
  }
  if (room.gameState?.phase === 'matchEnd') {
    await clearActiveMatch(userId, ref.roomCode);
    return null;
  }
  return {
    roomCode: room.code,
    mode: room.mode,
    seat: p.seat,
    started: room.started,
    connected: Date.now() - p.lastSeen < PRESENCE_MS,
    updatedAt: ref.updatedAt,
  };
}

async function acquireLock(code: string): Promise<string | null> {
  if (!redis) return 'memory';
  const token = crypto.randomUUID();
  for (let i = 0; i < 30; i++) {
    const ok = await redis.set(lockKey(code), token, 'PX', 5000, 'NX');
    if (ok === 'OK') return token;
    await sleep(30 + Math.floor(Math.random() * 40));
  }
  return null;
}
async function releaseLock(code: string, token: string): Promise<void> {
  if (!redis || token === 'memory') return;
  await redis.eval("if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end", 1, lockKey(code), token);
}
async function mutateRoom<T>(code: string, fn: (room: StoredRoom) => Promise<T> | T, publish = true): Promise<{ room: StoredRoom; result: T } | null> {
  const token = await acquireLock(code);
  if (!token) throw new Error('Room is busy. Try again.');
  try {
    const room = await loadRoom(code);
    if (!room) return null;
    const result = await fn(room);
    await saveRoom(room);
    if (publish) await publishRoom(code);
    return { room, result };
  } finally { await releaseLock(code, token); }
}

function sendJson(conn: Connection, msg: unknown) {
  if (conn.closed) return;
  try { conn.ws.send(JSON.stringify(msg)); } catch { conn.closed = true; }
}
const sendError = (conn: Connection, message: string) => sendJson(conn, { type: 'ERROR', message });

async function broadcastLocalRoom(code: string): Promise<void> {
  const room = await loadRoom(code);
  for (const conn of localConnections) {
    if (conn.closed || conn.roomCode !== code || !conn.token || !conn.role) continue;
    if (!room) { sendError(conn, 'That room no longer exists.'); continue; }
    const snapshot = roomSnapshot(room);

    if (conn.role === 'player') {
      if (!conn.seat) continue;
      const p = room.seats[String(conn.seat)];
      if (!p) continue;
      if (p.token !== conn.token || p.connectionId !== conn.id) {
        sendJson(conn, { type: 'NOTICE', message: 'This seat was resumed from another device.' });
        conn.closed = true;
        try { conn.ws.close(4001, 'Resumed on another device'); } catch {}
        continue;
      }
      sendJson(conn, {
        type: 'ROOM_STATE',
        update: {
          room: snapshot,
          you: { seat: p.seat, name: p.name, isHost: p.token === room.hostToken, role: 'player' },
          state: room.gameState ? visibleStateForSeat(room.gameState, p.seat) : null,
        },
      });
      continue;
    }

    const spectator = spectatorForToken(room, conn.token);
    if (!spectator || spectator.connectionId !== conn.id) continue;
    sendJson(conn, {
      type: 'ROOM_STATE',
      update: {
        room: snapshot,
        you: { seat: null, name: spectator.name, isHost: false, role: 'spectator' },
        state: room.gameState ? visibleStateForSpectator(room.gameState) : null,
      },
    });
  }
}

type EmoteEvent = {
  id: string;
  roomCode: string;
  seat: Brasta.Seat;
  name: string;
  emote: string;
  at: number;
};

function broadcastLocalEmote(event: EmoteEvent): void {
  for (const conn of localConnections) {
    if (conn.closed || conn.roomCode !== event.roomCode || !conn.role) continue;
    sendJson(conn, { type: 'EMOTE', event });
  }
}

async function publishEmote(event: EmoteEvent): Promise<void> {
  if (redis) {
    await redis.publish(EMOTE_CHANNEL, JSON.stringify(event));
    return;
  }
  broadcastLocalEmote(event);
}

async function ensureSubscriber(): Promise<void> {
  if (!redis || subscriberStarted) return;
  subscriberStarted = true;
  const sub = duplicateRedis();
  if (!sub) return;
  sub.on('message', (channel: string, payload: string) => {
    if (channel === EVENT_CHANNEL) {
      void broadcastLocalRoom(payload);
      return;
    }
    if (channel === EMOTE_CHANNEL) {
      try {
        const event = JSON.parse(payload) as EmoteEvent;
        if (event?.roomCode && event?.seat && event?.emote) broadcastLocalEmote(event);
      } catch {}
    }
  });
  sub.on('error', (err: unknown) => console.error('[brasta redis subscriber]', err));
  await sub.subscribe(EVENT_CHANNEL, EMOTE_CHANNEL);
}
async function publishRoom(code: string): Promise<void> {
  await broadcastLocalRoom(code);
  if (redis) await redis.publish(EVENT_CHANNEL, code);
}

async function makeRoomCode(): Promise<string> {
  for (let a = 0; a < 1000; a++) {
    let code = '';
    for (let i = 0; i < 5; i++) code += ROOM_CHARS[crypto.randomInt(ROOM_CHARS.length)];
    if (!(await loadRoom(code))) return code;
  }
  throw new Error('Could not allocate room code');
}

async function supersedeLocalSocket(conn: Connection, roomCode: string, token: string, role: 'player' | 'spectator'): Promise<void> {
  for (const old of localConnections) {
    if (old !== conn && !old.closed && old.roomCode === roomCode && old.token === token && old.role === role) {
      sendJson(old, { type: 'NOTICE', message: role === 'player' ? 'This seat was reconnected from another browser.' : 'This spectator session was reconnected from another browser.' });
      old.closed = true;
      try { old.ws.close(4001, 'Reconnected elsewhere'); } catch {}
    }
  }
}
async function supersedeLocalSeat(conn: Connection, roomCode: string, seat: Brasta.Seat): Promise<void> {
  for (const old of localConnections) {
    if (old !== conn && !old.closed && old.roomCode === roomCode && old.seat === seat && old.role === 'player') {
      sendJson(old, { type: 'NOTICE', message: 'This seat was resumed from another device.' });
      old.closed = true;
      try { old.ws.close(4001, 'Resumed on another device'); } catch {}
    }
  }
}
async function attachPlayer(conn: Connection, room: StoredRoom, p: Participant): Promise<void> {
  await supersedeLocalSocket(conn, room.code, p.token, 'player');
  p.connectionId = conn.id;
  p.lastSeen = Date.now();
  conn.roomCode = room.code;
  conn.seat = p.seat;
  conn.token = p.token;
  conn.role = 'player';
  sendJson(conn, { type: 'SESSION', session: { code: room.code, seat: p.seat, token: p.token, name: p.name, isHost: p.token === room.hostToken, role: 'player' } });
}
async function attachSpectator(conn: Connection, room: StoredRoom, spectator: Spectator): Promise<void> {
  await supersedeLocalSocket(conn, room.code, spectator.token, 'spectator');
  spectator.connectionId = conn.id;
  spectator.lastSeen = Date.now();
  conn.roomCode = room.code;
  conn.seat = null;
  conn.token = spectator.token;
  conn.role = 'spectator';
  sendJson(conn, { type: 'SESSION', session: { code: room.code, seat: null, token: spectator.token, name: spectator.name, isHost: false, role: 'spectator' } });
}

async function detach(conn: Connection, intentional = false): Promise<void> {
  const code = conn.roomCode;
  const seat = conn.seat;
  const token = conn.token;
  const role = conn.role;
  let removedAccountId: string | null = null;
  conn.roomCode = null; conn.seat = null; conn.token = null; conn.role = null;
  if (!code || !token || !role) return;

  const updated = await mutateRoom(code, (room) => {
    if (role === 'spectator') {
      const s = spectatorForToken(room, token);
      if (!s || s.connectionId !== conn.id) return;
      if (intentional) delete room.spectators[token];
      else s.lastSeen = 0;
      return;
    }

    if (!seat) return;
    const p = room.seats[String(seat)];
    if (!p || p.token !== token || p.connectionId !== conn.id) return;
    p.lastSeen = 0;
    if (intentional && !room.started) {
      const wasHost = p.token === room.hostToken;
      removedAccountId = p.accountId || null;
      delete room.seats[String(seat)];
      if (wasHost) {
        const next = Object.values(room.seats).sort((a, b) => a.seat - b.seat)[0];
        if (next) room.hostToken = next.token;
      }
    }
  });
  if (removedAccountId) await clearActiveMatch(removedAccountId, code);
  if (updated && Object.keys(updated.room.seats).length === 0) {
    await clearRoomActiveMatches(updated.room);
    await deleteRoom(code);
  }
}

async function requirePlayerSession(conn: Connection): Promise<{ room: StoredRoom; p: Participant } | null> {
  if (conn.role === 'spectator') { sendError(conn, 'Spectators can watch the game but cannot make moves.'); return null; }
  if (!conn.roomCode || !conn.seat || !conn.token || conn.role !== 'player') { sendError(conn, 'Join or create a room first.'); return null; }
  const room = await loadRoom(conn.roomCode);
  if (!room) { sendError(conn, 'That room no longer exists.'); return null; }
  const p = room.seats[String(conn.seat)];
  if (!p || p.token !== conn.token || p.connectionId !== conn.id) { sendError(conn, 'Your room session is no longer valid.'); return null; }
  return { room, p };
}

export async function handleMessage(conn: Connection, raw: string): Promise<void> {
  let msg: any;
  try { msg = JSON.parse(raw); } catch { sendError(conn, 'Message must be valid JSON.'); return; }
  if (!msg || typeof msg.type !== 'string') { sendError(conn, 'Message type is required.'); return; }
  try {
    if (msg.type === 'PING') {
      if (conn.roomCode && conn.token && conn.role) {
        await mutateRoom(conn.roomCode, (room) => {
          if (conn.role === 'spectator') {
            const s = spectatorForToken(room, conn.token!);
            if (s && s.connectionId === conn.id) s.lastSeen = Date.now();
            return;
          }
          if (conn.seat) {
            const p = room.seats[String(conn.seat)];
            if (p && p.token === conn.token && p.connectionId === conn.id) p.lastSeen = Date.now();
          }
        }, false);
      }
      sendJson(conn, { type: 'PONG' });
      return;
    }

    if (msg.type === 'CLAIM_ACCOUNT') {
      const session = await requirePlayerSession(conn);
      if (!session) return;
      try {
        await bindVerifiedAccountToSeat(session.room.code, session.p.seat, session.p.token, msg.accessToken);
      } catch (error) {
        console.error('[brasta account seat claim]', error);
      }
      return;
    }

    if (msg.type === 'EMOTE') {
      const session = await requirePlayerSession(conn);
      if (!session) return;
      if (!session.room.started || !session.room.gameState) return sendError(conn, 'Emotes are available during active matches.');
      const emote = String(msg.emote || '').trim();
      if (!ALLOWED_EMOTES.has(emote)) return sendError(conn, 'Choose a valid Brasta emote.');
      const now = Date.now();
      if (now - conn.lastEmoteAt < EMOTE_RATE_MS) return;
      conn.lastEmoteAt = now;
      await publishEmote({
        id: crypto.randomUUID(),
        roomCode: session.room.code,
        seat: session.p.seat,
        name: session.p.name,
        emote,
        at: now,
      });
      return;
    }

    if (msg.type === 'CREATE_ROOM') {
      await detach(conn, true);
      const name = cleanName(msg.name);
      const mode: Brasta.Mode | null = msg.mode === '2v2' ? '2v2' : msg.mode === '1v1' ? '1v1' : null;
      const targetScore: Brasta.TargetScore = Number(msg.targetScore) === 220 ? 220 : 110;
      if (!name) return sendError(conn, 'Enter a display name.');
      if (!mode) return sendError(conn, 'Choose 1v1 or 2v2.');
      const token = makeToken();
      let room: StoredRoom | null = null;
      for (let i = 0; i < 25 && !room; i++) {
        const code = await makeRoomCode();
        const p: Participant = { seat: 1, name, token, connectionId: conn.id, lastSeen: Date.now() };
        const candidate: StoredRoom = { code, mode, targetScore, createdAt: Date.now(), lastActivity: Date.now(), started: false, revision: 0, hostToken: token, seats: { '1': p }, spectators: {}, gameState: null, callableBurn: null };
        if (await createRoomIfAbsent(candidate)) room = candidate;
      }
      if (!room) return sendError(conn, 'Could not create a room. Try again.');
      const p = room.seats['1'];
      await attachPlayer(conn, room, p);
      await saveRoom(room);
      await publishRoom(room.code);
      // The lobby is already visible before this verification begins because
      // SESSION/ROOM_STATE were sent above. Await the binding here so the
      // cross-device resume registry is guaranteed to be durable.
      try {
        await bindVerifiedAccountToSeat(room.code, p.seat, p.token, msg.accessToken);
      } catch (error) {
        console.error('[brasta account seat bind]', error);
      }
      return;
    }

    if (msg.type === 'JOIN_ROOM') {
      await detach(conn, false);
      const code = cleanCode(msg.code);
      const name = cleanName(msg.name);
      const reconnectToken = typeof msg.token === 'string' ? msg.token : '';
      // Persist the membership/session change under the room lock, but wait to
      // publish until the new socket is attached. Never save `changed.room`
      // again afterward: another player may have advanced the game meanwhile.
      const changed = await mutateRoom(code, (room) => {
        if (reconnectToken) {
          const existing = participantForToken(room, reconnectToken);
          if (existing) {
            if (name) existing.name = name;
            applyNames(room);
            existing.connectionId = conn.id;
            existing.lastSeen = Date.now();
            return existing;
          }
        }
        if (room.started) throw new Error('This game has already started. Use Resume Match while signed into the account that owns this seat, or use the Spectate link.');
        if (!name) throw new Error('Enter a display name.');
        const seat = activeSeats(room).find((s) => !room.seats[String(s)]);
        if (!seat) throw new Error('That room is full. You can still spectate it.');
        const p: Participant = { seat, name, token: makeToken(), connectionId: conn.id, lastSeen: Date.now() };
        room.seats[String(seat)] = p;
        return p;
      }, false);
      if (!changed) return sendError(conn, 'Room not found. Check the code and try again.');
      await supersedeLocalSeat(conn, changed.room.code, changed.result.seat);
      await attachPlayer(conn, changed.room, changed.result);
      // Publish the join immediately, then finish the account binding before
      // this message handler returns so another device can discover the match.
      await publishRoom(changed.room.code);
      try {
        await bindVerifiedAccountToSeat(changed.room.code, changed.result.seat, changed.result.token, msg.accessToken);
      } catch (error) {
        console.error('[brasta account seat bind]', error);
      }
      return;
    }

    if (msg.type === 'RESUME_ACCOUNT') {
      await detach(conn, false);
      const identity = await verifyBrastaAccessToken(typeof msg.accessToken === 'string' ? msg.accessToken : '');
      if (!identity?.userId) return sendError(conn, 'Sign in again to resume your match.');
      const ref = await getActiveMatch(identity.userId);
      if (!ref) return sendError(conn, 'No active match was found for this account.');

      const changed = await mutateRoom(ref.roomCode, (room) => {
        const existing = participantForAccount(room, identity.userId);
        if (!existing) throw new Error('Your saved match seat is no longer available.');
        if (room.gameState?.phase === 'matchEnd') throw new Error('That match has already ended.');
        const wasHost = existing.token === room.hostToken;
        existing.token = makeToken();
        existing.connectionId = conn.id;
        existing.lastSeen = Date.now();
        if (wasHost) room.hostToken = existing.token;
        return existing;
      }, false);
      if (!changed) {
        await clearActiveMatch(identity.userId, ref.roomCode);
        return sendError(conn, 'That match is no longer available.');
      }
      await supersedeLocalSeat(conn, changed.room.code, changed.result.seat);
      await attachPlayer(conn, changed.room, changed.result);
      await bindParticipantActiveMatch(changed.room, changed.result);
      await publishRoom(changed.room.code);
      return;
    }

    if (msg.type === 'SPECTATE_ROOM') {
      await detach(conn, false);
      const code = cleanCode(msg.code);
      const name = cleanName(msg.name);
      const reconnectToken = typeof msg.token === 'string' ? msg.token : '';
      const changed = await mutateRoom(code, (room) => {
        normalizeRoom(room);
        if (reconnectToken) {
          const existing = spectatorForToken(room, reconnectToken);
          if (existing) {
            if (name) existing.name = name;
            existing.connectionId = conn.id;
            existing.lastSeen = Date.now();
            return existing;
          }
        }
        if (!name) throw new Error('Enter a display name.');
        const token = makeToken();
        const spectator: Spectator = { name, token, connectionId: conn.id, lastSeen: Date.now() };
        room.spectators[token] = spectator;
        return spectator;
      }, false);
      if (!changed) return sendError(conn, 'Room not found. Check the code and try again.');
      await attachSpectator(conn, changed.room, changed.result);
      await publishRoom(changed.room.code);
      return;
    }

    if (msg.type === 'LEAVE_ROOM') {
      await detach(conn, true);
      sendJson(conn, { type: 'NOTICE', message: 'Left room.' });
      return;
    }

    const current = await requirePlayerSession(conn);
    if (!current) return;
    const code = current.room.code;
    const changed = await mutateRoom(code, (room) => {
      const p = room.seats[String(conn.seat!)];
      if (!p || p.token !== conn.token || p.connectionId !== conn.id) throw new Error('Your room session is no longer valid.');
      p.lastSeen = Date.now();
      const requireHost = () => { if (p.token !== room.hostToken) throw new Error('Only the room host can do that.'); };

      if (msg.type === 'START_GAME') {
        requireHost();
        if (room.started) throw new Error('The game has already started.');
        if (!activeSeats(room).every((s) => !!room.seats[String(s)])) throw new Error('All seats must be filled before starting.');
        room.gameState = Brasta.startMatch(room.mode, crypto.randomInt(1, 0x7fffffff), room.targetScore);
        room.callableBurn = null;
        applyNames(room); room.started = true; room.revision++;
        return null;
      }
      if (!room.started || !room.gameState) throw new Error('The game has not started yet.');

      if (msg.type === 'CALL_BURN') {
        const burn = room.callableBurn;
        if (!burn || room.gameState.phase !== 'play' || burn.offenderSeat === p.seat) {
          return { type: 'BURN_RESULT', valid: false, message: 'No valid burn to call.' };
        }
        if (burn.claimedBySeat && burn.claimedAt && Date.now() - burn.claimedAt < BURN_CLAIM_MS && burn.claimedBySeat !== p.seat) {
          return { type: 'BURN_RESULT', valid: false, message: 'That burn has already been called.' };
        }
        burn.claimedBySeat = p.seat;
        burn.claimedAt = Date.now();
        if (burn.options.length === 1) {
          resolveBurn(room, burn, p.seat, burn.options[0]);
          room.callableBurn = null;
          room.revision++;
          return { type: 'BURN_RESOLVED', valid: true };
        }
        return {
          type: 'BURN_OPTIONS',
          burnId: burn.id,
          options: burn.options.map((option) => ({ id: option.id, label: option.label })),
        };
      }

      if (msg.type === 'RESOLVE_BURN') {
        const burn = room.callableBurn;
        if (!burn || burn.id !== String(msg.burnId || '') || burn.claimedBySeat !== p.seat) {
          return { type: 'BURN_RESULT', valid: false, message: 'That burn is no longer available.' };
        }
        const option = burn.options.find((candidate) => candidate.id === String(msg.optionId || ''));
        if (!option) return { type: 'BURN_RESULT', valid: false, message: 'Choose a valid burn pickup.' };
        resolveBurn(room, burn, p.seat, option);
        room.callableBurn = null;
        room.revision++;
        return { type: 'BURN_RESOLVED', valid: true };
      }

      if (msg.type === 'OPENING_CHOICE') {
        if (room.gameState.phase !== 'openingChoice') throw new Error('The opening choice is not active.');
        if (room.gameState.starterSeat !== p.seat) throw new Error('Only this round’s starter can make the opening choice.');
        if (msg.choice !== 'keep' && msg.choice !== 'put') throw new Error('Opening choice must be keep or put.');
        const result = Brasta.resolveOpening(room.gameState, msg.choice);
        if (!result.ok) throw new Error(result.error || 'Opening choice rejected.');
        room.callableBurn = null;
        room.gameState = result.state; applyNames(room); room.revision++; return null;
      }
      if (msg.type === 'COMMAND') {
        if (!msg.command || typeof msg.command.type !== 'string') throw new Error('A game command is required.');
        if (room.callableBurn?.claimedBySeat && room.callableBurn.claimedAt && Date.now() - room.callableBurn.claimedAt < BURN_CLAIM_MS) {
          throw new Error('A burn call is being resolved.');
        }
        const safe = { ...msg.command, seat: p.seat } as Brasta.Command;
        const before = clone(room.gameState);
        const result = Brasta.applyCommand(room.gameState, safe);
        if (!result.ok) throw new Error(result.error || 'Move rejected.');

        room.callableBurn = null;
        if (result.state.phase === 'play') {
          let options: BurnPickupOption[] = [];
          let includePlayedCard = true;

          if (safe.type === 'PLAY_LOOSE') {
            options = burnPickupOptions(before, p.seat, safe.cardId);
          } else if (safe.type === 'CAPTURE_LOOSE' || safe.type === 'CAPTURE_BUILD') {
            // A player can also be burned for taking only part of everything
            // their played card was legally able to capture. Example: capture
            // a loose 10 with a 10 while leaving 6+4 on the table.
            options = missedCaptureBurnOptions(before, result.state, safe);
            includePlayedCard = false;
          }

          if (options.length) {
            room.callableBurn = {
              id: crypto.randomUUID(),
              offenderSeat: p.seat,
              cardId: safe.cardId,
              options,
              includePlayedCard,
              claimedBySeat: null,
              claimedAt: null,
            };
          }
        }
        const previousPhase = room.gameState.phase;
        room.gameState = result.state;
        const ranked = rankedMeta(room);
        if (ranked) {
          if (result.state.phase === 'roundEnd' && previousPhase !== 'roundEnd') ranked.roundEndedAt = Date.now();
          else if (result.state.phase !== 'roundEnd') delete ranked.roundEndedAt;
        }
        applyNames(room); room.revision++; return null;
      }
      if (msg.type === 'NEXT_ROUND') {
        requireHost();
        const result = Brasta.nextRound(room.gameState);
        if (!result.ok) throw new Error(result.error || 'Unable to start next round.');
        room.callableBurn = null;
        room.gameState = result.state;
        const ranked = rankedMeta(room);
        if (ranked) delete ranked.roundEndedAt;
        applyNames(room); room.revision++; return null;
      }
      if (msg.type === 'END_MATCH') {
        requireHost(); room.callableBurn = null; room.gameState = Brasta.endMatch(room.gameState); room.revision++; return null;
      }
      throw new Error('Unsupported room command.');
    });
    if (!changed) return sendError(conn, 'That room no longer exists.');
    if (msg.type === 'START_GAME') {
      await Promise.all(Object.values(changed.room.seats).map((seatPlayer) => bindParticipantActiveMatch(changed.room, seatPlayer)));
    }
    if (changed.room.gameState?.phase === 'matchEnd') await clearRoomActiveMatches(changed.room);
    if (changed.result && typeof changed.result === 'object' && 'type' in changed.result) sendJson(conn, changed.result);
  } catch (err) {
    console.error('[brasta action]', err);
    sendError(conn, err instanceof Error ? err.message : 'The server could not process that action. No game state was changed.');
  }
}

export async function registerSocket(ws: WireSocket): Promise<Connection> {
  await ensureSubscriber();
  const conn: Connection = { id: crypto.randomUUID(), ws, closed: false, roomCode: null, seat: null, token: null, role: null, lastEmoteAt: 0 };
  localConnections.add(conn);
  sendJson(conn, { type: 'NOTICE', message: redis ? 'Connected to Brasta.' : 'Connected to Brasta (local memory mode).' });
  return conn;
}
export async function unregisterSocket(conn: Connection): Promise<void> {
  if (conn.closed) return;
  conn.closed = true;
  localConnections.delete(conn);
  await detach(conn, false);
}

export async function health() {
  let redisOk = false;
  if (redis) {
    try { redisOk = (await redis.ping()) === 'PONG'; } catch { redisOk = false; }
  }
  return { ok: true, redisConfigured: !!redis, redisOk, localConnections: [...localConnections].filter((c) => !c.closed).length };
}
