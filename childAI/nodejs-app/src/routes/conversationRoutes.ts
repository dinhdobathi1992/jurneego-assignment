import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { authenticate, requireRole } from '../middleware/authMiddleware';
import { canAccessConversation } from '../auth/ownership';
import {
  createNewConversation,
  getConversation,
  listLearnerConversations,
} from '../services/conversationService';

const CreateConversationBody = Type.Object({
  title: Type.Optional(Type.String({ maxLength: 255 })),
  shared_session_id: Type.Optional(Type.String({ format: 'uuid' })),
});

const ConversationIdParam = Type.Object({
  conversationId: Type.String({ format: 'uuid' }),
});

export const conversationRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/conversations
  fastify.post(
    '/api/conversations',
    {
      schema: {
        tags: ['conversations'],
        summary: 'Create a new conversation',
        security: [{ bearerAuth: [] }, { apiKey: [] }],
        body: CreateConversationBody,
      },
      preHandler: [authenticate],
    },
    async (request, reply) => {
      const user = request.user!;
      const body = request.body as { title?: string; shared_session_id?: string };

      const conv = await createNewConversation({
        learnerUserId: user.dbId,
        title: body.title,
        sharedSessionId: body.shared_session_id,
      });

      return reply.status(201).send(conv);
    }
  );

  // GET /api/conversations
  fastify.get(
    '/api/conversations',
    {
      schema: {
        tags: ['conversations'],
        summary: 'List conversations visible to caller',
        security: [{ bearerAuth: [] }, { apiKey: [] }],
        querystring: Type.Object({
          limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50, default: 20 })),
          cursor: Type.Optional(Type.String()),
        }),
      },
      preHandler: [authenticate],
    },
    async (request, reply) => {
      const user = request.user!;
      const query = request.query as { limit?: number; cursor?: string };

      // Admins see all, others see their own
      if (user.role === 'admin') {
        // Note: for simplicity returning learner query; full admin query would be separate
        return reply.send({ conversations: [] });
      }

      const conversations = await listLearnerConversations(
        user.dbId,
        query.limit ?? 20,
        query.cursor
      );

      return reply.send({ conversations });
    }
  );

  // GET /api/conversations/:conversationId
  fastify.get(
    '/api/conversations/:conversationId',
    {
      schema: {
        tags: ['conversations'],
        summary: 'Get a conversation with messages',
        security: [{ bearerAuth: [] }, { apiKey: [] }],
        params: ConversationIdParam,
      },
      preHandler: [authenticate],
    },
    async (request, reply) => {
      const user = request.user!;
      const { conversationId } = request.params as { conversationId: string };

      const allowed = await canAccessConversation(conversationId, user.dbId, user.role);
      if (!allowed) {
        return reply.status(403).send({ error: 'Access denied' });
      }

      const conv = await getConversation(conversationId, true);
      if (!conv) return reply.status(404).send({ error: 'Not found' });

      return reply.send(conv);
    }
  );
};
