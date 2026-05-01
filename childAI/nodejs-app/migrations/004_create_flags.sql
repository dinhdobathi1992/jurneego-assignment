-- Migration 004: Create flags table
create table if not exists flags (
  id uuid primary key default gen_random_uuid(),
  session_id uuid null,
  conversation_id uuid not null references conversations(id) on delete cascade,
  message_id uuid not null references messages(id) on delete cascade,
  flag_type text not null check (flag_type in ('self_harm', 'sexual', 'contact_info', 'manipulation', 'other')),
  reason text not null,
  severity text not null check (severity in ('low', 'medium', 'high')),
  reviewed boolean not null default false,
  reviewer_user_id uuid null references users(id),
  reviewer_notes text null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz null
);

create index if not exists flags_reviewed_created_idx
  on flags (reviewed, created_at desc);

create index if not exists flags_conversation_idx
  on flags (conversation_id, created_at desc);
