import { getDb } from '../db/kysely';

export interface SafetyAssessmentRow {
  id: string;
  session_id: string | null;
  message_id: string | null;
  conversation_id: string | null;
  direction: string;
  checker: string;
  is_safe: boolean;
  flag_type: string | null;
  severity: string | null;
  confidence: number;
  reason: string | null;
  metadata: string;
  created_at: Date;
}

export interface CreateSafetyAssessmentInput {
  session_id?: string;
  message_id?: string;
  conversation_id?: string;
  direction: 'input' | 'output';
  checker: 'rule' | 'llm' | 'provider';
  is_safe: boolean;
  flag_type?: string;
  severity?: string;
  confidence: number;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export async function createSafetyAssessment(
  input: CreateSafetyAssessmentInput
): Promise<SafetyAssessmentRow> {
  const db = getDb();
  const [row] = await db
    .insertInto('safety_assessments')
    .values({
      session_id: input.session_id ?? null,
      message_id: input.message_id ?? null,
      conversation_id: input.conversation_id ?? null,
      direction: input.direction,
      checker: input.checker,
      is_safe: input.is_safe,
      flag_type: input.flag_type ?? null,
      severity: input.severity ?? null,
      confidence: input.confidence,
      reason: input.reason ?? null,
      metadata: JSON.stringify(input.metadata ?? {}),
      created_at: new Date().toISOString(),
    })
    .returningAll()
    .execute();
  return row as unknown as SafetyAssessmentRow;
}
