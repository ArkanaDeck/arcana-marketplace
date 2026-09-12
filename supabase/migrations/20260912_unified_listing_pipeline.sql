-- Idempotent unified listing-batch migration.
-- Safe to run repeatedly after the base schema and subscription migrations.

create table if not exists public.upload_batches (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  deck_count integer not null check (deck_count > 0),
  fee_amount numeric(10,2) not null default 0 check (fee_amount >= 0),
  status text not null default 'pending_authentication'
    check (status in ('pending_authentication', 'pending_payment', 'paid', 'failed')),
  stripe_session_id text unique,
  created_at timestamptz not null default now()
);

alter table public.upload_batches
  add column if not exists authentication_fee_pence integer not null default 0;

alter table public.upload_batches
  add column if not exists insertion_fee_pence integer not null default 0;

alter table public.upload_batches
  add column if not exists grand_total_fee_pence integer not null default 0;

alter table public.listings
  add column if not exists batch_id uuid references public.upload_batches(id) on delete set null;

alter table public.listings
  add column if not exists requires_manual_review boolean not null default false;

alter table public.listings
  add column if not exists authenticated boolean not null default false;

alter table public.listings
  add column if not exists authentication_fee_pence integer not null default 0;

alter table public.listings
  add column if not exists insertion_fee_pence integer not null default 0;

alter table public.listings
  add column if not exists grand_total_fee_pence integer not null default 0;

alter table public.upload_batches
  drop constraint if exists upload_batches_fee_components_nonnegative;

alter table public.upload_batches
  add constraint upload_batches_fee_components_nonnegative
  check (
    authentication_fee_pence >= 0
    and insertion_fee_pence >= 0
    and grand_total_fee_pence >= 0
  );

alter table public.listings
  drop constraint if exists listings_fee_components_nonnegative;

alter table public.listings
  add constraint listings_fee_components_nonnegative
  check (
    authentication_fee_pence >= 0
    and insertion_fee_pence >= 0
    and grand_total_fee_pence >= 0
  );

create index if not exists listings_batch_id_idx
  on public.listings (batch_id);

create index if not exists upload_batches_seller_id_idx
  on public.upload_batches (seller_id);

alter table public.upload_batches enable row level security;

drop policy if exists "sellers manage their own upload batches" on public.upload_batches;
create policy "sellers manage their own upload batches"
  on public.upload_batches for select
  using (seller_id = auth.uid());

-- Atomic batch activation: payment state and eligible listing visibility change together.
create or replace function public.activate_listing_batch(target_batch_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.upload_batches
  set status = 'paid'
  where id = target_batch_id
    and status = 'pending_payment';

  if not found then
    return false;
  end if;

  update public.listings
  set review_status = 'approved'
  where batch_id = target_batch_id
    and review_status = 'pending_review'
    and requires_manual_review = false
    and authenticated = true;

  return true;
end;
$$;

revoke all on function public.activate_listing_batch(uuid) from public;

-- Atomic single-listing ledger update used by the legacy listing-fee webhook path.
create or replace function public.approve_paid_listing(
  target_listing_id uuid,
  target_seller_id uuid,
  p_authentication_fee_pence integer,
  p_insertion_fee_pence integer,
  p_grand_total_pence integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.listings
  set review_status = 'approved',
      authentication_fee_pence = p_authentication_fee_pence,
      insertion_fee_pence = p_insertion_fee_pence,
      grand_total_fee_pence = p_grand_total_pence
  where id = target_listing_id
    and seller_id = target_seller_id
    and review_status = 'pending_review';

  return found;
end;
$$;

revoke all on function public.approve_paid_listing(uuid, uuid, integer, integer, integer) from public;

notify pgrst, 'reload schema';
