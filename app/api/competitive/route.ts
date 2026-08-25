import {
  getCompetitiveStatus,
  getRankedLeaderboard,
  getRecentRankedMatches,
  publicCompetitiveStatus,
  type CompetitiveMode,
} from '../../../lib/competitive';
import {
  monitorRankedRoom,
  rankedQueueAction,
} from '../../../lib/ranked-matchmaking';
import {
  monitorRanked2v2Room,
  ranked2v2QueueAction,
} from '../../../lib/ranked-matchmaking-2v2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function sanitizeQueuePayload(value: any) {
  if (!value || typeof value !== 'object') return value;
  const next = { ...value };
  if (next.competitive && typeof next.competitive === 'object') {
    const { matchmakingOrdinal: _hidden, ...visible } = next.competitive;
    next.competitive = visible;
  }
  return next;
}

function bearerToken(request: Request): string {
  return (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
}

function competitiveMode(value: unknown): CompetitiveMode {
  return value === '2v2' ? '2v2' : '1v1';
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as {
      action?: string;
      roomCode?: string;
      limit?: number;
      mode?: CompetitiveMode;
    };
    const action = String(body.action || '');
    const mode = competitiveMode(body.mode);

    if (action === 'leaderboard') {
      const leaderboard = await getRankedLeaderboard(mode, Number(body.limit) || 50);
      return json({ state: 'ok', mode, leaderboard });
    }

    if (action === 'profile') {
      const token = bearerToken(request);
      if (!token) return json({ error: 'Sign in to view your competitive profile.' }, 401);
      const status = await getCompetitiveStatus(token, mode);
      return json({ state: 'ok', mode, competitive: publicCompetitiveStatus(status) });
    }

    if (action === 'history') {
      const token = bearerToken(request);
      if (!token) return json({ error: 'Sign in to view ranked match history.' }, 401);
      const matches = await getRecentRankedMatches(token, mode, Number(body.limit) || 10);
      return json({ state: 'ok', mode, matches });
    }

    if (action === 'monitor') {
      const result = mode === '2v2'
        ? await monitorRanked2v2Room(request, String(body.roomCode || ''))
        : await monitorRankedRoom(request, String(body.roomCode || ''));
      return json(result);
    }

    if (action === 'status' || action === 'join' || action === 'leave') {
      const result = mode === '2v2'
        ? await ranked2v2QueueAction(request, action)
        : await rankedQueueAction(request, action);
      return json(sanitizeQueuePayload(result));
    }

    return json({ error: 'Unsupported competitive action.' }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Competitive service request failed.';
    const authError = /sign in|authentication required|missing.*token|invalid.*token|session.*expired/i.test(message);
    console.error('[brasta competitive api]', error);
    return json({ error: message }, authError ? 401 : 400);
  }
}
