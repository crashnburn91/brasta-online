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

export type TrafficClientDetails = {
  language: string | null;
  timezone: string | null;
  referrer: string | null;
  standalone: boolean;
  screenWidth: number | null;
  screenHeight: number | null;
  viewportWidth: number | null;
  viewportHeight: number | null;
  pixelRatio: number | null;
  platform: string | null;
  platformVersion: string | null;
  architecture: string | null;
  bitness: string | null;
  model: string | null;
  browserHint: string | null;
  browserHintVersion: string | null;
};

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
  deviceModel: string | null;
  os: string;
  osVersion: string | null;
  browser: string;
  browserVersion: string | null;
  ip: string | null;
  city: string | null;
  country: string | null;
  countryRegion: string | null;
  ipTimezone: string | null;
  language: string | null;
  browserTimezone: string | null;
  referrer: string | null;
  standalone: boolean;
  screenWidth: number | null;
  screenHeight: number | null;
  viewportWidth: number | null;
  viewportHeight: number | null;
  pixelRatio: number | null;
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

function cleanText(value: unknown, max = 120): string | null {
  const raw = String(value || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);
  return raw || null;
}

function cleanNumber(value: unknown, min: number, max: number): number | null {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) return null;
  return Math.round(number * 100) / 100;
}

function cleanIp(value: unknown): string | null {
  const raw = String(value || '').trim().slice(0, 80);
  return /^[0-9a-f:.]+$/i.test(raw) ? raw : null;
}

function cleanReferrer(value: unknown): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.hostname.slice(0, 180) || null;
  } catch {
    return cleanText(raw, 180);
  }
}

function detectDevice(userAgent: string): TrafficPresence['device'] {
  if (/ipad|tablet|playbook|silk/i.test(userAgent)) return 'tablet';
  if (/mobi|iphone|android/i.test(userAgent)) return 'mobile';
  return 'desktop';
}

function browserFromUa(userAgent: string): { name: string; version: string | null } {
  const candidates: Array<[RegExp, string]> = [
    [/Edg\/([\d.]+)/i, 'Edge'],
    [/OPR\/([\d.]+)/i, 'Opera'],
    [/Firefox\/([\d.]+)/i, 'Firefox'],
    [/CriOS\/([\d.]+)/i, 'Chrome'],
    [/Chrome\/([\d.]+)/i, 'Chrome'],
    [/Version\/([\d.]+).*Safari\//i, 'Safari'],
  ];
  for (const [regex, name] of candidates) {
    const match = userAgent.match(regex);
    if (match) return { name, version: match[1] || null };
  }
  return { name: 'Other', version: null };
}

function osFromUa(userAgent: string): { name: string; version: string | null } {
  let match = userAgent.match(/Windows NT ([\d.]+)/i);
  if (match) {
    const labels: Record<string, string> = {
      '10.0': 'Windows',
      '6.3': 'Windows 8.1',
      '6.2': 'Windows 8',
      '6.1': 'Windows 7',
    };
    return { name: labels[match[1]] || 'Windows', version: match[1] || null };
  }

  match = userAgent.match(/Android ([\d.]+)/i);
  if (match) return { name: 'Android', version: match[1] || null };

  match = userAgent.match(/(?:iPhone|CPU(?: iPhone)? OS) ([\d_]+)/i);
  if (match) return { name: 'iOS', version: (match[1] || '').replace(/_/g, '.') || null };

  match = userAgent.match(/Mac OS X ([\d_]+)/i);
  if (match) return { name: 'macOS', version: (match[1] || '').replace(/_/g, '.') || null };

  if (/Linux/i.test(userAgent)) return { name: 'Linux', version: null };
  return { name: 'Other', version: null };
}

function modelFromUa(userAgent: string): string | null {
  const android = userAgent.match(/Android[^;]*;\s*([^;)]+?)(?:\s+Build\/|;|\))/i);
  if (android?.[1]) {
    const model = android[1].replace(/^wv\s*/i, '').trim();
    if (model && !/^en[-_]/i.test(model)) return model.slice(0, 80);
  }
  if (/iPhone/i.test(userAgent)) return 'iPhone';
  if (/iPad/i.test(userAgent)) return 'iPad';
  return null;
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
  ip: unknown;
  city: unknown;
  country: unknown;
  countryRegion: unknown;
  ipTimezone: unknown;
  client: Partial<TrafficClientDetails> | null | undefined;
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
  const client = args.client || {};
  const uaBrowser = browserFromUa(args.userAgent);
  const uaOs = osFromUa(args.userAgent);
  const hintedBrowser = cleanText(client.browserHint, 40);
  const hintedBrowserVersion = cleanText(client.browserHintVersion, 40);
  const hintedPlatform = cleanText(client.platform, 40);
  const hintedPlatformVersion = cleanText(client.platformVersion, 40);
  const hintedModel = cleanText(client.model, 80);

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
    deviceModel: hintedModel || modelFromUa(args.userAgent),
    os: hintedPlatform || uaOs.name,
    osVersion: hintedPlatformVersion || uaOs.version,
    browser: hintedBrowser || uaBrowser.name,
    browserVersion: hintedBrowserVersion || uaBrowser.version,
    ip: cleanIp(args.ip),
    city: cleanText(args.city, 100),
    country: cleanText(args.country, 12),
    countryRegion: cleanText(args.countryRegion, 24),
    ipTimezone: cleanText(args.ipTimezone, 80),
    language: cleanText(client.language, 40),
    browserTimezone: cleanText(client.timezone, 80),
    referrer: cleanReferrer(client.referrer),
    standalone: client.standalone === true,
    screenWidth: cleanNumber(client.screenWidth, 1, 20_000),
    screenHeight: cleanNumber(client.screenHeight, 1, 20_000),
    viewportWidth: cleanNumber(client.viewportWidth, 1, 20_000),
    viewportHeight: cleanNumber(client.viewportHeight, 1, 20_000),
    pixelRatio: cleanNumber(client.pixelRatio, 0.1, 20),
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
