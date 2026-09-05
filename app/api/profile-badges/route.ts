import { NextResponse } from 'next/server';
import {
  equipProfileBadge,
  getEquippedProfileBadgeByUsername,
  getProfileBadgeCollectionByUsername,
} from '../../../lib/profile-badges';
import { verifyBrastaAccessToken } from '../../../lib/supabase-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function tokenFrom(request: Request): string {
  return (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
}

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const action = String(body.action || 'collection');

    if (action === 'equipped') {
      return json({ state: 'ok', equipped: await getEquippedProfileBadgeByUsername(body.username) });
    }

    if (action === 'collection') {
      const value = await getProfileBadgeCollectionByUsername(body.username);
      if (!value) return json({ error: 'This player does not have a Brasta profile yet.' }, 404);
      const viewer = tokenFrom(request) ? await verifyBrastaAccessToken(tokenFrom(request)) : null;
      return json({
        state: 'ok',
        username: value.username,
        isSelf: Boolean(viewer?.userId && viewer.userId === value.playerId),
        badges: value.badges,
      });
    }

    if (action === 'equip') {
      const token = tokenFrom(request);
      if (!token) return json({ error: 'Sign in to choose a profile badge.' }, 401);
      const identity = await verifyBrastaAccessToken(token);
      if (!identity?.userId) return json({ error: 'Your Brasta session has expired.' }, 401);
      const badges = await equipProfileBadge(identity.userId, body.badgeKey);
      return json({ state: 'equipped', badges });
    }

    return json({ error: 'Unsupported badge action.' }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Profile badge request failed.';
    console.error('[brasta profile badges]', error);
    const status = /expired|sign in/i.test(message) ? 401
      : /not configured/i.test(message) ? 503
      : /not unlocked|have not unlocked/i.test(message) ? 403
      : 400;
    return json({ error: message.replace(/^Could not [^:]+:\s*/i, '') }, status);
  }
}
