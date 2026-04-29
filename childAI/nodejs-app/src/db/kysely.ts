import {
  Kysely,
  PostgresDialect,
  GeneratedAlways,
  ColumnType,
} from 'kysely';
import { Pool } from 'pg';
import { getPool } from './pool';

// ─── Table Types ───────────────────────────────────────────────────────────────

export interface UsersTable {
  id: GeneratedAlways<string>;
  external_subject: string;
  primary_role: string;
  display_name: string | null;
  email: string | null;
  preferred_language: string;
  created_at: ColumnType<Date, string | undefined, never>;
  updated_at: ColumnType<Date, string | undefined, string>;
}

export interface UserRolesTable {
  user_id: string;
  role: string;
  created_at: ColumnType<Date, string | undefined, never>;
}

export interface ParentChildLinksTable {
  id: GeneratedAlways<string>;
  parent_user_id: string;
  child_user_id: string;
  relationship_type: string;
  status: string;
  consent_source: string | null;
  created_at: ColumnType<Date, string | undefined, never>;
  updated_at: ColumnType<Date, string | undefined, string>;
}

export interface SchoolsTable {
  id: GeneratedAlways<string>;
  name: string;
  created_at: ColumnType<Date, string | undefined, never>;
  updated_at: ColumnType<Date, string | undefined, string>;
}

export interface ClassroomsTable {
  id: GeneratedAlways<string>;
  school_id: string | null;
  name: string;
  grade_level: string | null;
  academic_year: string | null;
  created_at: ColumnType<Date, string | undefined, never>;
  updated_at: ColumnType<Date, string | undefined, string>;
}

export interface ClassroomMembershipsTable {
  id: GeneratedAlways<string>;
  classroom_id: string;
  user_id: string;
  membership_role: string;
  status: string;
  created_at: ColumnType<Date, string | undefined, never>;
  updated_at: ColumnType<Date, string | undefined, string>;
}

export interface SharedSessionsTable {
  id: GeneratedAlways<string>;
  learner_user_id: string;
  created_by_user_id: string;
  classroom_id: string | null;
  title: string | null;
  mode: string;
  visibility: string;
  status: string;
  created_at: ColumnType<Date, string | undefined, never>;
  updated_at: ColumnType<Date, string | undefined, string>;
}

export interface SessionParticipantsTable {
  id: GeneratedAlways<string>;
  session_id: string;
  user_id: string;
  participant_role: string;
  permissions: string; // JSONB stored as string
  joined_at: ColumnType<Date, string | undefined, never>;
  left_at: ColumnType<Date | null, string | null | undefined, string | null>;
}

export interface ConversationsTable {
  id: GeneratedAlways<string>;
  learner_user_id: string;
  shared_session_id: string | null;
  title: string | null;
  is_flagged: boolean;
  status: string;
  created_at: ColumnType<Date, string | undefined, never>;
  updated_at: ColumnType<Date, string | undefined, string>;
}

export interface MessagesTable {
  id: GeneratedAlways<string>;
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
  metadata: string; // JSONB
  created_at: ColumnType<Date, string | undefined, never>;
  completed_at: ColumnType<Date | null, string | null | undefined, string | null>;
}

export interface GuidanceNotesTable {
  id: GeneratedAlways<string>;
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
  created_at: ColumnType<Date, string | undefined, never>;
  updated_at: ColumnType<Date, string | undefined, string>;
}

export interface LearningObjectivesTable {
  id: GeneratedAlways<string>;
  session_id: string;
  author_user_id: string;
  objective_type: string;
  title: string;
  description: string | null;
  standards: string; // JSONB
  status: string;
  created_at: ColumnType<Date, string | undefined, never>;
  updated_at: ColumnType<Date, string | undefined, string>;
}

export interface MessageTranslationsTable {
  id: GeneratedAlways<string>;
  message_id: string;
  requested_by_user_id: string;
  source_language: string;
  target_language: string;
  translated_content: string;
  provider: string | null;
  model: string | null;
  created_at: ColumnType<Date, string | undefined, never>;
}

export interface SessionEventsTable {
  id: GeneratedAlways<string>;
  session_id: string;
  event_type: string;
  actor_user_id: string | null;
  entity_type: string;
  entity_id: string;
  child_visible: boolean;
  metadata: string; // JSONB
  created_at: ColumnType<Date, string | undefined, never>;
}

export interface FlagsTable {
  id: GeneratedAlways<string>;
  session_id: string | null;
  conversation_id: string;
  message_id: string;
  flag_type: string;
  reason: string;
  severity: string;
  reviewed: boolean;
  reviewer_user_id: string | null;
  reviewer_notes: string | null;
  created_at: ColumnType<Date, string | undefined, never>;
  reviewed_at: ColumnType<Date | null, string | null | undefined, string | null>;
}

export interface SafetyAssessmentsTable {
  id: GeneratedAlways<string>;
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
  metadata: string; // JSONB
  created_at: ColumnType<Date, string | undefined, never>;
}

export interface AuditEventsTable {
  id: GeneratedAlways<string>;
  request_id: string;
  actor_user_id: string | null;
  actor_role: string | null;
  event_type: string;
  entity_type: string;
  entity_id: string | null;
  ip_hash: string | null;
  user_agent_hash: string | null;
  metadata: string; // JSONB
  created_at: ColumnType<Date, string | undefined, never>;
}

export interface AiProviderAttemptsTable {
  id: GeneratedAlways<string>;
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
  created_at: ColumnType<Date, string | undefined, never>;
}

export interface SessionAnalyticsSnapshotsTable {
  id: GeneratedAlways<string>;
  session_id: string;
  learner_user_id: string;
  classroom_id: string | null;
  snapshot_type: string;
  metrics: string; // JSONB
  generated_at: ColumnType<Date, string | undefined, never>;
}

// ─── Database Interface ────────────────────────────────────────────────────────

export interface Database {
  users: UsersTable;
  user_roles: UserRolesTable;
  parent_child_links: ParentChildLinksTable;
  schools: SchoolsTable;
  classrooms: ClassroomsTable;
  classroom_memberships: ClassroomMembershipsTable;
  shared_sessions: SharedSessionsTable;
  session_participants: SessionParticipantsTable;
  conversations: ConversationsTable;
  messages: MessagesTable;
  guidance_notes: GuidanceNotesTable;
  learning_objectives: LearningObjectivesTable;
  message_translations: MessageTranslationsTable;
  session_events: SessionEventsTable;
  flags: FlagsTable;
  safety_assessments: SafetyAssessmentsTable;
  audit_events: AuditEventsTable;
  ai_provider_attempts: AiProviderAttemptsTable;
  session_analytics_snapshots: SessionAnalyticsSnapshotsTable;
}

// ─── Singleton ─────────────────────────────────────────────────────────────────

let db: Kysely<Database> | null = null;

export function getDb(pool?: Pool): Kysely<Database> {
  if (!db) {
    db = new Kysely<Database>({
      dialect: new PostgresDialect({ pool: pool ?? getPool() }),
    });
  }
  return db;
}

export async function closeDb(): Promise<void> {
  if (db) {
    await db.destroy();
    db = null;
  }
}
