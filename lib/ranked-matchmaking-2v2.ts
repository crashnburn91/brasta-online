import crypto from 'node:crypto';
import * as Brasta from './game-engine';
import { redis } from './redis';
import { verifyBrastaAccessToken, type BrastaAuthIdentity } from './supabase-auth';
import {
  competitiveBackendReady,
  getCompetitiveStatus,
  type CompetitiveStatus,
  type RankedFinalizeResult,
} from './competitive';
import { createRanked2v2MatchRecord, finalizeRanked2v2Match } from './competitive-2v2';

const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_TTL_SECONDS = 24 * 60 * 60;
const QUEUE_TTL_SECONDS = 120;
const PARTY_TTL_SECONDS = 15 * 60;
const ASSIGNMENT_TTL_SECONDS = 24 * 60 * 60;
const QUEUE_STALE_MS = 90_000;
const PRESENCE_MS = 45_000;
const ROUND_SCORE_PAUSE_MS = 4_000;
const ROOM_EVENT_CHANNEL = 'brasta:room-events';
const QUEUE_KEY = 'brasta:ranked:queue:2v2';
const QUEUE_LOCK_KEY = 'brasta:ranked:queue:2v2:lock';
const ONE_V_ONE_QUEUE_KEY = 'brasta:ranked:queue:1v1';

export type Ranked2v2Assignment = {
  mode: '2v2';
  roomCode: string;
  matchId: string;
  seat: 1 | 2 | 3 | 4;
  token: string;
  name: string;
  teammate: string;
  opponents: [string, string];
  opponent: string;
  rankName: string;
};

type QueueEntry = {
  userId: string;
  username: string;
  ordinal: number;
  rankName: string;
  gamesPlayed: number;
  placementGames: number;
  joinedAt: number;
  lastSeen: number;
  partyId: string | null;
  partnerUserId: string | null;
};

type Ranked2v2PartyMember = {
  userId: string;
  username: string;
  ordinal: number;
  rankName: string;
  gamesPlayed: number;
  placementGames: number;
};

type Ranked2v2Party = {
  id: string;
  code: string;
  members: Ranked2v2PartyMember[];
  createdAt: number;
  updatedAt: number;
};

type QueueUnit = {
  key: string;
  entries: QueueEntry[];
  ordinal: number;
  joinedAt: number;
};

type RankedParticipant = {
  seat: 1 | 2 | 3 | 4;
  name: string;
  token: string;
  connectionId: string;
  lastSeen: number;
  authUserId: string;
  rankName: string;
};

type RankedRoom = {
  code: string;
  mode: '2v2';
  targetScore: 110;
  createdAt: number;
  lastActivity: number;
  started: boolean;
  revision: number;
  hostToken: string;
  seats: Record<string, RankedParticipant>;
  spectators: Record<string, unknown>;
  gameState: Brasta.GameState | null;
  callableBurn: null;
  ranked: {
    mode: '2v2';
    matchId: string;
    playerIds: { A: [string, string]; B: [string, string] };
    finalized: boolean;
    finalizing: boolean;
    result: RankedFinalizeResult | null;
  };
};

const roomKey = (code: string) => `brasta:room:${code}`;
const roomLockKey = (code: string) => `brasta:lock:${code}`;
const queueDataKey = (userId: string) => `brasta:ranked:queue:2v2:data:${userId}`;
const assignmentKey = (userId: string) => `brasta:ranked:assignment:2v2:${userId}`;
const partyKey = (partyId: string) => `brasta:ranked:party:2v2:${partyId}`;
const partyCodeKey = (code: string) => `brasta:ranked:party:2v2:code:${code}`;
const partyUserKey = (userId: string) => `brasta:ranked:party:2v2:user:${userId}`;
const legacy1v1QueueDataKey = (userId: string) => `brasta:ranked:queue:data:${userId}`;
const legacy1v1AssignmentKey = (userId: string) => `brasta:ranked:assignment:${userId}`;
const makeToken = () => crypto.randomBytes(24).toString('hex');
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function requireRedis(): Promise<NonNullable<typeof redis>> {
  if (!redis) throw new Error('Ranked matchmaking requires the production Redis service.');
  return redis;
}

async function authFromRequest(request: Request): Promise<{ identity: BrastaAuthIdentity; accessToken: string }> {
  const auth = request.headers.get('authorization') || '';
  const accessToken = auth.replace(/^Bearer\s+/i, '').trim();
  const identity = await verifyBrastaAccessToken(accessToken);
  if (!identity?.userId || !identity.username) throw new Error('Sign in and finish your Brasta profile before playing ranked.');
  return { identity, accessToken };
}

async function acquireKeyLock(key: string, ttlMs = 5000): Promise<string> {
  const r = await requireRedis();
  const token = crypto.randomUUID();
  for (let i = 0; i < 35; i++) {
    const ok = await r.set(key, token, 'PX', ttlMs, 'NX');
    if (ok === 'OK') return token;
    await sleep(25 + Math.floor(Math.random() * 35));
  }
  throw new Error('Ranked service is busy. Try again.');
}

async function releaseKeyLock(key: string, token: string): Promise<void> {
  const r = await requireRedis();
  await r.eval("if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end", 1, key, token);
}

async function readQueueEntry(userId: string): Promise<QueueEntry | null> {
  const r = await requireRedis();
  const raw = await r.get(queueDataKey(userId));
  if (!raw) return null;
  try { return JSON.parse(raw) as QueueEntry; } catch { return null; }
}

async function writeQueueEntry(entry: QueueEntry): Promise<void> {
  const r = await requireRedis();
  await r.set(queueDataKey(entry.userId), JSON.stringify(entry), 'EX', QUEUE_TTL_SECONDS);
  await r.zadd(QUEUE_KEY, entry.joinedAt, entry.userId);
}

async function removeQueueEntry(userId: string): Promise<void> {
  const r = await requireRedis();
  await r.zrem(QUEUE_KEY, userId);
  await r.del(queueDataKey(userId));
}

async function leave1v1Queue(userId: string): Promise<void> {
  const r = await requireRedis();
  await r.zrem(ONE_V_ONE_QUEUE_KEY, userId);
  await r.del(legacy1v1QueueDataKey(userId));
}

async function readAssignment(userId: string): Promise<Ranked2v2Assignment | null> {
  const r = await requireRedis();
  const raw = await r.get(assignmentKey(userId));
  if (!raw) return null;
  try { return JSON.parse(raw) as Ranked2v2Assignment; } catch { return null; }
}

async function writeAssignment(userId: string, assignment: Ranked2v2Assignment): Promise<void> {
  const r = await requireRedis();
  await r.set(assignmentKey(userId), JSON.stringify(assignment), 'EX', ASSIGNMENT_TTL_SECONDS);
}

async function makeRoomCode(): Promise<string> {
  const r = await requireRedis();
  for (let attempt = 0; attempt < 1000; attempt++) {
    let code = '';
    for (let i = 0; i < 5; i++) code += ROOM_CHARS[crypto.randomInt(ROOM_CHARS.length)];
    if (!(await r.exists(roomKey(code)))) return code;
  }
  throw new Error('Could not allocate a ranked room code.');
}

function normalizePartyCode(value: string): string {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
}

async function makePartyCode(): Promise<string> {
  const r = await requireRedis();
  for (let attempt = 0; attempt < 1000; attempt++) {
    let code = '';
    for (let i = 0; i < 5; i++) code += ROOM_CHARS[crypto.randomInt(ROOM_CHARS.length)];
    if (!(await r.exists(partyCodeKey(code)))) return code;
  }
  throw new Error('Could not allocate a duo code.');
}

function partyMember(identity: BrastaAuthIdentity, status: CompetitiveStatus): Ranked2v2PartyMember {
  return {
    userId: identity.userId,
    username: identity.username!,
    ordinal: status.matchmakingOrdinal,
    rankName: status.rankName,
    gamesPlayed: status.gamesPlayed,
    placementGames: status.placementGames,
  };
}

async function readParty(partyId: string): Promise<Ranked2v2Party | null> {
  const r = await requireRedis();
  const raw = await r.get(partyKey(partyId));
  if (!raw) return null;
  try { return JSON.parse(raw) as Ranked2v2Party; } catch { return null; }
}

async function readPartyForUser(userId: string): Promise<Ranked2v2Party | null> {
  const r = await requireRedis();
  const partyId = await r.get(partyUserKey(userId));
  if (!partyId) return null;
  const party = await readParty(partyId);
  if (!party) {
    await r.del(partyUserKey(userId));
    return null;
  }
  return party.members.some((member) => member.userId === userId) ? party : null;
}

async function readPartyByCode(code: string): Promise<Ranked2v2Party | null> {
  const r = await requireRedis();
  const normalized = normalizePartyCode(code);
  if (!normalized) return null;
  const partyId = await r.get(partyCodeKey(normalized));
  if (!partyId) return null;
  const party = await readParty(partyId);
  if (!party) {
    await r.del(partyCodeKey(normalized));
    return null;
  }
  return party;
}

async function writeParty(party: Ranked2v2Party): Promise<void> {
  const r = await requireRedis();
  party.updatedAt = Date.now();
  await r.set(partyKey(party.id), JSON.stringify(party), 'EX', PARTY_TTL_SECONDS);
  await r.set(partyCodeKey(party.code), party.id, 'EX', PARTY_TTL_SECONDS);
  await Promise.all(party.members.map((member) =>
    r.set(partyUserKey(member.userId), party.id, 'EX', PARTY_TTL_SECONDS)
  ));
}

async function clearParty(party: Ranked2v2Party): Promise<void> {
  const r = await requireRedis();
  await r.del(partyKey(party.id), partyCodeKey(party.code), ...party.members.map((member) => partyUserKey(member.userId)));
}

function publicParty(party: Ranked2v2Party | null, viewerUserId: string) {
  if (!party) return null;
  return {
    code: party.code,
    full: party.members.length === 2,
    members: party.members.map((member) => ({
      username: member.username,
      rankName: member.rankName,
      you: member.userId === viewerUserId,
    })),
  };
}

function searchWindow(waitMs: number): number {
  return Math.min(18, 3 + Math.floor(Math.max(0, waitMs) / 10_000) * 2);
}

async function cleanAndLoadCandidates(): Promise<QueueEntry[]> {
  const r = await requireRedis();
  const now = Date.now();
  const ids = await r.zrange(QUEUE_KEY, 0, -1);
  const entries: QueueEntry[] = [];
  for (const id of ids) {
    const entry = await readQueueEntry(id);
    if (!entry || now - entry.lastSeen > QUEUE_STALE_MS) {
      await removeQueueEntry(id);
      continue;
    }
    entries.push(entry);
  }
  return entries;
}

function makeQueueUnits(entries: QueueEntry[]): QueueUnit[] {
  const groups = new Map<string, QueueEntry[]>();
  for (const entry of entries) {
    const key = entry.partyId ? `party:${entry.partyId}` : `solo:${entry.userId}`;
    const group = groups.get(key) || [];
    group.push(entry);
    groups.set(key, group);
  }

  const units: QueueUnit[] = [];
  for (const [key, group] of groups) {
    if (key.startsWith('party:')) {
      if (group.length !== 2) continue;
      const [a, b] = group;
      if (a.partnerUserId !== b.userId || b.partnerUserId !== a.userId) continue;
    } else if (group.length !== 1) {
      continue;
    }
    units.push({
      key,
      entries: group,
      ordinal: group.reduce((sum, entry) => sum + entry.ordinal, 0) / group.length,
      joinedAt: Math.min(...group.map((entry) => entry.joinedAt)),
    });
  }
  return units;
}

function pairingKeepsDuosTogether(pairing: [[QueueEntry, QueueEntry], [QueueEntry, QueueEntry]]): boolean {
  const side = new Map<string, 'A' | 'B'>();
  pairing[0].forEach((entry) => side.set(entry.userId, 'A'));
  pairing[1].forEach((entry) => side.set(entry.userId, 'B'));
  for (const team of pairing) {
    for (const entry of team) {
      if (!entry.partyId || !entry.partnerUserId) continue;
      if (side.get(entry.userId) !== side.get(entry.partnerUserId)) return false;
    }
  }
  return true;
}

function balanceTeams(players: [QueueEntry, QueueEntry, QueueEntry, QueueEntry]): {
  teamA: [QueueEntry, QueueEntry]; teamB: [QueueEntry, QueueEntry];
} {
  const pairings: Array<[[QueueEntry, QueueEntry], [QueueEntry, QueueEntry]]> = [
    [[players[0], players[1]], [players[2], players[3]]],
    [[players[0], players[2]], [players[1], players[3]]],
    [[players[0], players[3]], [players[1], players[2]]],
  ].filter(pairingKeepsDuosTogether);
  if (!pairings.length) throw new Error('Could not keep the queued duo on the same ranked team.');

  pairings.sort((a, b) => {
    const gapA = Math.abs((a[0][0].ordinal + a[0][1].ordinal) - (a[1][0].ordinal + a[1][1].ordinal));
    const gapB = Math.abs((b[0][0].ordinal + b[0][1].ordinal) - (b[1][0].ordinal + b[1][1].ordinal));
    return gapA - gapB;
  });
  let [teamA, teamB] = pairings[0];
  if (crypto.randomInt(2) === 1) [teamA, teamB] = [teamB, teamA];
  if (crypto.randomInt(2) === 1) teamA = [teamA[1], teamA[0]];
  if (crypto.randomInt(2) === 1) teamB = [teamB[1], teamB[0]];
  return { teamA, teamB };
}

function chooseMatchGroup(current: QueueEntry, entries: QueueEntry[]): [QueueEntry, QueueEntry, QueueEntry, QueueEntry] | null {
  const units = makeQueueUnits(entries);
  const currentUnit = units.find((unit) => unit.entries.some((entry) => entry.userId === current.userId));
  if (!currentUnit) return null;

  const now = Date.now();
  const currentWindow = searchWindow(now - currentUnit.joinedAt);
  const eligible = units
    .filter((unit) => unit.key !== currentUnit.key)
    .map((unit) => ({
      unit,
      gap: Math.abs(unit.ordinal - currentUnit.ordinal),
      allowed: Math.max(currentWindow, searchWindow(now - unit.joinedAt)),
    }))
    .filter(({ gap, allowed }) => gap <= allowed)
    .sort((a, b) => a.gap - b.gap || a.unit.joinedAt - b.unit.joinedAt)
    .slice(0, 24)
    .map(({ unit }) => unit);

  let best: QueueUnit[] | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  function consider(chosen: QueueUnit[]) {
    const flattened = [currentUnit, ...chosen].flatMap((unit) => unit.entries);
    if (flattened.length !== 4) return;
    const ordinals = flattened.map((entry) => entry.ordinal);
    const score = Math.max(...ordinals) - Math.min(...ordinals)
      + chosen.reduce((sum, unit) => sum + Math.abs(unit.ordinal - currentUnit.ordinal), 0) * 0.1;
    if (score < bestScore) {
      bestScore = score;
      best = chosen;
    }
  }

  function search(start: number, chosen: QueueUnit[], size: number) {
    const total = currentUnit.entries.length + size;
    if (total === 4) {
      consider(chosen);
      return;
    }
    if (total > 4) return;
    for (let i = start; i < eligible.length; i++) {
      search(i + 1, [...chosen, eligible[i]], size + eligible[i].entries.length);
    }
  }

  search(0, [], 0);
  if (!best) return null;
  const group = [currentUnit, ...best].flatMap((unit) => unit.entries);
  return group.length === 4 ? group as [QueueEntry, QueueEntry, QueueEntry, QueueEntry] : null;
}

function applyNames(room: RankedRoom): void {
  if (!room.gameState) return;
  for (const player of room.gameState.players) {
    const p = room.seats[String(player.seat)];
    if (p) player.name = p.name;
  }
}

async function createMatch(entries: [QueueEntry, QueueEntry, QueueEntry, QueueEntry]): Promise<Record<string, Ranked2v2Assignment>> {
  const r = await requireRedis();
  const code = await makeRoomCode();
  const matchId = crypto.randomUUID();
  const { teamA, teamB } = balanceTeams(entries);
  const seated: Array<{ entry: QueueEntry; seat: 1 | 2 | 3 | 4 }> = [
    { entry: teamA[0], seat: 1 },
    { entry: teamB[0], seat: 2 },
    { entry: teamA[1], seat: 3 },
    { entry: teamB[1], seat: 4 },
  ];
  const now = Date.now();
  const tokens = new Map(seated.map(({ entry }) => [entry.userId, makeToken()]));

  const room: RankedRoom = {
    code,
    mode: '2v2',
    targetScore: 110,
    createdAt: now,
    lastActivity: now,
    started: true,
    revision: 0,
    hostToken: `ranked-system-${makeToken()}`,
    seats: Object.fromEntries(seated.map(({ entry, seat }) => [String(seat), {
      seat,
      name: entry.username,
      token: tokens.get(entry.userId)!,
      connectionId: '',
      lastSeen: 0,
      authUserId: entry.userId,
      rankName: entry.rankName,
    }])) as Record<string, RankedParticipant>,
    spectators: {},
    gameState: null,
    callableBurn: null,
    ranked: {
      mode: '2v2',
      matchId,
      playerIds: {
        A: [teamA[0].userId, teamA[1].userId],
        B: [teamB[0].userId, teamB[1].userId],
      },
      finalized: false,
      finalizing: false,
      result: null,
    },
  };

  const saved = await r.set(roomKey(code), JSON.stringify(room), 'EX', ROOM_TTL_SECONDS, 'NX');
  if (saved !== 'OK') throw new Error('Could not reserve the ranked room.');
  try {
    await createRanked2v2MatchRecord({
      matchId,
      roomCode: code,
      targetScore: 110,
      players: seated.map(({ entry, seat }) => ({ playerId: entry.userId, seat })),
    });
  } catch (error) {
    await r.del(roomKey(code));
    throw error;
  }

  const assignments: Record<string, Ranked2v2Assignment> = {};
  for (const { entry, seat } of seated) {
    const team = seat === 1 || seat === 3 ? teamA : teamB;
    const opponents = seat === 1 || seat === 3 ? teamB : teamA;
    const teammate = team.find((candidate) => candidate.userId !== entry.userId)!;
    assignments[entry.userId] = {
      mode: '2v2',
      roomCode: code,
      matchId,
      seat,
      token: tokens.get(entry.userId)!,
      name: entry.username,
      teammate: teammate.username,
      opponents: [opponents[0].username, opponents[1].username],
      opponent: `${opponents[0].username} & ${opponents[1].username}`,
      rankName: entry.rankName,
    };
  }
  await Promise.all(Object.entries(assignments).map(([userId, assignment]) => writeAssignment(userId, assignment)));
  return assignments;
}

async function tryMatch(entry: QueueEntry): Promise<Ranked2v2Assignment | null> {
  const lock = await acquireKeyLock(QUEUE_LOCK_KEY);
  try {
    const current = await readQueueEntry(entry.userId);
    if (!current) return readAssignment(entry.userId);
    const now = Date.now();
    current.lastSeen = now;
    await writeQueueEntry(current);

    const candidates = await cleanAndLoadCandidates(entry.userId);
    const currentWindow = searchWindow(now - current.joinedAt);
    const eligible = candidates
      .map((candidate) => ({
        candidate,
        gap: Math.abs(candidate.ordinal - current.ordinal),
        allowed: Math.max(currentWindow, searchWindow(now - candidate.joinedAt)),
      }))
      .filter(({ gap, allowed }) => gap <= allowed)
      .sort((a, b) => a.gap - b.gap || a.candidate.joinedAt - b.candidate.joinedAt)
      .map(({ candidate }) => candidate);

    if (eligible.length < 3) return null;
    const group: [QueueEntry, QueueEntry, QueueEntry, QueueEntry] = [current, eligible[0], eligible[1], eligible[2]];
    for (const candidate of group) {
      if (!(await readQueueEntry(candidate.userId))) return null;
    }

    await Promise.all(group.map((candidate) => removeQueueEntry(candidate.userId)));
    try {
      const assignments = await createMatch(group);
      return assignments[current.userId] || null;
    } catch (error) {
      const retryAt = Date.now();
      await Promise.all(group.map((candidate) => writeQueueEntry({ ...candidate, lastSeen: retryAt })));
      throw error;
    }
  } finally {
    await releaseKeyLock(QUEUE_LOCK_KEY, lock);
  }
}

function queuePayload(status: CompetitiveStatus, entry: QueueEntry | null, assignment: Ranked2v2Assignment | null) {
  if (assignment) return { state: 'matched' as const, assignment, competitive: status };
  if (entry) return {
    state: 'queued' as const,
    competitive: status,
    queuedAt: entry.joinedAt,
    waitSeconds: Math.max(0, Math.floor((Date.now() - entry.joinedAt) / 1000)),
    searchRange: searchWindow(Date.now() - entry.joinedAt),
    playersNeeded: 4,
  };
  return { state: 'idle' as const, competitive: status };
}

export async function ranked2v2QueueAction(request: Request, action: 'status' | 'join' | 'leave') {
  if (!competitiveBackendReady()) {
    return { state: 'unavailable' as const, message: 'Ranked play needs its backend secret configured.' };
  }
  const { identity, accessToken } = await authFromRequest(request);
  const status = await getCompetitiveStatus(accessToken, '2v2');
  const assignment = await readAssignment(identity.userId);
  if (assignment) return queuePayload(status, null, assignment);

  if (action === 'join') {
    const r = await requireRedis();
    if (await r.exists(legacy1v1AssignmentKey(identity.userId))) {
      throw new Error('Finish your current ranked 1v1 match before joining ranked 2v2.');
    }
    await leave1v1Queue(identity.userId);
  }

  if (action === 'leave') {
    await removeQueueEntry(identity.userId);
    return queuePayload(status, null, null);
  }

  let entry = await readQueueEntry(identity.userId);
  if (action === 'join' && !entry) {
    const now = Date.now();
    entry = {
      userId: identity.userId,
      username: identity.username!,
      ordinal: status.matchmakingOrdinal,
      rankName: status.rankName,
      gamesPlayed: status.gamesPlayed,
      placementGames: status.placementGames,
      joinedAt: now,
      lastSeen: now,
    };
    await writeQueueEntry(entry);
  } else if (entry) {
    entry.lastSeen = Date.now();
    await writeQueueEntry(entry);
  }

  if (entry) {
    const matched = await tryMatch(entry);
    if (matched) return queuePayload(status, null, matched);
    entry = await readQueueEntry(identity.userId);
  }
  return queuePayload(status, entry, null);
}

async function loadRankedRoom(code: string): Promise<RankedRoom | null> {
  const r = await requireRedis();
  const raw = await r.get(roomKey(code));
  if (!raw) return null;
  try {
    const room = JSON.parse(raw) as RankedRoom;
    return room.ranked?.mode === '2v2' && room.ranked?.matchId ? room : null;
  } catch { return null; }
}

async function saveRankedRoom(room: RankedRoom, publish = true): Promise<void> {
  const r = await requireRedis();
  room.lastActivity = Date.now();
  await r.set(roomKey(room.code), JSON.stringify(room), 'EX', ROOM_TTL_SECONDS);
  if (publish) await r.publish(ROOM_EVENT_CHANNEL, room.code);
}

function participantForIdentity(room: RankedRoom, identity: BrastaAuthIdentity): RankedParticipant | null {
  return Object.values(room.seats).find((p) => p.authUserId === identity.userId) || null;
}

function allPlayersConnected(room: RankedRoom): boolean {
  const now = Date.now();
  return ['1','2','3','4'].every((seat) => {
    const p = room.seats[seat];
    return Boolean(p?.connectionId && now - p.lastSeen < PRESENCE_MS);
  });
}

function personalizedResult(result: RankedFinalizeResult, userId: string) {
  const player = result.players.find((p) => p.playerId === userId);
  if (!player) return null;
  return {
    ...player,
    placementComplete: player.gamesPlayedAfter >= 5,
    promoted: player.rankBefore !== 'Unranked' && player.rankAfter !== player.rankBefore,
  };
}

export async function monitorRanked2v2Room(request: Request, roomCode: string) {
  if (!competitiveBackendReady()) throw new Error('Ranked backend is not configured.');
  const { identity } = await authFromRequest(request);
  const code = String(roomCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  if (!code) throw new Error('Ranked room code is required.');

  const lock = await acquireKeyLock(roomLockKey(code), 8000);
  let finalizeArgs: null | {
    matchId: string;
    teamA: [string, string];
    teamB: [string, string];
    winnerTeam: 'A' | 'B';
    scoreA: number;
    scoreB: number;
  } = null;
  try {
    const room = await loadRankedRoom(code);
    if (!room) throw new Error('Ranked 2v2 match was not found.');
    if (!participantForIdentity(room, identity)) throw new Error('This ranked match is not assigned to your account.');

    if (!room.gameState) {
      if (allPlayersConnected(room)) {
        room.gameState = Brasta.startMatch('2v2', crypto.randomInt(1, 0x7fffffff), 110);
        applyNames(room);
        room.revision += 1;
        await saveRankedRoom(room);
        return { state: 'playing' as const, phase: room.gameState.phase, started: true };
      }
      return { state: 'waiting' as const, message: 'Waiting for all four players to connect.' };
    }

    if (room.gameState.phase === 'roundEnd') {
      const remaining = ROUND_SCORE_PAUSE_MS - (Date.now() - room.lastActivity);
      if (remaining <= 0) {
        const next = Brasta.nextRound(room.gameState);
        if (!next.ok) throw new Error(next.error || 'Could not advance the ranked round.');
        room.gameState = next.state;
        applyNames(room);
        room.revision += 1;
        await saveRankedRoom(room);
        return { state: 'playing' as const, phase: room.gameState.phase, advancedRound: true };
      }
      return { state: 'roundEnd' as const, advanceInMs: remaining };
    }

    if (room.gameState.phase === 'matchEnd') {
      if (room.ranked.finalized && room.ranked.result) {
        return { state: 'completed' as const, result: personalizedResult(room.ranked.result, identity.userId) };
      }
      if (room.ranked.finalizing) return { state: 'finalizing' as const };
      const scoreA = room.gameState.score.A;
      const scoreB = room.gameState.score.B;
      const targetReached = scoreA >= room.gameState.targetScore || scoreB >= room.gameState.targetScore;
      if (!targetReached || scoreA === scoreB) throw new Error('Ranked result is not eligible for finalization.');
      room.ranked.finalizing = true;
      await saveRankedRoom(room, false);
      finalizeArgs = {
        matchId: room.ranked.matchId,
        teamA: room.ranked.playerIds.A,
        teamB: room.ranked.playerIds.B,
        winnerTeam: scoreA > scoreB ? 'A' : 'B',
        scoreA,
        scoreB,
      };
    } else {
      return { state: 'playing' as const, phase: room.gameState.phase };
    }
  } finally {
    await releaseKeyLock(roomLockKey(code), lock);
  }

  if (!finalizeArgs) return { state: 'playing' as const };
  try {
    const result = await finalizeRanked2v2Match({ ...finalizeArgs, events: [] });
    const finishLock = await acquireKeyLock(roomLockKey(code), 8000);
    try {
      const room = await loadRankedRoom(code);
      if (room) {
        room.ranked.finalizing = false;
        room.ranked.finalized = true;
        room.ranked.result = result;
        await saveRankedRoom(room, false);
      }
    } finally { await releaseKeyLock(roomLockKey(code), finishLock); }
    const r = await requireRedis();
    await Promise.all([...finalizeArgs.teamA, ...finalizeArgs.teamB].map((playerId) => r.del(assignmentKey(playerId))));
    return { state: 'completed' as const, result: personalizedResult(result, identity.userId) };
  } catch (error) {
    const retryLock = await acquireKeyLock(roomLockKey(code), 8000);
    try {
      const room = await loadRankedRoom(code);
      if (room) {
        room.ranked.finalizing = false;
        await saveRankedRoom(room, false);
      }
    } finally { await releaseKeyLock(roomLockKey(code), retryLock); }
    throw error;
  }
}
