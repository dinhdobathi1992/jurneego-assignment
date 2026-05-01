import { getDb } from '../db/kysely';

export interface GuidanceNoteRow {
  id: string;
  session_id: string;
  conversation_id: string | null;
  target_message_id: string | null;
  author_user_id: string;
  author_role: string;
  guidance_type: string;
  content: string;
  language: string;
  visibility: string;
  status: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateGuidanceNoteInput {
  session_id: string;
  conversation_id?: string;
  target_message_id?: string;
  author_user_id: string;
  author_role: string;
  guidance_type: string;
  content: string;
  language?: string;
  visibility?: string;
}

export async function createGuidanceNote(input: CreateGuidanceNoteInput): Promise<GuidanceNoteRow> {
  const db = getDb();
  const [row] = await db
    .insertInto('guidance_notes')
    .values({
      session_id: input.session_id,
      conversation_id: input.conversation_id ?? null,
      target_message_id: input.target_message_id ?? null,
      author_user_id: input.author_user_id,
      author_role: input.author_role,
      guidance_type: input.guidance_type,
      content: input.content,
      language: input.language ?? 'en',
      visibility: input.visibility ?? 'adult_only',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .returningAll()
    .execute();
  return row as unknown as GuidanceNoteRow;
}

export async function listGuidanceForSession(
  sessionId: string,
  visibilityFilter?: string
): Promise<GuidanceNoteRow[]> {
  const db = getDb();
  let query = db
    .selectFrom('guidance_notes')
    .selectAll()
    .where('session_id', '=', sessionId)
    .where('status', '=', 'active');

  if (visibilityFilter) {
    query = query.where('visibility', '=', visibilityFilter);
  }

  const rows = await query.orderBy('created_at', 'asc').execute();
  return rows as unknown as GuidanceNoteRow[];
}

export async function listGuidanceForConversation(conversationId: string): Promise<GuidanceNoteRow[]> {
  const db = getDb();
  const rows = await db
    .selectFrom('guidance_notes')
    .selectAll()
    .where('conversation_id', '=', conversationId)
    .where('status', '=', 'active')
    .orderBy('created_at', 'asc')
    .execute();
  return rows as unknown as GuidanceNoteRow[];
}
