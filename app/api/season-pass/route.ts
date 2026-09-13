import { NextResponse } from 'next/server';
import { getSeasonPassState } from '../../../lib/season-pass';
import { verifyBrastaAccessToken } from '../../../lib/supabase-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function accessTokenFrom(request: Request): string {
  return (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
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

export async function GET(request: Request) {
  try {
    return await stateFor(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Season Pass state is unavailable.';
    console.error('[brasta season pass]', error);
    const status = /sign in|expired|authentication/i.test(message) ? 401
      : /not configured|backend/i.test(message) ? 503
      : 500;
    return json({ error: message.replace(/^Could not load Season Pass[^:]*:\s*/i, '') }, status);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as { action?: string };
    if (body.action && body.action !== 'status') return json({ error: 'Unsupported Season Pass action.' }, 400);
    return await stateFor(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Season Pass state is unavailable.';
    console.error('[brasta season pass]', error);
    const status = /sign in|expired|authentication/i.test(message) ? 401
      : /not configured|backend/i.test(message) ? 503
      : 500;
    return json({ error: message.replace(/^Could not load Season Pass[^:]*:\s*/i, '') }, status);
  }
}
