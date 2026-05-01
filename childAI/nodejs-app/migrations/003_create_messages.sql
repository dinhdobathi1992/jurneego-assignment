-- Migration 003: Create messages table
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  created_by_user_id uuid null references users(id),
  role text not null check (role in ('learner', 'assistant', 'system')),
  content text not null,
  language text not null default 'en',
  status text not null default 'completed' check (status in ('pending', 'streaming', 'completed', 'cancelled', 'failed')),
  is_safe boolean null,
  safety_score double precision null,
  ai_provider text null,
  ai_model text null,
  token_count integer null,
  latency_ms integer null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  completed_at timestamptz null
);

create index if not exists messages_conversation_created_idx
  on messages (conversation_id, created_at asc);

create index if not exists messages_role_idx
  on messages (conversation_id, role);
