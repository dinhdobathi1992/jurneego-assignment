/**
 * Global test setup — sets minimum required env vars before any module loads settings.ts.
 * Tests that need real DB/Redis use Testcontainers and set their own overrides.
 */
process.env['DATABASE_URL'] = process.env['DATABASE_URL'] ?? 'postgresql://test:test@localhost:5432/test';
process.env['REDIS_URL'] = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
process.env['NODE_ENV'] = 'test';
process.env['AI_PROVIDER_ORDER'] = process.env['AI_PROVIDER_ORDER'] ?? 'mock';
process.env['DEV_JWT_SECRET'] = process.env['DEV_JWT_SECRET'] ?? 'test-secret-at-least-32-chars-long!!';
