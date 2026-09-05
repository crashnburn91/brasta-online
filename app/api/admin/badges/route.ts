import { brastaAdminConfigured, isBrastaAdmin } from '../../../../lib/admin-auth';
import {
  getAdminBadgeDefinitions,
  searchAdminBadgeProfiles,
  setAdminProfileBadge,
} from '../../../../lib/profile-badges';
import { verifyBrastaAccessToken } from '../../../../lib/supabase-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function tokenFrom(request: Request): string {
  return (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
}

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  try {
    const token = tokenFrom(request);
    if (!token) return json({ error: 'Sign in to use badge administration.' }, 401);
    const identity = await verifyBrastaAccessToken(token);
    if (!identity?.userId) return json({ error: 'Your Brasta session has expired.' }, 401);
    if (!brastaAdminConfigured()) return json({ error: 'Brasta admin access is not configured.' }, 503);
    if (!isBrastaAdmin(identity)) return json({ error: 'This Brasta account is not authorized to manage badges.' }, 403);

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const action = String(body.action || 'definitions');

    if (action === 'definitions') {
      return json({ state: 'ok', badges: await getAdminBadgeDefinitions() });
    }

    if (action === 'search') {
      return json({
        state: 'ok',
        badges: await getAdminBadgeDefinitions(),
        profiles: await searchAdminBadgeProfiles(body.query),
      });
    }

    if (action === 'assign') {
      const playerId = String(body.playerId || '').trim();
      const badgeKey = String(body.badgeKey || '').trim();
      const assign = Boolean(body.assign);
      if (!playerId || !badgeKey) return json({ error: 'Choose a player and badge.' }, 400);
      await setAdminProfileBadge({ playerId, badgeKey, adminId: identity.userId, assign });
      return json({ state: assign ? 'assigned' : 'revoked' });
    }

    return json({ error: 'Unsupported badge administration action.' }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Badge administration request failed.';
    const status = /expired|sign in/i.test(message) ? 401
      : /not authorized/i.test(message) ? 403
      : /not configured/i.test(message) ? 503
      : 400;
    console.error('[brasta badge admin]', error);
    return json({ error: message.replace(/^Could not [^:]+:\s*/i, '') }, status);
  }
}
