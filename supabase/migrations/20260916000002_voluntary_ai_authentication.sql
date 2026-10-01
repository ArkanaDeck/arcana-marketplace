-- AI authenticity checks become opt-in: track whether a listing actually went through the
-- vision check, separately from any listing-approval gating.
alter table public.listings add column if not exists is_ai_authenticated boolean not null default false;

notify pgrst, 'reload schema';
