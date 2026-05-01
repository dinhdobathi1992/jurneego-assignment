-- Migration 005: Create safety_assessments table
create table if not exists safety_assessments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid null,
  message_id uuid null references messages(id) on delete cascade,
  conversation_id uuid null references conversations(id) on delete cascade,
  direction text not null check (direction in ('input', 'output')),
  checker text not null check (checker in ('rule', 'llm', 'provider')),
  is_safe boolean not null,
  flag_type text null,
  severity text null,
  confidence double precision not null default 1.0,
  reason text null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists safety_assessments_message_idx
  on safety_assessments (message_id, created_at desc);

create index if not exists safety_assessments_conversation_idx
  on safety_assessments (conversation_id, created_at desc);
