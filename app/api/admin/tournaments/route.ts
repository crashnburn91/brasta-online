import { brastaAdminConfigured, isBrastaAdmin } from '../../../../lib/admin-auth';
import { verifyBrastaAccessToken } from '../../../../lib/supabase-auth';
import {
  createTournament,
  listAdminTournaments,
  publishTournamentBracket,
  setTournamentMatchWinner,
  updateTournament,
} from '../../../../lib/tournaments';

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
    if (!token) return json({ error: 'Sign in to manage tournaments.' }, 401);
    const identity = await verifyBrastaAccessToken(token);
    if (!identity?.userId) return json({ error: 'Your Brasta session has expired.' }, 401);
    if (!brastaAdminConfigured()) return json({ error: 'Brasta admin access is not configured.' }, 503);
    if (!isBrastaAdmin(identity)) return json({ error: 'This Brasta account is not authorized to manage tournaments.' }, 403);

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const action = String(body.action || 'list');

    if (action === 'list') return json({ tournaments: await listAdminTournaments() });
    if (action === 'create') {
      const tournamentId = await createTournament({
        title: body.title,
        description: body.description,
        startsAt: body.startsAt,
        registrationOpensAt: body.registrationOpensAt,
        registrationClosesAt: body.registrationClosesAt,
        maxTeams: body.maxTeams,
        createdBy: identity.userId,
      });
      return json({ state: 'created', tournamentId, tournaments: await listAdminTournaments() });
    }
    if (action === 'update') {
      await updateTournament({
        tournamentId: String(body.tournamentId || ''),
        title: body.title,
        description: body.description,
        startsAt: body.startsAt,
        registrationClosesAt: body.registrationClosesAt,
        maxTeams: body.maxTeams,
        status: body.status,
      });
      return json({ state: 'updated', tournaments: await listAdminTournaments() });
    }
    if (action === 'publish') {
      await publishTournamentBracket(String(body.tournamentId || ''));
      return json({ state: 'published', tournaments: await listAdminTournaments() });
    }
    if (action === 'winner') {
      await setTournamentMatchWinner({
        matchId: String(body.matchId || ''),
        winnerTeamId: String(body.winnerTeamId || ''),
        roomCode: body.roomCode,
      });
      return json({ state: 'advanced', tournaments: await listAdminTournaments() });
    }

    return json({ error: 'Unsupported tournament admin action.' }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Tournament admin request failed.';
    console.error('[brasta tournament admin]', error);
    return json({ error: message.replace(/^Could not [^:]+:\s*/i, '') }, /not authorized/i.test(message) ? 403 : 400);
  }
}
