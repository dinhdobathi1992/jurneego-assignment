import { getDb } from '../db/kysely';

export interface LearningObjectiveRow {
  id: string;
  session_id: string;
  author_user_id: string;
  objective_type: string;
  title: string;
  description: string | null;
  standards: string;
  status: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateLearningObjectiveInput {
  session_id: string;
  author_user_id: string;
  objective_type: string;
  title: string;
  description?: string;
  standards?: Record<string, unknown>;
}

export async function createLearningObjective(
  input: CreateLearningObjectiveInput
): Promise<LearningObjectiveRow> {
  const db = getDb();
  const [row] = await db
    .insertInto('learning_objectives')
    .values({
      session_id: input.session_id,
      author_user_id: input.author_user_id,
      objective_type: input.objective_type,
      title: input.title,
      description: input.description ?? null,
      standards: JSON.stringify(input.standards ?? {}),
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .returningAll()
    .execute();
  return row as unknown as LearningObjectiveRow;
}

export async function listObjectivesForSession(sessionId: string): Promise<LearningObjectiveRow[]> {
  const db = getDb();
  const rows = await db
    .selectFrom('learning_objectives')
    .selectAll()
    .where('session_id', '=', sessionId)
    .where('status', '=', 'active')
    .orderBy('created_at', 'asc')
    .execute();
  return rows as unknown as LearningObjectiveRow[];
}
