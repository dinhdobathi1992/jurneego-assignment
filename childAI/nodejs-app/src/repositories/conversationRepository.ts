import { getDb } from '../db/kysely';

export interface ConversationRow {
  id: string;
  learner_user_id: string;
  shared_session_id: string | null;
  title: string | null;
  is_flagged: boolean;
  status: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateConversationInput {
  learner_user_id: string;
  shared_session_id?: string;
  title?: string;
}

export async function createConversation(input: CreateConversationInput): Promise<ConversationRow> {
  const db = getDb();
  const now = new Date().toISOString();
  const [row] = await db
    .insertInto('conversations')
    .values({
      learner_user_id: input.learner_user_id,
      shared_session_id: input.shared_session_id ?? null,
      title: input.title ?? null,
      is_flagged: false,
      status: 'active',
      created_at: now,
      updated_at: now,
    })
    .returningAll()
    .execute();
  return row as unknown as ConversationRow;
}

export async function findConversationById(id: string): Promise<ConversationRow | null> {
  const db = getDb();
  const row = await db
    .selectFrom('conversations')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst();
  return (row as unknown as ConversationRow) ?? null;
}

export async function listConversationsForLearner(
  learnerUserId: string,
  limit = 20,
  cursor?: string
): Promise<ConversationRow[]> {
  const db = getDb();
  let query = db
    .selectFrom('conversations')
    .selectAll()
    .where('learner_user_id', '=', learnerUserId)
    .where('status', '!=', 'deleted')
    .orderBy('created_at', 'desc')
    .limit(limit);

  if (cursor) {
    query = query.where('created_at', '<', cursor as unknown as Date);
  }

  const rows = await query.execute();
  return rows as unknown as ConversationRow[];
}

export async function listFlaggedConversations(
  limit = 20,
  cursor?: string
): Promise<ConversationRow[]> {
  const db = getDb();
  let query = db
    .selectFrom('conversations')
    .selectAll()
    .where('is_flagged', '=', true)
    .orderBy('updated_at', 'desc')
    .limit(limit);

  if (cursor) {
    query = query.where('updated_at', '<', cursor as unknown as Date);
  }

  return (await query.execute()) as unknown as ConversationRow[];
}

export async function markConversationFlagged(id: string): Promise<void> {
  const db = getDb();
  await db
    .updateTable('conversations')
    .set({ is_flagged: true, updated_at: new Date().toISOString() })
    .where('id', '=', id)
    .execute();
}

export async function setConversationTitle(id: string, title: string): Promise<void> {
  const db = getDb();
  await db
    .updateTable('conversations')
    .set({ title, updated_at: new Date().toISOString() })
    .where('id', '=', id)
    .execute();
}
