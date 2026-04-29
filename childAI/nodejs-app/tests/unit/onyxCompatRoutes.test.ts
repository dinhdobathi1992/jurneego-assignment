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

describe('onyxCompatRoutes — feature stubs', () => {
  it('GET /api/persona returns one default Bubbli persona', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/persona' });
    expect(res.statusCode).toBe(200);
    const list = res.json();
    expect(Array.isArray(list)).toBe(true);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(0);
    expect(list[0].name).toBe('Bubbli');
    expect(list[0].is_default_persona).toBe(true);
  });

  it('GET /api/persona/labels returns empty array', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/persona/labels' });
    expect(res.json()).toEqual([]);
  });

  it('GET /api/llm/provider returns one default provider', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/llm/provider' });
    const list = res.json();
    expect(list).toHaveLength(1);
    expect(list[0].is_default_provider).toBe(true);
    expect(list[0].model_names.length).toBeGreaterThan(0);
  });

  it('GET /api/user/projects returns empty array', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/user/projects' });
    expect(res.json()).toEqual([]);
  });

  it('GET /api/notifications returns empty list shape', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/notifications' });
    const body = res.json();
    expect(body).toEqual({ notifications: [] });
  });

  it('GET /api/user/assistant/preferences returns empty preferences', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/user/assistant/preferences' });
    expect(res.json()).toEqual({ chosen_assistants: null, hidden_assistants: [], visible_assistants: [] });
  });

  it('GET /api/manage/connector returns empty array', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/manage/connector' });
    expect(res.json()).toEqual([]);
  });

  it('GET /api/manage/document-set returns empty array', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/manage/document-set' });
    expect(res.json()).toEqual([]);
  });
});
