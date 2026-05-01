import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

declare module 'fastify' {
  interface FastifyRequest {
    requestId: string;
    actorUserId?: string;
    actorRole?: string;
  }
}

const requestContextPluginFn: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', async (request) => {
    // Cast request.id (already set by Fastify genReqId)
    request.requestId = request.id as string;
  });

  fastify.addHook('onResponse', async (request, reply) => {
    request.log.info(
      {
        requestId: request.requestId,
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        actorUserId: request.actorUserId,
        actorRole: request.actorRole,
      },
      'request completed'
    );
  });
};

export const requestContextPlugin = fp(requestContextPluginFn, {
  name: 'requestContext',
});
