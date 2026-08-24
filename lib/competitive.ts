import { ordinal as openskillOrdinal, rate, rating } from 'openskill';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://fhdrywazfmmvgswkdpdb.supabase.co';
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_0eLE7QNyW1BpWdu40IOMww_H5otqRzy';
const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export type CompetitiveMode = '1v1' | '2v2';

export type CompetitiveStatus = {
  mode: CompetitiveMode;
  matchmakingOrdinal: number;
  rankName: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  currentStreak: number;
  bestStreak: number;
  placementGames: number;
};

export type PublicCompetitiveStatus = Omit<CompetitiveStatus, 'matchmakingOrdinal'>;

export type LeaderboardEntry = {
  leaderboardPosition: number;
  username: string;
  rankName: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  bestStreak: number;
};

export type RecentRankedMatch = {
  matchId: string;
  completedAt: string;
  opponentUsername: string;
  result: 'win' | 'loss';
  scoreFor: number;
  scoreAgainst: number;
  rankBefore: string;
  rankAfter: string;
};

export type RankedActionEvent = {
  seat: number | null;
  type: string;
  payload: Record<string, unknown>;
};

export type RankedFinalizePlayer = {
  playerId: string;
  won: boolean;
  rankBefore: string;
  rankAfter: string;
  gamesPlayedAfter: number;
  winsAfter: number;
  lossesAfter: number;
  placementGamesAfter: number;
};

export type RankedFinalizeResult = {
  winnerTeam: 'A' | 'B';
  players: RankedFinalizePlayer[];
};

type RatingRow = {
  player_id: string;
  mode: CompetitiveMode;
  mu: number;
  sigma: number;
  ordinal: number;
  games_played: number;
  wins: number;
  losses: number;
  current_streak: number;
  best_streak: number;
};

export function competitiveBackendReady(): boolean {
  return Boolean(supabaseUrl && publishableKey && secretKey);
}

export function publicCompetitiveStatus(status: CompetitiveStatus): PublicCompetitiveStatus {
  const { matchmakingOrdinal: _hidden, ...visible } = status;
  return visible;
}

export function baseRankName(gamesPlayed: number, ordinalValue: number): string {
  if (gamesPlayed < 5) return 'Unranked';
  if (ordinalValue < -2) return 'Bronze III';
  if (ordinalValue < 1) return 'Bronze II';
  if (ordinalValue < 4) return 'Bronze I';
  if (ordinalValue < 7) return 'Silver III';
  if (ordinalValue < 10) return 'Silver II';
  if (ordinalValue < 13) return 'Silver I';
  if (ordinalValue < 16) return 'Gold III';
  if (ordinalValue < 19) return 'Gold II';
  if (ordinalValue < 22) return 'Gold I';
  if (ordinalValue < 25) return 'Platinum III';
  if (ordinalValue < 28) return 'Platinum II';
  if (ordinalValue < 31) return 'Platinum I';
  if (ordinalValue < 34) return 'Diamond III';
  if (ordinalValue < 37) return 'Diamond II';
  if (ordinalValue < 40) return 'Diamond I';
  return 'Master';
}

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

export async function getCompetitiveStatus(accessToken: string, mode: CompetitiveMode = '1v1'): Promise<CompetitiveStatus> {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/brasta_competitive_status`, {
    method: 'POST',
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ p_mode: mode }),
    cache: 'no-store',
  });
  const rows = await parseJsonResponse<Array<{
    mode: CompetitiveMode;
    matchmaking_ordinal: number;
    rank_name: string;
    games_played: number;
    wins: number;
    losses: number;
    current_streak: number;
    best_streak: number;
    placement_games: number;
  }>>(response, 'Could not load competitive profile');
  const row = rows[0];
  if (!row) throw new Error('Competitive profile was not returned.');
  return {
    mode: row.mode,
    matchmakingOrdinal: Number(row.matchmaking_ordinal),
    rankName: row.rank_name,
    gamesPlayed: row.games_played,
    wins: row.wins,
    losses: row.losses,
    currentStreak: row.current_streak,
    bestStreak: row.best_streak,
    placementGames: row.placement_games,
  };
}

export async function getRankedLeaderboard(mode: CompetitiveMode = '1v1', limit = 50): Promise<LeaderboardEntry[]> {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/brasta_ranked_leaderboard`, {
    method: 'POST',
    headers: {
      apikey: publishableKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ p_mode: mode, p_limit: limit }),
    cache: 'no-store',
  });
  const rows = await parseJsonResponse<Array<{
    leaderboard_position: number;
    username: string;
    rank_name: string;
    games_played: number;
    wins: number;
    losses: number;
    best_streak: number;
  }>>(response, 'Could not load ranked leaderboard');
  return rows.map((row) => ({
    leaderboardPosition: Number(row.leaderboard_position),
    username: row.username,
    rankName: row.rank_name,
    gamesPlayed: row.games_played,
    wins: row.wins,
    losses: row.losses,
    bestStreak: row.best_streak,
  }));
}

export async function getRecentRankedMatches(accessToken: string, mode: CompetitiveMode = '1v1', limit = 10): Promise<RecentRankedMatch[]> {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/brasta_my_recent_matches`, {
    method: 'POST',
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ p_mode: mode, p_limit: limit }),
    cache: 'no-store',
  });
  const rows = await parseJsonResponse<Array<{
    match_id: string;
    completed_at: string;
    opponent_username: string;
    result: 'win' | 'loss';
    score_for: number;
    score_against: number;
    rank_before: string;
    rank_after: string;
  }>>(response, 'Could not load ranked match history');
  return rows.map((row) => ({
    matchId: row.match_id,
    completedAt: row.completed_at,
    opponentUsername: row.opponent_username,
    result: row.result,
    scoreFor: row.score_for,
    scoreAgainst: row.score_against,
    rankBefore: row.rank_before,
    rankAfter: row.rank_after,
  }));
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

export async function createRankedMatchRecord(args: {
  matchId: string;
  roomCode: string;
  mode: CompetitiveMode;
  targetScore: 110 | 220;
  playerA: string;
  seatA: number;
  playerB: string;
  seatB: number;
}): Promise<void> {
  await serviceRpc<void>('brasta_create_ranked_match', {
    p_match_id: args.matchId,
    p_room_code: args.roomCode,
    p_mode: args.mode,
    p_target_score: args.targetScore,
    p_player_a: args.playerA,
    p_seat_a: args.seatA,
    p_player_b: args.playerB,
    p_seat_b: args.seatB,
  });
}

async function getRatingRows(playerIds: string[], mode: CompetitiveMode): Promise<RatingRow[]> {
  const ids = playerIds.map((id) => encodeURIComponent(id)).join(',');
  const response = await fetch(
    `${supabaseUrl}/rest/v1/player_ratings?player_id=in.(${ids})&mode=eq.${encodeURIComponent(mode)}&select=player_id,mode,mu,sigma,ordinal,games_played,wins,losses,current_streak,best_streak`,
    {
      headers: serviceHeaders(),
      cache: 'no-store',
    },
  );
  return parseJsonResponse<RatingRow[]>(response, 'Could not load ranked ratings');
}

export async function finalizeRanked1v1Match(args: {
  matchId: string;
  playerA: string;
  playerB: string;
  winnerTeam: 'A' | 'B';
  scoreA: number;
  scoreB: number;
  events: RankedActionEvent[];
}): Promise<RankedFinalizeResult> {
  if (!competitiveBackendReady()) throw new Error('Ranked backend is not configured.');

  const rows = await getRatingRows([args.playerA, args.playerB], '1v1');
  const a = rows.find((row) => row.player_id === args.playerA);
  const b = rows.find((row) => row.player_id === args.playerB);
  if (!a || !b) throw new Error('One or both ranked rating records are missing.');

  const aRating = rating({ mu: Number(a.mu), sigma: Number(a.sigma) });
  const bRating = rating({ mu: Number(b.mu), sigma: Number(b.sigma) });
  const rankOrder = args.winnerTeam === 'A' ? [1, 2] : [2, 1];
  const [[nextA], [nextB]] = rate([[aRating], [bRating]], { rank: rankOrder });
  const nextAOrdinal = openskillOrdinal(nextA);
  const nextBOrdinal = openskillOrdinal(nextB);

  await serviceRpc<void>('brasta_finalize_ranked_match', {
    p_match_id: args.matchId,
    p_winner_team: args.winnerTeam,
    p_score_a: args.scoreA,
    p_score_b: args.scoreB,
    p_a_player: args.playerA,
    p_a_mu: nextA.mu,
    p_a_sigma: nextA.sigma,
    p_a_ordinal: nextAOrdinal,
    p_b_player: args.playerB,
    p_b_mu: nextB.mu,
    p_b_sigma: nextB.sigma,
    p_b_ordinal: nextBOrdinal,
    p_events: args.events,
  });

  const aWon = args.winnerTeam === 'A';
  const bWon = !aWon;
  return {
    winnerTeam: args.winnerTeam,
    players: [
      {
        playerId: a.player_id,
        won: aWon,
        rankBefore: baseRankName(a.games_played, Number(a.ordinal)),
        rankAfter: baseRankName(a.games_played + 1, nextAOrdinal),
        gamesPlayedAfter: a.games_played + 1,
        winsAfter: a.wins + (aWon ? 1 : 0),
        lossesAfter: a.losses + (aWon ? 0 : 1),
        placementGamesAfter: Math.min(a.games_played + 1, 5),
      },
      {
        playerId: b.player_id,
        won: bWon,
        rankBefore: baseRankName(b.games_played, Number(b.ordinal)),
        rankAfter: baseRankName(b.games_played + 1, nextBOrdinal),
        gamesPlayedAfter: b.games_played + 1,
        winsAfter: b.wins + (bWon ? 1 : 0),
        lossesAfter: b.losses + (bWon ? 0 : 1),
        placementGamesAfter: Math.min(b.games_played + 1, 5),
      },
    ],
  };
}
