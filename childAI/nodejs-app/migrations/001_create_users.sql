-- Migration 001: Create users and user_roles tables
-- Up
create extension if not exists "pgcrypto";

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  external_subject text unique not null,
  primary_role text not null check (primary_role in ('learner', 'parent', 'teacher', 'admin', 'service')),
  display_name text null,
  email text null,
  preferred_language text not null default 'en',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists user_roles (
  user_id uuid not null references users(id) on delete cascade,
  role text not null check (role in ('learner', 'parent', 'teacher', 'admin', 'service')),
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create index if not exists users_external_subject_idx on users (external_subject);
create index if not exists user_roles_user_id_idx on user_roles (user_id);
