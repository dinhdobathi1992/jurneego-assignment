import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { authenticate } from '../middleware/authMiddleware';
import { rateLimitFor } from '../middleware/rateLimitMiddleware';
import { canAccessConversation } from '../auth/ownership';
import { SSEWriter } from '../services/streaming/sseWriter';
import {
  handleStreamingMessage,
  canRegenerate,
} from '../services/streaming/streamMessageService';
import {
  findLatestExchange,
  markMessageRegenerated,
} from '../repositories/messageRepository';

const StreamParams = Type.Object({
  conversationId: Type.String({ format: 'uuid' }),
});

const StreamBody = Type.Object({
  content: Type.String({ minLength: 1, maxLength: 10000 }),
  idempotency_key: Type.Optional(Type.String()),
});

export const streamRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/conversations/:conversationId/messages/stream
  fastify.post(
    '/api/conversations/:conversationId/messages/stream',
    {
      schema: {
        tags: ['streaming'],
        summary: 'Send a message with SSE streaming response',
        security: [{ bearerAuth: [] }, { apiKey: [] }],
        params: StreamParams,
        body: StreamBody,
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
          error: 'Only learners may stream messages here. Adults use guidance endpoints.',
        });
      }

      const allowed = await canAccessConversation(conversationId, user.dbId, user.role);
      if (!allowed) {
        return reply.status(403).send({ error: 'Access denied' });
      }

      const sse = new SSEWriter(reply);
      const abortController = new AbortController();

      // Abort if client disconnects
      sse.onClose(() => abortController.abort());
      sse.start(request.headers.origin ?? '*');

      // Don't await — SSE writes directly to the raw response
      handleStreamingMessage({
        conversationId,
        learnerDbId: user.dbId,
        content: body.content,
        requestId: request.requestId,
        sse,
        abortSignal: abortController.signal,
      }).catch((err) => {
        request.log.error({ err }, 'SSE handler error');
        sse.close();
      });

      // Return the raw reply so Fastify doesn't attempt to serialize
      return reply;
    }
  );

  // POST /api/conversations/:conversationId/regenerate
  fastify.post<{ Params: { conversationId: string } }>(
    '/api/conversations/:conversationId/regenerate',
    {
      schema: {
        tags: ['messages'],
        summary: 'Regenerate the latest assistant reply (SSE stream)',
        security: [{ bearerAuth: [] }],
        params: Type.Object({ conversationId: Type.String({ format: 'uuid' }) }),
      },
      preHandler: [authenticate, rateLimitFor('message')],
    },
    async (request, reply) => {
      const user = request.user!;
      const { conversationId } = request.params;

      const allowed = await canAccessConversation(conversationId, user.dbId, user.role);
      if (!allowed) return reply.status(403).send({ error: 'Access denied' });

      const exchange = await findLatestExchange(conversationId);
      if (!canRegenerate(exchange)) {
        return reply.status(400).send({ error: 'Nothing to regenerate' });
      }

      // Mark previous assistant as regenerated BEFORE the new stream starts,
      // so concurrent listMessages calls don't see both the old and new.
      await markMessageRegenerated(exchange!.assistant.id);

      const sse = new SSEWriter(reply);
      const abortController = new AbortController();

      // Abort if client disconnects
      sse.onClose(() => abortController.abort());
      sse.start(request.headers.origin ?? '*');

      // Don't await — SSE writes directly to the raw response
      handleStreamingMessage({
        conversationId,
        learnerDbId: user.dbId,
        content: exchange!.learner.content,
        requestId: request.requestId,
        sse,
        abortSignal: abortController.signal,
        regenerateFromLearnerMsgId: exchange!.learner.id,
      }).catch((err) => {
        request.log.error({ err }, 'SSE regenerate handler error');
        sse.close();
      });

      // Return the raw reply so Fastify doesn't attempt to serialize
      return reply;
    }
  );
};
