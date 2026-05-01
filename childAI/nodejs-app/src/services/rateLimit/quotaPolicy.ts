export interface QuotaPolicy {
  key: string;
  limit: number;
  windowMs: number;
  description: string;
}

/**
 * Build the list of rate limit checks to apply for a given context.
 */
export function buildQuotaPolicies(context: {
  ip?: string;
  userId?: string;
  route: 'message' | 'moderation' | 'parent' | 'teacher' | 'translation' | 'general';
}): QuotaPolicy[] {
  const policies: QuotaPolicy[] = [];

  // IP burst limit — all routes
  if (context.ip) {
    policies.push({
      key: `ip:${context.ip}:general`,
      limit: 100,
      windowMs: 60_000, // 1 minute
      description: 'IP burst limit',
    });
  }

  // Per-route limits
  if (context.userId) {
    switch (context.route) {
      case 'message':
        policies.push({
          key: `user:${context.userId}:ai:min`,
          limit: 10,
          windowMs: 60_000,
          description: 'Learner AI message rate (per minute)',
        });
        break;

      case 'moderation':
        policies.push({
          key: `user:${context.userId}:moderation`,
          limit: 60,
          windowMs: 60_000,
          description: 'Moderation route limit',
        });
        break;

      case 'parent':
        policies.push({
          key: `user:${context.userId}:parent`,
          limit: 120,
          windowMs: 60_000,
          description: 'Parent dashboard limit',
        });
        break;

      case 'teacher':
        policies.push({
          key: `user:${context.userId}:teacher`,
          limit: 180,
          windowMs: 60_000,
          description: 'Teacher dashboard limit',
        });
        break;

      case 'translation':
        policies.push({
          key: `user:${context.userId}:translation`,
          limit: 30,
          windowMs: 3_600_000, // 1 hour
          description: 'Parent translation limit',
        });
        break;
    }
  }

  return policies;
}
