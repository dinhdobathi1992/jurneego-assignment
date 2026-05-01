import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { verifyJwt, verifyApiKey, extractBearerToken } from '../auth/jwt';
import { hasRole, Role } from '../auth/roles';
import { upsertUser } from '../repositories/userRepository';

declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      sub: string;
      role: string;
      dbId: string;
    };
  }
}

/**
 * Authenticate a request. Sets request.user on success.
 * Returns 401 on failure.
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    let authUser: { sub: string; role: string } | null = null;

    // Try Bearer JWT first
    const token = extractBearerToken(request);
    if (token) {
      authUser = await verifyJwt(token);
    }

    // Fallback: X-API-Key (dev only)
    if (!authUser) {
      const apiKey = request.headers['x-api-key'] as string | undefined;
      if (apiKey) {
        authUser = verifyApiKey(apiKey);
      }
    }

    if (!authUser) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    // Upsert user in local DB and attach dbId
    const dbUser = await upsertUser({
      external_subject: authUser.sub,
      primary_role: authUser.role,
    });

    request.user = {
      sub: authUser.sub,
      role: authUser.role,
      dbId: dbUser.id,
    };

    // Attach to request context for logging
    request.actorUserId = dbUser.id;
    request.actorRole = authUser.role;
  } catch (err) {
    request.log.warn({ err }, 'Authentication failed');
    return reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Invalid or expired token',
    });
  }
}

/**
 * Create a route pre-handler that requires specific roles.
 */
export function requireRole(...roles: Role[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await authenticate(request, reply);
    if (reply.sent) return;

    if (!request.user || !hasRole(request.user.role, ...roles)) {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: `Required role: ${roles.join(' or ')}`,
      });
    }
  };
}

/**
 * Pre-handler that only requires any valid authentication.
 */
export const requireAuth = authenticate;

/**
 * Fastify plugin to attach auth helpers to the instance.
 */
const authMiddlewarePlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate('authenticate', authenticate);
  fastify.decorate('requireRole', requireRole);
};

export const authPlugin = fp(authMiddlewarePlugin, { name: 'auth' });
