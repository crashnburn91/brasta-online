import { ordinal as openskillOrdinal, rate, rating } from 'openskill';
import {
  baseRankName,
  competitiveBackendReady,
  type RankedActionEvent,
  type RankedFinalizeResult,
} from './competitive';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://fhdrywazfmmvgswkdpdb.supabase.co';
const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

type RatingRow = {
  player_id: string;
  mu: number;
  sigma: number;
  ordinal: number;
  games_played: number;
  wins: number;
  losses: number;
  current_streak: number;
  best_streak: number;
};

async function parseJsonResponse<T>(response: Response, context: string): Promise<T> {
  const text = await response.text();
  if (!response.ok) {
    let detail = text;
    try {
      const parsed = JSON.parse(text) as { message?: string; error_description?: string; hint?: string };
      detail = parsed.message || parsed.error_description || parsed.hint || text;
    } catch {}
    throw new Error(`${context}: ${detail || `HTTP ${response.status}`}`);
  }
  return text ? JSON.parse(text) as T : undefined as T;
}

function serviceHeaders(): Record<string, string> {
  if (!secretKey) throw new Error('Ranked backend secret is not configured.');
  return {
    apikey: secretKey,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

async function serviceRpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: serviceHeaders(),
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  return parseJsonResponse<T>(response, `Competitive RPC ${name} failed`);
}

async function getRatingRows(playerIds: string[]): Promise<RatingRow[]> {
  const ids = playerIds.map((id) => encodeURIComponent(id)).join(',');
  const response = await fetch(
    `${supabaseUrl}/rest/v1/player_ratings?player_id=in.(${ids})&mode=eq.2v2&select=player_id,mu,sigma,ordinal,games_played,wins,losses,current_streak,best_streak`,
    { headers: serviceHeaders(), cache: 'no-store' },
  );
  return parseJsonResponse<RatingRow[]>(response, 'Could not load ranked 2v2 ratings');
}

export async function createRanked2v2MatchRecord(args: {
  matchId: string;
  roomCode: string;
  targetScore: 110 | 220;
  players: Array<{ playerId: string; seat: 1 | 2 | 3 | 4 }>;
}): Promise<void> {
  await serviceRpc<void>('brasta_create_ranked_2v2_match', {
    p_match_id: args.matchId,
    p_room_code: args.roomCode,
    p_target_score: args.targetScore,
    p_players: args.players,
  });
}

export async function finalizeRanked2v2Match(args: {
  matchId: string;
  teamA: [string, string];
  teamB: [string, string];
  winnerTeam: 'A' | 'B';
  scoreA: number;
  scoreB: number;
  events: RankedActionEvent[];
}): Promise<RankedFinalizeResult> {
  if (!competitiveBackendReady()) throw new Error('Ranked backend is not configured.');

  const playerIds = [...args.teamA, ...args.teamB];
  const rows = await getRatingRows(playerIds);
  const byId = new Map(rows.map((row) => [row.player_id, row]));
  const rowFor = (id: string) => {
    const row = byId.get(id);
    if (!row) throw new Error('One or more ranked 2v2 rating records are missing.');
    return row;
  };

  const aRows = args.teamA.map(rowFor) as [RatingRow, RatingRow];
  const bRows = args.teamB.map(rowFor) as [RatingRow, RatingRow];
  const aRatings = aRows.map((row) => rating({ mu: Number(row.mu), sigma: Number(row.sigma) }));
  const bRatings = bRows.map((row) => rating({ mu: Number(row.mu), sigma: Number(row.sigma) }));
  const rankOrder = args.winnerTeam === 'A' ? [1, 2] : [2, 1];
  const [nextA, nextB] = rate([aRatings, bRatings], { rank: rankOrder });

  const updates = [
    ...aRows.map((row, index) => ({ row, next: nextA[index], won: args.winnerTeam === 'A' })),
    ...bRows.map((row, index) => ({ row, next: nextB[index], won: args.winnerTeam === 'B' })),
  ].map(({ row, next, won }) => ({
    playerId: row.player_id,
    mu: next.mu,
    sigma: next.sigma,
    ordinal: openskillOrdinal(next),
    won,
    before: row,
  }));

  await serviceRpc<void>('brasta_finalize_ranked_2v2_match', {
    p_match_id: args.matchId,
    p_winner_team: args.winnerTeam,
    p_score_a: args.scoreA,
    p_score_b: args.scoreB,
    p_ratings: updates.map(({ playerId, mu, sigma, ordinal }) => ({ playerId, mu, sigma, ordinal })),
    p_events: args.events,
  });

  return {
    winnerTeam: args.winnerTeam,
    players: updates.map(({ playerId, ordinal, won, before }) => ({
      playerId,
      won,
      rankBefore: baseRankName(before.games_played, Number(before.ordinal)),
      rankAfter: baseRankName(before.games_played + 1, ordinal),
      gamesPlayedAfter: before.games_played + 1,
      winsAfter: before.wins + (won ? 1 : 0),
      lossesAfter: before.losses + (won ? 0 : 1),
      placementGamesAfter: Math.min(before.games_played + 1, 5),
    })),
  };
}
