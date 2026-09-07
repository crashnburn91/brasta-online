import { NextResponse } from 'next/server';
import {
  pushDeliveryConfigured,
  pushStorageConfigured,
  registerPushSubscription,
  unregisterPushSubscription,
} from '../../../lib/push-notifications';
import { verifyBrastaAccessToken } from '../../../lib/supabase-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

function tokenFrom(request: Request): string {
  return (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
}

export async function POST(request: Request) {
  try {
    if (!pushStorageConfigured()) return json({ error: 'Android notifications are not configured yet.' }, 503);
    const body = await request.json().catch(() => ({})) as {
      action?: 'register' | 'unregister';
      token?: string;
      revocationSecret?: string;
      platform?: string;
    };
    if (body.platform !== 'android') return json({ error: 'Only Android notification registrations are accepted.' }, 400);

    if (body.action === 'unregister') {
      await unregisterPushSubscription(body.token, body.revocationSecret);
      return json({ state: 'unregistered' });
    }

    const accessToken = tokenFrom(request);
    if (!accessToken) return json({ error: 'Sign in to manage Android notifications.' }, 401);
    const identity = await verifyBrastaAccessToken(accessToken);
    if (!identity?.userId) return json({ error: 'Your Brasta session has expired.' }, 401);

    if (body.action === 'register') {
      await registerPushSubscription(identity.userId, body.token, body.revocationSecret);
      return json({ state: 'registered', deliveryConfigured: pushDeliveryConfigured() });
    }
    return json({ error: 'Choose register or unregister.' }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Android notification registration failed.';
    const status = /session|sign in/i.test(message) ? 401 : /not configured/i.test(message) ? 503 : 400;
    console.error('[brasta push api]', error);
    return json({ error: message }, status);
  }
}
