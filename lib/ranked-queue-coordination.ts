import { redis } from './redis';
import { verifyBrastaAccessToken } from './supabase-auth';
import type { CompetitiveMode } from './competitive';

const ONE_QUEUE = 'brasta:ranked:queue:1v1';
const TWO_QUEUE = 'brasta:ranked:queue:2v2';
const oneQueueData = (userId: string) => `brasta:ranked:queue:data:${userId}`;
const twoQueueData = (userId: string) => `brasta:ranked:queue:2v2:data:${userId}`;
const oneAssignment = (userId: string) => `brasta:ranked:assignment:${userId}`;
const twoAssignment = (userId: string) => `brasta:ranked:assignment:2v2:${userId}`;
const twoParty = (partyId: string) => `brasta:ranked:party:2v2:${partyId}`;
const twoPartyCode = (code: string) => `brasta:ranked:party:2v2:code:${code}`;
const twoPartyUser = (userId: string) => `brasta:ranked:party:2v2:user:${userId}`;

function accessToken(request: Request): string {
  return (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
}

export async function prepareRankedQueueSwitch(request: Request, targetMode: CompetitiveMode): Promise<void> {
  if (!redis) return;
  const identity = await verifyBrastaAccessToken(accessToken(request));
  if (!identity?.userId) throw new Error('Sign in before joining ranked matchmaking.');
  const userId = identity.userId;

  if (targetMode === '1v1') {
    if (await redis.exists(twoAssignment(userId))) {
      throw new Error('Finish your current ranked 2v2 match before joining ranked 1v1.');
    }
    const raw = await redis.get(twoQueueData(userId));
    let partnerUserId = '';
    let partyId = '';
    try {
      const entry = raw ? JSON.parse(raw) as { partnerUserId?: string; partyId?: string } : null;
      partnerUserId = String(entry?.partnerUserId || '');
      partyId = String(entry?.partyId || '');
    } catch {}

    if (partnerUserId) {
      await redis.zrem(TWO_QUEUE, userId, partnerUserId);
      await redis.del(twoQueueData(userId), twoQueueData(partnerUserId));
    } else {
      await redis.zrem(TWO_QUEUE, userId);
      await redis.del(twoQueueData(userId));
    }

    if (partyId) {
      const partyRaw = await redis.get(twoParty(partyId));
      try {
        const party = partyRaw ? JSON.parse(partyRaw) as { code?: string; members?: Array<{ userId?: string }> } : null;
        const keys = [
          twoParty(partyId),
          ...(party?.code ? [twoPartyCode(String(party.code))] : []),
          ...((party?.members || []).map((member) => twoPartyUser(String(member.userId || ''))).filter((key) => !key.endsWith(':'))),
        ];
        if (keys.length) await redis.del(...keys);
      } catch {
        await redis.del(twoParty(partyId), twoPartyUser(userId));
      }
    }
    return;
  }

  if (await redis.exists(oneAssignment(userId))) {
    throw new Error('Finish your current ranked 1v1 match before joining ranked 2v2.');
  }
  await redis.zrem(ONE_QUEUE, userId);
  await redis.del(oneQueueData(userId));
}
