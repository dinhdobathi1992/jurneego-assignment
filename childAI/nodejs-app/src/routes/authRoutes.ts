import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { SignJWT } from 'jose';
import { settings } from '../config/settings';
import { getPool } from '../db/pool';

const GoogleTokenBody = Type.Object({
  id_token:     Type.Optional(Type.String()),
  access_token: Type.String({ minLength: 1 }),
});

const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

// Parse "email:role,email2:role2" → { email: role }
function parseRoleMap(raw: string): Record<string, string> {
  return Object.fromEntries(
    raw.split(',')
       .map(e => e.trim().split(':'))
       .filter(([email, role]) => email && role)
       .map(([email, role]) => [email.toLowerCase(), role.toLowerCase()])
  );
}

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    '/api/auth/google',
    {
      schema: {
        tags: ['auth'],
        summary: 'Exchange Google access_token for app JWT',
        body: GoogleTokenBody,
      },
    },
    async (request, reply) => {
      const { access_token } = request.body as { id_token?: string; access_token: string };

      // Fetch user info from Google using access_token — no JWT verification needed
      let googleUser: Record<string, string>;
      try {
        const res = await fetch(GOOGLE_USERINFO_URL, {
          headers: { Authorization: `Bearer ${access_token}` },
        });
        googleUser = (await res.json()) as Record<string, string>;

        request.log.info({ googleUser }, 'Google userinfo response');

        if (googleUser.error || !googleUser.sub) {
          request.log.warn({ error: googleUser.error }, 'Google userinfo error');
          return reply.status(401).send({ message: 'Invalid Google token' });
        }
      } catch (err) {
        request.log.error({ err }, 'Google userinfo fetch failed');
        return reply.status(401).send({ message: 'Token verification failed' });
      }

      const externalSubject = googleUser.sub;
      const email           = googleUser.email ?? '';
      // Use trim + || so empty string from Google falls through to email, then 'User'
      const displayName     = googleUser.name?.trim() || googleUser.email?.trim() || 'User';

      if (!externalSubject) {
        return reply.status(401).send({ message: 'Invalid token payload' });
      }

      // Resolve role: ROLE_MAP env var takes priority, then DB, then default learner
      // Format: ROLE_MAP=email@example.com:teacher,other@example.com:parent
      const roleMap = parseRoleMap(process.env.ROLE_MAP ?? '');
      const mappedRole = roleMap[email.toLowerCase()];

      const db = getPool();
      let role = 'learner';

      try {
        const existing = await db.query(
          `SELECT id, primary_role FROM users WHERE external_subject = $1 LIMIT 1`,
          [externalSubject]
        );

        if (existing.rows.length > 0) {
          role = mappedRole ?? existing.rows[0].primary_role;
          // Only overwrite display_name if Google returned a real non-empty value
          await db.query(
            `UPDATE users SET display_name = COALESCE(NULLIF($1, 'User'), display_name), primary_role = $2 WHERE external_subject = $3`,
            [displayName, role, externalSubject]
          );
        } else {
          role = mappedRole ?? 'learner';
          const inserted = await db.query(
            `INSERT INTO users (external_subject, primary_role, display_name, preferred_language)
             VALUES ($1, $2, $3, 'en')
             RETURNING id, primary_role`,
            [externalSubject, role, displayName]
          );
          role = inserted.rows[0].primary_role;
        }
      } catch (err) {
        request.log.error({ err }, 'DB error during user upsert');
        return reply.status(500).send({ message: 'Internal error' });
      }

      // Issue app JWT signed with DEV_JWT_SECRET
      const secret = new TextEncoder().encode(
        settings.DEV_JWT_SECRET ?? 'fallback-dev-secret-must-be-32chars!!'
      );

      const token = await new SignJWT({ sub: externalSubject, role, email })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setIssuer('bubbli')
        .setExpirationTime('8h')
        .sign(secret);

      return reply.status(200).send({ token, role, display_name: displayName });
    }
  );
};
