-- Migration 011: Create learning_objectives table
create table if not exists learning_objectives (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references shared_sessions(id) on delete cascade,
  author_user_id uuid not null references users(id),
  objective_type text not null check (objective_type in ('standard', 'custom', 'skill', 'topic')),
  title text not null,
  description text null,
  standards jsonb not null default '[]',
  status text not null default 'active' check (status in ('active', 'completed', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists learning_objectives_session_idx
  on learning_objectives (session_id, status);
