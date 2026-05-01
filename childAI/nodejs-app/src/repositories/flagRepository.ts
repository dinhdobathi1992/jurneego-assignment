import { getDb } from '../db/kysely';

export interface FlagRow {
  id: string;
  session_id: string | null;
  conversation_id: string;
  message_id: string;
  flag_type: string;
  reason: string;
  severity: string;
  reviewed: boolean;
  reviewer_user_id: string | null;
  reviewer_notes: string | null;
  created_at: Date;
  reviewed_at: Date | null;
}

export interface CreateFlagInput {
  session_id?: string;
  conversation_id: string;
  message_id: string;
  flag_type: string;
  reason: string;
  severity: string;
}

export async function createFlag(input: CreateFlagInput): Promise<FlagRow> {
  const db = getDb();
  const [row] = await db
    .insertInto('flags')
    .values({
      session_id: input.session_id ?? null,
      conversation_id: input.conversation_id,
      message_id: input.message_id,
      flag_type: input.flag_type,
      reason: input.reason,
      severity: input.severity,
      reviewed: false,
      created_at: new Date().toISOString(),
    })
    .returningAll()
    .execute();
  return row as unknown as FlagRow;
}

export async function reviewFlag(
  flagId: string,
  reviewerUserId: string,
  notes?: string
): Promise<void> {
  const db = getDb();
  await db
    .updateTable('flags')
    .set({
      reviewed: true,
      reviewer_user_id: reviewerUserId,
      reviewer_notes: notes ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .where('id', '=', flagId)
    .execute();
}

export async function listUnreviewedFlags(limit = 20): Promise<FlagRow[]> {
  const db = getDb();
  const rows = await db
    .selectFrom('flags')
    .selectAll()
    .where('reviewed', '=', false)
    .orderBy('created_at', 'desc')
    .limit(limit)
    .execute();
  return rows as unknown as FlagRow[];
}

export async function findFlagById(id: string): Promise<FlagRow | null> {
  const db = getDb();
  const row = await db.selectFrom('flags').selectAll().where('id', '=', id).executeTakeFirst();
  return (row as unknown as FlagRow) ?? null;
}

export async function listFlagsByConversation(conversationId: string): Promise<FlagRow[]> {
  const db = getDb();
  const rows = await db
    .selectFrom('flags')
    .selectAll()
    .where('conversation_id', '=', conversationId)
    .orderBy('created_at', 'desc')
    .execute();
  return rows as unknown as FlagRow[];
}
