-- Idempotent migration for paid 30-day external store-link listings.

alter table public.listings
  add column if not exists is_premium boolean not null default false;

alter table public.listings
  add column if not exists premium_stripe_session_id text;

create unique index if not exists listings_premium_stripe_session_id_key
  on public.listings (premium_stripe_session_id)
  where premium_stripe_session_id is not null;

notify pgrst, 'reload schema';
