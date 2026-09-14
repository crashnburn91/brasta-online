import { NextResponse } from 'next/server';
import { equipSeasonPassReward, getSeasonPassState, type SeasonPassSlot } from '../../../lib/season-pass';
import { verifyBrastaAccessToken } from '../../../lib/supabase-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function accessTokenFrom(request: Request): string {
  return /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') || '')?.[1] || '';
}

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

async function stateFor(request: Request) {
  const token = accessTokenFrom(request);
  if (!token) return json({ error: 'Sign in to view your Season Pass.' }, 401);

  const identity = await verifyBrastaAccessToken(token);
  if (!identity?.userId) return json({ error: 'Your Brasta session has expired.' }, 401);

  return json({ state: await getSeasonPassState(identity.userId) });
}

async function equipFor(request: Request, body: Record<string, unknown>) {
  const token = accessTokenFrom(request);
  if (!token) return json({ error: 'Sign in to equip Season Pass rewards.' }, 401);

  const identity = await verifyBrastaAccessToken(token);
  if (!identity?.userId) return json({ error: 'Your Brasta session has expired.' }, 401);

  const slot = body.slot as SeasonPassSlot;
  const rewardId = body.rewardId == null || body.rewardId === '' ? null : body.rewardId;
  const seasonId = body.seasonId ?? 'season_1';
  if (!['card_back', 'table_felt', 'avatar_frame', 'profile_title'].includes(slot)) {
    return json({ error: 'Choose a valid Season Pass equipment slot.' }, 400);
  }
  if (rewardId !== null && (typeof rewardId !== 'string' || !/^[a-z0-9_:-]{1,80}$/i.test(rewardId))) {
    return json({ error: 'Choose a valid Season Pass reward.' }, 400);
  }
  if (typeof seasonId !== 'string' || !/^[a-z0-9_:-]{1,80}$/i.test(seasonId)) {
    return json({ error: 'Choose a valid season.' }, 400);
  }

  return json({
    state: await equipSeasonPassReward({
      playerId: identity.userId,
      slot,
      rewardId,
      seasonId,
    }),
  });
}

function failure(error: unknown) {
    const message = error instanceof Error ? error.message : 'Season Pass state is unavailable.';
    console.error('[brasta season pass]', error);
    const status = /sign in|expired|authentication/i.test(message) ? 401
      : /not unlocked|does not fit|reward not found|season not found/i.test(message) ? 403
      : /not configured|backend/i.test(message) ? 503
      : 500;
    return json({ error: status === 401 ? 'Your Brasta session has expired. Please sign in again.'
      : status === 403 ? 'That reward is unavailable for this account or equipment slot.'
      : 'Your Season Pass could not be loaded. Please try again.' }, status);
}

export async function GET(request: Request) {
  try {
    return await stateFor(request);
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Send a valid Season Pass request.' }, 400);
    const action = body.action ?? 'status';
    if (action === 'equip') return await equipFor(request, body);
    if (action !== 'status') return json({ error: 'Unsupported Season Pass action.' }, 400);
    return await stateFor(request);
  } catch (error) {
    return failure(error);
  }
}
