import { NextResponse } from 'next/server';
import { claimPrivateMatchExperience, getExperienceStatus } from '../../../lib/experience';
import { verifyBrastaAccessToken } from '../../../lib/supabase-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function accessTokenFrom(request: Request): string {
  return (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
}

export async function POST(request: Request) {
  try {
    const accessToken = accessTokenFrom(request);
    if (!accessToken) return NextResponse.json({ error: 'Sign in to use player experience.' }, { status: 401 });

    const body = await request.json().catch(() => ({})) as {
      action?: string;
      roomCode?: string;
      playerToken?: string;
    };
    const action = String(body.action || 'status');

    if (action === 'status') {
      return NextResponse.json({ experience: await getExperienceStatus(accessToken) });
    }

    if (action === 'claim-private') {
      const identity = await verifyBrastaAccessToken(accessToken);
      if (!identity?.userId) return NextResponse.json({ error: 'Your Brasta session has expired.' }, { status: 401 });
      const claim = await claimPrivateMatchExperience({
        userId: identity.userId,
        roomCode: body.roomCode || '',
        playerToken: body.playerToken || '',
      });
      const experience = await getExperienceStatus(accessToken);
      return NextResponse.json({ ...claim, experience });
    }

    return NextResponse.json({ error: 'Unsupported experience action.' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Player experience is unavailable.';
    const status = /sign in|session has expired|authentication/i.test(message) ? 401 : /valid player session|completed match|unsupported match/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
