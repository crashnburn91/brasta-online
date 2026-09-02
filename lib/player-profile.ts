import { baseRankName, type CompetitiveMode } from './competitive';
import { experienceStatusFromGames, type ExperienceStatus } from './experience';
import { verifyBrastaAccessToken } from './supabase-auth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://fhdrywazfmmvgswkdpdb.supabase.co';
const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

type ProfileRow = {
  id: string;
  username: string | null;
  avatar_url: string | null;
  created_at?: string | null;
};

type RatingRow = {
  mode: CompetitiveMode;
  ordinal: number;
  games_played: number;
  wins: number;
  losses: number;
  current_streak: number;
  best_streak: number;
};

type FriendshipRow = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted';
};

type BlockRow = {
  blocker_id: string;
  blocked_id: string;
};

export type PlayerProfileRelationship =
  | 'self'
  | 'friend'
  | 'incoming'
  | 'outgoing'
  | 'blocked'
  | 'blocked_by_player'
  | 'none';

export type PublicPlayerRank = {
  mode: CompetitiveMode;
  rankName: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  currentStreak: number;
  bestStreak: number;
  placementGames: number;
};

export type PublicPlayerProfile = {
  id: string;
  username: string;
  avatarUrl: string | null;
  memberSince: string | null;
  ranks: Record<CompetitiveMode, PublicPlayerRank>;
  experience: ExperienceStatus;
  relationship: PlayerProfileRelationship;
};

function headers(): Record<string, string> {
  if (!secretKey) throw new Error('Player profiles are not configured.');
  return {
    apikey: secretKey,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

async function rest<T>(path: string, context: string): Promise<T> {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    headers: headers(),
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

function cleanUsername(value: unknown): string {
  return String(value || '').trim().replace(/^@/, '');
}

function blankRank(mode: CompetitiveMode): PublicPlayerRank {
  return {
    mode,
    rankName: 'Unranked',
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    currentStreak: 0,
    bestStreak: 0,
    placementGames: 0,
  };
}

function publicRank(mode: CompetitiveMode, row?: RatingRow): PublicPlayerRank {
  if (!row) return blankRank(mode);
  const gamesPlayed = Math.max(0, Number(row.games_played) || 0);
  return {
    mode,
    rankName: baseRankName(gamesPlayed, Number(row.ordinal) || 0),
    gamesPlayed,
    wins: Math.max(0, Number(row.wins) || 0),
    losses: Math.max(0, Number(row.losses) || 0),
    currentStreak: Math.max(0, Number(row.current_streak) || 0),
    bestStreak: Math.max(0, Number(row.best_streak) || 0),
    placementGames: Math.min(gamesPlayed, 5),
  };
}

async function relationshipFor(viewerId: string | null, targetId: string): Promise<PlayerProfileRelationship> {
  if (!viewerId) return 'none';
  if (viewerId === targetId) return 'self';

  const [friendships, blocks] = await Promise.all([
    rest<FriendshipRow[]>(
      `friendships?or=(and(requester_id.eq.${viewerId},addressee_id.eq.${targetId}),and(requester_id.eq.${targetId},addressee_id.eq.${viewerId}))&select=id,requester_id,addressee_id,status&limit=1`,
      'Could not load friendship status',
    ),
    rest<BlockRow[]>(
      `friend_blocks?or=(and(blocker_id.eq.${viewerId},blocked_id.eq.${targetId}),and(blocker_id.eq.${targetId},blocked_id.eq.${viewerId}))&select=blocker_id,blocked_id&limit=2`,
      'Could not load block status',
    ),
  ]);

  if (blocks.some((row) => row.blocker_id === viewerId && row.blocked_id === targetId)) return 'blocked';
  if (blocks.some((row) => row.blocker_id === targetId && row.blocked_id === viewerId)) return 'blocked_by_player';

  const friendship = friendships[0];
  if (!friendship) return 'none';
  if (friendship.status === 'accepted') return 'friend';
  return friendship.requester_id === viewerId ? 'outgoing' : 'incoming';
}

export async function getPublicPlayerProfile(usernameValue: unknown, accessToken = ''): Promise<PublicPlayerProfile | null> {
  const username = cleanUsername(usernameValue);
  if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) return null;

  const profiles = await rest<ProfileRow[]>(
    `profiles?username=ilike.${encodeURIComponent(username)}&select=id,username,avatar_url,created_at&limit=1`,
    'Could not load player profile',
  );
  const profile = profiles[0];
  if (!profile?.id || !profile.username) return null;

  const [ratings, experienceRows, viewer] = await Promise.all([
    rest<RatingRow[]>(
      `player_ratings?player_id=eq.${profile.id}&select=mode,ordinal,games_played,wins,losses,current_streak,best_streak`,
      'Could not load player ranks',
    ),
    rest<Array<{ games_played: number }>>(
      `player_experience?player_id=eq.${profile.id}&select=games_played&limit=1`,
      'Could not load player experience',
    ).catch(() => []),
    accessToken ? verifyBrastaAccessToken(accessToken) : Promise.resolve(null),
  ]);

  const one = ratings.find((row) => row.mode === '1v1');
  const two = ratings.find((row) => row.mode === '2v2');

  return {
    id: profile.id,
    username: profile.username,
    avatarUrl: profile.avatar_url || null,
    memberSince: profile.created_at || null,
    ranks: {
      '1v1': publicRank('1v1', one),
      '2v2': publicRank('2v2', two),
    },
    experience: experienceStatusFromGames(experienceRows[0]?.games_played || 0),
    relationship: await relationshipFor(viewer?.userId || null, profile.id),
  };
}
