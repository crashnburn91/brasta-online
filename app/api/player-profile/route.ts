import { NextResponse } from 'next/server';
import { getPublicPlayerProfile } from '../../../lib/player-profile';

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
    const body = await request.json().catch(() => ({})) as { username?: string };
    const profile = await getPublicPlayerProfile(body.username, tokenFrom(request));
    if (!profile) return json({ error: 'This player does not have a Brasta profile yet.' }, 404);
    return json({ state: 'ok', profile });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not load player profile.';
    console.error('[brasta player profile api]', error);
    return json({ error: message }, /not configured/i.test(message) ? 503 : 400);
  }
}
