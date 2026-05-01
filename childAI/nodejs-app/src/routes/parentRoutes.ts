import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { authenticate, requireRole } from '../middleware/authMiddleware';
import { rateLimitFor } from '../middleware/rateLimitMiddleware';
import { isLinkedParent } from '../auth/ownership';
import {
  getChildrenForParent,
  getChildSessions,
  getChildConversations,
  getChildConversationMessages,
} from '../services/parentViewService';
import { addGuidanceNote, getSessionGuidance } from '../services/guidanceService';
import { translateMessage } from '../services/translationService';
import { getDb } from '../db/kysely';
import { adultViewRequestsTotal } from '../services/observability/metrics';

export const parentRoutes: FastifyPluginAsync = async (fastify) => {
  const parentGuard = requireRole('parent', 'admin');

  // GET /api/parent/children
  fastify.get(
    '/api/parent/children',
    {
      schema: { tags: ['parent'], summary: 'List linked children', security: [{ bearerAuth: [] }, { apiKey: [] }] },
      preHandler: [authenticate, parentGuard, rateLimitFor('parent')],
    },
    async (request, reply) => {
      const user = request.user!;
      // Admin sees all users who have at least one conversation (mirrors teacher virtual classroom)
      if (user.role === 'admin') {
        adultViewRequestsTotal.inc({ role: 'admin', endpoint: 'list_children' });
        const db = getDb();
        const rows = await db
          .selectFrom('users as u')
          .innerJoin('conversations as c', 'c.learner_user_id', 'u.id')
          .select(['u.id', 'u.display_name', 'u.external_subject', 'u.primary_role'])
          .groupBy(['u.id', 'u.display_name', 'u.external_subject', 'u.primary_role'])
          .orderBy('u.display_name', 'asc')
          .execute();
        return reply.send({
          children: (rows as any[]).map(r => ({
            id: r.id,
            name: (r.display_name?.trim() || null) ?? (/^\d+$/.test(String(r.external_subject ?? '')) ? null : String(r.external_subject).slice(0, 20)) ?? 'Learner',
            display_name: r.display_name,
            primary_role: r.primary_role,
            relationship_type: 'admin_view',
          })),
        });
      }
      const children = await getChildrenForParent(request.user!.dbId);
      return reply.send({ children });
    }
  );

  // GET /api/parent/children/:childId/sessions
  fastify.get(
    '/api/parent/children/:childId/sessions',
    {
      schema: {
        tags: ['parent'],
        summary: 'List sessions for a linked child',
        security: [{ bearerAuth: [] }, { apiKey: [] }],
        params: Type.Object({ childId: Type.String({ format: 'uuid' }) }),
      },
      preHandler: [authenticate, parentGuard, rateLimitFor('parent')],
    },
    async (request, reply) => {
      const { childId } = request.params as { childId: string };
      const user = request.user!;
      if (user.role !== 'admin') {
        const linked = await isLinkedParent(user.dbId, childId);
        if (!linked) return reply.status(403).send({ error: 'Not linked to this child' });
      }
      const sessions = await getChildSessions(user.dbId, childId, request.requestId);
      return reply.send({ sessions });
    }
  );

  // GET /api/parent/children/:childId/conversations
  fastify.get(
    '/api/parent/children/:childId/conversations',
    {
      schema: {
        tags: ['parent'],
        summary: 'List conversations for a linked child',
        security: [{ bearerAuth: [] }, { apiKey: [] }],
        params: Type.Object({ childId: Type.String({ format: 'uuid' }) }),
        querystring: Type.Object({
          limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50, default: 20 })),
        }),
      },
      preHandler: [authenticate, parentGuard, rateLimitFor('parent')],
    },
    async (request, reply) => {
      const { childId } = request.params as { childId: string };
      const { limit } = request.query as { limit?: number };
      const user = request.user!;
      if (user.role !== 'admin') {
        const linked = await isLinkedParent(user.dbId, childId);
        if (!linked) return reply.status(403).send({ error: 'Not linked to this child' });
      }
      const conversations = await getChildConversations(user.dbId, childId, request.requestId, limit ?? 20);
      return reply.send({ conversations });
    }
  );

  // GET /api/parent/conversations/:conversationId/messages
  fastify.get(
    '/api/parent/conversations/:conversationId/messages',
    {
      schema: {
        tags: ['parent'],
        summary: 'Read messages in a child conversation',
        security: [{ bearerAuth: [] }, { apiKey: [] }],
        params: Type.Object({ conversationId: Type.String({ format: 'uuid' }) }),
      },
      preHandler: [authenticate, parentGuard, rateLimitFor('parent')],
    },
    async (request, reply) => {
      const { conversationId } = request.params as { conversationId: string };
      const user = request.user!;
      const messages = await getChildConversationMessages(user.dbId, conversationId, request.requestId);
      return reply.send({ messages });
    }
  );

  // POST /api/parent/sessions/:sessionId/guidance
  fastify.post(
    '/api/parent/sessions/:sessionId/guidance',
    {
      schema: {
        tags: ['parent'],
        summary: 'Add a guidance note to a session',
        security: [{ bearerAuth: [] }, { apiKey: [] }],
        params: Type.Object({ sessionId: Type.String({ format: 'uuid' }) }),
        body: Type.Object({
          guidance_type: Type.String(),
          content: Type.String({ minLength: 1, maxLength: 5000 }),
          conversation_id: Type.Optional(Type.String({ format: 'uuid' })),
          target_message_id: Type.Optional(Type.String({ format: 'uuid' })),
          visibility: Type.Optional(Type.Union([
            Type.Literal('adult_only'),
            Type.Literal('child_visible'),
          ])),
        }),
      },
      preHandler: [authenticate, parentGuard, rateLimitFor('parent')],
    },
    async (request, reply) => {
      const { sessionId } = request.params as { sessionId: string };
      const body = request.body as {
        guidance_type: string;
        content: string;
        conversation_id?: string;
        target_message_id?: string;
        visibility?: string;
      };
      const user = request.user!;

      const note = await addGuidanceNote(
        {
          session_id: sessionId,
          conversation_id: body.conversation_id,
          target_message_id: body.target_message_id,
          author_user_id: user.dbId,
          author_role: 'parent',
          guidance_type: body.guidance_type,
          content: body.content,
          visibility: body.visibility ?? 'adult_only',
        },
        request.requestId
      );

      return reply.status(201).send({ note });
    }
  );

  // GET /api/parent/sessions/:sessionId/guidance
  fastify.get(
    '/api/parent/sessions/:sessionId/guidance',
    {
      schema: {
        tags: ['parent'],
        summary: 'List guidance notes for a session',
        security: [{ bearerAuth: [] }, { apiKey: [] }],
        params: Type.Object({ sessionId: Type.String({ format: 'uuid' }) }),
      },
      preHandler: [authenticate, parentGuard, rateLimitFor('parent')],
    },
    async (request, reply) => {
      const { sessionId } = request.params as { sessionId: string };
      const guidance = await getSessionGuidance(sessionId, 'parent');
      return reply.send({ guidance });
    }
  );

  // POST /api/parent/messages/:messageId/translate
  fastify.post(
    '/api/parent/messages/:messageId/translate',
    {
      schema: {
        tags: ['parent'],
        summary: 'Translate a message to a target language',
        security: [{ bearerAuth: [] }, { apiKey: [] }],
        params: Type.Object({ messageId: Type.String({ format: 'uuid' }) }),
        body: Type.Object({
          target_language: Type.String({ minLength: 2, maxLength: 10 }),
        }),
      },
      preHandler: [authenticate, parentGuard, rateLimitFor('translation')],
    },
    async (request, reply) => {
      const { messageId } = request.params as { messageId: string };
      const { target_language } = request.body as { target_language: string };
      const user = request.user!;

      const translation = await translateMessage({
        messageId,
        targetLanguage: target_language,
        requestedByUserId: user.dbId,
        requestId: request.requestId,
      });

      return reply.send({ translation });
    }
  );
};
