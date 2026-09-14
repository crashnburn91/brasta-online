import { seasonTier, type SeasonReward, type SeasonSetId } from './season-catalog';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://fhdrywazfmmvgswkdpdb.supabase.co';
const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export type SeasonPassSlot = 'card_back' | 'table_felt' | 'avatar_frame' | 'profile_title';

export type SeasonPassSeason = {
  id: string;
  name: string;
  status: 'draft' | 'active' | 'ended';
  startsAt: string | null;
  endsAt: string | null;
  priceCents: number;
  currency: string;
  durationWeeks: number;
  tiers: number;
  xpPerTier: number;
  completionXp: number;
  winXp: number;
  eligibleMatchTypes: string[];
};

export type SeasonPassSet = {
  id: string;
  name: string;
  description: string;
  premium: boolean;
  sortOrder: number;
};

export type SeasonPassProgress = {
  xp: number;
  tier: number;
  tiers: number;
  xpPerTier: number;
  progressPercent: number;
  xpToNextTier: number;
};

export type SeasonPassState = {
  playerId: string;
  season: SeasonPassSeason;
  sets: SeasonPassSet[];
  rewards: SeasonReward[];
  progress: SeasonPassProgress;
  premiumUnlocked: boolean;
  ownedRewardIds: string[];
  equipment: Record<SeasonPassSlot, string | null>;
  titleSource: 'season' | 'earned' | 'none';
};

type SeasonRow = {
  season_id: string;
  name: string;
  status: SeasonPassSeason['status'];
  starts_at: string | null;
  ends_at: string | null;
  price_cents: number;
  currency: string;
  duration_weeks: number;
  tier_count: number;
  xp_per_tier: number;
  completion_xp: number;
  win_xp: number;
  eligible_match_types: string[];
};

type SetRow = {
  set_id: string;
  name: string;
  description: string;
  is_premium: boolean;
  sort_order: number;
};

type RewardRow = {
  reward_id: string;
  set_id: string;
  name: string;
  kind: SeasonReward['kind'];
  tier: number;
  is_premium: boolean;
  motif: string;
  color: string;
  description: string;
  matching_card_back_id: string | null;
  asset_path: string;
};

type ProgressRow = { xp: number };
type EntitlementRow = { entitlement_id: string };
type OwnershipRow = { reward_id: string };
type EquipmentRow = { slot: SeasonPassSlot; reward_id: string | null; title_source: SeasonPassState['titleSource'] | null };

function headers(): Record<string, string> {
  if (!secretKey) throw new Error('Season Pass backend is not configured.');
  return {
    apikey: secretKey,
    Authorization: `Bearer ${secretKey}`,
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

async function rpc<T>(name: string, body: Record<string, unknown>, context: string): Promise<T> {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: headers(),
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

function boundedInt(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : fallback;
}

function season(row: SeasonRow): SeasonPassSeason {
  return {
    id: row.season_id,
    name: row.name,
    status: row.status,
    startsAt: row.starts_at || null,
    endsAt: row.ends_at || null,
    priceCents: boundedInt(row.price_cents),
    currency: String(row.currency || 'USD'),
    durationWeeks: boundedInt(row.duration_weeks),
    tiers: boundedInt(row.tier_count),
    xpPerTier: boundedInt(row.xp_per_tier),
    completionXp: boundedInt(row.completion_xp),
    winXp: boundedInt(row.win_xp),
    eligibleMatchTypes: row.eligible_match_types || [],
  };
}

function reward(row: RewardRow): SeasonReward {
  return {
    id: row.reward_id,
    name: row.name,
    kind: row.kind,
    tier: boundedInt(row.tier),
    setId: row.set_id as SeasonSetId,
    premium: Boolean(row.is_premium),
    motif: row.motif || '',
    color: row.color || '',
    description: row.description || '',
    matchingCardBackId: row.matching_card_back_id as SeasonReward['matchingCardBackId'],
  };
}

function progress(xpValue: unknown, currentSeason: SeasonPassSeason): SeasonPassProgress {
  const xp = Math.min(currentSeason.tiers * currentSeason.xpPerTier, boundedInt(xpValue));
  const tier = Math.min(currentSeason.tiers, Math.floor(xp / Math.max(1, currentSeason.xpPerTier)));
  const nextTierXp = (tier + 1) * currentSeason.xpPerTier;
  const progressPercent = currentSeason.tiers > 0 && currentSeason.xpPerTier > 0
    ? Math.round((xp / (currentSeason.tiers * currentSeason.xpPerTier)) * 100)
    : 0;
  return {
    xp,
    tier,
    tiers: currentSeason.tiers,
    xpPerTier: currentSeason.xpPerTier,
    progressPercent,
    xpToNextTier: tier >= currentSeason.tiers ? 0 : Math.max(0, nextTierXp - xp),
  };
}

export async function getSeasonPassState(playerId: string, seasonId = 'season_1'): Promise<SeasonPassState> {
  if (!playerId) throw new Error('A player account is required.');
  const seasonFilter = encodeURIComponent(seasonId);
  const playerFilter = encodeURIComponent(playerId);

  const [seasonRows, setRows, rewardRows, progressRows, entitlementRows, ownershipRows, equipmentRows] = await Promise.all([
    rest<SeasonRow[]>(
      `season_pass_seasons?season_id=eq.${seasonFilter}&select=season_id,name,status,starts_at,ends_at,price_cents,currency,duration_weeks,tier_count,xp_per_tier,completion_xp,win_xp,eligible_match_types&limit=1`,
      'Could not load Season Pass season',
    ),
    rest<SetRow[]>(
      `season_pass_sets?season_id=eq.${seasonFilter}&select=set_id,name,description,is_premium,sort_order&order=sort_order.asc,set_id.asc`,
      'Could not load Season Pass sets',
    ),
    rest<RewardRow[]>(
      `season_pass_rewards?season_id=eq.${seasonFilter}&select=reward_id,set_id,name,kind,tier,is_premium,motif,color,description,matching_card_back_id,asset_path&order=tier.asc,reward_id.asc`,
      'Could not load Season Pass rewards',
    ),
    rest<ProgressRow[]>(
      `season_pass_progress?player_id=eq.${playerFilter}&season_id=eq.${seasonFilter}&select=xp&limit=1`,
      'Could not load Season Pass progress',
    ),
    rest<EntitlementRow[]>(
      `season_pass_entitlements?player_id=eq.${playerFilter}&season_id=eq.${seasonFilter}&status=eq.active&select=entitlement_id&limit=1`,
      'Could not load Season Pass entitlement',
    ),
    rest<OwnershipRow[]>(
      `season_pass_reward_ownership?player_id=eq.${playerFilter}&season_id=eq.${seasonFilter}&select=reward_id&order=awarded_at.asc,reward_id.asc`,
      'Could not load Season Pass rewards owned',
    ),
    rest<EquipmentRow[]>(
      `season_pass_equipment?player_id=eq.${playerFilter}&select=slot,reward_id,title_source`,
      'Could not load Season Pass equipment',
    ),
  ]);

  const seasonRow = seasonRows[0];
  if (!seasonRow) throw new Error('Season Pass season is not configured.');
  const currentSeason = season(seasonRow);
  const currentProgress = progress(progressRows[0]?.xp, currentSeason);
  // Keep this calculation aligned with the catalog helper for the seeded
  // Season 1 values, while still respecting future server-tuned tier settings.
  if (currentSeason.id === 'season_1' && currentSeason.xpPerTier === 250 && currentSeason.tiers === 12) {
    currentProgress.tier = seasonTier(currentProgress.xp);
  }

  const equipment: Record<SeasonPassSlot, string | null> = {
    card_back: null,
    table_felt: null,
    avatar_frame: null,
    profile_title: null,
  };
  equipmentRows.forEach((row) => {
    if (row.slot in equipment) equipment[row.slot] = row.reward_id || null;
  });

  return {
    playerId,
    season: currentSeason,
    sets: setRows.map((row) => ({
      id: row.set_id,
      name: row.name,
      description: row.description || '',
      premium: Boolean(row.is_premium),
      sortOrder: boundedInt(row.sort_order),
    })),
    rewards: rewardRows.map(reward),
    progress: currentProgress,
    premiumUnlocked: entitlementRows.length > 0,
    ownedRewardIds: [...new Set(ownershipRows.map((row) => row.reward_id).filter(Boolean))],
    equipment,
    titleSource: equipmentRows.find((row) => row.slot === 'profile_title')?.title_source || 'earned',
  };
}

export async function equipSeasonPassReward(options: {
  playerId: string;
  slot: SeasonPassSlot;
  rewardId: string | null;
  seasonId?: string;
}): Promise<SeasonPassState> {
  const seasonId = options.seasonId || 'season_1';
  await rpc(
    'brasta_equip_season_pass_reward',
    {
      p_player_id: options.playerId,
      p_season_id: seasonId,
      p_slot: options.slot,
      p_reward_id: options.rewardId || null,
    },
    'Could not equip Season Pass reward',
  );
  return getSeasonPassState(options.playerId, seasonId);
}
