-- Migration 009: Create shared_sessions and session_participants tables
create table if not exists shared_sessions (
  id uuid primary key default gen_random_uuid(),
  learner_user_id uuid not null references users(id) on delete cascade,
  created_by_user_id uuid not null references users(id),
  classroom_id uuid null references classrooms(id) on delete set null,
  title varchar(255) null,
  mode text not null default 'exploration' check (mode in ('exploration', 'guided', 'review_only')),
  visibility text not null default 'linked_adults' check (visibility in ('linked_adults', 'private', 'classroom')),
  status text not null default 'active' check (status in ('active', 'archived', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists session_participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references shared_sessions(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  participant_role text not null check (participant_role in ('learner', 'parent', 'teacher', 'admin')),
  permissions jsonb not null default '{}',
  joined_at timestamptz not null default now(),
  left_at timestamptz null
);

-- Add foreign key from conversations to shared_sessions
alter table conversations
  add constraint conversations_shared_session_fk
  foreign key (shared_session_id) references shared_sessions(id)
  on delete set null;

-- Add foreign key from flags and safety_assessments to shared_sessions
alter table flags
  add constraint flags_session_fk
  foreign key (session_id) references shared_sessions(id)
  on delete set null;

alter table safety_assessments
  add constraint safety_assessments_session_fk
  foreign key (session_id) references shared_sessions(id)
  on delete set null;

alter table ai_provider_attempts
  add constraint ai_provider_attempts_session_fk
  foreign key (session_id) references shared_sessions(id)
  on delete set null;

create index if not exists shared_sessions_learner_updated_idx
  on shared_sessions (learner_user_id, updated_at desc);

create index if not exists shared_sessions_classroom_updated_idx
  on shared_sessions (classroom_id, updated_at desc)
  where classroom_id is not null;

create unique index if not exists session_participants_unique_active_idx
  on session_participants (session_id, user_id, participant_role)
  where left_at is null;

create index if not exists conversations_session_created_idx
  on conversations (shared_session_id, created_at desc)
  where shared_session_id is not null;

create index if not exists flags_session_created_idx
  on flags (session_id, created_at desc)
  where session_id is not null;

create index if not exists safety_assessments_session_idx
  on safety_assessments (session_id, created_at desc)
  where session_id is not null;
