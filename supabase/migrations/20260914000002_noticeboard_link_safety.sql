-- Noticeboard safety migration.
-- Preserves all dormant P2P marketplace tables and columns.
-- Safe to run repeatedly in Supabase/PostgreSQL.

-- ============================================================================
-- 1. Active external links must carry both their destination and expiry.
-- ============================================================================

do $$
begin
  alter table public.listings
    drop constraint if exists listings_active_external_link_requirements;

  alter table public.listings
    add constraint listings_active_external_link_requirements
    check (
      external_link_active = false
      or (
        external_store_url is not null
        and external_link_expires_at is not null
      )
    );
exception
  when undefined_table then
    raise notice 'public.listings does not exist; apply the base schema first.';
end;
$$;

-- ============================================================================
-- 2. Changing an approved/active external URL forces moderation.
--
-- The expiry timestamp is deliberately untouched, preserving remaining paid time.
-- IS DISTINCT FROM handles NULL -> value and value -> NULL transitions safely.
-- ============================================================================
create or replace function public.handle_listing_url_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.external_store_url is distinct from new.external_store_url
     and (
       old.review_status = 'approved'
       or old.external_link_active = true
     ) then
    new.review_status := 'pending_review';
    new.requires_manual_review := true;
  end if;

  return new;
end;
$$;

drop trigger if exists listings_external_url_moderation on public.listings;

create trigger listings_external_url_moderation
before update on public.listings
for each row
execute function public.handle_listing_url_changes();

-- ============================================================================
-- 3. Optional payment mapping, preserving the existing credit ledger.
-- ============================================================================
alter table public.listing_credit_purchases
  add column if not exists activated_listing_id uuid;

alter table public.listing_credit_purchases
  drop constraint if exists listing_credit_purchases_activated_listing_id_fkey;

alter table public.listing_credit_purchases
  add constraint listing_credit_purchases_activated_listing_id_fkey
  foreign key (activated_listing_id)
  references public.listings(id)
  on delete set null;

create index if not exists listing_credit_purchases_activated_listing_id_idx
  on public.listing_credit_purchases (activated_listing_id);

notify pgrst, 'reload schema';
