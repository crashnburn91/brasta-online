const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://fhdrywazfmmvgswkdpdb.supabase.co';
const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export type ProfileBadgeAwardType = 'achievement' | 'admin';
export type ProfileBadgeSource = 'achievement' | 'admin';

export type ProfileBadgeDefinition = {
  key: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  awardType: ProfileBadgeAwardType;
  achievementKey: string | null;
  tier: string;
  sortOrder: number;
};

export type ProfileBadgeItem = ProfileBadgeDefinition & {
  unlocked: boolean;
  equipped: boolean;
  source: ProfileBadgeSource | null;
  awardedAt: string | null;
};

export type ProfileBadgeCollection = {
  equipped: ProfileBadgeItem | null;
  items: ProfileBadgeItem[];
};

export type AdminBadgeProfile = {
  id: string;
  username: string;
  avatarUrl: string | null;
  badges: Record<string, boolean>;
};

type DefinitionRow = {
  badge_key: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  award_type: ProfileBadgeAwardType;
  achievement_key: string | null;
  tier: string;
  sort_order: number;
};

type OwnedRow = {
  player_id?: string;
  badge_key: string;
  source: ProfileBadgeSource;
  awarded_at: string;
};

type EquipmentRow = { badge_key: string | null };
type ProfileRow = { id: string; username: string | null; avatar_url?: string | null };

function headers(): Record<string, string> {
  if (!secretKey) throw new Error('Profile badges are not configured.');
  return {
    apikey: secretKey,
    Authorization: `Bearer ${secretKey}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

async function rest<T>(path: string, context: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: { ...headers(), ...(init.headers || {}) },
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
  return rest<T>(`rpc/${name}`, context, { method: 'POST', body: JSON.stringify(body) });
}

function cleanUsername(value: unknown): string {
  return String(value || '').trim().replace(/^@/, '');
}

function definition(row: DefinitionRow): ProfileBadgeDefinition {
  return {
    key: row.badge_key,
    name: row.name,
    description: row.description,
    icon: row.icon,
    category: row.category,
    awardType: row.award_type,
    achievementKey: row.achievement_key || null,
    tier: row.tier || 'standard',
    sortOrder: Math.max(0, Number(row.sort_order) || 0),
  };
}

async function definitions(awardType?: ProfileBadgeAwardType): Promise<ProfileBadgeDefinition[]> {
  const filter = awardType ? `&award_type=eq.${awardType}` : '';
  const rows = await rest<DefinitionRow[]>(
    `profile_badge_definitions?visible=eq.true${filter}&select=badge_key,name,description,icon,category,award_type,achievement_key,tier,sort_order&order=sort_order.asc,name.asc`,
    'Could not load badge definitions',
  );
  return rows.map(definition);
}

export function blankProfileBadgeCollection(): ProfileBadgeCollection {
  return { equipped: null, items: [] };
}

export async function getProfileIdByUsername(usernameValue: unknown): Promise<ProfileRow | null> {
  const username = cleanUsername(usernameValue);
  if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) return null;
  const rows = await rest<ProfileRow[]>(
    `profiles?username=ilike.${encodeURIComponent(username)}&select=id,username,avatar_url&limit=1`,
    'Could not find player profile',
  );
  const row = rows[0];
  return row?.id && row.username ? row : null;
}

export async function getProfileBadgeCollection(playerId: string): Promise<ProfileBadgeCollection> {
  if (!playerId) return blankProfileBadgeCollection();
  const [defs, ownedRows, equipmentRows] = await Promise.all([
    definitions(),
    rest<OwnedRow[]>(
      `player_profile_badges?player_id=eq.${encodeURIComponent(playerId)}&select=badge_key,source,awarded_at`,
      'Could not load player badges',
    ),
    rest<EquipmentRow[]>(
      `player_profile_badge_equipment?player_id=eq.${encodeURIComponent(playerId)}&select=badge_key&limit=1`,
      'Could not load equipped badge',
    ),
  ]);

  const owned = new Map(ownedRows.map((row) => [row.badge_key, row]));
  const equippedKey = equipmentRows[0]?.badge_key || null;
  const items = defs.map((item): ProfileBadgeItem => {
    const row = owned.get(item.key);
    const unlocked = Boolean(row);
    return {
      ...item,
      unlocked,
      equipped: unlocked && equippedKey === item.key,
      source: row?.source || null,
      awardedAt: row?.awarded_at || null,
    };
  });

  return {
    items,
    equipped: items.find((item) => item.equipped) || null,
  };
}

export async function getProfileBadgeCollectionByUsername(usernameValue: unknown): Promise<{ playerId: string; username: string; badges: ProfileBadgeCollection } | null> {
  const profile = await getProfileIdByUsername(usernameValue);
  if (!profile?.id || !profile.username) return null;
  return {
    playerId: profile.id,
    username: profile.username,
    badges: await getProfileBadgeCollection(profile.id),
  };
}

export async function getEquippedProfileBadgeByUsername(usernameValue: unknown): Promise<ProfileBadgeItem | null> {
  const value = await getProfileBadgeCollectionByUsername(usernameValue);
  return value?.badges.equipped || null;
}

export async function equipProfileBadge(playerId: string, badgeKey: unknown): Promise<ProfileBadgeCollection> {
  const normalized = String(badgeKey || '').trim() || null;
  await rpc<string | null>('brasta_equip_profile_badge', {
    p_player_id: playerId,
    p_badge_key: normalized,
  }, 'Could not equip profile badge');
  return getProfileBadgeCollection(playerId);
}

export async function getAdminBadgeDefinitions(): Promise<ProfileBadgeDefinition[]> {
  return definitions('admin');
}

export async function searchAdminBadgeProfiles(queryValue: unknown): Promise<AdminBadgeProfile[]> {
  const query = cleanUsername(queryValue).replace(/[^A-Za-z0-9_]/g, '').slice(0, 20);
  if (query.length < 2) return [];
  const profiles = await rest<ProfileRow[]>(
    `profiles?username=ilike.*${encodeURIComponent(query)}*&select=id,username,avatar_url&order=username.asc&limit=20`,
    'Could not search player profiles',
  );
  const valid = profiles.filter((profile) => profile.id && profile.username);
  if (!valid.length) return [];

  const ids = valid.map((profile) => profile.id).join(',');
  const owned = await rest<Array<{ player_id: string; badge_key: string }>>(
    `player_profile_badges?player_id=in.(${ids})&source=eq.admin&select=player_id,badge_key`,
    'Could not load assigned admin badges',
  );
  const byPlayer = new Map<string, Set<string>>();
  owned.forEach((row) => {
    if (!byPlayer.has(row.player_id)) byPlayer.set(row.player_id, new Set());
    byPlayer.get(row.player_id)?.add(row.badge_key);
  });

  return valid.map((profile) => ({
    id: profile.id,
    username: profile.username || '',
    avatarUrl: profile.avatar_url || null,
    badges: Object.fromEntries([...(byPlayer.get(profile.id) || new Set<string>())].map((key) => [key, true])),
  }));
}

export async function setAdminProfileBadge(input: {
  playerId: string;
  badgeKey: string;
  adminId: string;
  assign: boolean;
}): Promise<void> {
  await rpc<void>('brasta_admin_set_profile_badge', {
    p_player_id: input.playerId,
    p_badge_key: input.badgeKey,
    p_admin_id: input.adminId,
    p_assign: input.assign,
  }, input.assign ? 'Could not assign profile badge' : 'Could not revoke profile badge');
}
