-- Migration 006: Create audit_events table (append-only)
create table if not exists audit_events (
  id uuid primary key default gen_random_uuid(),
  request_id text not null,
  actor_user_id uuid null references users(id),
  actor_role text null,
  event_type text not null,
  entity_type text not null,
  entity_id uuid null,
  ip_hash text null,
  user_agent_hash text null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists audit_events_entity_idx
  on audit_events (entity_type, entity_id, created_at desc);

create index if not exists audit_events_actor_idx
  on audit_events (actor_user_id, created_at desc);

create index if not exists audit_events_type_idx
  on audit_events (event_type, created_at desc);
