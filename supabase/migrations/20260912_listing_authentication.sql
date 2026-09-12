-- Idempotent migration for vision-authenticated listing submissions.
-- Safe to run repeatedly in an existing Supabase project.

alter table public.listings
  add column if not exists authenticated boolean not null default false;

notify pgrst, 'reload schema';
