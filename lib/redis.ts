import Redis from 'ioredis';

const url = process.env.REDIS_URL;

export const redis: Redis | null = url
  ? new Redis(url, {
      maxRetriesPerRequest: null,
      retryStrategy: (times) => Math.min(times * 200, 5000),
    })
  : null;

export function duplicateRedis(): Redis | null {
  return redis ? redis.duplicate() : null;
}

export function redisConfigured(): boolean { return !!redis; }
