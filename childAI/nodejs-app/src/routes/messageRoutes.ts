import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { authenticate } from '../middleware/authMiddleware';
import { rateLimitFor } from '../middleware/rateLimitMiddleware';
import { canAccessConversation } from '../auth/ownership';
import { sendMessage } from '../services/messageService';
import {
  getIdempotencyRecord,
  markIdempotencyPending,
  markIdempotencyComplete,
  clearIdempotencyRecord,
} from '../services/idempotency/idempotencyService';
import {
  findMessageById,
  setMessageFeedback,
} from '../repositories/messageRepository';

const MessageBody = Type.Object({
  content: Type.String({ minLength: 1, maxLength: 10000 }),
  idempotency_key: Type.Optional(Type.String()),
});

const MessageParams = Type.Object({
  conversationId: Type.String({ format: 'uuid' }),
});

export const messageRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/conversations/:conversationId/messages
  fastify.post(
    '/api/conversations/:conversationId/messages',
    {
      schema: {
        tags: ['messages'],
        summary: 'Send a message (non-streaming)',
        security: [{ bearerAuth: [] }, { apiKey: [] }],
        params: MessageParams,
        body: MessageBody,
      },
      preHandler: [authenticate, rateLimitFor('message')],
    },
    async (request, reply) => {
      const user = request.user!;
      const { conversationId } = request.params as { conversationId: string };
      const body = request.body as { content: string; idempotency_key?: string };

      // Only learners may post learner messages. Parents/teachers use guidance endpoints.
      if (user.role !== 'learner' && user.role !== 'admin' && user.role !== 'service') {
        return reply.status(403).send({
          error: 'Only learners may send messages here. Adults use guidance endpoints.',
        });
      }

      const allowed = await canAccessConversation(conversationId, user.dbId, user.role);
      if (!allowed) {
        return reply.status(403).send({ error: 'Access denied to this conversation' });
      }

      // Idempotency: return cached result if this key was already processed
      if (body.idempotency_key) {
        const existing = await getIdempotencyRecord(user.dbId, body.idempotency_key);
        if (existing) {
          if (existing.status === 'pending') {
            return reply.status(409).send({ error: 'Request with this idempotency key is already in progress' });
          }
          return reply.status(200).send(existing.result);
        }
        await markIdempotencyPending(user.dbId, body.idempotency_key);
      }

      let result;
      try {
        result = await sendMessage({
          conversationId,
          learnerDbId: user.dbId,
          content: body.content,
          requestId: request.requestId,
        });
      } catch (err) {
        if (body.idempotency_key) {
          await clearIdempotencyRecord(user.dbId, body.idempotency_key);
        }
        throw err;
      }

      if (body.idempotency_key) {
        await markIdempotencyComplete(user.dbId, body.idempotency_key, result);
      }

      return reply.status(200).send(result);
    }
  );

  const FeedbackBody = Type.Object({
    score: Type.Union([Type.Literal(-1), Type.Literal(1), Type.Null()]),
  });

  const FeedbackParams = Type.Object({
    messageId: Type.String({ format: 'uuid' }),
  });

  // PATCH /api/messages/:messageId/feedback
  fastify.patch(
    '/api/messages/:messageId/feedback',
    {
      schema: {
        tags: ['messages'],
        summary: 'Set thumbs up/down feedback on an assistant message',
        security: [{ bearerAuth: [] }],
        params: FeedbackParams,
        body: FeedbackBody,
      },
      preHandler: [authenticate],
    },
    async (request, reply) => {
      const user = request.user!;
      const { messageId } = request.params as { messageId: string };
      const { score } = request.body as { score: -1 | 1 | null };

      const msg = await findMessageById(messageId);
      if (!msg) return reply.status(404).send({ error: 'Message not found' });
      if (msg.role !== 'assistant') {
        return reply.status(400).send({ error: 'Feedback only applies to assistant messages' });
      }

      const allowed = await canAccessConversation(msg.conversation_id, user.dbId, user.role);
      if (!allowed) return reply.status(403).send({ error: 'Access denied' });

      await setMessageFeedback(messageId, score);
      return reply.status(204).send();
    },
  );
};
