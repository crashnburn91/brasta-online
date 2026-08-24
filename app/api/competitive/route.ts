import {
  getRankedLeaderboard,
  getRecentRankedMatches,
} from '../../../lib/competitive';
import {
  monitorRankedRoom,
  rankedQueueAction,
} from '../../../lib/ranked-matchmaking';

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

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as {
      action?: string;
      roomCode?: string;
      limit?: number;
    };
    const action = String(body.action || '');

    if (action === 'leaderboard') {
      const leaderboard = await getRankedLeaderboard('1v1', Number(body.limit) || 50);
      return json({ state: 'ok', leaderboard });
    }

    if (action === 'history') {
      const token = bearerToken(request);
      if (!token) return json({ error: 'Sign in to view ranked match history.' }, 401);
      const matches = await getRecentRankedMatches(token, '1v1', Number(body.limit) || 10);
      return json({ state: 'ok', matches });
    }

    if (action === 'monitor') {
      const result = await monitorRankedRoom(request, String(body.roomCode || ''));
      return json(result);
    }

    if (action === 'status' || action === 'join' || action === 'leave') {
      const result = await rankedQueueAction(request, action);
      return json(sanitizeQueuePayload(result));
    }

    return json({ error: 'Unsupported competitive action.' }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Competitive service request failed.';
    const authError = /sign in|authentication|required|profile/i.test(message);
    console.error('[brasta competitive api]', error);
    return json({ error: message }, authError ? 401 : 400);
  }
}
