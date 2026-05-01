import { getDb } from '../db/kysely';

export interface MessageTranslationRow {
  id: string;
  message_id: string;
  requested_by_user_id: string;
  source_language: string;
  target_language: string;
  translated_content: string;
  provider: string | null;
  model: string | null;
  created_at: Date;
}

export interface CreateTranslationInput {
  message_id: string;
  requested_by_user_id: string;
  source_language: string;
  target_language: string;
  translated_content: string;
  provider?: string;
  model?: string;
}

export async function createTranslation(input: CreateTranslationInput): Promise<MessageTranslationRow> {
  const db = getDb();
  const [row] = await db
    .insertInto('message_translations')
    .values({
      message_id: input.message_id,
      requested_by_user_id: input.requested_by_user_id,
      source_language: input.source_language,
      target_language: input.target_language,
      translated_content: input.translated_content,
      provider: input.provider ?? null,
      model: input.model ?? null,
      created_at: new Date().toISOString(),
    })
    .returningAll()
    .execute();
  return row as unknown as MessageTranslationRow;
}

export async function findTranslation(
  messageId: string,
  targetLanguage: string
): Promise<MessageTranslationRow | null> {
  const db = getDb();
  const row = await db
    .selectFrom('message_translations')
    .selectAll()
    .where('message_id', '=', messageId)
    .where('target_language', '=', targetLanguage)
    .orderBy('created_at', 'desc')
    .executeTakeFirst();
  return (row as unknown as MessageTranslationRow) ?? null;
}
