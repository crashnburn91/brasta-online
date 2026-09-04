const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://fhdrywazfmmvgswkdpdb.supabase.co';
const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export type MatchHistoryType = 'ranked' | 'private' | 'bot';
export type MatchHistoryResult = 'win' | 'loss' | 'draw';

export type MatchHistoryPlayerStats = {
  brastas: number;
  currentBrastaStreak: number;
  bestBrastaStreak: number;
  bigTenCaptures: number;
  bigTwoCaptures: number;
  jackSweeps: number;
  jackBurns: number;
  burnCalls: number;
  buildsMade: number;
  lastPickups: number;
  cardsCaptured: number;
};

export type MatchHistoryPlayerInput = MatchHistoryPlayerStats & {
  playerId: string | null;
  seat: number;
  team: 'A' | 'B';
  username: string;
  result: MatchHistoryResult;
};

export type MatchHistoryEventInput = {
  seq: number;
  round: number;
  seat: number | null;
  playerId: string | null;
  eventType: string;
  points: number;
  payload?: Record<string, unknown>;
};

export type RecordCompletedMatchInput = {
  matchKey: string;
  rankedMatchId: string | null;
  roomCode: string;
  mode: '1v1' | '2v2';
  matchType: MatchHistoryType;
  targetScore: 110 | 220;
  winnerTeam: 'A' | 'B' | null;
  scoreA: number;
  scoreB: number;
  roundsPlayed: number;
  startedAt: string;
  completedAt: string;
  completionReason: string;
  players: MatchHistoryPlayerInput[];
  events: MatchHistoryEventInput[];
};

export type PlayerGameStats = MatchHistoryPlayerStats & {
  matchesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  currentWinStreak: number;
  bestWinStreak: number;
  trackedSince: string | null;
};

export type PlayerRecentMatch = {
  matchId: string;
  matchType: MatchHistoryType;
  mode: '1v1' | '2v2';
  completedAt: string;
  durationSeconds: number;
  roundsPlayed: number;
  scoreA: number;
  scoreB: number;
  team: 'A' | 'B';
  result: MatchHistoryResult;
  rankBefore: string | null;
  rankAfter: string | null;
  brastas: number;
  bestBrastaStreak: number;
  bigTenCaptures: number;
  bigTwoCaptures: number;
  jackSweeps: number;
  burnCalls: number;
  players: Array<{
    seat: number;
    team: 'A' | 'B';
    username: string;
    result: MatchHistoryResult;
    playerId: string | null;
  }>;
  events: Array<{
    seq: number;
    round: number;
    seat: number | null;
    eventType: string;
    points: number;
    payload: Record<string, unknown>;
  }>;
};

export type PlayerAchievement = {
  key: string;
  name: string;
  description: string;
  category: string;
  target: number;
  icon: string;
  tier: string;
  hidden: boolean;
  progress: number;
  unlockedAt: string | null;
  completed: boolean;
};

export type PlayerProgression = {
  stats: PlayerGameStats;
  matches: PlayerRecentMatch[];
  achievements: PlayerAchievement[];
};

export const blankPlayerStats = (): PlayerGameStats => ({
  matchesPlayed: 0,
  wins: 0,
  losses: 0,
  winRate: 0,
  currentWinStreak: 0,
  bestWinStreak: 0,
  brastas: 0,
  currentBrastaStreak: 0,
  bestBrastaStreak: 0,
  bigTenCaptures: 0,
  bigTwoCaptures: 0,
  jackSweeps: 0,
  jackBurns: 0,
  burnCalls: 0,
  buildsMade: 0,
  lastPickups: 0,
  cardsCaptured: 0,
  trackedSince: null,
});

export const blankPlayerProgression = (): PlayerProgression => ({
  stats: blankPlayerStats(),
  matches: [],
  achievements: [],
});

function serviceHeaders(): Record<string, string> {
  if (!secretKey) throw new Error('Match history backend secret is not configured.');
  return {
    apikey: secretKey,
    Authorization: `Bearer ${secretKey}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

async function rpc<T>(name: string, body: Record<string, unknown>, context: string): Promise<T> {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: serviceHeaders(),
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const text = await response.text();
  if (!response.ok) {
    let detail = text;
    try {
      const parsed = JSON.parse(text) as { message?: string; hint?: string; details?: string };
      detail = parsed.message || parsed.hint || parsed.details || text;
    } catch {}
    throw new Error(`${context}: ${detail || `HTTP ${response.status}`}`);
  }
  return (text ? JSON.parse(text) : undefined) as T;
}

function dbPlayer(player: MatchHistoryPlayerInput) {
  return {
    player_id: player.playerId || null,
    seat: player.seat,
    team: player.team,
    username: player.username,
    result: player.result,
    brastas: player.brastas,
    best_brasta_streak: player.bestBrastaStreak,
    big_ten_captures: player.bigTenCaptures,
    big_two_captures: player.bigTwoCaptures,
    jack_sweeps: player.jackSweeps,
    jack_burns: player.jackBurns,
    burn_calls: player.burnCalls,
    builds_made: player.buildsMade,
    last_pickups: player.lastPickups,
    cards_captured: player.cardsCaptured,
  };
}

function dbEvent(event: MatchHistoryEventInput) {
  return {
    seq: event.seq,
    round: event.round,
    seat: event.seat,
    player_id: event.playerId || null,
    event_type: event.eventType,
    points: event.points,
    payload: event.payload || {},
  };
}

export async function recordCompletedMatch(input: RecordCompletedMatchInput): Promise<string> {
  return rpc<string>('brasta_record_completed_match', {
    p_match_key: input.matchKey,
    p_ranked_match_id: input.rankedMatchId,
    p_room_code: input.roomCode,
    p_mode: input.mode,
    p_match_type: input.matchType,
    p_target_score: input.targetScore,
    p_winner_team: input.winnerTeam,
    p_score_a: input.scoreA,
    p_score_b: input.scoreB,
    p_rounds_played: input.roundsPlayed,
    p_started_at: input.startedAt,
    p_completed_at: input.completedAt,
    p_completion_reason: input.completionReason,
    p_players: input.players.map(dbPlayer),
    p_events: input.events.map(dbEvent),
  }, 'Could not record completed match');
}

export async function getPlayerProgression(playerId: string, limit = 10): Promise<PlayerProgression> {
  if (!playerId) return blankPlayerProgression();
  const data = await rpc<PlayerProgression>('brasta_player_progression', {
    p_player_id: playerId,
    p_limit: Math.max(1, Math.min(Number(limit) || 10, 25)),
  }, 'Could not load player progression');
  if (!data || typeof data !== 'object') return blankPlayerProgression();
  return {
    stats: { ...blankPlayerStats(), ...(data.stats || {}), currentBrastaStreak: 0 },
    matches: Array.isArray(data.matches) ? data.matches : [],
    achievements: Array.isArray(data.achievements) ? data.achievements : [],
  };
}
