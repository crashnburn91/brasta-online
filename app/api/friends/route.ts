import { NextResponse } from 'next/server';
import { verifyBrastaAccessToken } from '../../../lib/supabase-auth';
import {
  acceptFriendRequest,
  blockFriend,
  deleteFriendship,
  friendRateLimit,
  getFriendsSnapshot,
  presenceHeartbeat,
  sendFriendRequest,
  unblockFriend,
} from '../../../lib/friends';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function tokenFrom(request: Request): string {
  return (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
}

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  try {
    const token = tokenFrom(request);
    if (!token) return json({ error: 'Sign in to use friends.' }, 401);
    const identity = await verifyBrastaAccessToken(token);
    if (!identity?.userId) return json({ error: 'Your Brasta session has expired.' }, 401);

    const body = await request.json().catch(() => ({})) as {
      action?: string;
      username?: string;
      relationshipId?: string;
      userId?: string;
    };
    const action = String(body.action || 'status');

    if (action === 'presence') {
      await presenceHeartbeat(identity.userId);
      return json({ state: 'ok' });
    }

    if (action === 'status') {
      await friendRateLimit(identity.userId, 'read', 120);
      return json({ state: 'ok', ...(await getFriendsSnapshot(identity.userId)) });
    }

    await friendRateLimit(identity.userId, 'write', 30);

    if (action === 'send') {
      const result = await sendFriendRequest(identity.userId, body.username);
      return json({ state: result.accepted ? 'accepted' : 'sent', target: result.target, ...(await getFriendsSnapshot(identity.userId)) });
    }
    if (action === 'accept') {
      await acceptFriendRequest(identity.userId, String(body.relationshipId || ''));
      return json({ state: 'accepted', ...(await getFriendsSnapshot(identity.userId)) });
    }
    if (action === 'decline') {
      await deleteFriendship(identity.userId, String(body.relationshipId || ''), 'incoming');
      return json({ state: 'declined', ...(await getFriendsSnapshot(identity.userId)) });
    }
    if (action === 'cancel') {
      await deleteFriendship(identity.userId, String(body.relationshipId || ''), 'outgoing');
      return json({ state: 'canceled', ...(await getFriendsSnapshot(identity.userId)) });
    }
    if (action === 'remove') {
      await deleteFriendship(identity.userId, String(body.relationshipId || ''));
      return json({ state: 'removed', ...(await getFriendsSnapshot(identity.userId)) });
    }
    if (action === 'block') {
      await blockFriend(identity.userId, String(body.userId || ''));
      return json({ state: 'blocked', ...(await getFriendsSnapshot(identity.userId)) });
    }
    if (action === 'unblock') {
      await unblockFriend(identity.userId, String(body.userId || ''));
      return json({ state: 'unblocked', ...(await getFriendsSnapshot(identity.userId)) });
    }

    return json({ error: 'Unsupported friends action.' }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Friends service request failed.';
    const status = /sign in|session has expired/i.test(message) ? 401
      : /not configured|backend/i.test(message) ? 503
      : /too many/i.test(message) ? 429
      : 400;
    console.error('[brasta friends api]', error);
    return json({ error: message }, status);
  }
}
