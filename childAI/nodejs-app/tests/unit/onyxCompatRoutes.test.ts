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

describe('onyxCompatRoutes — auth bootstrap', () => {
  it('GET /api/auth/type returns basic auth with anonymous enabled', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/type' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.auth_type).toBe('basic');
    expect(body.anonymous_user_enabled).toBe(true);
    expect(body.has_users).toBe(true);
    expect(body.oauth_enabled).toBe(false);
  });

  it('GET /api/me returns an anonymous user when no auth header is sent', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/me' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.is_anonymous_user).toBe(true);
    expect(body.role).toBe('basic');
  });

  it('GET /api/settings returns minimal default settings', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/settings' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.application_status).toBe('active');
    expect(body.anonymous_user_enabled).toBe(true);
  });

  it('GET /api/enterprise-settings returns disabled enterprise config', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/enterprise-settings' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.application_status).toBe('active');
  });
});
