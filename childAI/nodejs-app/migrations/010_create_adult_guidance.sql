-- Migration 010: Create guidance_notes and session_events tables
create table if not exists guidance_notes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references shared_sessions(id) on delete cascade,
  conversation_id uuid null references conversations(id) on delete set null,
  target_message_id uuid null references messages(id) on delete set null,
  author_user_id uuid not null references users(id),
  author_role text not null check (author_role in ('parent', 'teacher', 'admin')),
  guidance_type text not null check (guidance_type in ('reflection_prompt', 'context_note', 'learning_objective', 'safety_note', 'translation_note')),
  content text not null,
  language text not null default 'en',
  visibility text not null default 'visible_to_session' check (visibility in ('visible_to_session', 'adults_only', 'private')),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists session_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references shared_sessions(id) on delete cascade,
  event_type text not null,
  actor_user_id uuid null references users(id),
  entity_type text not null,
  entity_id uuid not null,
  child_visible boolean not null default true,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists guidance_notes_session_created_idx
  on guidance_notes (session_id, created_at desc);

create index if not exists session_events_session_created_idx
  on session_events (session_id, created_at asc);
