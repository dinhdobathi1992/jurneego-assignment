import { getRedis } from '../../db/redis';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Sliding window rate limiter backed by Redis.
 *
 * @param key      Unique key (e.g. "ip:1.2.3.4:msg", "user:uuid:ai")
 * @param limit    Max requests allowed
 * @param windowMs Window size in milliseconds
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const redis = getRedis();
  const now = Date.now();
  const windowStart = now - windowMs;
  const redisKey = `rl:${key}`;

  // Use a Lua script for atomicity
  const luaScript = `
    local key = KEYS[1]
    local now = tonumber(ARGV[1])
    local window_start = tonumber(ARGV[2])
    local limit = tonumber(ARGV[3])
    local window_ms = tonumber(ARGV[4])

    -- Remove expired entries
    redis.call('ZREMRANGEBYSCORE', key, '-inf', window_start)

    -- Count current entries
    local count = redis.call('ZCARD', key)

    if count < limit then
      -- Add current request
      redis.call('ZADD', key, now, now .. '-' .. math.random(1000000))
      -- Set TTL
      redis.call('PEXPIRE', key, window_ms)
      return { count + 1, limit - count - 1, 0 }
    else
      -- Get oldest entry to compute retry-after
      local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
      local retry_after = 0
      if #oldest > 0 then
        retry_after = math.ceil((tonumber(oldest[2]) + window_ms - now) / 1000)
      end
      return { count, 0, retry_after }
    end
  `;

  const result = (await redis.eval(
    luaScript,
    1,
    redisKey,
    String(now),
    String(windowStart),
    String(limit),
    String(windowMs)
  )) as [number, number, number];

  const [count, remaining, retryAfterSeconds] = result;

  return {
    allowed: remaining >= 0 && count <= limit,
    remaining: Math.max(0, remaining),
    retryAfterSeconds,
  };
}

/**
 * Decrement a daily token/request budget stored as a simple counter.
 */
export async function checkDailyBudget(
  userId: string,
  budget: number
): Promise<RateLimitResult> {
  const redis = getRedis();
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const key = `budget:${userId}:${today}`;

  const current = await redis.incr(key);
  if (current === 1) {
    // First request of the day — set TTL to end of day
    const secondsUntilMidnight =
      86400 - (Math.floor(Date.now() / 1000) % 86400);
    await redis.expire(key, secondsUntilMidnight);
  }

  const remaining = budget - current;
  return {
    allowed: remaining >= 0,
    remaining: Math.max(0, remaining),
    retryAfterSeconds: remaining < 0 ? 3600 : 0,
  };
}
