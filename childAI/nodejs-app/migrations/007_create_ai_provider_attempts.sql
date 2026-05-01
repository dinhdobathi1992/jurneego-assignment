-- Migration 007: Create ai_provider_attempts table
create table if not exists ai_provider_attempts (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  session_id uuid null,
  message_id uuid null references messages(id) on delete set null,
  provider text not null check (provider in ('mock', 'litellm', 'bedrock')),
  model text not null,
  status text not null check (status in ('success', 'failed', 'timeout', 'cancelled')),
  latency_ms integer null,
  error_code text null,
  input_tokens integer null,
  output_tokens integer null,
  created_at timestamptz not null default now()
);

create index if not exists ai_provider_attempts_conversation_idx
  on ai_provider_attempts (conversation_id, created_at desc);

create index if not exists ai_provider_attempts_provider_status_idx
  on ai_provider_attempts (provider, status, created_at desc);
