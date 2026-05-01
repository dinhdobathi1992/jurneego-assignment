import { FastifyRequest, FastifyReply } from 'fastify';
import { checkRateLimit } from '../services/rateLimit/limiter';
import { buildQuotaPolicies } from '../services/rateLimit/quotaPolicy';
import { rateLimitBlockedTotal } from '../services/observability/metrics';

type RouteType = 'message' | 'moderation' | 'parent' | 'teacher' | 'translation' | 'general';

/**
 * Pre-handler factory — apply rate limit policies for a given route type.
 */
export function rateLimitFor(route: RouteType) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const userId = request.user?.dbId;
    const ip = request.ip;

    const policies = buildQuotaPolicies({ ip, userId, route });

    for (const policy of policies) {
      const result = await checkRateLimit(policy.key, policy.limit, policy.windowMs);

      if (!result.allowed) {
        rateLimitBlockedTotal.inc({ limit_type: route });
        return reply.status(429).send({
          statusCode: 429,
          error: 'Too Many Requests',
          detail: 'Rate limit exceeded',
          retry_after_seconds: result.retryAfterSeconds,
        });
      }

      // Set standard rate limit headers
      reply.header('X-RateLimit-Limit', policy.limit);
      reply.header('X-RateLimit-Remaining', result.remaining);
    }
  };
}
