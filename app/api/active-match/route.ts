import { getActiveMatchForAccount } from '../../../lib/brasta-server';
import { getRanked1v1ActiveAssignment } from '../../../lib/ranked-matchmaking';
import { getRanked2v2ActiveAssignment } from '../../../lib/ranked-matchmaking-2v2';
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

  const [ranked1v1, ranked2v2, privateMatch] = await Promise.all([
    getRanked1v1ActiveAssignment(identity.userId),
    getRanked2v2ActiveAssignment(identity.userId),
    getActiveMatchForAccount(identity.userId),
  ]);

  const match = ranked1v1
    ? {
        kind: 'ranked_1v1' as const,
        roomCode: ranked1v1.roomCode,
        mode: '1v1' as const,
        seat: ranked1v1.seat,
        token: ranked1v1.token,
        name: ranked1v1.name,
        opponent: ranked1v1.opponent,
        rankName: ranked1v1.rankName,
        started: true,
      }
    : ranked2v2
      ? {
          kind: 'ranked_2v2' as const,
          roomCode: ranked2v2.roomCode,
          mode: '2v2' as const,
          seat: ranked2v2.seat,
          token: ranked2v2.token,
          name: ranked2v2.name,
          teammate: ranked2v2.teammate,
          opponent: ranked2v2.opponent,
          rankName: ranked2v2.rankName,
          started: true,
        }
      : privateMatch
        ? { kind: 'private' as const, ...privateMatch }
        : null;

  return Response.json({ state: 'ok', match }, { headers: { 'Cache-Control': 'no-store' } });
}
