import Fastify, { FastifyInstance } from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import fastifyHelmet from '@fastify/helmet';
import fastifyCors from '@fastify/cors';
import fastifySensible from '@fastify/sensible';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { randomUUID } from 'crypto';
import { settings } from './config/settings';
import { errorHandler } from './middleware/errorHandler';
import { httpRequestsTotal, httpRequestDurationSeconds } from './services/observability/metrics';
import { requestContextPlugin } from './middleware/requestContext';
import { authRoutes } from './routes/authRoutes';
import { systemRoutes } from './routes/systemRoutes';
import { conversationRoutes } from './routes/conversationRoutes';
import { messageRoutes } from './routes/messageRoutes';
import { streamRoutes } from './routes/streamRoutes';
import { moderationRoutes } from './routes/moderationRoutes';
import { parentRoutes } from './routes/parentRoutes';
import { teacherRoutes } from './routes/teacherRoutes';
import { sharedSessionRoutes } from './routes/sharedSessionRoutes';
import { metricsRoute } from './services/observability/metricsRoute';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: settings.LOG_LEVEL,
      serializers: {
        req(req: { method: string; url: string; hostname: string; ip: string }) {
          return {
            method: req.method,
            url: req.url,
            hostname: req.hostname,
            remoteAddress: req.ip,
          };
        },
      },
    },
    ajv: {
      customOptions: {
        removeAdditional: true,
        coerceTypes: true,
        allErrors: true,
      },
    },
    genReqId: () => randomUUID(),
  }).withTypeProvider<TypeBoxTypeProvider>();

  // Security headers
  await app.register(fastifyHelmet, { contentSecurityPolicy: false });

  // CORS
  await app.register(fastifyCors, {
    origin: settings.APP_ENV === 'production' ? false : true,
    credentials: true,
  });

  // Sensible defaults
  await app.register(fastifySensible);

  // OpenAPI / Swagger
  await app.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'ChildAI API',
        description: 'Child-safe AI learning assistant backend',
        version: '1.0.0',
      },
      tags: [
        { name: 'system', description: 'Health and readiness' },
        { name: 'conversations', description: 'Conversation management' },
        { name: 'messages', description: 'Message sending' },
        { name: 'streaming', description: 'SSE streaming' },
        { name: 'moderation', description: 'Flag review' },
        { name: 'parent', description: 'Parent dashboard' },
        { name: 'teacher', description: 'Teacher dashboard' },
        { name: 'shared-sessions', description: 'Shared learning sessions' },
      ],
      security: [{ apiKey: [] }, { bearerAuth: [] }],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
          apiKey: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
        },
      },
    },
  });

  await app.register(fastifySwaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', deepLinking: false },
  });

  // Request context
  await app.register(requestContextPlugin);

  // Global error handler
  app.setErrorHandler(errorHandler);

  // HTTP request metrics
  app.addHook('onRequest', async (request) => {
    (request as { _startTime?: number })._startTime = Date.now();
  });

  app.addHook('onResponse', async (request, reply) => {
    const startTime = (request as { _startTime?: number })._startTime;
    const route = request.routerPath ?? request.url;
    const durationSec = startTime ? (Date.now() - startTime) / 1000 : 0;
    httpRequestsTotal.inc({ method: request.method, route, status: String(reply.statusCode) });
    httpRequestDurationSeconds.observe({ method: request.method, route }, durationSec);
  });

  // ─── Routes ────────────────────────────────────────────────────────────────
  await app.register(authRoutes);
  await app.register(systemRoutes);
  await app.register(conversationRoutes);
  await app.register(messageRoutes);
  await app.register(streamRoutes);
  await app.register(moderationRoutes);
  await app.register(parentRoutes);
  await app.register(teacherRoutes);
  await app.register(sharedSessionRoutes);
  await app.register(metricsRoute);

  return app;
}
