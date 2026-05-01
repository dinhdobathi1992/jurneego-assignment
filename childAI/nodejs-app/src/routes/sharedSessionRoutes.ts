import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { authenticate } from '../middleware/authMiddleware';
import { rateLimitFor } from '../middleware/rateLimitMiddleware';
import { canAccessConversation } from '../auth/ownership';
import { getDb } from '../db/kysely';
import {
  getSharedSessionDetail,
  getSessionTimeline,
  getLearnerSessions,
} from '../services/sharedSessionService';
import { getSessionGuidance } from '../services/guidanceService';
import { listObjectivesForSession } from '../repositories/learningObjectiveRepository';

export const sharedSessionRoutes: FastifyPluginAsync = async (fastify) => {

  // GET /api/shared-sessions — learner's own sessions
  fastify.get(
    '/api/shared-sessions',
    {
      schema: { tags: ['shared-sessions'], summary: 'List sessions for current learner', security: [{ bearerAuth: [] }, { apiKey: [] }] },
      preHandler: [authenticate, rateLimitFor('general')],
    },
    async (request, reply) => {
      const sessions = await getLearnerSessions(request.user!.dbId);
      return reply.send({ sessions });
    }
  );

  // GET /api/shared-sessions/:sessionId
  fastify.get(
    '/api/shared-sessions/:sessionId',
    {
      schema: {
        tags: ['shared-sessions'],
        summary: 'Get session detail with participants, guidance, and objectives',
        security: [{ bearerAuth: [] }, { apiKey: [] }],
        params: Type.Object({ sessionId: Type.String({ format: 'uuid' }) }),
      },
      preHandler: [authenticate, rateLimitFor('general')],
    },
    async (request, reply) => {
      const { sessionId } = request.params as { sessionId: string };
      const user = request.user!;

      // Verify access: admin, session participant, or linked parent/teacher
      const db = getDb();
      if (user.role !== 'admin') {
        const participant = await db
          .selectFrom('session_participants')
          .select('id')
          .where('session_id', '=', sessionId)
          .where('user_id', '=', user.dbId)
          .where('left_at', 'is', null)
          .executeTakeFirst();
        if (!participant) return reply.status(403).send({ error: 'Not a participant in this session' });
      }

      const detail = await getSharedSessionDetail(sessionId, user.role);
      if (!detail) return reply.status(404).send({ error: 'Session not found' });

      return reply.send(detail);
    }
  );

  // GET /api/shared-sessions/:sessionId/timeline
  fastify.get(
    '/api/shared-sessions/:sessionId/timeline',
    {
      schema: {
        tags: ['shared-sessions'],
        summary: 'Get conversation timeline for a shared session',
        security: [{ bearerAuth: [] }, { apiKey: [] }],
        params: Type.Object({ sessionId: Type.String({ format: 'uuid' }) }),
      },
      preHandler: [authenticate, rateLimitFor('general')],
    },
    async (request, reply) => {
      const { sessionId } = request.params as { sessionId: string };
      const user = request.user!;

      const db = getDb();
      const session = await db
        .selectFrom('shared_sessions')
        .select(['id', 'learner_user_id'])
        .where('id', '=', sessionId)
        .executeTakeFirst();
      if (!session) return reply.status(404).send({ error: 'Session not found' });

      const timeline = await getSessionTimeline(sessionId, session.learner_user_id);
      return reply.send({ timeline });
    }
  );

  // GET /api/shared-sessions/:sessionId/guidance
  fastify.get(
    '/api/shared-sessions/:sessionId/guidance',
    {
      schema: {
        tags: ['shared-sessions'],
        summary: 'List guidance notes (filtered by caller role)',
        security: [{ bearerAuth: [] }, { apiKey: [] }],
        params: Type.Object({ sessionId: Type.String({ format: 'uuid' }) }),
      },
      preHandler: [authenticate, rateLimitFor('general')],
    },
    async (request, reply) => {
      const { sessionId } = request.params as { sessionId: string };
      const guidance = await getSessionGuidance(sessionId, request.user!.role);
      return reply.send({ guidance });
    }
  );

  // GET /api/shared-sessions/:sessionId/objectives
  fastify.get(
    '/api/shared-sessions/:sessionId/objectives',
    {
      schema: {
        tags: ['shared-sessions'],
        summary: 'List learning objectives for a session',
        security: [{ bearerAuth: [] }, { apiKey: [] }],
        params: Type.Object({ sessionId: Type.String({ format: 'uuid' }) }),
      },
      preHandler: [authenticate, rateLimitFor('general')],
    },
    async (request, reply) => {
      const { sessionId } = request.params as { sessionId: string };
      const objectives = await listObjectivesForSession(sessionId);
      return reply.send({ objectives });
    }
  );
};
