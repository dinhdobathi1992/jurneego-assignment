import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { onyxCompatRoutes } from '../../src/routes/onyxCompatRoutes';
import { toOnyxSession, toOnyxMessages } from '../../src/services/onyxShapes';

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

describe('toOnyxSession', () => {
  it('maps our conversation to Onyx session shape with flagged carry-through', () => {
    const out = toOnyxSession({
      id: '11111111-1111-1111-1111-111111111111',
      title: 'About dragons',
      created_at: '2026-04-01T10:00:00.000Z',
      updated_at: '2026-04-02T10:00:00.000Z',
      is_flagged: true,
    });
    expect(out.id).toBe('11111111-1111-1111-1111-111111111111');
    expect(out.name).toBe('About dragons');
    expect(out.persona_id).toBe(0);
    expect(out.time_created).toBe('2026-04-01T10:00:00.000Z');
    expect(out.is_flagged).toBe(true);
  });

  it('falls back to a slug when title is null', () => {
    const out = toOnyxSession({
      id: 'abcdef12-1111-1111-1111-111111111111',
      title: null,
      created_at: '2026-04-01T10:00:00.000Z',
    });
    expect(out.name).toBe('Chat abcdef');
    expect(out.is_flagged).toBe(false);
  });
});

describe('toOnyxMessages', () => {
  it('produces a linear thread with correct parent/child links', () => {
    const out = toOnyxMessages([
      { id: 'aaa', role: 'learner', content: 'hi', created_at: '2026-04-01T10:00:00.000Z' },
      { id: 'bbb', role: 'assistant', content: 'hello!', created_at: '2026-04-01T10:00:01.000Z' },
      { id: 'ccc', role: 'learner', content: 'how are you', created_at: '2026-04-01T10:00:02.000Z' },
    ]);
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ message_id: 1, message_type: 'user', parent_message: null, latest_child_message: 2 });
    expect(out[1]).toMatchObject({ message_id: 2, message_type: 'assistant', parent_message: 1, latest_child_message: 3 });
    expect(out[2]).toMatchObject({ message_id: 3, message_type: 'user', parent_message: 2, latest_child_message: null });
  });

  it('sorts by created_at even if input is reversed', () => {
    const out = toOnyxMessages([
      { id: 'b', role: 'assistant', content: 'second', created_at: '2026-04-01T10:00:01.000Z' },
      { id: 'a', role: 'learner', content: 'first', created_at: '2026-04-01T10:00:00.000Z' },
    ]);
    expect(out[0].message).toBe('first');
    expect(out[1].message).toBe('second');
  });

  it('carries is_safe through', () => {
    const out = toOnyxMessages([
      { id: 'a', role: 'assistant', content: 'flagged', created_at: '2026-04-01T10:00:00.000Z', is_safe: false },
    ]);
    expect(out[0].is_safe).toBe(false);
  });
});
