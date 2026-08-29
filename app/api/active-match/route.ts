import { getActiveMatchForAccount } from '../../../lib/brasta-server';
import { verifyBrastaAccessToken } from '../../../lib/supabase-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function bearerToken(request: Request): string {
  return (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
}

export async function POST(request: Request) {
  const token = bearerToken(request);
  if (!token) return Response.json({ error: 'Sign in to check for an active match.' }, { status: 401 });

  const identity = await verifyBrastaAccessToken(token);
  if (!identity?.userId) return Response.json({ error: 'Your Brasta session has expired.' }, { status: 401 });

  const match = await getActiveMatchForAccount(identity.userId);
  return Response.json({ state: 'ok', match }, { headers: { 'Cache-Control': 'no-store' } });
}
