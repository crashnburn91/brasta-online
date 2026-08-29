import crypto from 'node:crypto';
import { redis } from './redis';
import type { BrastaAuthIdentity } from './supabase-auth';

const PRESENCE_INDEX = 'brasta:traffic:presence:index';
const PRESENCE_KEY_PREFIX = 'brasta:traffic:presence:';
const ACTIVE_MS = 90_000;
const RECENT_MS = 10 * 60_000;
const SESSION_TTL_SECONDS = 15 * 60;
const DAILY_TTL_SECONDS = 8 * 24 * 60 * 60;

export type TrafficActivity = 'home' | 'lobby' | 'match' | 'spectating' | 'admin' | 'auth' | 'other';

export type TrafficPresence = {
  sessionId: string;
  signedIn: boolean;
  userId: string | null;
  userLabel: string | null;
  activity: TrafficActivity;
  roomCode: string | null;
  path: string;
  pageKey: string;
  visible: boolean;
  device: 'mobile' | 'tablet' | 'desktop';
  browser: string;
  firstSeen: number;
  lastSeen: number;
};

export type TrafficSnapshot = {
  generatedAt: number;
  redisConfigured: boolean;
  totals: {
    active: number;
    guests: number;
    signedIn: number;
    rooms: number;
    playing: number;
    spectating: number;
    recent10m: number;
    visitorsToday: number;
    pageviewsToday: number;
  };
  sessions: TrafficPresence[];
};

function dayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10).replace(/-/g, '');
}

function sessionKey(sessionId: string): string {
  return `${PRESENCE_KEY_PREFIX}${sessionId}`;
}

function visitorsKey(day: string): string {
  return `brasta:traffic:visitors:${day}`;
}

function pageviewsKey(day: string): string {
  return `brasta:traffic:pageviews:${day}`;
}

function cleanSessionId(value: unknown): string {
  const raw = String(value || '').trim();
  return /^[A-Za-z0-9_-]{16,80}$/.test(raw) ? raw : '';
}

function cleanRoomCode(value: unknown): string | null {
  const code = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  return code || null;
}

function cleanPath(value: unknown): string {
  const path = String(value || '/').trim().slice(0, 180);
  return path.startsWith('/') ? path : '/';
}

function cleanPageKey(value: unknown, path: string): string {
  const raw = String(value || path).trim().slice(0, 220);
  return raw || path;
}

function cleanActivity(value: unknown): TrafficActivity {
  const allowed: TrafficActivity[] = ['home', 'lobby', 'match', 'spectating', 'admin', 'auth', 'other'];
  const candidate = String(value || 'other') as TrafficActivity;
  return allowed.includes(candidate) ? candidate : 'other';
}

function detectDevice(userAgent: string): TrafficPresence['device'] {
  if (/ipad|tablet|playbook|silk/i.test(userAgent)) return 'tablet';
  if (/mobi|iphone|android/i.test(userAgent)) return 'mobile';
  return 'desktop';
}

function detectBrowser(userAgent: string): string {
  if (/edg\//i.test(userAgent)) return 'Edge';
  if (/opr\//i.test(userAgent)) return 'Opera';
  if (/firefox\//i.test(userAgent)) return 'Firefox';
  if (/chrome\//i.test(userAgent) || /crios\//i.test(userAgent)) return 'Chrome';
  if (/safari\//i.test(userAgent)) return 'Safari';
  return 'Other';
}

export function adminTrafficConfigured(): boolean {
  return Boolean(
    String(process.env.BRASTA_ADMIN_EMAILS || '').trim()
    || String(process.env.BRASTA_ADMIN_USER_IDS || '').trim()
  );
}

export function isTrafficAdmin(identity: BrastaAuthIdentity | null): boolean {
  if (!identity) return false;
  const ids = String(process.env.BRASTA_ADMIN_USER_IDS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (ids.includes(identity.userId)) return true;

  const email = String(identity.email || '').trim().toLowerCase();
  if (!email) return false;
  const emails = String(process.env.BRASTA_ADMIN_EMAILS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return emails.includes(email);
}

export async function recordTrafficPresence(args: {
  sessionId: unknown;
  activity: unknown;
  roomCode: unknown;
  path: unknown;
  pageKey: unknown;
  visible: unknown;
  userAgent: string;
  identity: BrastaAuthIdentity | null;
}): Promise<{ ok: boolean; sessionId?: string }> {
  if (!redis) return { ok: false };

  const sessionId = cleanSessionId(args.sessionId);
  if (!sessionId) return { ok: false };

  const now = Date.now();
  const key = sessionKey(sessionId);
  const path = cleanPath(args.path);
  const pageKey = cleanPageKey(args.pageKey, path);

  let previous: TrafficPresence | null = null;
  try {
    const raw = await redis.get(key);
    if (raw) previous = JSON.parse(raw) as TrafficPresence;
  } catch {}

  const identity = args.identity;
  const record: TrafficPresence = {
    sessionId,
    signedIn: Boolean(identity?.userId),
    userId: identity?.userId || null,
    userLabel: identity?.displayName || identity?.username || null,
    activity: cleanActivity(args.activity),
    roomCode: cleanRoomCode(args.roomCode),
    path,
    pageKey,
    visible: args.visible !== false,
    device: detectDevice(args.userAgent),
    browser: detectBrowser(args.userAgent),
    firstSeen: previous?.firstSeen || now,
    lastSeen: now,
  };

  const day = dayKey();
  const pipeline = redis.pipeline();
  pipeline.set(key, JSON.stringify(record), 'EX', SESSION_TTL_SECONDS);
  pipeline.zadd(PRESENCE_INDEX, now, sessionId);
  pipeline.expire(PRESENCE_INDEX, SESSION_TTL_SECONDS * 2);
  pipeline.sadd(visitorsKey(day), sessionId);
  pipeline.expire(visitorsKey(day), DAILY_TTL_SECONDS);
  if (!previous || previous.pageKey !== pageKey) {
    pipeline.incr(pageviewsKey(day));
    pipeline.expire(pageviewsKey(day), DAILY_TTL_SECONDS);
  }
  await pipeline.exec();

  return { ok: true, sessionId };
}

async function loadSessions(ids: string[]): Promise<TrafficPresence[]> {
  if (!redis || ids.length === 0) return [];
  const raws = await redis.mget(ids.map(sessionKey));
  const sessions: TrafficPresence[] = [];
  for (const raw of raws) {
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as TrafficPresence;
      if (parsed?.sessionId && parsed?.lastSeen) sessions.push(parsed);
    } catch {}
  }
  return sessions;
}

export async function getTrafficSnapshot(): Promise<TrafficSnapshot> {
  const now = Date.now();
  if (!redis) {
    return {
      generatedAt: now,
      redisConfigured: false,
      totals: { active: 0, guests: 0, signedIn: 0, rooms: 0, playing: 0, spectating: 0, recent10m: 0, visitorsToday: 0, pageviewsToday: 0 },
      sessions: [],
    };
  }

  await redis.zremrangebyscore(PRESENCE_INDEX, 0, now - SESSION_TTL_SECONDS * 1000);

  const [activeIds, recentIds, visitorsToday, pageviewsRaw] = await Promise.all([
    redis.zrevrangebyscore(PRESENCE_INDEX, '+inf', now - ACTIVE_MS),
    redis.zrevrangebyscore(PRESENCE_INDEX, '+inf', now - RECENT_MS),
    redis.scard(visitorsKey(dayKey())),
    redis.get(pageviewsKey(dayKey())),
  ]);

  const sessions = (await loadSessions(activeIds))
    .filter((session) => now - session.lastSeen <= ACTIVE_MS)
    .sort((a, b) => b.lastSeen - a.lastSeen);

  const roomCodes = new Set(sessions.map((session) => session.roomCode).filter(Boolean));
  const signedIn = sessions.filter((session) => session.signedIn).length;
  const playing = sessions.filter((session) => session.activity === 'match').length;
  const spectating = sessions.filter((session) => session.activity === 'spectating').length;

  return {
    generatedAt: now,
    redisConfigured: true,
    totals: {
      active: sessions.length,
      guests: sessions.length - signedIn,
      signedIn,
      rooms: roomCodes.size,
      playing,
      spectating,
      recent10m: recentIds.length,
      visitorsToday,
      pageviewsToday: Number(pageviewsRaw || 0),
    },
    sessions,
  };
}

export function makeTrafficSessionId(): string {
  return crypto.randomUUID();
}
