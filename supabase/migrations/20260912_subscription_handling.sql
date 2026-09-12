-- Idempotent seller subscription migration.
-- Safe to run repeatedly in an existing Supabase project.

alter table public.profiles
  add column if not exists subscription_status text not null default 'inactive';

alter table public.profiles
  add column if not exists stripe_subscription_id text;

alter table public.profiles
  drop constraint if exists profiles_subscription_status_check;

alter table public.profiles
  add constraint profiles_subscription_status_check
  check (subscription_status in ('inactive', 'active', 'past_due'));

create unique index if not exists profiles_stripe_subscription_id_key
  on public.profiles (stripe_subscription_id)
  where stripe_subscription_id is not null;

notify pgrst, 'reload schema';
