import Redis from 'ioredis';
import { settings } from '../config/settings';

let redis: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(settings.REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
    });

    redis.on('error', (err) => {
      console.error('[redis] Connection error:', err.message);
    });

    redis.on('connect', () => {
      console.info('[redis] Connected');
    });
  }
  return redis;
}

export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}
