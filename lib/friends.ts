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

export type MatchInvite = FriendProfile & {
  inviteId: string;
  inviteType: 'private' | 'ranked_2v2';
  mode: '1v1' | '2v2' | null;
  roomCode: string | null;
  partyCode: string | null;
  createdAt: string;
  expiresAt: string;
};

export type FriendsSnapshot = {
  friends: FriendRelationship[];
  incoming: FriendRelationship[];
  outgoing: FriendRelationship[];
  blocked: FriendProfile[];
  gameInvitesIncoming: MatchInvite[];
  gameInvitesOutgoing: MatchInvite[];
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

type MatchInviteRow = {
  id: string;
  inviter_id: string;
  invitee_id: string;
  invite_type: 'private' | 'ranked_2v2';
  mode: '1v1' | '2v2' | null;
  room_code: string | null;
  party_code: string | null;
  created_at: string;
  expires_at: string;
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

function cleanRoomCode(value: unknown): string {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

function cleanPartyCode(value: unknown): string {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
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

async function matchInviteRows(userId: string): Promise<MatchInviteRow[]> {
  const now = encodeURIComponent(new Date().toISOString());
  return rest<MatchInviteRow[]>(
    `match_invites?or=(inviter_id.eq.${userId},invitee_id.eq.${userId})&expires_at=gt.${now}&select=id,inviter_id,invitee_id,invite_type,mode,room_code,party_code,created_at,expires_at&order=created_at.desc&limit=50`,
    {},
    'Could not load game invites',
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

function inviteItem(row: MatchInviteRow, profile: ProfileRow): MatchInvite {
  return {
    ...publicProfile(profile),
    inviteId: row.id,
    inviteType: row.invite_type,
    mode: row.mode,
    roomCode: row.room_code,
    partyCode: row.party_code,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

export async function getFriendsSnapshot(userId: string): Promise<FriendsSnapshot> {
  await touchPresence(userId);
  const [relationships, blocks, invites] = await Promise.all([
    friendshipRows(userId),
    blockRows(userId),
    matchInviteRows(userId),
  ]);
  const otherIds = relationships.map((row) => row.requester_id === userId ? row.addressee_id : row.requester_id);
  const blockedIds = blocks.filter((row) => row.blocker_id === userId).map((row) => row.blocked_id);
  const inviteOtherIds = invites.map((row) => row.inviter_id === userId ? row.invitee_id : row.inviter_id);
  const profiles = await profilesByIds([...otherIds, ...blockedIds, ...inviteOtherIds]);
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

  const gameInvitesIncoming: MatchInvite[] = [];
  const gameInvitesOutgoing: MatchInvite[] = [];
  for (const row of invites) {
    const otherId = row.inviter_id === userId ? row.invitee_id : row.inviter_id;
    const profile = profiles.get(otherId);
    if (!profile) continue;
    const item = inviteItem(row, profile);
    if (row.invitee_id === userId) gameInvitesIncoming.push(item);
    else gameInvitesOutgoing.push(item);
  }

  friends.sort((a,b) => Number(Boolean(b.online)) - Number(Boolean(a.online)) || a.username.localeCompare(b.username));
  incoming.sort((a,b) => a.username.localeCompare(b.username));
  outgoing.sort((a,b) => a.username.localeCompare(b.username));

  return {
    friends,
    incoming,
    outgoing,
    blocked: blockedIds.map((id) => profiles.get(id)).filter((row): row is ProfileRow => Boolean(row)).map((row) => publicProfile(row)),
    gameInvitesIncoming,
    gameInvitesOutgoing,
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

export async function sendMatchInvite(args: {
  userId: string;
  targetId: string;
  inviteType: 'private' | 'ranked_2v2';
  mode?: '1v1' | '2v2' | null;
  roomCode?: string | null;
  partyCode?: string | null;
}): Promise<void> {
  if (!args.targetId || args.targetId === args.userId) throw new Error('Choose a valid friend.');
  const relationship = await exactFriendship(args.userId, args.targetId);
  if (!relationship || relationship.status !== 'accepted') throw new Error('You can only invite accepted friends.');
  if (await isBlockedEitherWay(args.userId, args.targetId)) throw new Error('This player cannot be invited.');

  const roomCode = cleanRoomCode(args.roomCode);
  const partyCode = cleanPartyCode(args.partyCode);
  const mode = args.inviteType === 'ranked_2v2' ? '2v2' : (args.mode === '2v2' ? '2v2' : args.mode === '1v1' ? '1v1' : null);

  if (args.inviteType === 'private' && roomCode.length < 4) throw new Error('Create a private room before inviting a friend.');
  if (args.inviteType === 'ranked_2v2' && partyCode.length < 4) throw new Error('Create a ranked duo before inviting a friend.');

  await rest<void>(
    `match_invites?inviter_id=eq.${args.userId}&invitee_id=eq.${args.targetId}&invite_type=eq.${args.inviteType}`,
    { method: 'DELETE' },
    'Could not replace the previous game invite',
  );

  const ttlMinutes = args.inviteType === 'ranked_2v2' ? 10 : 30;
  await rest<MatchInviteRow[]>(
    'match_invites',
    {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        inviter_id: args.userId,
        invitee_id: args.targetId,
        invite_type: args.inviteType,
        mode,
        room_code: args.inviteType === 'private' ? roomCode : null,
        party_code: args.inviteType === 'ranked_2v2' ? partyCode : null,
        expires_at: new Date(Date.now() + ttlMinutes * 60_000).toISOString(),
      }),
    },
    'Could not send game invite',
  );
}

export async function consumeMatchInvite(userId: string, inviteId: string): Promise<void> {
  await rest<void>(
    `match_invites?id=eq.${encodeURIComponent(inviteId)}&invitee_id=eq.${userId}`,
    { method: 'DELETE' },
    'Could not accept game invite',
  );
}

export async function declineMatchInvite(userId: string, inviteId: string): Promise<void> {
  await consumeMatchInvite(userId, inviteId);
}

export async function cancelMatchInvite(userId: string, inviteId: string): Promise<void> {
  await rest<void>(
    `match_invites?id=eq.${encodeURIComponent(inviteId)}&inviter_id=eq.${userId}`,
    { method: 'DELETE' },
    'Could not cancel game invite',
  );
}

export async function blockFriend(userId: string, targetId: string): Promise<void> {
  if (!targetId || targetId === userId) throw new Error('That player cannot be blocked.');
  await Promise.all([
    rest<void>(`friendships?requester_id=eq.${userId}&addressee_id=eq.${targetId}`, { method: 'DELETE' }, 'Could not remove friendship'),
    rest<void>(`friendships?requester_id=eq.${targetId}&addressee_id=eq.${userId}`, { method: 'DELETE' }, 'Could not remove friendship'),
    rest<void>(`match_invites?inviter_id=eq.${userId}&invitee_id=eq.${targetId}`, { method: 'DELETE' }, 'Could not clear game invites'),
    rest<void>(`match_invites?inviter_id=eq.${targetId}&invitee_id=eq.${userId}`, { method: 'DELETE' }, 'Could not clear game invites'),
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
