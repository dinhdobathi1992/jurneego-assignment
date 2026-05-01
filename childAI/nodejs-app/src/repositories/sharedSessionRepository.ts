import { getDb } from '../db/kysely';

export interface SharedSessionRow {
  id: string;
  learner_user_id: string;
  created_by_user_id: string;
  classroom_id: string | null;
  title: string | null;
  mode: string;
  visibility: string;
  status: string;
  created_at: Date;
  updated_at: Date;
}

export interface SessionParticipantRow {
  id: string;
  session_id: string;
  user_id: string;
  participant_role: string;
  permissions: string;
  joined_at: Date;
  left_at: Date | null;
}

export async function findSharedSessionById(id: string): Promise<SharedSessionRow | null> {
  const db = getDb();
  const row = await db
    .selectFrom('shared_sessions')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst();
  return (row as unknown as SharedSessionRow) ?? null;
}

export async function listSessionsForLearner(learnerUserId: string): Promise<SharedSessionRow[]> {
  const db = getDb();
  const rows = await db
    .selectFrom('shared_sessions')
    .selectAll()
    .where('learner_user_id', '=', learnerUserId)
    .where('status', '!=', 'closed')
    .orderBy('created_at', 'desc')
    .execute();
  return rows as unknown as SharedSessionRow[];
}

export async function listSessionsForParentChildren(
  childUserIds: string[]
): Promise<SharedSessionRow[]> {
  if (childUserIds.length === 0) return [];
  const db = getDb();
  const rows = await db
    .selectFrom('shared_sessions')
    .selectAll()
    .where('learner_user_id', 'in', childUserIds)
    .orderBy('created_at', 'desc')
    .execute();
  return rows as unknown as SharedSessionRow[];
}

export async function listSessionsForTeacher(teacherUserId: string): Promise<SharedSessionRow[]> {
  const db = getDb();
  const participants = await db
    .selectFrom('session_participants')
    .select('session_id')
    .where('user_id', '=', teacherUserId)
    .where('left_at', 'is', null)
    .execute();

  if (participants.length === 0) return [];
  const ids = participants.map((p) => p.session_id);

  const rows = await db
    .selectFrom('shared_sessions')
    .selectAll()
    .where('id', 'in', ids)
    .orderBy('created_at', 'desc')
    .execute();
  return rows as unknown as SharedSessionRow[];
}

export async function listParticipants(sessionId: string): Promise<SessionParticipantRow[]> {
  const db = getDb();
  const rows = await db
    .selectFrom('session_participants')
    .selectAll()
    .where('session_id', '=', sessionId)
    .where('left_at', 'is', null)
    .execute();
  return rows as unknown as SessionParticipantRow[];
}
