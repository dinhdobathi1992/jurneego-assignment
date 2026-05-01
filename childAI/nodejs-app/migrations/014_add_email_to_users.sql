-- Migration 014: Add email column to users table
alter table users add column if not exists email text null;
