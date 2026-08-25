import { redis } from './redis';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://fhdrywazfmmvgswkdpdb.supabase.co';
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_0eLE7QNyW1BpWdu40IOMww_H5otqRzy';
const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

type ExperienceBand = {
  level: number;
  title: string;
  minGames: number;
  nextTarget: number | null;
};

export type ExperienceStatus = ExperienceBand & {
  gamesPlayed: number;
  progressPercent: number;
  progressLabel: string;
};

const EXPERIENCE_BANDS: ExperienceBand[] = [
  { level: 1, title: 'Beginner', minGames: 0, nextTarget: 5 },
  { level: 2, title: 'Regular', minGames: 5, nextTarget: 15 },
  { level: 3, title: 'Experienced', minGames: 15, nextTarget: 30 },
  { level: 4, title: 'Veteran', minGames: 30, nextTarget: 60 },
  { level: 5, title: 'Seasoned', minGames: 60, nextTarget: 100 },
  { level: 6, title: 'Expert', minGames: 100, nextTarget: 175 },
  { level: 7, title: 'Elite', minGames: 175, nextTarget: 300 },
  { level: 8, title: 'Legend', minGames: 300, nextTarget: null },
];

function parseJson<T>(response: Response, context: string): Promise<T> {
  return response.text().then((text) => {
    if (!response.ok) {
      let detail = text;
      try {
        const parsed = JSON.parse(text) as { message?: string; hint?: string; error_description?: string };
        detail = parsed.message || parsed.hint || parsed.error_description || text;
      } catch {}
      throw new Error(`${context}: ${detail || `HTTP ${response.status}`}`);
    }
    return (text ? JSON.parse(text) : undefined) as T;
  });
}

export function experienceStatusFromGames(value: number): ExperienceStatus {
  const gamesPlayed = Math.max(0, Math.floor(Number(value) || 0));
  let band = EXPERIENCE_BANDS[0];
  for (const candidate of EXPERIENCE_BANDS) {
    if (gamesPlayed >= candidate.minGames) band = candidate;
    else break;
  }

  if (band.nextTarget == null) {
    return {
      ...band,
      gamesPlayed,
      progressPercent: 100,
      progressLabel: `${gamesPlayed} games`,
    };
  }

  const span = Math.max(1, band.nextTarget - band.minGames);
  const progressPercent = Math.max(0, Math.min(100, ((gamesPlayed - band.minGames) / span) * 100));
  return {
    ...band,
    gamesPlayed,
    progressPercent,
    progressLabel: `${gamesPlayed} / ${band.nextTarget} games`,
  };
}

export async function getExperienceStatus(accessToken: string): Promise<ExperienceStatus> {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/brasta_experience_status`, {
    method: 'POST',
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: '{}',
    cache: 'no-store',
  });
  const rows = await parseJson<Array<{ games_played: number }>>(response, 'Could not load player experience');
  return experienceStatusFromGames(rows[0]?.games_played || 0);
}

function serviceHeaders(): Record<string, string> {
  if (!secretKey) throw new Error('Player experience backend is not configured.');
  return {
    apikey: secretKey,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

type PrivateRoom = {
  code?: string;
  mode?: '1v1' | '2v2';
  createdAt?: number;
  seats?: Record<string, { seat?: number; token?: string }>;
  gameState?: { phase?: string } | null;
  ranked?: unknown;
};

export async function claimPrivateMatchExperience(args: {
  userId: string;
  roomCode: string;
  playerToken: string;
}): Promise<{ credited: boolean; seat: number }> {
  if (!redis) throw new Error('Private match experience requires the production room service.');

  const code = String(args.roomCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  const token = String(args.playerToken || '').trim();
  if (!code || token.length < 20) throw new Error('A valid private match session is required.');

  const raw = await redis.get(`brasta:room:${code}`);
  if (!raw) throw new Error('That completed private match is no longer available.');

  let room: PrivateRoom;
  try { room = JSON.parse(raw) as PrivateRoom; } catch { throw new Error('The private match record could not be read.'); }
  if (room.ranked) throw new Error('Ranked matches are credited automatically.');
  if (room.gameState?.phase !== 'matchEnd') throw new Error('Experience is awarded only after a completed match.');
  if (room.mode !== '1v1' && room.mode !== '2v2') throw new Error('Unsupported match mode.');

  const participant = Object.values(room.seats || {}).find((entry) => entry?.token === token);
  const seat = Number(participant?.seat || 0);
  if (!participant || !Number.isInteger(seat) || seat < 1 || seat > 4) {
    throw new Error('This account does not have a valid player session for that match.');
  }

  const matchKey = `private:${code}:${Number(room.createdAt || 0)}`;
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/brasta_credit_private_experience`, {
    method: 'POST',
    headers: serviceHeaders(),
    body: JSON.stringify({
      p_player_id: args.userId,
      p_match_key: matchKey,
      p_mode: room.mode,
      p_seat: seat,
    }),
    cache: 'no-store',
  });
  const credited = await parseJson<boolean>(response, 'Could not credit private match experience');
  return { credited: Boolean(credited), seat };
}
