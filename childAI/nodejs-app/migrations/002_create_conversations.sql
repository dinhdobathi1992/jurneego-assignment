-- Migration 002: Create conversations table
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  learner_user_id uuid not null references users(id) on delete cascade,
  shared_session_id uuid null,
  title varchar(255) null,
  is_flagged boolean not null default false,
  status text not null default 'active' check (status in ('active', 'archived', 'deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists conversations_learner_created_idx
  on conversations (learner_user_id, created_at desc);

create index if not exists conversations_flagged_updated_idx
  on conversations (is_flagged, updated_at desc)
  where is_flagged = true;
