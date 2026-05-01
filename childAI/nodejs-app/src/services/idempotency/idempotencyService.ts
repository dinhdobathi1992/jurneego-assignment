import { getRedis } from '../../db/redis';

const TTL_SECONDS = 86400; // 24 hours — long enough to cover any retry window

export type IdempotencyStatus = 'pending' | 'complete';

export interface IdempotencyRecord<T = unknown> {
  status: IdempotencyStatus;
  result?: T;
}

function redisKey(userId: string, key: string): string {
  return `idempotency:${userId}:${key}`;
}

/**
 * Check if a request with this key already exists for this user.
 * Returns null if no record exists (caller should proceed normally).
 * Returns the stored record if a prior attempt is found (return cached result or 409 if still pending).
 */
export async function getIdempotencyRecord<T>(
  userId: string,
  key: string
): Promise<IdempotencyRecord<T> | null> {
  const redis = getRedis();
  const raw = await redis.get(redisKey(userId, key));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as IdempotencyRecord<T>;
  } catch {
    return null;
  }
}

/**
 * Mark a key as in-flight (pending). Call before starting the operation.
 */
export async function markIdempotencyPending(userId: string, key: string): Promise<void> {
  const redis = getRedis();
  const record: IdempotencyRecord = { status: 'pending' };
  await redis.set(redisKey(userId, key), JSON.stringify(record), 'EX', TTL_SECONDS);
}

/**
 * Store the completed result for a key. Call after the operation succeeds.
 */
export async function markIdempotencyComplete<T>(
  userId: string,
  key: string,
  result: T
): Promise<void> {
  const redis = getRedis();
  const record: IdempotencyRecord<T> = { status: 'complete', result };
  await redis.set(redisKey(userId, key), JSON.stringify(record), 'EX', TTL_SECONDS);
}

/**
 * Remove an idempotency record (e.g. if the operation failed unrecoverably).
 */
export async function clearIdempotencyRecord(userId: string, key: string): Promise<void> {
  const redis = getRedis();
  await redis.del(redisKey(userId, key));
}
