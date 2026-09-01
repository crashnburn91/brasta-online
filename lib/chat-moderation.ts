import crypto from 'node:crypto';

export const CHAT_POLICY_VERSION = '2026-09-01';
export const CHAT_MESSAGE_RETENTION_DAYS = 30;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://fhdrywazfmmvgswkdpdb.supabase.co';
const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const memoryMode = process.env.BRASTA_CHAT_MODERATION_MEMORY === 'true';

const allowedReportReasons = new Set([
  'harassment',
  'hate',
  'sexual',
  'threats',
  'spam',
  'personal_info',
  'cheating',
  'other',
]);

const categoryTerms: Record<string, string[]> = {
  hate: [
    'chink', 'faggot', 'gook', 'kike', 'nigger', 'nigga', 'raghead', 'retard', 'spic', 'tranny',
  ],
  profanity: [
    'asshole', 'bastard', 'bitch', 'bullshit', 'cocksucker', 'cunt', 'dickhead', 'dumbass',
    'fuck', 'fucker', 'fucking', 'motherfucker', 'piss off', 'shit', 'shithead', 'slut', 'whore',
  ],
  sexual: [
    'blowjob', 'dick pic', 'naked pics', 'nudes', 'onlyfans', 'porn', 'rape', 'rapist', 'send pics',
  ],
  threats: [
    'go die', 'i will kill you', 'kill yourself', 'kys', 'swat you', 'you should die',
  ],
};

type ChatRestrictionRow = {
  action_type: 'warning' | 'mute' | 'suspension' | 'ban' | 'reversal';
  reason: string;
  expires_at: string | null;
};

type ChatMessageRow = {
  id: string;
  room_id: string;
  room_code: string;
  sender_id: string;
  content: string;
  status: 'visible' | 'removed';
};

type ReportRow = {
  id: string;
  message_id: string | null;
  reporter_id: string;
  reported_user_id: string;
  room_id: string;
  reason: string;
  details: string | null;
  message_snapshot: string;
  status: 'open' | 'reviewing' | 'resolved' | 'dismissed';
  moderator_id: string | null;
  resolution_note: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

type ModerationActionRow = {
  id: string;
  target_user_id: string;
  moderator_user_id: string | null;
  related_report_id: string | null;
  action_type: 'warning' | 'mute' | 'suspension' | 'ban' | 'reversal';
  reason: string;
  starts_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

type ProfileRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

const memoryConsents = new Set<string>();
const memoryMessages = new Map<string, ChatMessageRow>();
const memoryReports = new Map<string, ReportRow>();
const memoryBlocks = new Map<string, Set<string>>();

function configured(): boolean {
  return Boolean(supabaseUrl && secretKey);
}

function requestHeaders(extra: Record<string, string> = {}): Record<string, string> {
  if (!secretKey) throw new Error('Chat moderation backend is not configured.');
  return {
    apikey: secretKey,
    Authorization: `Bearer ${secretKey}`,
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
      const data = JSON.parse(text) as { message?: string; hint?: string; details?: string };
      detail = data.message || data.hint || data.details || text;
    } catch {}
    throw new Error(`${context}: ${detail || `HTTP ${response.status}`}`);
  }
  return (text ? JSON.parse(text) : undefined) as T;
}

async function rest<T>(path: string, init: RequestInit = {}, context = 'Chat moderation request failed'): Promise<T> {
  if (!configured()) throw new Error('Chat moderation backend is not configured.');
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: requestHeaders(init.headers as Record<string, string> || {}),
    cache: 'no-store',
  });
  return parse<T>(response, context);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function canonicalText(value: unknown): string {
  const leet: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', '$': 's' };
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[0134578@$]/g, (character) => leet[character] || character)
    .replace(/(.)\1{2,}/g, '$1$1');
}

function termPattern(term: string): RegExp {
  const pieces = canonicalText(term).split(/[^a-z0-9]+/).filter(Boolean).map((word) =>
    [...word].map(escapeRegex).join('[^a-z0-9]*'));
  return new RegExp(`(?:^|[^a-z0-9])${pieces.join('[^a-z0-9]+')}(?=$|[^a-z0-9])`, 'i');
}

const categoryPatterns = Object.fromEntries(Object.entries(categoryTerms).map(([category, terms]) => [
  category,
  terms.map(termPattern),
])) as Record<string, RegExp[]>;

function configuredPatterns(): RegExp[] {
  return String(process.env.BRASTA_CHAT_BLOCKED_TERMS || '')
    .split(',')
    .map((term) => term.trim())
    .filter(Boolean)
    .map(termPattern);
}

export type ChatModerationDecision =
  | { allowed: true; text: string }
  | { allowed: false; reasonCode: string; message: string };

export function moderateChatText(value: unknown): ChatModerationDecision {
  const text = Array.from(String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim())
    .slice(0, 180)
    .join('');
  if (!text) return { allowed: false, reasonCode: 'empty', message: 'Enter a message first.' };

  const canonical = canonicalText(text);
  for (const [category, patterns] of Object.entries(categoryPatterns)) {
    if (patterns.some((pattern) => pattern.test(canonical))) {
      return {
        allowed: false,
        reasonCode: category,
        message: 'That message includes content that is not allowed in Brasta chat.',
      };
    }
  }
  if (configuredPatterns().some((pattern) => pattern.test(canonical))) {
    return {
      allowed: false,
      reasonCode: 'custom_blocked_term',
      message: 'That message includes content that is not allowed in Brasta chat.',
    };
  }

  const personalInfo = /\b(?:https?:\/\/|www\.)\S+/i.test(text)
    || /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(text)
    || /(?:\+?\d[\s().-]*){8,}/.test(text)
    || /\b(?:\d{1,3}\.){3}\d{1,3}\b/.test(text);
  if (personalInfo) {
    return {
      allowed: false,
      reasonCode: 'personal_info',
      message: 'For your safety, links and personal contact details are not allowed in match chat.',
    };
  }

  const words = canonical.match(/[a-z0-9]+/g) || [];
  const repeatedWord = words.some((word, index) =>
    word.length > 1
    && index + 4 <= words.length
    && words.slice(index, index + 4).every((item) => item === word));
  if (/(.)\1{9,}/i.test(canonical) || repeatedWord) {
    return { allowed: false, reasonCode: 'spam', message: 'Please avoid repeated or spam messages.' };
  }

  return { allowed: true, text };
}

export function safeChatAvatarUrl(value: unknown): string | null {
  const raw = String(value || '').trim().slice(0, 2048);
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export async function registerChatRoomMember(args: {
  roomId: string;
  roomCode: string;
  userId: string;
  seat: number;
  mode: '1v1' | '2v2';
  roomKind: 'private' | 'ranked';
  expiresAt: string;
}): Promise<void> {
  if (memoryMode) return;
  await rest<void>(
    'chat_room_members?on_conflict=room_id,user_id',
    {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({
        room_id: args.roomId,
        room_code: args.roomCode,
        user_id: args.userId,
        seat: args.seat,
        mode: args.mode,
        room_kind: args.roomKind,
        expires_at: args.expiresAt,
      }),
    },
    'Could not register chat room membership',
  );
}

export async function hasCurrentChatConsent(userId: string): Promise<boolean> {
  if (memoryMode) return memoryConsents.has(userId);
  const rows = await rest<Array<{ user_id: string }>>(
    `chat_user_consents?user_id=eq.${userId}&policy_version=eq.${encodeURIComponent(CHAT_POLICY_VERSION)}&select=user_id&limit=1`,
    {},
    'Could not check chat policy consent',
  );
  return rows.length > 0;
}

export async function acceptCurrentChatPolicy(userId: string): Promise<void> {
  if (memoryMode) {
    memoryConsents.add(userId);
    return;
  }
  const now = new Date().toISOString();
  await rest<void>(
    'chat_user_consents?on_conflict=user_id',
    {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ user_id: userId, policy_version: CHAT_POLICY_VERSION, accepted_at: now, updated_at: now }),
    },
    'Could not save chat policy consent',
  );
}

export async function activeChatRestriction(userId: string): Promise<ChatRestrictionRow | null> {
  if (memoryMode) return null;
  const now = encodeURIComponent(new Date().toISOString());
  const rows = await rest<ChatRestrictionRow[]>(
    `chat_moderation_actions?target_user_id=eq.${userId}&revoked_at=is.null&action_type=in.(mute,suspension,ban)&or=(expires_at.is.null,expires_at.gt.${now})&select=action_type,reason,expires_at&order=starts_at.desc&limit=1`,
    {},
    'Could not check chat restrictions',
  );
  return rows[0] || null;
}

export async function recordChatSafetyEvent(args: { userId: string; roomId: string; reasonCode: string; content: string }): Promise<void> {
  if (memoryMode) return;
  const contentHash = crypto.createHash('sha256').update(args.content).digest('hex');
  await rest<void>(
    'chat_safety_events',
    {
      method: 'POST',
      body: JSON.stringify({
        user_id: args.userId,
        room_id: args.roomId,
        reason_code: args.reasonCode.slice(0, 64),
        content_hash: contentHash,
      }),
    },
    'Could not record chat safety event',
  );
}

export async function persistChatMessage(args: {
  id: string;
  roomId: string;
  roomCode: string;
  roomKind: 'private' | 'ranked';
  mode: '1v1' | '2v2';
  senderId: string;
  senderSeat: number;
  senderTeam: 'A' | 'B';
  senderUsername: string;
  senderDisplayName: string | null;
  senderAvatarUrl: string | null;
  content: string;
  createdAt: string;
  expiresAt: string;
}): Promise<void> {
  const row: ChatMessageRow = {
    id: args.id,
    room_id: args.roomId,
    room_code: args.roomCode,
    sender_id: args.senderId,
    content: args.content,
    status: 'visible',
  };
  if (memoryMode) {
    memoryMessages.set(args.id, row);
    return;
  }
  await rest<void>(
    'chat_messages',
    {
      method: 'POST',
      body: JSON.stringify({
        id: args.id,
        room_id: args.roomId,
        room_code: args.roomCode,
        room_kind: args.roomKind,
        mode: args.mode,
        sender_id: args.senderId,
        sender_seat: args.senderSeat,
        sender_team: args.senderTeam,
        sender_username: args.senderUsername.slice(0, 20),
        sender_display_name: args.senderDisplayName?.slice(0, 24) || null,
        sender_avatar_url: safeChatAvatarUrl(args.senderAvatarUrl),
        content: args.content,
        created_at: args.createdAt,
        expires_at: args.expiresAt,
      }),
    },
    'Could not persist chat message',
  );
}

export async function deletePersistedChatMessage(messageId: string): Promise<void> {
  if (memoryMode) {
    memoryMessages.delete(messageId);
    return;
  }
  await rest<void>(`chat_messages?id=eq.${encodeURIComponent(messageId)}`, { method: 'DELETE' }, 'Could not remove unsent chat message');
}

export async function reportChatMessage(args: {
  reporterId: string;
  messageId: string;
  currentRoomId: string;
  reason: unknown;
  details: unknown;
}): Promise<{ reportId: string; reportedUserId: string; autoHidden: boolean }> {
  const reason = String(args.reason || '').trim();
  if (!allowedReportReasons.has(reason)) throw new Error('Choose a valid report reason.');
  const details = String(args.details || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500) || null;
  const message = memoryMode
    ? memoryMessages.get(args.messageId) || null
    : (await rest<ChatMessageRow[]>(
      `chat_messages?id=eq.${encodeURIComponent(args.messageId)}&select=id,room_id,room_code,sender_id,content,status&limit=1`,
      {},
      'Could not find that chat message',
    ))[0] || null;
  if (!message || message.room_id !== args.currentRoomId) throw new Error('That message is no longer available to report.');
  if (message.sender_id === args.reporterId) throw new Error('You cannot report your own message.');

  if (memoryMode) {
    const duplicate = [...memoryReports.values()].find((item) => item.message_id === message.id && item.reporter_id === args.reporterId);
    if (duplicate) throw new Error('You already reported this message.');
    const reportId = crypto.randomUUID();
    const now = new Date().toISOString();
    memoryReports.set(reportId, {
      id: reportId,
      message_id: message.id,
      reporter_id: args.reporterId,
      reported_user_id: message.sender_id,
      room_id: message.room_id,
      reason,
      details,
      message_snapshot: message.content,
      status: 'open',
      moderator_id: null,
      resolution_note: null,
      created_at: now,
      updated_at: now,
      resolved_at: null,
    });
    return { reportId, reportedUserId: message.sender_id, autoHidden: false };
  }

  let rows: ReportRow[];
  try {
    rows = await rest<ReportRow[]>(
      'chat_reports',
      {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          message_id: message.id,
          reporter_id: args.reporterId,
          reported_user_id: message.sender_id,
          room_id: message.room_id,
          reason,
          details,
          message_snapshot: message.content,
        }),
      },
      'Could not submit chat report',
    );
  } catch (error) {
    if (error instanceof Error && /duplicate|unique|23505/i.test(error.message)) throw new Error('You already reported this message.');
    throw error;
  }

  const reports = await rest<Array<{ id: string }>>(
    `chat_reports?message_id=eq.${encodeURIComponent(message.id)}&status=in.(open,reviewing,resolved)&select=id&limit=3`,
    {},
    'Could not evaluate chat reports',
  );
  const autoHidden = message.status === 'visible' && reports.length >= 3;
  if (autoHidden) {
    await rest<void>(
      `chat_messages?id=eq.${encodeURIComponent(message.id)}&status=eq.visible`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status: 'removed', moderation_reason: 'Automatically hidden after multiple independent reports.' }),
      },
      'Could not hide repeatedly reported message',
    );
  }
  return { reportId: rows[0].id, reportedUserId: message.sender_id, autoHidden };
}

export async function blockedChatPeers(userId: string): Promise<Set<string>> {
  if (memoryMode) return new Set(memoryBlocks.get(userId) || []);
  const rows = await rest<Array<{ blocker_id: string; blocked_id: string }>>(
    `friend_blocks?or=(blocker_id.eq.${userId},blocked_id.eq.${userId})&select=blocker_id,blocked_id`,
    {},
    'Could not load blocked players',
  );
  return new Set(rows.map((row) => row.blocker_id === userId ? row.blocked_id : row.blocker_id));
}

export async function blockChatPeer(userId: string, targetId: string): Promise<void> {
  if (!targetId || targetId === userId) throw new Error('That player cannot be blocked.');
  if (memoryMode) {
    const own = memoryBlocks.get(userId) || new Set<string>();
    own.add(targetId);
    memoryBlocks.set(userId, own);
    const target = memoryBlocks.get(targetId) || new Set<string>();
    target.add(userId);
    memoryBlocks.set(targetId, target);
    return;
  }
  await Promise.all([
    rest<void>(`friendships?or=(and(requester_id.eq.${userId},addressee_id.eq.${targetId}),and(requester_id.eq.${targetId},addressee_id.eq.${userId}))`, { method: 'DELETE' }, 'Could not remove friendship'),
    rest<void>(`match_invites?or=(and(inviter_id.eq.${userId},invitee_id.eq.${targetId}),and(inviter_id.eq.${targetId},invitee_id.eq.${userId}))`, { method: 'DELETE' }, 'Could not clear game invites'),
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

function publicProfile(row: ProfileRow | undefined) {
  return {
    id: row?.id || '',
    username: row?.username || 'Deleted player',
    displayName: row?.display_name || null,
    avatarUrl: safeChatAvatarUrl(row?.avatar_url),
  };
}

async function profilesByIds(ids: string[]): Promise<Map<string, ProfileRow>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length || memoryMode) return new Map();
  const rows = await rest<ProfileRow[]>(
    `profiles?id=in.(${unique.join(',')})&select=id,username,display_name,avatar_url`,
    {},
    'Could not load moderation profiles',
  );
  return new Map(rows.map((row) => [row.id, row]));
}

export async function listModerationQueue() {
  const reports = memoryMode
    ? [...memoryReports.values()]
    : await rest<ReportRow[]>(
      'chat_reports?select=id,message_id,reporter_id,reported_user_id,room_id,reason,details,message_snapshot,status,moderator_id,resolution_note,created_at,updated_at,resolved_at&order=created_at.desc&limit=200',
      {},
      'Could not load moderation reports',
    );
  const actions = memoryMode
    ? []
    : await rest<ModerationActionRow[]>(
      'chat_moderation_actions?select=id,target_user_id,moderator_user_id,related_report_id,action_type,reason,starts_at,expires_at,revoked_at,created_at&order=created_at.desc&limit=200',
      {},
      'Could not load moderation actions',
    );
  const profiles = await profilesByIds([
    ...reports.flatMap((row) => [row.reporter_id, row.reported_user_id, row.moderator_id || '']),
    ...actions.flatMap((row) => [row.target_user_id, row.moderator_user_id || '']),
  ]);
  return {
    reports: reports.map((row) => ({
      id: row.id,
      messageId: row.message_id,
      roomId: row.room_id,
      reason: row.reason,
      details: row.details,
      messageSnapshot: row.message_snapshot,
      status: row.status,
      resolutionNote: row.resolution_note,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      resolvedAt: row.resolved_at,
      reporter: publicProfile(profiles.get(row.reporter_id)),
      reportedUser: publicProfile(profiles.get(row.reported_user_id)),
      moderator: row.moderator_id ? publicProfile(profiles.get(row.moderator_id)) : null,
    })),
    actions: actions.map((row) => ({
      id: row.id,
      targetUser: publicProfile(profiles.get(row.target_user_id)),
      moderator: row.moderator_user_id ? publicProfile(profiles.get(row.moderator_user_id)) : null,
      relatedReportId: row.related_report_id,
      actionType: row.action_type,
      reason: row.reason,
      startsAt: row.starts_at,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
      createdAt: row.created_at,
    })),
  };
}

export async function updateModerationReport(args: {
  reportId: string;
  moderatorId: string;
  status: 'open' | 'reviewing' | 'resolved' | 'dismissed';
  resolutionNote?: unknown;
}): Promise<void> {
  const resolutionNote = String(args.resolutionNote || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1000) || null;
  const now = new Date().toISOString();
  if (memoryMode) {
    const report = memoryReports.get(args.reportId);
    if (!report) throw new Error('That report no longer exists.');
    report.status = args.status;
    report.moderator_id = args.moderatorId;
    report.resolution_note = resolutionNote;
    report.updated_at = now;
    report.resolved_at = ['resolved', 'dismissed'].includes(args.status) ? now : null;
    return;
  }
  await rest<void>(
    `chat_reports?id=eq.${encodeURIComponent(args.reportId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        status: args.status,
        moderator_id: args.moderatorId,
        resolution_note: resolutionNote,
        updated_at: now,
        resolved_at: ['resolved', 'dismissed'].includes(args.status) ? now : null,
      }),
    },
    'Could not update moderation report',
  );
}

export async function createModerationAction(args: {
  targetUserId: string;
  moderatorId: string;
  relatedReportId?: string | null;
  actionType: 'warning' | 'mute' | 'suspension' | 'ban';
  reason: unknown;
  expiresAt?: string | null;
}): Promise<void> {
  const reason = String(args.reason || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1000);
  if (!reason) throw new Error('Add a reason for the moderation action.');
  if (memoryMode) return;
  await rest<void>(
    'chat_moderation_actions',
    {
      method: 'POST',
      body: JSON.stringify({
        target_user_id: args.targetUserId,
        moderator_user_id: args.moderatorId,
        related_report_id: args.relatedReportId || null,
        action_type: args.actionType,
        reason,
        expires_at: args.expiresAt || null,
      }),
    },
    'Could not create moderation action',
  );
}

export async function revokeModerationAction(actionId: string): Promise<void> {
  if (memoryMode) return;
  await rest<void>(
    `chat_moderation_actions?id=eq.${encodeURIComponent(actionId)}&revoked_at=is.null`,
    { method: 'PATCH', body: JSON.stringify({ revoked_at: new Date().toISOString() }) },
    'Could not revoke moderation action',
  );
}

export async function removeModeratedMessage(messageId: string, reason: unknown): Promise<void> {
  const cleanReason = String(reason || 'Removed by a Brasta moderator.').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
  if (memoryMode) {
    const message = memoryMessages.get(messageId);
    if (message) message.status = 'removed';
    return;
  }
  await rest<void>(
    `chat_messages?id=eq.${encodeURIComponent(messageId)}`,
    { method: 'PATCH', body: JSON.stringify({ status: 'removed', moderation_reason: cleanReason }) },
    'Could not remove chat message',
  );
}
