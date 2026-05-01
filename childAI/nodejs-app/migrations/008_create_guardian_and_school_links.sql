-- Migration 008: Create guardian/school/classroom tables and parent_child_links
create table if not exists schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists classrooms (
  id uuid primary key default gen_random_uuid(),
  school_id uuid null references schools(id) on delete set null,
  name text not null,
  grade_level text null,
  academic_year text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists classroom_memberships (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references classrooms(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  membership_role text not null check (membership_role in ('student', 'teacher')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists parent_child_links (
  id uuid primary key default gen_random_uuid(),
  parent_user_id uuid not null references users(id) on delete cascade,
  child_user_id uuid not null references users(id) on delete cascade,
  relationship_type text not null default 'parent',
  status text not null default 'active' check (status in ('active', 'inactive', 'pending')),
  consent_source text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists parent_child_links_unique_active_idx
  on parent_child_links (parent_user_id, child_user_id)
  where status = 'active';

create index if not exists parent_child_links_child_idx
  on parent_child_links (child_user_id, status);

create unique index if not exists classroom_memberships_unique_active_idx
  on classroom_memberships (classroom_id, user_id, membership_role)
  where status = 'active';

create index if not exists classroom_memberships_user_role_idx
  on classroom_memberships (user_id, membership_role, status);
