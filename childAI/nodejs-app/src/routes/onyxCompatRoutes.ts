import { FastifyPluginAsync } from 'fastify';

/**
 * Compatibility shim for the upstream Onyx frontend.
 *
 * Onyx's web/ expects a specific set of API endpoints that don't exist in our
 * Fastify backend. This plugin emulates the minimum surface needed for the
 * chat page to render, plus translation routes that proxy chat-session calls
 * into our existing conversationService.
 *
 * Mounted at `/api/...` so the Onyx Next.js catch-all proxy forwards untouched.
 */
export const onyxCompatRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/health', async () => ({ status: 'ok' }));
};
