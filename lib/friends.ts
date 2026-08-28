import { redis } from './redis';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://fhdrywazfmmvgswkdpdb.supabase.co';
const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export type FriendProfile = {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  online?: boolean;
};

export type FriendRelationship = FriendProfile & {
  relationshipId: string;
  createdAt: string;
};

export type FriendsSnapshot = {
  friends: FriendRelationship[];
  incoming: FriendRelationship[];
  outgoing: FriendRelationship[];
  blocked: FriendProfile[];
};

type FriendshipRow = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted';
  created_at: string;
  updated_at: string;
  accepted_at: string | null;
};

type BlockRow = {
  blocker_id: string;
  blocked_id: string;
  created_at: string;
};

type ProfileRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

function configured(): boolean {
  return Boolean(supabaseUrl && secretKey);
}

function headers(extra: Record<string,string> = {}): Record<string,string> {
  if (!secretKey) throw new Error('Friends backend is not configured.');
  return {
    apikey: secretKey,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function parse<T>(response: Response, context: string): Promise<T> {
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

async function rest<T>(path: string, init: RequestInit = {}, context = 'Friends request failed'): Promise<T> {
  if (!configured()) throw new Error('Friends backend is not configured.');
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: headers(init.headers as Record<string,string> || {}),
    cache: 'no-store',
  });
  return parse<T>(response, context);
}

function cleanUsername(value: unknown): string {
  return String(value || '').trim().replace(/^@/, '');
}

function validUsername(value: string): boolean {
  return /^[A-Za-z0-9_]{3,20}$/.test(value);
}

async function profileByUsername(username: string): Promise<ProfileRow | null> {
  const rows = await rest<ProfileRow[]>(
    `profiles?username=ilike.${encodeURIComponent(username)}&select=id,username,display_name,avatar_url&limit=1`,
    {},
    'Could not find that player',
  );
  return rows[0] || null;
}

async function profilesByIds(ids: string[]): Promise<Map<string, ProfileRow>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const rows = await rest<ProfileRow[]>(
    `profiles?id=in.(${unique.join(',')})&select=id,username,display_name,avatar_url`,
    {},
    'Could not load friend profiles',
  );
  return new Map(rows.map((row) => [row.id, row]));
}

function publicProfile(row: ProfileRow, online?: boolean): FriendProfile {
  return {
    id: row.id,
    username: row.username || 'Player',
    displayName: row.display_name || null,
    avatarUrl: row.avatar_url || null,
    ...(online == null ? {} : { online }),
  };
}

async function friendshipRows(userId: string): Promise<FriendshipRow[]> {
  return rest<FriendshipRow[]>(
    `friendships?or=(requester_id.eq.${userId},addressee_id.eq.${userId})&select=id,requester_id,addressee_id,status,created_at,updated_at,accepted_at&order=created_at.desc`,
    {},
    'Could not load friendships',
  );
}

async function blockRows(userId: string): Promise<BlockRow[]> {
  return rest<BlockRow[]>(
    `friend_blocks?or=(blocker_id.eq.${userId},blocked_id.eq.${userId})&select=blocker_id,blocked_id,created_at`,
    {},
    'Could not load blocks',
  );
}

async function exactFriendship(a: string, b: string): Promise<FriendshipRow | null> {
  const one = await rest<FriendshipRow[]>(
    `friendships?requester_id=eq.${a}&addressee_id=eq.${b}&select=id,requester_id,addressee_id,status,created_at,updated_at,accepted_at&limit=1`,
    {},
    'Could not check friendship',
  );
  if (one[0]) return one[0];
  const two = await rest<FriendshipRow[]>(
    `friendships?requester_id=eq.${b}&addressee_id=eq.${a}&select=id,requester_id,addressee_id,status,created_at,updated_at,accepted_at&limit=1`,
    {},
    'Could not check friendship',
  );
  return two[0] || null;
}

async function isBlockedEitherWay(a: string, b: string): Promise<boolean> {
  const rows = await rest<BlockRow[]>(
    `friend_blocks?or=(and(blocker_id.eq.${a},blocked_id.eq.${b}),and(blocker_id.eq.${b},blocked_id.eq.${a}))&select=blocker_id,blocked_id&limit=1`,
    {},
    'Could not check block status',
  );
  return rows.length > 0;
}

async function touchPresence(userId: string): Promise<void> {
  if (!redis) return;
  try { await redis.set(`brasta:presence:${userId}`, '1', 'EX', 90); } catch {}
}

async function onlineMap(ids: string[]): Promise<Map<string, boolean>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!redis || !unique.length) return new Map(unique.map((id) => [id, false]));
  try {
    const values = await redis.mget(unique.map((id) => `brasta:presence:${id}`));
    return new Map(unique.map((id, index) => [id, Boolean(values[index])]));
  } catch {
    return new Map(unique.map((id) => [id, false]));
  }
}

export async function friendRateLimit(userId: string, bucket = 'write', limit = 30): Promise<void> {
  if (!redis) return;
  const minute = Math.floor(Date.now() / 60000);
  const key = `brasta:friends:rate:${bucket}:${userId}:${minute}`;
  try {
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 75);
    if (count > limit) throw new Error('Too many friend actions. Try again in a minute.');
  } catch (error) {
    if (error instanceof Error && /Too many friend actions/.test(error.message)) throw error;
  }
}

export async function presenceHeartbeat(userId: string): Promise<void> {
  await touchPresence(userId);
}

export async function getFriendsSnapshot(userId: string): Promise<FriendsSnapshot> {
  await touchPresence(userId);
  const [relationships, blocks] = await Promise.all([friendshipRows(userId), blockRows(userId)]);
  const otherIds = relationships.map((row) => row.requester_id === userId ? row.addressee_id : row.requester_id);
  const blockedIds = blocks.filter((row) => row.blocker_id === userId).map((row) => row.blocked_id);
  const profiles = await profilesByIds([...otherIds, ...blockedIds]);
  const acceptedIds = relationships.filter((row) => row.status === 'accepted')
    .map((row) => row.requester_id === userId ? row.addressee_id : row.requester_id);
  const online = await onlineMap(acceptedIds);

  const friends: FriendRelationship[] = [];
  const incoming: FriendRelationship[] = [];
  const outgoing: FriendRelationship[] = [];

  for (const row of relationships) {
    const otherId = row.requester_id === userId ? row.addressee_id : row.requester_id;
    const profile = profiles.get(otherId);
    if (!profile) continue;
    const item: FriendRelationship = {
      ...publicProfile(profile, row.status === 'accepted' ? Boolean(online.get(otherId)) : undefined),
      relationshipId: row.id,
      createdAt: row.created_at,
    };
    if (row.status === 'accepted') friends.push(item);
    else if (row.addressee_id === userId) incoming.push(item);
    else outgoing.push(item);
  }

  friends.sort((a,b) => Number(Boolean(b.online)) - Number(Boolean(a.online)) || a.username.localeCompare(b.username));
  incoming.sort((a,b) => a.username.localeCompare(b.username));
  outgoing.sort((a,b) => a.username.localeCompare(b.username));

  return {
    friends,
    incoming,
    outgoing,
    blocked: blockedIds.map((id) => profiles.get(id)).filter((row): row is ProfileRow => Boolean(row)).map((row) => publicProfile(row)),
  };
}

export async function sendFriendRequest(userId: string, usernameValue: unknown): Promise<{ accepted: boolean; target: FriendProfile }> {
  const username = cleanUsername(usernameValue);
  if (!validUsername(username)) throw new Error('Enter a valid Brasta username.');
  const target = await profileByUsername(username);
  if (!target?.id || !target.username) throw new Error('No Brasta player has that username.');
  if (target.id === userId) throw new Error('You cannot add yourself.');
  if (await isBlockedEitherWay(userId, target.id)) throw new Error('A friend request cannot be sent to this player.');

  const existing = await exactFriendship(userId, target.id);
  if (existing?.status === 'accepted') throw new Error('You are already friends.');
  if (existing?.status === 'pending') {
    if (existing.requester_id === userId) throw new Error('Friend request already sent.');
    const rows = await rest<FriendshipRow[]>(
      `friendships?id=eq.${existing.id}&addressee_id=eq.${userId}&status=eq.pending`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ status: 'accepted', accepted_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
      },
      'Could not accept the existing friend request',
    );
    if (!rows.length) throw new Error('That friend request is no longer available.');
    return { accepted: true, target: publicProfile(target) };
  }

  await rest<FriendshipRow[]>(
    'friendships',
    {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ requester_id: userId, addressee_id: target.id, status: 'pending' }),
    },
    'Could not send friend request',
  );
  return { accepted: false, target: publicProfile(target) };
}

export async function acceptFriendRequest(userId: string, relationshipId: string): Promise<void> {
  const rows = await rest<FriendshipRow[]>(
    `friendships?id=eq.${encodeURIComponent(relationshipId)}&addressee_id=eq.${userId}&status=eq.pending`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ status: 'accepted', accepted_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
    },
    'Could not accept friend request',
  );
  if (!rows.length) throw new Error('That friend request is no longer available.');
}

export async function deleteFriendship(userId: string, relationshipId: string, pendingDirection?: 'incoming' | 'outgoing'): Promise<void> {
  const rows = await friendshipRows(userId);
  const row = rows.find((item) => item.id === relationshipId);
  if (!row) return;
  if (pendingDirection === 'incoming' && !(row.status === 'pending' && row.addressee_id === userId)) throw new Error('That request cannot be declined.');
  if (pendingDirection === 'outgoing' && !(row.status === 'pending' && row.requester_id === userId)) throw new Error('That request cannot be canceled.');
  await rest<void>(
    `friendships?id=eq.${encodeURIComponent(relationshipId)}&or=(requester_id.eq.${userId},addressee_id.eq.${userId})`,
    { method: 'DELETE' },
    'Could not update friendship',
  );
}

export async function blockFriend(userId: string, targetId: string): Promise<void> {
  if (!targetId || targetId === userId) throw new Error('That player cannot be blocked.');
  await Promise.all([
    rest<void>(`friendships?requester_id=eq.${userId}&addressee_id=eq.${targetId}`, { method: 'DELETE' }, 'Could not remove friendship'),
    rest<void>(`friendships?requester_id=eq.${targetId}&addressee_id=eq.${userId}`, { method: 'DELETE' }, 'Could not remove friendship'),
  ]);
  await rest<void>(
    'friend_blocks?on_conflict=blocker_id,blocked_id',
    {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ blocker_id: userId, blocked_id: targetId }),
    },
    'Could not block player',
  );
}

export async function unblockFriend(userId: string, targetId: string): Promise<void> {
  await rest<void>(
    `friend_blocks?blocker_id=eq.${userId}&blocked_id=eq.${targetId}`,
    { method: 'DELETE' },
    'Could not unblock player',
  );
}
