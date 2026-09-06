import { cert, getApps, initializeApp, type App as FirebaseApp, type ServiceAccount } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { createHash } from 'node:crypto';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://fhdrywazfmmvgswkdpdb.supabase.co';
const supabaseSecret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const APP_ID = 'app.brasta';
const ACTIVE_REGISTRATION_DAYS = 45;
const MAX_USER_DEVICES = 20;

type PushSubscriptionRow = {
  id: string;
  user_id: string;
  token: string;
  platform: 'android';
  app_id: string;
  updated_at: string;
};

export type BrastaPushKind = 'game_invite' | 'ranked_match' | 'your_turn';

export type BrastaPushPayload = {
  kind: BrastaPushKind;
  title: string;
  body: string;
  route: string;
  roomCode?: string;
  tag?: string;
  collapseKey?: string;
  ttlMs?: number;
};

export type PushDeliveryResult = {
  configured: boolean;
  attempted: number;
  delivered: number;
  failed: number;
};

let firebaseApp: FirebaseApp | null | undefined;

function serverHeaders(extra: Record<string, string> = {}): Record<string, string> {
  if (!supabaseSecret) throw new Error('Push subscription storage is not configured.');
  return {
    apikey: supabaseSecret,
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
      const payload = JSON.parse(text) as { message?: string; hint?: string; details?: string };
      detail = payload.message || payload.hint || payload.details || text;
    } catch {}
    throw new Error(`${context}: ${detail || `HTTP ${response.status}`}`);
  }
  return (text ? JSON.parse(text) : undefined) as T;
}

async function rest<T>(path: string, init: RequestInit = {}, context = 'Push subscription request failed'): Promise<T> {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: serverHeaders(init.headers as Record<string, string> || {}),
    cache: 'no-store',
  });
  return parse<T>(response, context);
}

function cleanToken(value: unknown): string {
  const token = String(value || '').trim();
  if (token.length < 20 || token.length > 4096 || /[\u0000-\u001f\u007f\s]/.test(token)) {
    throw new Error('The Android push token is invalid.');
  }
  return token;
}

function cleanRoute(value: unknown): string {
  const route = String(value || '').trim();
  return route.startsWith('/') && !route.startsWith('//') ? route.slice(0, 500) : '/';
}

function revocationHash(value: unknown): string {
  const secret = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]{43}$/.test(secret)) throw new Error('The Android registration secret is invalid.');
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

function firebaseServiceAccount(): ServiceAccount | null {
  const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  if (raw) {
    try {
      const decoded = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
      const value = JSON.parse(decoded) as {
        project_id?: string;
        client_email?: string;
        private_key?: string;
      };
      if (value.project_id && value.client_email && value.private_key) {
        return {
          projectId: value.project_id,
          clientEmail: value.client_email,
          privateKey: value.private_key.replace(/\\n/g, '\n'),
        };
      }
    } catch {
      console.error('[brasta push] FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON or base64-encoded JSON.');
      return null;
    }
  }

  const projectId = String(process.env.FIREBASE_PROJECT_ID || '').trim();
  const clientEmail = String(process.env.FIREBASE_CLIENT_EMAIL || '').trim();
  const privateKey = String(process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();
  return projectId && clientEmail && privateKey ? { projectId, clientEmail, privateKey } : null;
}

function messagingApp(): FirebaseApp | null {
  if (firebaseApp !== undefined) return firebaseApp;
  const existing = getApps().find((app) => app.name === 'brasta-push');
  if (existing) {
    firebaseApp = existing;
    return firebaseApp;
  }

  const serviceAccount = firebaseServiceAccount();
  if (!serviceAccount) {
    firebaseApp = null;
    return null;
  }
  try {
    firebaseApp = initializeApp({ credential: cert(serviceAccount) }, 'brasta-push');
  } catch (error) {
    console.error('[brasta push] Firebase Admin initialization failed.', error);
    firebaseApp = null;
  }
  return firebaseApp;
}

export function pushStorageConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseSecret);
}

export function pushDeliveryConfigured(): boolean {
  return Boolean(messagingApp());
}

export async function registerPushSubscription(
  userId: string,
  tokenValue: unknown,
  revocationSecret: unknown,
): Promise<void> {
  if (!userId) throw new Error('A signed-in account is required for push notifications.');
  const token = cleanToken(tokenValue);
  const revocation_hash = revocationHash(revocationSecret);
  const now = new Date().toISOString();
  await rest<void>(
    'push_subscriptions?on_conflict=token',
    {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        user_id: userId,
        token,
        platform: 'android',
        app_id: APP_ID,
        revocation_hash,
        enabled: true,
        updated_at: now,
      }),
    },
    'Could not register this Android device',
  );
}

export async function unregisterPushSubscription(tokenValue: unknown, revocationSecret: unknown): Promise<void> {
  const token = cleanToken(tokenValue);
  const revocation_hash = revocationHash(revocationSecret);
  await rest<void>(
    `push_subscriptions?token=eq.${encodeURIComponent(token)}&revocation_hash=eq.${encodeURIComponent(revocation_hash)}`,
    { method: 'DELETE' },
    'Could not unregister this Android device',
  );
}

async function activeSubscriptions(userId: string): Promise<PushSubscriptionRow[]> {
  if (!pushStorageConfigured() || !userId) return [];
  const activeSince = new Date(Date.now() - ACTIVE_REGISTRATION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  return rest<PushSubscriptionRow[]>(
    `push_subscriptions?user_id=eq.${encodeURIComponent(userId)}&platform=eq.android&app_id=eq.${encodeURIComponent(APP_ID)}&enabled=eq.true&updated_at=gte.${encodeURIComponent(activeSince)}&select=id,user_id,token,platform,app_id,updated_at&order=updated_at.desc&limit=${MAX_USER_DEVICES}`,
    {},
    'Could not load Android push subscriptions',
  );
}

async function removeSubscriptions(ids: string[]): Promise<void> {
  const safe = [...new Set(ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id)))];
  if (!safe.length) return;
  await rest<void>(
    `push_subscriptions?id=in.(${safe.join(',')})`,
    { method: 'DELETE' },
    'Could not remove expired Android push subscriptions',
  );
}

function isExpiredTokenError(code: string | undefined): boolean {
  return code === 'messaging/registration-token-not-registered'
    || code === 'messaging/invalid-registration-token';
}

export async function sendPushToUser(userId: string, payload: BrastaPushPayload): Promise<PushDeliveryResult> {
  const app = messagingApp();
  if (!app || !pushStorageConfigured()) {
    return { configured: false, attempted: 0, delivered: 0, failed: 0 };
  }

  try {
    const subscriptions = await activeSubscriptions(userId);
    if (!subscriptions.length) return { configured: true, attempted: 0, delivered: 0, failed: 0 };

    const roomCode = String(payload.roomCode || '').replace(/[^A-Z0-9]/gi, '').slice(0, 6).toUpperCase();
    const route = cleanRoute(payload.route);
    const response = await getMessaging(app).sendEachForMulticast({
      tokens: subscriptions.map((subscription) => subscription.token),
      notification: {
        title: String(payload.title || 'Brasta').slice(0, 80),
        body: String(payload.body || '').slice(0, 220),
      },
      data: {
        kind: payload.kind,
        route,
        roomCode,
      },
      android: {
        priority: 'high',
        ttl: Math.max(30_000, Math.min(payload.ttlMs || 15 * 60_000, 24 * 60 * 60_000)),
        collapseKey: String(payload.collapseKey || payload.kind).slice(0, 64),
        notification: {
          channelId: 'brasta_gameplay',
          icon: 'ic_stat_brasta',
          color: '#D8B75E',
          sound: 'default',
          tag: String(payload.tag || payload.kind).slice(0, 64),
          priority: 'high',
          visibility: 'private',
          defaultVibrateTimings: true,
        },
      },
    });

    const expiredIds = response.responses.flatMap((result, index) =>
      !result.success && isExpiredTokenError(result.error?.code) ? [subscriptions[index].id] : []
    );
    if (expiredIds.length) {
      void removeSubscriptions(expiredIds).catch((error) => {
        console.error('[brasta push] Could not prune invalid FCM registrations.', error);
      });
    }

    return {
      configured: true,
      attempted: subscriptions.length,
      delivered: response.successCount,
      failed: response.failureCount,
    };
  } catch (error) {
    console.error('[brasta push] Delivery failed.', error);
    return { configured: true, attempted: 0, delivered: 0, failed: 0 };
  }
}

export function sendGameInvitePush(args: {
  userId: string;
  inviterName: string;
  inviteType: 'private' | 'ranked_2v2';
  mode?: '1v1' | '2v2' | null;
  roomCode?: string | null;
}): Promise<PushDeliveryResult> {
  const name = String(args.inviterName || 'A Brasta friend').slice(0, 24);
  const roomCode = String(args.roomCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  const ranked = args.inviteType === 'ranked_2v2';
  return sendPushToUser(args.userId, {
    kind: 'game_invite',
    title: ranked ? 'Ranked duo invite' : `${args.mode || 'Private'} Brasta invite`,
    body: ranked ? `${name} invited you to queue for Ranked 2v2.` : `${name} invited you to room ${roomCode}.`,
    route: ranked ? '/?open=friends&push=invite' : `/?room=${encodeURIComponent(roomCode)}&push=invite`,
    roomCode,
    tag: ranked ? `ranked-duo-${args.userId}` : `invite-${roomCode}`,
    collapseKey: ranked ? `ranked-duo-${args.userId}` : `invite-${roomCode}`,
    ttlMs: ranked ? 10 * 60_000 : 30 * 60_000,
  });
}

export function sendRankedMatchPush(args: {
  userId: string;
  roomCode: string;
  mode: '1v1' | '2v2';
  opponent: string;
}): Promise<PushDeliveryResult> {
  return sendPushToUser(args.userId, {
    kind: 'ranked_match',
    title: 'Ranked match found',
    body: args.mode === '2v2'
      ? `Your Brasta 2v2 table is ready against ${args.opponent}.`
      : `Your Brasta table is ready against ${args.opponent}.`,
    // Reload the ranked status endpoint first so a backgrounded client can
    // restore its authoritative assignment before navigating into the room.
    route: '/?push=ranked',
    roomCode: args.roomCode,
    tag: `ranked-${args.roomCode}`,
    collapseKey: `ranked-${args.roomCode}`,
    ttlMs: 5 * 60_000,
  });
}

export function sendTurnPush(args: {
  userId: string;
  roomCode: string;
  phase: 'openingChoice' | 'play';
  opponentName?: string | null;
}): Promise<PushDeliveryResult> {
  return sendPushToUser(args.userId, {
    kind: 'your_turn',
    title: args.phase === 'openingChoice' ? 'Choose your opening hand' : 'Your turn in Brasta',
    body: args.phase === 'openingChoice'
      ? 'Keep your four cards or place them on the board.'
      : args.opponentName ? `Your table with ${args.opponentName} is waiting.` : 'Your Brasta table is waiting.',
    route: `/?room=${encodeURIComponent(args.roomCode)}&push=turn`,
    roomCode: args.roomCode,
    tag: `turn-${args.roomCode}`,
    collapseKey: `turn-${args.roomCode}`,
    ttlMs: 10 * 60_000,
  });
}
