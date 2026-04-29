import { getDb } from '../db/kysely';

export interface MessageRow {
  id: string;
  conversation_id: string;
  created_by_user_id: string | null;
  role: string;
  content: string;
  language: string;
  status: string;
  is_safe: boolean | null;
  safety_score: number | null;
  ai_provider: string | null;
  ai_model: string | null;
  token_count: number | null;
  latency_ms: number | null;
  metadata: string;
  created_at: Date;
  completed_at: Date | null;
  feedback_score: -1 | 1 | null;
  feedback_at: Date | null;
}

export interface CreateMessageInput {
  conversation_id: string;
  created_by_user_id?: string;
  role: 'learner' | 'assistant' | 'system';
  content: string;
  language?: string;
  status?: string;
  is_safe?: boolean;
  safety_score?: number;
  ai_provider?: string;
  ai_model?: string;
  token_count?: number;
  latency_ms?: number;
  metadata?: Record<string, unknown>;
}

export async function createMessage(input: CreateMessageInput): Promise<MessageRow> {
  const db = getDb();
  const now = new Date().toISOString();
  const [row] = await db
    .insertInto('messages')
    .values({
      conversation_id: input.conversation_id,
      created_by_user_id: input.created_by_user_id ?? null,
      role: input.role,
      content: input.content,
      language: input.language ?? 'en',
      status: input.status ?? 'completed',
      is_safe: input.is_safe ?? null,
      safety_score: input.safety_score ?? null,
      ai_provider: input.ai_provider ?? null,
      ai_model: input.ai_model ?? null,
      token_count: input.token_count ?? null,
      latency_ms: input.latency_ms ?? null,
      metadata: JSON.stringify(input.metadata ?? {}),
      created_at: now,
      completed_at: input.status === 'completed' ? now : null,
    })
    .returningAll()
    .execute();
  return row as unknown as MessageRow;
}

export async function listMessages(
  conversationId: string,
  limit = 50
): Promise<MessageRow[]> {
  const db = getDb();
  const rows = await db
    .selectFrom('messages')
    .selectAll()
    .where('conversation_id', '=', conversationId)
    .where('status', '!=', 'cancelled')
    .orderBy('created_at', 'asc')
    .limit(limit)
    .execute();
  return rows as unknown as MessageRow[];
}

export async function findMessageById(id: string): Promise<MessageRow | null> {
  const db = getDb();
  const row = await db
    .selectFrom('messages')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst();
  return (row as unknown as MessageRow) ?? null;
}

export async function updateMessageStatus(
  id: string,
  status: string,
  extra?: Partial<CreateMessageInput>
): Promise<void> {
  const db = getDb();
  await db
    .updateTable('messages')
    .set({
      status,
      completed_at: status === 'completed' ? new Date().toISOString() : undefined,
      ...(extra?.is_safe !== undefined ? { is_safe: extra.is_safe } : {}),
      ...(extra?.ai_provider ? { ai_provider: extra.ai_provider } : {}),
      ...(extra?.ai_model ? { ai_model: extra.ai_model } : {}),
      ...(extra?.latency_ms !== undefined ? { latency_ms: extra.latency_ms } : {}),
    })
    .where('id', '=', id)
    .execute();
}

export function isValidFeedbackScore(score: unknown): score is -1 | 1 | null {
  return score === null || score === 1 || score === -1;
}

export async function setMessageFeedback(
  messageId: string,
  score: -1 | 1 | null,
): Promise<void> {
  const db = getDb();
  await db
    .updateTable('messages')
    .set({
      feedback_score: score,
      feedback_at: score === null ? null : new Date().toISOString(),
    })
    .where('id', '=', messageId)
    .execute();
}

export interface LatestExchange {
  learner: MessageRow;
  assistant: MessageRow;
}

/**
 * Returns the last (learner, assistant) pair in a conversation. Used by
 * the regenerate endpoint to know what learner message to re-run from.
 * Returns null if the conversation has fewer than 2 messages or the
 * latest message isn't a (learner→assistant) sequence.
 */
export async function findLatestExchange(
  conversationId: string,
): Promise<LatestExchange | null> {
  const db = getDb();
  const rows = await db
    .selectFrom('messages')
    .selectAll()
    .where('conversation_id', '=', conversationId)
    // Hide previously-regenerated assistant messages so the lookup returns the
    // CURRENT exchange, not a stale one. This filter differs from listMessages
    // (which filters 'cancelled') because the regenerate flow is what creates
    // the 'regenerated' status in the first place.
    .where('status', '!=', 'regenerated')
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .limit(2)
    .execute();
  if (rows.length < 2) return null;
  const [latest, prior] = rows as unknown as MessageRow[];
  if (latest.role !== 'assistant' || prior.role !== 'learner') return null;
  return { assistant: latest, learner: prior };
}

export async function markMessageRegenerated(messageId: string): Promise<void> {
  const db = getDb();
  await db
    .updateTable('messages')
    .set({ status: 'regenerated' })
    .where('id', '=', messageId)
    .execute();
}
