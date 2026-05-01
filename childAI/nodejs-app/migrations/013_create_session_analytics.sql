-- Migration 013: Create session_analytics_snapshots table
create table if not exists session_analytics_snapshots (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references shared_sessions(id) on delete cascade,
  learner_user_id uuid not null references users(id),
  classroom_id uuid null references classrooms(id) on delete set null,
  snapshot_type text not null check (snapshot_type in ('session_summary', 'classroom_summary', 'daily_rollup')),
  metrics jsonb not null,
  generated_at timestamptz not null default now()
);

create index if not exists session_analytics_snapshots_session_idx
  on session_analytics_snapshots (session_id, generated_at desc);

create index if not exists session_analytics_snapshots_classroom_idx
  on session_analytics_snapshots (classroom_id, generated_at desc)
  where classroom_id is not null;
