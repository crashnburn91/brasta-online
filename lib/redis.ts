import Redis from 'ioredis';

const url = process.env.REDIS_URL;
const ROOM_KEY_PREFIX = 'brasta:room:';

// Room game state is versioned by `revision`. A reconnect previously had a
// narrow race where an older room snapshot could be saved after a newer move.
// Enforce monotonic room revisions at the shared Redis boundary so no writer can
// ever move an active room backwards.
const MONOTONIC_ROOM_SET = `
local current = redis.call('get', KEYS[1])
if current then
  local current_ok, current_room = pcall(cjson.decode, current)
  local incoming_ok, incoming_room = pcall(cjson.decode, ARGV[1])
  if current_ok and incoming_ok and current_room['revision'] ~= nil and incoming_room['revision'] ~= nil then
    local current_revision = tonumber(current_room['revision'])
    local incoming_revision = tonumber(incoming_room['revision'])
    if current_revision and incoming_revision and current_revision > incoming_revision then
      return {0, current_revision}
    end
  end
end
redis.call('set', KEYS[1], ARGV[1], 'EX', ARGV[2])
return {1, -1}
`;

export function roomRevisionWouldRewind(currentRevision: unknown, incomingRevision: unknown): boolean {
  const current = Number(currentRevision);
  const incoming = Number(incomingRevision);
  return Number.isFinite(current) && Number.isFinite(incoming) && current > incoming;
}

function installMonotonicRoomGuard(client: Redis): void {
  const originalSet = (client.set as any).bind(client) as (...args: any[]) => Promise<any>;

  (client as any).set = (...args: any[]) => {
    const [rawKey, value, ...options] = args;
    const key = String(rawKey ?? '');
    const upperOptions = options.map((option) => String(option).toUpperCase());
    const exIndex = upperOptions.indexOf('EX');
    const conditional = upperOptions.includes('NX') || upperOptions.includes('XX');

    if (key.startsWith(ROOM_KEY_PREFIX) && typeof value === 'string' && exIndex >= 0 && !conditional) {
      const ttlSeconds = Number(options[exIndex + 1]);
      let incomingRevision: number | null = null;
      try {
        const parsed = JSON.parse(value) as { revision?: unknown };
        const revision = Number(parsed?.revision);
        if (Number.isFinite(revision)) incomingRevision = revision;
      } catch {}

      if (incomingRevision !== null && Number.isFinite(ttlSeconds) && ttlSeconds > 0) {
        return client.eval(MONOTONIC_ROOM_SET, 1, key, value, String(Math.floor(ttlSeconds)))
          .then((result: any) => {
            const tuple = Array.isArray(result) ? result : [result];
            if (Number(tuple[0]) === 0) {
              console.warn('[brasta redis] blocked stale room write', {
                room: key.slice(ROOM_KEY_PREFIX.length),
                incomingRevision,
                currentRevision: Number(tuple[1]),
              });
            }
            // Preserve the normal Redis SET contract for callers. A stale write
            // is deliberately treated as a successful no-op because the newer
            // authoritative room state already won.
            return 'OK';
          });
      }
    }

    return originalSet(...args);
  };
}

export const redis: Redis | null = url
  ? new Redis(url, {
      maxRetriesPerRequest: null,
      retryStrategy: (times) => Math.min(times * 200, 5000),
    })
  : null;

if (redis) installMonotonicRoomGuard(redis);

export function duplicateRedis(): Redis | null {
  return redis ? redis.duplicate() : null;
}

export function redisConfigured(): boolean { return !!redis; }
