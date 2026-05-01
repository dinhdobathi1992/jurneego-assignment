import { registry } from './metrics';
import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

/**
 * Expose /metrics endpoint (Prometheus scrape target).
 * Should be restricted to internal/monitoring network in production.
 */
const metricsPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.get('/metrics', async (_request, reply) => {
    const output = await registry.metrics();
    return reply
      .header('Content-Type', registry.contentType)
      .send(output);
  });
};

export const metricsRoute = fp(metricsPlugin, { name: 'metrics' });
