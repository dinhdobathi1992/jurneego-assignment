import { FastifyRequest } from 'fastify';
import { createRemoteJWKSet, jwtVerify, decodeJwt } from 'jose';
import { createHmac } from 'crypto';
import { settings } from '../config/settings';

export interface AuthenticatedUser {
  sub: string;          // external subject (JWT sub claim)
  role: string;         // primary role from JWT
  userId?: string;      // local DB user id (set after upsert)
}

// JWKS remote key set (cached after first fetch)
let remoteJwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks() {
  if (!remoteJwks && settings.JWT_JWKS_URL) {
    remoteJwks = createRemoteJWKSet(new URL(settings.JWT_JWKS_URL));
  }
  return remoteJwks;
}

/**
 * Validate a JWT using JWKS (production) or HS256 dev secret (development).
 * Returns the authenticated user payload on success, throws on failure.
 */
export async function verifyJwt(token: string): Promise<AuthenticatedUser> {
  // Dev mode: HS256 with DEV_JWT_SECRET
  if (settings.APP_ENV !== 'production' && settings.DEV_JWT_SECRET) {
    try {
      const secret = new TextEncoder().encode(settings.DEV_JWT_SECRET);
      const { payload } = await jwtVerify(token, secret, {
        issuer: settings.JWT_ISSUER,
        audience: settings.JWT_AUDIENCE,
      });
      return {
        sub: payload.sub as string,
        role: (payload['role'] as string) ?? (payload['primary_role'] as string) ?? 'learner',
      };
    } catch {
      // fall through to JWKS if dev secret fails
    }
  }

  // Production: JWKS validation
  const jwks = getJwks();
  if (!jwks) {
    throw new Error('JWKS not configured');
  }

  const { payload } = await jwtVerify(token, jwks, {
    issuer: settings.JWT_ISSUER,
    audience: settings.JWT_AUDIENCE,
  });

  return {
    sub: payload.sub as string,
    role: (payload['role'] as string) ?? (payload['primary_role'] as string) ?? 'learner',
  };
}

/**
 * Validate a dev API key header (X-API-Key).
 * Only works in non-production environments.
 */
export function verifyApiKey(apiKey: string): AuthenticatedUser | null {
  if (settings.APP_ENV === 'production') return null;
  if (!settings.DEV_API_KEY) return null;

  // Constant-time comparison
  const expected = settings.DEV_API_KEY;
  if (apiKey.length !== expected.length) return null;

  let diff = 0;
  for (let i = 0; i < apiKey.length; i++) {
    diff |= apiKey.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  if (diff !== 0) return null;

  return { sub: 'dev-service', role: 'service' };
}

/**
 * Extract Bearer token from Authorization header.
 */
export function extractBearerToken(request: FastifyRequest): string | null {
  const auth = request.headers['authorization'];
  if (!auth || !auth.startsWith('Bearer ')) return null;
  return auth.slice(7);
}
