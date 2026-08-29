import { adminTrafficConfigured, getTrafficSnapshot, isTrafficAdmin } from '../../../../lib/traffic-presence';
import { verifyBrastaAccessToken } from '../../../../lib/supabase-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function bearerToken(request: Request): string {
  return (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
}

export async function POST(request: Request) {
  const token = bearerToken(request);
  if (!token) return Response.json({ error: 'Sign in to view live traffic.' }, { status: 401 });

  const identity = await verifyBrastaAccessToken(token);
  if (!identity?.userId) return Response.json({ error: 'Your Brasta session has expired.' }, { status: 401 });

  if (!adminTrafficConfigured()) {
    return Response.json(
      { error: 'Live traffic admin access is not configured.', code: 'admin_not_configured' },
      { status: 503 },
    );
  }

  if (!isTrafficAdmin(identity)) {
    return Response.json({ error: 'This Brasta account is not authorized for live traffic.' }, { status: 403 });
  }

  const snapshot = await getTrafficSnapshot();
  return Response.json(snapshot, { headers: { 'Cache-Control': 'no-store' } });
}
