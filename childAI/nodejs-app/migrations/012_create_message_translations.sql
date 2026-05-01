-- Migration 012: Create message_translations table
create table if not exists message_translations (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references messages(id) on delete cascade,
  requested_by_user_id uuid not null references users(id),
  source_language text not null,
  target_language text not null,
  translated_content text not null,
  provider text null,
  model text null,
  created_at timestamptz not null default now()
);

create unique index if not exists message_translations_unique_idx
  on message_translations (message_id, requested_by_user_id, target_language);
