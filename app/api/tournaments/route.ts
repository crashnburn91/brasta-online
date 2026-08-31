import { NextResponse } from 'next/server';
import { friendRateLimit } from '../../../lib/friends';
import { verifyBrastaAccessToken } from '../../../lib/supabase-auth';
import {
  acceptTournamentInvite,
  getTournamentSnapshot,
  inviteTournamentPartner,
  markTournamentNotificationsRead,
  registerTournamentPlayer,
  removeTournamentTeam,
} from '../../../lib/tournaments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function tokenFrom(request: Request): string {
  return (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
}

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(request: Request) {
  try {
    const token = tokenFrom(request);
    const identity = token ? await verifyBrastaAccessToken(token) : null;
    if (token && !identity) return json({ error: 'Your Brasta session has expired.' }, 401);
    return json(await getTournamentSnapshot(identity?.userId || null));
  } catch (error) {
    console.error('[brasta tournament status]', error);
    return json({ error: error instanceof Error ? error.message : 'Could not load tournament.' }, 503);
  }
}

export async function POST(request: Request) {
  try {
    const token = tokenFrom(request);
    if (!token) return json({ error: 'Sign in to register for a tournament.' }, 401);
    const identity = await verifyBrastaAccessToken(token);
    if (!identity?.userId) return json({ error: 'Your Brasta session has expired.' }, 401);
    await friendRateLimit(identity.userId, 'tournament-write', 30);

    const body = await request.json().catch(() => ({})) as {
      action?: string;
      tournamentId?: string;
      teamId?: string;
      teamName?: string;
      partnerUsername?: string;
      notificationId?: string;
    };
    const action = String(body.action || 'status');

    if (action === 'status') return json(await getTournamentSnapshot(identity.userId));
    if (action === 'register') {
      const tournamentId = String(body.tournamentId || '');
      const snapshot = await getTournamentSnapshot(identity.userId);
      if (!snapshot.tournament || snapshot.tournament.id !== tournamentId) {
        return json({ error: 'Tournament registration is not available.' }, 400);
      }
      if (snapshot.tournament.mode === '1v1') {
        await registerTournamentPlayer({ tournamentId, playerId: identity.userId });
        return json({ state: 'confirmed', ...(await getTournamentSnapshot(identity.userId)) });
      }
      await inviteTournamentPartner({
        tournamentId,
        captainId: identity.userId,
        partnerUsername: body.partnerUsername,
        teamName: body.teamName,
      });
      return json({ state: 'invited', ...(await getTournamentSnapshot(identity.userId)) });
    }
    if (action === 'accept') {
      await acceptTournamentInvite(String(body.teamId || ''), identity.userId);
      return json({ state: 'confirmed', ...(await getTournamentSnapshot(identity.userId)) });
    }
    if (action === 'decline' || action === 'withdraw') {
      await removeTournamentTeam(String(body.teamId || ''), identity.userId);
      return json({ state: action === 'decline' ? 'declined' : 'withdrawn', ...(await getTournamentSnapshot(identity.userId)) });
    }
    if (action === 'mark-read') {
      await markTournamentNotificationsRead(identity.userId, body.notificationId);
      return json({ state: 'read', ...(await getTournamentSnapshot(identity.userId)) });
    }

    return json({ error: 'Unsupported tournament action.' }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Tournament request failed.';
    const status = /session has expired|sign in/i.test(message) ? 401
      : /too many/i.test(message) ? 429
      : /not configured/i.test(message) ? 503
      : 400;
    console.error('[brasta tournament api]', error);
    return json({ error: message.replace(/^Could not [^:]+:\s*/i, '') }, status);
  }
}
