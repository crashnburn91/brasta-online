import crypto from 'node:crypto';
import * as Brasta from './game-engine';
import { redis } from './redis';
import { verifyBrastaAccessToken, type BrastaAuthIdentity } from './supabase-auth';
import {
  competitiveBackendReady,
  finalizeRanked1v1Match,
  type CompetitiveMode,
  type RankedActionEvent,
  type RankedFinalizeResult,
} from './competitive';
import { finalizeRanked2v2Match } from './competitive-2v2';

const ROOM_TTL_SECONDS = 24 * 60 * 60;
const ROOM_EVENT_CHANNEL = 'brasta:room-events';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://fhdrywazfmmvgswkdpdb.supabase.co';
const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

type Team = 'A' | 'B';

type RankedParticipant = {
  seat: 1 | 2 | 3 | 4;
  name: string;
  authUserId?: string;
};

type ForfeitInfo = {
  mode: CompetitiveMode;
  winnerTeam: Team;
  loserTeam: Team;
  forfeitedBy: string;
  forfeitedSeat: number;
  scoreA: number;
  scoreB: number;
  at: number;
};

type RankedMeta = {
  mode?: CompetitiveMode;
  matchId: string;
  playerIds: { A: string | [string, string]; B: string | [string, string] };
  finalized: boolean;
  finalizing: boolean;
  result: RankedFinalizeResult | null;
};

type RankedRoom = {
  code: string;
  mode: CompetitiveMode;
  lastActivity: number;
  revision: number;
  seats: Record<string, RankedParticipant>;
  gameState: Brasta.GameState | null;
  ranked: RankedMeta;
};

type ForfeitGameState = Brasta.GameState & { forfeitInfo?: ForfeitInfo };

const roomKey = (code: string) => `brasta:room:${code}`;
const roomLockKey = (code: string) => `brasta:lock:${code}`;
const oneAssignmentKey = (userId: string) => `brasta:ranked:assignment:${userId}`;
const twoAssignmentKey = (userId: string) => `brasta:ranked:assignment:2v2:${userId}`;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function requireRedis(): Promise<NonNullable<typeof redis>> {
  if (!redis) throw new Error('Ranked forfeits require the production Redis service.');
  return redis;
}

async function authFromRequest(request: Request): Promise<BrastaAuthIdentity> {
  const accessToken = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const identity = await verifyBrastaAccessToken(accessToken);
  if (!identity?.userId || !identity.username) throw new Error('Sign in and finish your Brasta profile before forfeiting a ranked match.');
  return identity;
}

async function acquireRoomLock(code: string, ttlMs = 10_000): Promise<string> {
  const r = await requireRedis();
  const token = crypto.randomUUID();
  for (let i = 0; i < 40; i++) {
    const ok = await r.set(roomLockKey(code), token, 'PX', ttlMs, 'NX');
    if (ok === 'OK') return token;
    await sleep(25 + Math.floor(Math.random() * 35));
  }
  throw new Error('Ranked match is busy. Try again.');
}

async function releaseRoomLock(code: string, token: string): Promise<void> {
  const r = await requireRedis();
  await r.eval("if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end", 1, roomLockKey(code), token);
}

async function loadRoom(code: string): Promise<RankedRoom | null> {
  const r = await requireRedis();
  const raw = await r.get(roomKey(code));
  if (!raw) return null;
  try {
    const room = JSON.parse(raw) as RankedRoom;
    return room?.ranked?.matchId ? room : null;
  } catch {
    return null;
  }
}

async function saveRoom(room: RankedRoom, publish = true): Promise<void> {
  const r = await requireRedis();
  room.lastActivity = Date.now();
  await r.set(roomKey(room.code), JSON.stringify(room), 'EX', ROOM_TTL_SECONDS);
  if (publish) await r.publish(ROOM_EVENT_CHANNEL, room.code);
}

function roomMode(room: RankedRoom): CompetitiveMode {
  return room.ranked.mode === '2v2' || room.mode === '2v2' ? '2v2' : '1v1';
}

function teamForSeat(mode: CompetitiveMode, seat: number): Team {
  if (mode === '1v1') return seat === 1 ? 'A' : 'B';
  return seat === 1 || seat === 3 ? 'A' : 'B';
}

function participantForIdentity(room: RankedRoom, identity: BrastaAuthIdentity): RankedParticipant | null {
  return Object.values(room.seats).find((participant) => participant.authUserId === identity.userId) || null;
}

function allPlayerIds(room: RankedRoom, mode: CompetitiveMode): string[] {
  if (mode === '1v1') {
    return [room.ranked.playerIds.A, room.ranked.playerIds.B].filter((value): value is string => typeof value === 'string');
  }
  const a = Array.isArray(room.ranked.playerIds.A) ? room.ranked.playerIds.A : [];
  const b = Array.isArray(room.ranked.playerIds.B) ? room.ranked.playerIds.B : [];
  return [...a, ...b];
}

function personalizedResult(result: RankedFinalizeResult, userId: string) {
  const player = result.players.find((entry) => entry.playerId === userId);
  if (!player) return null;
  return {
    ...player,
    placementComplete: player.gamesPlayedAfter >= 5,
    promoted: player.rankBefore !== 'Unranked' && player.rankAfter !== player.rankBefore,
  };
}

async function markResultReasonForfeit(matchId: string): Promise<void> {
  if (!secretKey) return;
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/ranked_matches?id=eq.${encodeURIComponent(matchId)}`, {
      method: 'PATCH',
      headers: {
        apikey: secretKey,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ result_reason: 'forfeit' }),
      cache: 'no-store',
    });
    if (!response.ok) {
      console.warn('[brasta ranked forfeit] could not mark result_reason=forfeit', response.status, await response.text());
    }
  } catch (error) {
    console.warn('[brasta ranked forfeit] could not mark result reason', error);
  }
}

export async function forfeitRankedMatch(request: Request, roomCode: string, requestedMode: CompetitiveMode) {
  if (!competitiveBackendReady()) throw new Error('Ranked backend is not configured.');
  const identity = await authFromRequest(request);
  const code = String(roomCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  if (!code) throw new Error('Ranked room code is required.');

  const lock = await acquireRoomLock(code);
  let previousGameState: Brasta.GameState | null = null;
  let matchId = '';
  let mode: CompetitiveMode = requestedMode;
  let info: ForfeitInfo | null = null;
  let playerIds: string[] = [];
  let finalizeArgs:
    | { mode: '1v1'; playerA: string; playerB: string; winnerTeam: Team; scoreA: number; scoreB: number; events: RankedActionEvent[] }
    | { mode: '2v2'; teamA: [string, string]; teamB: [string, string]; winnerTeam: Team; scoreA: number; scoreB: number; events: RankedActionEvent[] }
    | null = null;

  try {
    const room = await loadRoom(code);
    if (!room) throw new Error('Ranked match was not found.');
    mode = roomMode(room);
    if (mode !== requestedMode) throw new Error(`This room is a ranked ${mode} match.`);

    const participant = participantForIdentity(room, identity);
    if (!participant) throw new Error('This ranked match is not assigned to your account.');

    if (room.ranked.finalized && room.ranked.result) {
      return { state: 'completed' as const, result: personalizedResult(room.ranked.result, identity.userId) };
    }
    if (room.ranked.finalizing) return { state: 'finalizing' as const };
    if (!room.gameState) throw new Error('The ranked game has not started yet.');
    if (room.gameState.phase === 'matchEnd') throw new Error('This ranked match has already ended.');

    matchId = room.ranked.matchId;
    previousGameState = JSON.parse(JSON.stringify(room.gameState)) as Brasta.GameState;
    const loserTeam = teamForSeat(mode, participant.seat);
    const winnerTeam: Team = loserTeam === 'A' ? 'B' : 'A';
    const scoreA = Number(room.gameState.score.A || 0);
    const scoreB = Number(room.gameState.score.B || 0);
    const now = Date.now();
    info = {
      mode,
      winnerTeam,
      loserTeam,
      forfeitedBy: participant.name || identity.username || `Seat ${participant.seat}`,
      forfeitedSeat: participant.seat,
      scoreA,
      scoreB,
      at: now,
    };

    const state = room.gameState as ForfeitGameState;
    state.phase = 'matchEnd';
    state.message = mode === '2v2'
      ? `Team ${winnerTeam} wins by forfeit. ${info.forfeitedBy} forfeited for Team ${loserTeam}.`
      : `Team ${winnerTeam} wins by forfeit. ${info.forfeitedBy} forfeited the ranked match.`;
    state.event = `FORFEIT! ${info.forfeitedBy} forfeited. Team ${winnerTeam} wins.`;
    state.lastMove = `${info.forfeitedBy} forfeited the ranked match.`;
    state.forfeitInfo = info;
    room.ranked.finalizing = true;
    room.revision += 1;
    await saveRoom(room, true);

    const events: RankedActionEvent[] = [{
      seat: participant.seat,
      type: 'FORFEIT',
      payload: {
        forfeitedBy: info.forfeitedBy,
        loserTeam,
        winnerTeam,
        mode,
        scoreA,
        scoreB,
      },
    }];

    playerIds = allPlayerIds(room, mode);
    if (mode === '1v1') {
      const playerA = room.ranked.playerIds.A;
      const playerB = room.ranked.playerIds.B;
      if (typeof playerA !== 'string' || typeof playerB !== 'string') throw new Error('Ranked 1v1 player assignments are invalid.');
      finalizeArgs = { mode, playerA, playerB, winnerTeam, scoreA, scoreB, events };
    } else {
      const teamA = room.ranked.playerIds.A;
      const teamB = room.ranked.playerIds.B;
      if (!Array.isArray(teamA) || teamA.length !== 2 || !Array.isArray(teamB) || teamB.length !== 2) {
        throw new Error('Ranked 2v2 team assignments are invalid.');
      }
      finalizeArgs = {
        mode,
        teamA: [teamA[0], teamA[1]],
        teamB: [teamB[0], teamB[1]],
        winnerTeam,
        scoreA,
        scoreB,
        events,
      };
    }
  } finally {
    await releaseRoomLock(code, lock);
  }

  if (!finalizeArgs || !info || !matchId) throw new Error('Could not prepare the ranked forfeit.');

  try {
    const result = finalizeArgs.mode === '2v2'
      ? await finalizeRanked2v2Match({
          matchId,
          teamA: finalizeArgs.teamA,
          teamB: finalizeArgs.teamB,
          winnerTeam: finalizeArgs.winnerTeam,
          scoreA: finalizeArgs.scoreA,
          scoreB: finalizeArgs.scoreB,
          events: finalizeArgs.events,
        })
      : await finalizeRanked1v1Match({
          matchId,
          playerA: finalizeArgs.playerA,
          playerB: finalizeArgs.playerB,
          winnerTeam: finalizeArgs.winnerTeam,
          scoreA: finalizeArgs.scoreA,
          scoreB: finalizeArgs.scoreB,
          events: finalizeArgs.events,
        });

    await markResultReasonForfeit(matchId);

    const finishLock = await acquireRoomLock(code);
    try {
      const room = await loadRoom(code);
      if (room && room.ranked.matchId === matchId) {
        room.ranked.finalizing = false;
        room.ranked.finalized = true;
        room.ranked.result = result;
        room.revision += 1;
        await saveRoom(room, true);
      }
    } finally {
      await releaseRoomLock(code, finishLock);
    }

    const r = await requireRedis();
    const keys = playerIds.map((userId) => mode === '2v2' ? twoAssignmentKey(userId) : oneAssignmentKey(userId));
    if (keys.length) await r.del(...keys);

    return {
      state: 'completed' as const,
      result: personalizedResult(result, identity.userId),
      forfeit: info,
    };
  } catch (error) {
    const retryLock = await acquireRoomLock(code);
    try {
      const room = await loadRoom(code);
      if (room && room.ranked.matchId === matchId && !room.ranked.finalized) {
        if (previousGameState) room.gameState = previousGameState;
        room.ranked.finalizing = false;
        room.revision += 1;
        await saveRoom(room, true);
      }
    } finally {
      await releaseRoomLock(code, retryLock);
    }
    throw error;
  }
}
