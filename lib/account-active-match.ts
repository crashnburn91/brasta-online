import { redis } from './redis';

export type ActiveMatchRef = {
  roomCode: string;
  seat: number;
  mode: '1v1' | '2v2';
  updatedAt: number;
};

const memory = new Map<string, ActiveMatchRef>();
const TTL_SECONDS = 24 * 60 * 60;
const keyFor = (userId: string) => `brasta:account-active-match:${userId}`;

export async function setActiveMatch(userId: string, ref: ActiveMatchRef): Promise<void> {
  if (!userId) return;
  if (!redis) {
    memory.set(userId, ref);
    return;
  }
  await redis.set(keyFor(userId), JSON.stringify(ref), 'EX', TTL_SECONDS);
}

export async function getActiveMatch(userId: string): Promise<ActiveMatchRef | null> {
  if (!userId) return null;
  if (!redis) return memory.get(userId) || null;
  const raw = await redis.get(keyFor(userId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ActiveMatchRef;
    if (!parsed?.roomCode || !parsed?.seat || !parsed?.mode) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function clearActiveMatch(userId: string, roomCode?: string): Promise<void> {
  if (!userId) return;
  if (!redis) {
    const current = memory.get(userId);
    if (!roomCode || current?.roomCode === roomCode) memory.delete(userId);
    return;
  }
  if (!roomCode) {
    await redis.del(keyFor(userId));
    return;
  }
  const current = await getActiveMatch(userId);
  if (current?.roomCode === roomCode) await redis.del(keyFor(userId));
}
