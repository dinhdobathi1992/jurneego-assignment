import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { authenticate, requireRole } from '../middleware/authMiddleware';
import { rateLimitFor } from '../middleware/rateLimitMiddleware';
import {
  listFlaggedForReview,
  getFlaggedConversationDetail,
  reviewFlagById,
} from '../services/moderationService';

export const moderationRoutes: FastifyPluginAsync = async (fastify) => {
  const teacherAdminGuard = requireRole('teacher', 'admin');

  // GET /api/moderation/flagged
  fastify.get(
    '/api/moderation/flagged',
    {
      schema: { tags: ['moderation'], summary: 'List unreviewed flags (scoped to assigned students for teachers)', security: [{ bearerAuth: [] }, { apiKey: [] }] },
      preHandler: [authenticate, teacherAdminGuard, rateLimitFor('moderation')],
    },
    async (request, reply) => {
      const user = request.user!;
      const flags = await listFlaggedForReview(20, user.dbId, user.role);
      return reply.send({ flags });
    }
  );

  // GET /api/moderation/flagged/:conversationId
  fastify.get(
    '/api/moderation/flagged/:conversationId',
    {
      schema: {
        tags: ['moderation'],
        summary: 'Get flagged conversation details (teachers see only assigned students)',
        security: [{ bearerAuth: [] }, { apiKey: [] }],
        params: Type.Object({ conversationId: Type.String({ format: 'uuid' }) }),
      },
      preHandler: [authenticate, teacherAdminGuard, rateLimitFor('moderation')],
    },
    async (request, reply) => {
      const user = request.user!;
      const { conversationId } = request.params as { conversationId: string };
      const detail = await getFlaggedConversationDetail(conversationId, user.dbId, user.role);
      if (!detail) return reply.status(404).send({ error: 'Not found' });
      return reply.send(detail);
    }
  );

  // PATCH /api/moderation/flags/:flagId/review
  fastify.patch(
    '/api/moderation/flags/:flagId/review',
    {
      schema: {
        tags: ['moderation'],
        summary: 'Mark a flag as reviewed',
        security: [{ bearerAuth: [] }, { apiKey: [] }],
        params: Type.Object({ flagId: Type.String({ format: 'uuid' }) }),
        body: Type.Object({
          reviewer_notes: Type.Optional(Type.String({ maxLength: 2000 })),
        }),
      },
      preHandler: [authenticate, teacherAdminGuard],
    },
    async (request, reply) => {
      const { flagId } = request.params as { flagId: string };
      const body = request.body as { reviewer_notes?: string };
      const user = request.user!;

      await reviewFlagById({
        flagId,
        reviewerUserId: user.dbId,
        reviewerRole: user.role,
        reviewerNotes: body.reviewer_notes,
        requestId: request.requestId,
      });

      return reply.status(200).send({ ok: true });
    }
  );
};
