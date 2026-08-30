import crypto from 'node:crypto';
import * as Brasta from './game-engine';
import { redis } from './redis';
import { getActiveMatch } from './account-active-match';
import { verifyBrastaAccessToken, type BrastaAuthIdentity } from './supabase-auth';
import {
  competitiveBackendReady,
  createRankedMatchRecord,
  finalizeRanked1v1Match,
  getCompetitiveStatus,
  type CompetitiveStatus,
  type RankedFinalizeResult,
} from './competitive';

const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_TTL_SECONDS = 24 * 60 * 60;
const QUEUE_TTL_SECONDS = 120;
const ASSIGNMENT_TTL_SECONDS = 24 * 60 * 60;
const QUEUE_STALE_MS = 90_000;
const PRESENCE_MS = 45_000;
const ROUND_SCORE_PAUSE_MS = 10_000;
const ROOM_EVENT_CHANNEL = 'brasta:room-events';
const QUEUE_KEY = 'brasta:ranked:queue:1v1';
const QUEUE_LOCK_KEY = 'brasta:ranked:queue:1v1:lock';

export type RankedAssignment = {
  roomCode: string;
  matchId: string;
  seat: 1 | 2;
  token: string;
  name: string;
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
};

type RankedParticipant = {
  seat: 1 | 2;
  name: string;
  token: string;
  connectionId: string;
  lastSeen: number;
  authUserId: string;
  rankName: string;
};

type RankedRoom = {
  code: string;
  mode: '1v1';
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
    matchId: string;
    playerIds: { A: string; B: string };
    finalized: boolean;
    finalizing: boolean;
    result: RankedFinalizeResult | null;
    roundEndedAt?: number;
    turnStartedAt?: number;
    turnSeat?: Brasta.Seat;
  };
};

const roomKey = (code: string) => `brasta:room:${code}`;
const roomLockKey = (code: string) => `brasta:lock:${code}`;
const queueDataKey = (userId: string) => `brasta:ranked:queue:data:${userId}`;
const assignmentKey = (userId: string) => `brasta:ranked:assignment:${userId}`;
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

async function readAssignment(userId: string): Promise<RankedAssignment | null> {
  const r = await requireRedis();
  const raw = await r.get(assignmentKey(userId));
  if (!raw) return null;
  try { return JSON.parse(raw) as RankedAssignment; } catch { return null; }
}

async function writeAssignment(userId: string, assignment: RankedAssignment): Promise<void> {
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

function searchWindow(waitMs: number): number {
  return Math.min(18, 3 + Math.floor(Math.max(0, waitMs) / 10_000) * 2);
}

async function cleanAndLoadCandidates(excludeUserId: string): Promise<QueueEntry[]> {
  const r = await requireRedis();
  const now = Date.now();
  const ids = await r.zrange(QUEUE_KEY, 0, -1);
  const entries: QueueEntry[] = [];
  for (const id of ids) {
    if (id === excludeUserId) continue;
    const entry = await readQueueEntry(id);
    if (!entry || now - entry.lastSeen > QUEUE_STALE_MS) {
      await removeQueueEntry(id);
      continue;
    }
    entries.push(entry);
  }
  return entries;
}

function applyNames(room: RankedRoom): void {
  if (!room.gameState) return;
  for (const player of room.gameState.players) {
    const p = room.seats[String(player.seat)];
    if (p) player.name = p.name;
  }
}

async function createMatch(entry1: QueueEntry, entry2: QueueEntry): Promise<Record<string, RankedAssignment>> {
  const r = await requireRedis();
  const code = await makeRoomCode();
  const matchId = crypto.randomUUID();
  const swap = crypto.randomInt(2) === 1;
  const seat1Entry = swap ? entry2 : entry1;
  const seat2Entry = swap ? entry1 : entry2;
  const seat1Token = makeToken();
  const seat2Token = makeToken();
  const now = Date.now();

  // Mark the room started so ordinary room-leave logic cannot remove ranked seats.
  // gameState remains null until both assigned players have connected.
  const room: RankedRoom = {
    code,
    mode: '1v1',
    targetScore: 110,
    createdAt: now,
    lastActivity: now,
    started: true,
    revision: 0,
    hostToken: `ranked-system-${makeToken()}`,
    seats: {
      '1': { seat: 1, name: seat1Entry.username, token: seat1Token, connectionId: '', lastSeen: 0, authUserId: seat1Entry.userId, rankName: seat1Entry.rankName },
      '2': { seat: 2, name: seat2Entry.username, token: seat2Token, connectionId: '', lastSeen: 0, authUserId: seat2Entry.userId, rankName: seat2Entry.rankName },
    },
    spectators: {},
    gameState: null,
    callableBurn: null,
    ranked: {
      matchId,
      playerIds: { A: seat1Entry.userId, B: seat2Entry.userId },
      finalized: false,
      finalizing: false,
      result: null,
    },
  };

  const saved = await r.set(roomKey(code), JSON.stringify(room), 'EX', ROOM_TTL_SECONDS, 'NX');
  if (saved !== 'OK') throw new Error('Could not reserve the ranked room.');
  try {
    await createRankedMatchRecord({
      matchId,
      roomCode: code,
      mode: '1v1',
      targetScore: 110,
      playerA: seat1Entry.userId,
      seatA: 1,
      playerB: seat2Entry.userId,
      seatB: 2,
    });
  } catch (error) {
    await r.del(roomKey(code));
    throw error;
  }

  const assignments: Record<string, RankedAssignment> = {
    [seat1Entry.userId]: {
      roomCode: code, matchId, seat: 1, token: seat1Token, name: seat1Entry.username,
      opponent: seat2Entry.username, rankName: seat1Entry.rankName,
    },
    [seat2Entry.userId]: {
      roomCode: code, matchId, seat: 2, token: seat2Token, name: seat2Entry.username,
      opponent: seat1Entry.username, rankName: seat2Entry.rankName,
    },
  };
  await Promise.all(Object.entries(assignments).map(([userId, assignment]) => writeAssignment(userId, assignment)));
  return assignments;
}

async function tryMatch(entry: QueueEntry): Promise<RankedAssignment | null> {
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
      .sort((a, b) => a.gap - b.gap || a.candidate.joinedAt - b.candidate.joinedAt);
    const best = eligible[0]?.candidate;
    if (!best) return null;

    // Re-check both queue rows while holding the queue lock.
    if (!(await readQueueEntry(best.userId)) || !(await readQueueEntry(current.userId))) return null;
    await removeQueueEntry(current.userId);
    await removeQueueEntry(best.userId);
    try {
      const assignments = await createMatch(current, best);
      return assignments[current.userId] || null;
    } catch (error) {
      current.lastSeen = Date.now();
      best.lastSeen = Date.now();
      await writeQueueEntry(current);
      await writeQueueEntry(best);
      throw error;
    }
  } finally {
    await releaseKeyLock(QUEUE_LOCK_KEY, lock);
  }
}

function queuePayload(status: CompetitiveStatus, entry: QueueEntry | null, assignment: RankedAssignment | null) {
  if (assignment) return { state: 'matched' as const, assignment, competitive: status };
  if (entry) return {
    state: 'queued' as const,
    competitive: status,
    queuedAt: entry.joinedAt,
    waitSeconds: Math.max(0, Math.floor((Date.now() - entry.joinedAt) / 1000)),
    searchRange: searchWindow(Date.now() - entry.joinedAt),
  };
  return { state: 'idle' as const, competitive: status };
}

export async function rankedQueueAction(request: Request, action: 'status' | 'join' | 'leave') {
  if (!competitiveBackendReady()) {
    return { state: 'unavailable' as const, message: 'Ranked play needs its backend secret configured.' };
  }
  const { identity, accessToken } = await authFromRequest(request);
  if (action === 'join' && await getActiveMatch(identity.userId)) {
    throw new Error('Finish or leave your active private match before joining ranked.');
  }
  const status = await getCompetitiveStatus(accessToken, '1v1');
  const assignment = await readAssignment(identity.userId);
  if (assignment) return queuePayload(status, null, assignment);

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
    return room.ranked?.matchId ? room : null;
  } catch { return null; }
}

export async function getRanked1v1ActiveAssignment(userId: string): Promise<RankedAssignment | null> {
  if (!userId || !redis) return null;
  const assignment = await readAssignment(userId);
  if (!assignment) return null;
  const room = await loadRankedRoom(assignment.roomCode);
  if (!room || room.ranked.finalized || room.gameState?.phase === 'matchEnd') {
    await redis.del(assignmentKey(userId));
    return null;
  }
  const participant = Object.values(room.seats).find((p) => p.authUserId === userId);
  if (!participant) {
    await redis.del(assignmentKey(userId));
    return null;
  }
  // Keep the assignment token synchronized with the authoritative seat token.
  if (assignment.token !== participant.token) {
    assignment.token = participant.token;
    await writeAssignment(userId, assignment);
  }
  return assignment;
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

function bothPlayersConnected(room: RankedRoom): boolean {
  const now = Date.now();
  return ['1','2'].every((seat) => {
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

export async function monitorRankedRoom(request: Request, roomCode: string) {
  if (!competitiveBackendReady()) throw new Error('Ranked backend is not configured.');
  const { identity } = await authFromRequest(request);
  const code = String(roomCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  if (!code) throw new Error('Ranked room code is required.');

  const lock = await acquireKeyLock(roomLockKey(code), 8000);
  let finalizeArgs: null | {
    matchId: string; playerA: string; playerB: string; winnerTeam: 'A'|'B'; scoreA: number; scoreB: number;
  } = null;
  try {
    const room = await loadRankedRoom(code);
    if (!room) throw new Error('Ranked match was not found.');
    if (!participantForIdentity(room, identity)) throw new Error('This ranked match is not assigned to your account.');

    if (!room.gameState) {
      if (bothPlayersConnected(room)) {
        room.gameState = Brasta.startMatch('1v1', crypto.randomInt(1, 0x7fffffff), 110);
        delete room.ranked.turnStartedAt;
        delete room.ranked.turnSeat;
        applyNames(room);
        room.revision += 1;
        await saveRankedRoom(room);
        return { state: 'playing' as const, phase: room.gameState.phase, started: true };
      }
      return { state: 'waiting' as const, message: 'Waiting for your opponent to connect.' };
    }

    if (room.gameState.phase === 'roundEnd') {
      // lastActivity is also touched by heartbeats/account claims, so it cannot
      // represent when the round actually ended. Persist a dedicated timestamp
      // that remains stable while players are sitting on the score screen.
      if (!room.ranked.roundEndedAt) {
        room.ranked.roundEndedAt = Date.now();
        await saveRankedRoom(room, false);
      }
      const remaining = ROUND_SCORE_PAUSE_MS - (Date.now() - room.ranked.roundEndedAt);
      if (remaining <= 0) {
        const next = Brasta.nextRound(room.gameState);
        if (!next.ok) throw new Error(next.error || 'Could not advance the ranked round.');
        room.gameState = next.state;
        delete room.ranked.roundEndedAt;
        delete room.ranked.turnStartedAt;
        delete room.ranked.turnSeat;
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
        playerA: room.ranked.playerIds.A,
        playerB: room.ranked.playerIds.B,
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
    const result = await finalizeRanked1v1Match({ ...finalizeArgs, events: [] });
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
    await Promise.all([r.del(assignmentKey(finalizeArgs.playerA)), r.del(assignmentKey(finalizeArgs.playerB))]);
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
