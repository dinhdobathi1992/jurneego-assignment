import { getDb } from '../db/kysely';
import * as crypto from 'crypto';

export interface AuditEventRow {
  id: string;
  request_id: string;
  actor_user_id: string | null;
  actor_role: string | null;
  event_type: string;
  entity_type: string;
  entity_id: string | null;
  ip_hash: string | null;
  user_agent_hash: string | null;
  metadata: string;
  created_at: Date;
}

export interface CreateAuditEventInput {
  request_id: string;
  actor_user_id?: string;
  actor_role?: string;
  event_type: string;
  entity_type: string;
  entity_id?: string;
  ip?: string;
  user_agent?: string;
  metadata?: Record<string, unknown>;
}

function hashIfPresent(value?: string): string | null {
  if (!value) return null;
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 16);
}

export async function createAuditEvent(input: CreateAuditEventInput): Promise<void> {
  const db = getDb();
  await db
    .insertInto('audit_events')
    .values({
      request_id: input.request_id,
      actor_user_id: input.actor_user_id ?? null,
      actor_role: input.actor_role ?? null,
      event_type: input.event_type,
      entity_type: input.entity_type,
      entity_id: input.entity_id ?? null,
      ip_hash: hashIfPresent(input.ip),
      user_agent_hash: hashIfPresent(input.user_agent),
      metadata: JSON.stringify(input.metadata ?? {}),
      created_at: new Date().toISOString(),
    })
    .execute();
}

export async function listAuditEvents(
  entityType: string,
  entityId: string,
  limit = 50
): Promise<AuditEventRow[]> {
  const db = getDb();
  const rows = await db
    .selectFrom('audit_events')
    .selectAll()
    .where('entity_type', '=', entityType)
    .where('entity_id', '=', entityId as unknown as never)
    .orderBy('created_at', 'desc')
    .limit(limit)
    .execute();
  return rows as unknown as AuditEventRow[];
}
