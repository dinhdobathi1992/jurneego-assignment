import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { onyxCompatRoutes } from '../../src/routes/onyxCompatRoutes';

let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify();
  await app.register(onyxCompatRoutes);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('onyxCompatRoutes — basic registration', () => {
  it('GET /api/health returns 200 with shape Onyx expects', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });
});
