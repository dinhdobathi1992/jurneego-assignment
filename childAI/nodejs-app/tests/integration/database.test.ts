import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

let pgContainer: StartedPostgreSqlContainer;
let redisContainer: StartedTestContainer;
let pool: Pool;

// Helper to run all migrations
async function runMigrations(pool: Pool): Promise<void> {
  const migrationsDir = path.resolve(__dirname, '../../migrations');
  const files = fs.readdirSync(migrationsDir).sort();
  for (const file of files) {
    if (!file.endsWith('.sql')) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    await pool.query(sql);
  }
}

beforeAll(async () => {
  pgContainer = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('test_jurnee')
    .withUsername('test')
    .withPassword('test')
    .start();

  redisContainer = await new GenericContainer('redis:7-alpine')
    .withExposedPorts(6379)
    .start();

  pool = new Pool({ connectionString: pgContainer.getConnectionUri() });
  await runMigrations(pool);
}, 60_000);

afterAll(async () => {
  await pool.end();
  await pgContainer.stop();
  await redisContainer.stop();
});

describe('conversations table', () => {
  it('can insert and retrieve a user and conversation', async () => {
    // Insert user
    const userResult = await pool.query(
      `INSERT INTO users (external_subject, primary_role, preferred_language, created_at, updated_at)
       VALUES ('test-sub-001', 'learner', 'en', now(), now())
       RETURNING id`
    );
    const userId = userResult.rows[0].id;
    expect(userId).toBeTruthy();

    // Insert conversation
    const convResult = await pool.query(
      `INSERT INTO conversations (learner_user_id, status, created_at, updated_at)
       VALUES ($1, 'active', now(), now())
       RETURNING id`,
      [userId]
    );
    const convId = convResult.rows[0].id;
    expect(convId).toBeTruthy();

    // Retrieve
    const fetched = await pool.query('SELECT * FROM conversations WHERE id = $1', [convId]);
    expect(fetched.rows[0].learner_user_id).toBe(userId);
    expect(fetched.rows[0].is_flagged).toBe(false);
  });

  it('can insert a message into a conversation', async () => {
    const userResult = await pool.query(
      `INSERT INTO users (external_subject, primary_role, preferred_language, created_at, updated_at)
       VALUES ('test-sub-002', 'learner', 'en', now(), now())
       RETURNING id`
    );
    const userId = userResult.rows[0].id;

    const convResult = await pool.query(
      `INSERT INTO conversations (learner_user_id, status, created_at, updated_at)
       VALUES ($1, 'active', now(), now())
       RETURNING id`,
      [userId]
    );
    const convId = convResult.rows[0].id;

    const msgResult = await pool.query(
      `INSERT INTO messages (conversation_id, role, content, language, status, metadata, created_at)
       VALUES ($1, 'learner', 'How do fractions work?', 'en', 'completed', '{}', now())
       RETURNING id`,
      [convId]
    );
    expect(msgResult.rows[0].id).toBeTruthy();
  });
});

describe('parent_child_links', () => {
  it('enforces unique active parent-child link', async () => {
    const parentResult = await pool.query(
      `INSERT INTO users (external_subject, primary_role, preferred_language, created_at, updated_at)
       VALUES ('parent-001', 'parent', 'en', now(), now()) RETURNING id`
    );
    const childResult = await pool.query(
      `INSERT INTO users (external_subject, primary_role, preferred_language, created_at, updated_at)
       VALUES ('child-001', 'learner', 'en', now(), now()) RETURNING id`
    );

    const parentId = parentResult.rows[0].id;
    const childId = childResult.rows[0].id;

    await pool.query(
      `INSERT INTO parent_child_links (parent_user_id, child_user_id, relationship_type, status, created_at, updated_at)
       VALUES ($1, $2, 'parent', 'active', now(), now())`,
      [parentId, childId]
    );

    // Second insert should fail (unique constraint)
    await expect(
      pool.query(
        `INSERT INTO parent_child_links (parent_user_id, child_user_id, relationship_type, status, created_at, updated_at)
         VALUES ($1, $2, 'parent', 'active', now(), now())`,
        [parentId, childId]
      )
    ).rejects.toThrow();
  });
});
