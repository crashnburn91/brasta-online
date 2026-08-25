import { redis } from './redis';
import { verifyBrastaAccessToken } from './supabase-auth';
import type { CompetitiveMode } from './competitive';

const ONE_QUEUE = 'brasta:ranked:queue:1v1';
const TWO_QUEUE = 'brasta:ranked:queue:2v2';
const oneQueueData = (userId: string) => `brasta:ranked:queue:data:${userId}`;
const twoQueueData = (userId: string) => `brasta:ranked:queue:2v2:data:${userId}`;
const oneAssignment = (userId: string) => `brasta:ranked:assignment:${userId}`;
const twoAssignment = (userId: string) => `brasta:ranked:assignment:2v2:${userId}`;

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
    await redis.zrem(TWO_QUEUE, userId);
    await redis.del(twoQueueData(userId));
    return;
  }

  if (await redis.exists(oneAssignment(userId))) {
    throw new Error('Finish your current ranked 1v1 match before joining ranked 2v2.');
  }
  await redis.zrem(ONE_QUEUE, userId);
  await redis.del(oneQueueData(userId));
}
