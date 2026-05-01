import { FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { getPool } from '../db/pool';
import { getRedis } from '../db/redis';
import { settings } from '../config/settings';

const ProviderInfo = Type.Object({
  model: Type.String(),
  endpoint: Type.Optional(Type.String()),
});

const HealthResponse = Type.Object({
  status: Type.Literal('ok'),
  timestamp: Type.String(),
  env: Type.String(),
  ai: Type.Object({
    mode: Type.String(),
    provider_order: Type.Array(Type.String()),
    active_provider: Type.String(),
    providers: Type.Record(Type.String(), ProviderInfo),
  }),
});

const ReadyResponse = Type.Object({
  status: Type.Union([Type.Literal('ok'), Type.Literal('degraded')]),
  database: Type.String(),
  redis: Type.String(),
  timestamp: Type.String(),
});

export const systemRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /health
  fastify.get(
    '/health',
    {
      schema: {
        tags: ['system'],
        summary: 'Health check',
        response: { 200: HealthResponse },
      },
    },
    async (_request, reply) => {
      const activeProvider = settings.AI_PROVIDER_ORDER[0] ?? 'mock';

      // Build a map of all configured providers with their details
      const providers: Record<string, { model: string; endpoint?: string }> = {
        mock: { model: 'mock-v1' },
      };
      if (settings.LITELLM_API_BASE) {
        providers['litellm'] = {
          model: settings.LITELLM_MODEL,
          endpoint: settings.LITELLM_API_BASE,
        };
      }
      if (settings.NINE_ROUTER_API_BASE) {
        providers['9router'] = {
          model: settings.NINE_ROUTER_MODEL,
          endpoint: settings.NINE_ROUTER_API_BASE,
        };
      }
      if (settings.BEDROCK_MODEL_ID) {
        providers['bedrock'] = { model: settings.BEDROCK_MODEL_ID };
      }

      return reply.send({
        status: 'ok',
        timestamp: new Date().toISOString(),
        env: process.env['APP_ENV'] ?? 'development',
        ai: {
          mode: settings.AI_PROVIDER_MODE,
          provider_order: settings.AI_PROVIDER_ORDER,
          active_provider: activeProvider,
          providers,
        },
      });
    }
  );

  // GET /ready
  fastify.get(
    '/ready',
    {
      schema: {
        tags: ['system'],
        summary: 'Readiness check with database and Redis',
        response: {
          200: ReadyResponse,
          503: ReadyResponse,
        },
      },
    },
    async (_request, reply) => {
      let dbStatus = 'ok';
      let redisStatus = 'ok';

      try {
        const pool = getPool();
        await pool.query('SELECT 1');
      } catch {
        dbStatus = 'unavailable';
      }

      try {
        const redis = getRedis();
        await redis.ping();
      } catch {
        redisStatus = 'unavailable';
      }

      const isReady = dbStatus === 'ok' && redisStatus === 'ok';
      const status = isReady ? 'ok' : 'degraded';

      return reply.status(isReady ? 200 : 503).send({
        status,
        database: dbStatus,
        redis: redisStatus,
        timestamp: new Date().toISOString(),
      });
    }
  );
};
