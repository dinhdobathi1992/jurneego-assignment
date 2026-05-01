import { getDb } from '../db/kysely';

export interface AiProviderAttemptRow {
  id: string;
  conversation_id: string;
  session_id: string | null;
  message_id: string | null;
  provider: string;
  model: string;
  status: string;
  latency_ms: number | null;
  error_code: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: Date;
}

export interface CreateAiProviderAttemptInput {
  conversation_id: string;
  session_id?: string;
  message_id?: string;
  provider: string;
  model: string;
  status: 'success' | 'failed' | 'timeout' | 'cancelled';
  latency_ms?: number;
  error_code?: string;
  input_tokens?: number;
  output_tokens?: number;
}

export async function createAiProviderAttempt(
  input: CreateAiProviderAttemptInput
): Promise<AiProviderAttemptRow> {
  const db = getDb();
  const [row] = await db
    .insertInto('ai_provider_attempts')
    .values({
      conversation_id: input.conversation_id,
      session_id: input.session_id ?? null,
      message_id: input.message_id ?? null,
      provider: input.provider,
      model: input.model,
      status: input.status,
      latency_ms: input.latency_ms ?? null,
      error_code: input.error_code ?? null,
      input_tokens: input.input_tokens ?? null,
      output_tokens: input.output_tokens ?? null,
      created_at: new Date().toISOString(),
    })
    .returningAll()
    .execute();
  return row as unknown as AiProviderAttemptRow;
}
