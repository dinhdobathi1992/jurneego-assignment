import { getDb } from '../db/kysely';
import { sql } from 'kysely';

export interface UserRow {
  id: string;
  external_subject: string;
  primary_role: string;
  display_name: string | null;
  preferred_language: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateUserInput {
  external_subject: string;
  primary_role: string;
  display_name?: string;
  preferred_language?: string;
}

export async function upsertUser(input: CreateUserInput): Promise<UserRow> {
  const db = getDb();
  const now = new Date().toISOString();

  const [user] = await db
    .insertInto('users')
    .values({
      external_subject: input.external_subject,
      primary_role: input.primary_role,
      display_name: input.display_name ?? null,
      preferred_language: input.preferred_language ?? 'en',
      created_at: now,
      updated_at: now,
    })
    .onConflict((oc) =>
      oc.column('external_subject').doUpdateSet({
        primary_role: input.primary_role,
        display_name: input.display_name ?? null,
        updated_at: now,
      })
    )
    .returningAll()
    .execute();

  return user as unknown as UserRow;
}

export async function findUserById(id: string): Promise<UserRow | null> {
  const db = getDb();
  const user = await db
    .selectFrom('users')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst();
  return (user as unknown as UserRow) ?? null;
}

export async function findUserByExternalSubject(subject: string): Promise<UserRow | null> {
  const db = getDb();
  const user = await db
    .selectFrom('users')
    .selectAll()
    .where('external_subject', '=', subject)
    .executeTakeFirst();
  return (user as unknown as UserRow) ?? null;
}

export async function getUserRoles(userId: string): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .selectFrom('user_roles')
    .select('role')
    .where('user_id', '=', userId)
    .execute();
  return rows.map((r) => r.role);
}

export async function addUserRole(userId: string, role: string): Promise<void> {
  const db = getDb();
  await db
    .insertInto('user_roles')
    .values({ user_id: userId, role, created_at: new Date().toISOString() })
    .onConflict((oc) => oc.doNothing())
    .execute();
}
