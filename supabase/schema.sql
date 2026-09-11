create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  display_name text,
  avatar_url text,
  bio text,
  seller_payout_status text not null default 'not_started' check (seller_payout_status in ('not_started', 'pending_connect', 'enabled', 'restricted')),
  stripe_connect_account_id text unique,
  paypal_merchant_id text unique,
  paypal_email text,
  listing_credits integer not null default 3 check (listing_credits >= 0),
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists listing_credits integer not null default 3 check (listing_credits >= 0);
alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists seller_payout_status text not null default 'not_started' check (seller_payout_status in ('not_started', 'pending_connect', 'enabled', 'restricted'));
alter table public.profiles add column if not exists stripe_connect_account_id text unique;
alter table public.profiles add column if not exists paypal_merchant_id text unique;
alter table public.profiles add column if not exists paypal_email text;
alter table public.profiles add column if not exists subscription_status text not null default 'inactive' check (subscription_status in ('inactive', 'active', 'past_due'));
alter table public.profiles add column if not exists stripe_subscription_id text unique;
-- Requirement 1: sellers' own external checkout link (Stripe Payment Link, PayPal.me, Revolut, etc.).
alter table public.profiles add column if not exists direct_payment_link text default null;
alter table public.profiles add column if not exists website_url text;
alter table public.profiles add column if not exists website_link_active boolean not null default false;
alter table public.profiles add column if not exists website_link_expires_at timestamptz;

create table if not exists public.listing_credit_purchases (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  stripe_session_id text not null unique,
  credits integer not null check (credits > 0),
  amount numeric(10,2) not null check (amount > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid references public.profiles(id) on delete set null,
  name text not null,
  price numeric(10,2) not null check (price >= 0),
  description text,
  listing_type text not null default 'sale' check (listing_type in ('sale', 'swap', 'free')),
  image text,
  images text[] not null default '{}',
  is_active boolean not null default true,
  is_free_delivery boolean not null default false,
  condition text not null default 'good' check (condition in ('new', 'like new', 'good', 'fair', 'poor')),
  created_at timestamptz not null default now()
);
alter table public.listings add column if not exists description text;
alter table public.listings add column if not exists listing_type text not null default 'sale' check (listing_type in ('sale', 'swap', 'free'));
alter table public.listings add column if not exists images text[] not null default '{}';
alter table public.listings add column if not exists is_active boolean not null default true;
alter table public.listings add column if not exists is_free_delivery boolean not null default false;
alter table public.listings add column if not exists review_status text not null default 'approved' check (review_status in ('approved', 'pending_review', 'rejected'));
alter table public.listings add column if not exists external_store_url text;
alter table public.listings add column if not exists external_link_active boolean not null default false;
alter table public.listings add column if not exists external_link_expires_at timestamptz;
-- Stacked-fee ledger: what was actually charged for this listing's bundle at submission time.
alter table public.listings add column if not exists authentication_fee_pence integer not null default 0 check (authentication_fee_pence >= 0);
alter table public.listings add column if not exists insertion_fee_pence integer not null default 0 check (insertion_fee_pence >= 0);
alter table public.listings add column if not exists grand_total_fee_pence integer not null default 0 check (grand_total_fee_pence >= 0);
alter table public.listings drop constraint if exists listings_free_delivery_check;
alter table public.listings add column if not exists condition text not null default 'good';
alter table public.listings drop constraint if exists listings_condition_check;
alter table public.listings drop constraint if exists check_condition_values;
alter table public.listings add constraint check_condition_values check (condition in ('new', 'like new', 'good', 'fair', 'poor'));
alter table public.listings drop constraint if exists listings_price_check;
alter table public.listings drop constraint if exists listings_price_matches_type;
alter table public.listings drop constraint if exists listings_listing_type_check;
alter table public.listings drop constraint if exists listings_name_length_check;
alter table public.listings drop constraint if exists listings_description_length_check;
alter table public.listings add constraint listings_listing_type_check check (listing_type in ('sale', 'swap', 'free'));
alter table public.listings add constraint listings_name_length_check check (length(trim(name)) between 1 and 120);
alter table public.listings add constraint listings_description_length_check check (description is null or length(description) <= 2000);
alter table public.listings add constraint listings_price_matches_type check (
  (listing_type = 'sale' and price > 0)
  or (listing_type in ('swap', 'free') and price = 0)
);

insert into storage.buckets (id, name, public)
values ('listing-images', 'listing-images', true)
on conflict (id) do update set public = true;

drop policy if exists "public_can_view_listing_images" on storage.objects;
drop policy if exists "authenticated_users_can_upload_listing_images" on storage.objects;
drop policy if exists "users_can_delete_own_listing_images" on storage.objects;

create policy "public_can_view_listing_images"
on storage.objects for select
using (bucket_id = 'listing-images');
create policy "authenticated_users_can_upload_listing_images"
on storage.objects for insert to authenticated
with check (bucket_id = 'listing-images' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "users_can_delete_own_listing_images"
on storage.objects for delete to authenticated
using (bucket_id = 'listing-images' and (storage.foldername(name))[1] = (select auth.uid()::text));

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

drop policy if exists "public_can_view_avatars" on storage.objects;
drop policy if exists "authenticated_users_can_upload_own_avatar" on storage.objects;
drop policy if exists "users_can_delete_own_avatar" on storage.objects;

create policy "public_can_view_avatars"
on storage.objects for select
using (bucket_id = 'avatars');
create policy "authenticated_users_can_upload_own_avatar"
on storage.objects for insert to authenticated
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "users_can_delete_own_avatar"
on storage.objects for delete to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid()::text));

create table if not exists public.chat_rooms (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.listings(id) on delete cascade,
  buyer_id uuid not null references auth.users(id) on delete cascade,
  seller_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint unique_buyer_seller_listing unique (listing_id, buyer_id, seller_id),
  constraint chat_room_participants_differ check (buyer_id <> seller_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  text_content text not null check (length(trim(text_content)) between 1 and 2000),
  created_at timestamptz not null default timezone('utc'::text, now())
);
alter table public.messages drop constraint if exists messages_text_content_length_check;
alter table public.messages add constraint messages_text_content_length_check check (length(trim(text_content)) between 1 and 2000);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc'::text, now()),
  sender_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (length(trim(content)) between 1 and 2000)
);

create or replace view public.public_profiles as
select id, coalesce(display_name, full_name) as full_name, avatar_url, bio,
  case when website_link_active and website_link_expires_at > now() then website_url else null end as website_url,
  direct_payment_link
from public.profiles;
grant select on public.public_profiles to anon, authenticated;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid references public.profiles(id) on delete set null,
  listing_id uuid references public.listings(id) on delete set null,
  status text not null default 'created',
  subtotal numeric(10,2) not null default 0,
  shipping numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  delivery_name text,
  delivery_email text,
  delivery_address_line_1 text,
  delivery_address_line_2 text,
  delivery_city text,
  delivery_postcode text,
  delivery_country text not null default 'United Kingdom',
  delivery_service text,
  tracking_reference text,
  dispatched_at timestamptz,
  delivered_at timestamptz,
  buyer_confirmed_at timestamptz,
  dispute_reason text,
  payout_status text not null default 'held' check (payout_status in ('held', 'released', 'blocked')),
  stripe_transfer_id text unique,
  paypal_order_id text unique,
  base_price numeric(10,2),
  platform_fee numeric(10,2),
  grand_total numeric(10,2),
  created_at timestamptz not null default now()
);

alter table public.orders add column if not exists buyer_id uuid references public.profiles(id) on delete set null;
alter table public.orders add column if not exists listing_id uuid references public.listings(id) on delete set null;
alter table public.orders add column if not exists status text not null default 'created';
alter table public.orders add column if not exists subtotal numeric(10,2) not null default 0;
alter table public.orders add column if not exists shipping numeric(10,2) not null default 0;
alter table public.orders add column if not exists total numeric(10,2) not null default 0;
alter table public.orders add column if not exists delivery_name text;
alter table public.orders add column if not exists delivery_email text;
alter table public.orders add column if not exists delivery_address_line_1 text;
alter table public.orders add column if not exists delivery_address_line_2 text;
alter table public.orders add column if not exists delivery_city text;
alter table public.orders add column if not exists delivery_postcode text;
alter table public.orders add column if not exists delivery_country text not null default 'United Kingdom';
alter table public.orders add column if not exists delivery_service text;
alter table public.orders add column if not exists tracking_reference text;
alter table public.orders add column if not exists dispatched_at timestamptz;
alter table public.orders add column if not exists delivered_at timestamptz;
alter table public.orders add column if not exists buyer_confirmed_at timestamptz;
alter table public.orders add column if not exists dispute_reason text;
alter table public.orders add column if not exists payout_status text not null default 'held' check (payout_status in ('held', 'released', 'blocked'));
alter table public.orders add column if not exists stripe_transfer_id text unique;
alter table public.orders add column if not exists paypal_order_id text unique;
alter table public.orders add column if not exists base_price numeric(10,2);
alter table public.orders add column if not exists platform_fee numeric(10,2);
alter table public.orders add column if not exists grand_total numeric(10,2);

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and column_name = 'user_id'
  ) then
    execute 'update public.orders set buyer_id = user_id where buyer_id is null';
  end if;
end;
$$;

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete cascade,
  provider text not null,
  provider_payment_id text,
  status text not null default 'pending',
  amount numeric(10,2) not null,
  created_at timestamptz not null default now()
);

create unique index if not exists payments_provider_payment_id_key
on public.payments (provider_payment_id)
where provider_payment_id is not null;

alter table public.profiles enable row level security;
alter table public.listings enable row level security;
alter table public.chat_rooms enable row level security;
alter table public.messages enable row level security;
alter table public.support_messages enable row level security;
alter table public.orders enable row level security;
alter table public.payments enable row level security;
alter table public.listing_credit_purchases enable row level security;

drop policy if exists "profiles_are_viewable_by_owners" on public.profiles;
drop policy if exists "profiles_can_update_own_profile" on public.profiles;
drop policy if exists "profiles_can_insert_own_profile" on public.profiles;
drop policy if exists "listings_public_read" on public.listings;
drop policy if exists "Allow public read access" on public.listings;
drop policy if exists "sellers_can_manage_their_listings" on public.listings;
drop policy if exists "sellers_can_update_their_listings" on public.listings;
drop policy if exists "Allow owners to update their listings" on public.listings;
drop policy if exists "sellers_can_delete_their_listings" on public.listings;
drop policy if exists "Users can view their own chat rooms" on public.chat_rooms;
drop policy if exists "Authenticated users can create rooms" on public.chat_rooms;
drop policy if exists "Participants can view messages" on public.messages;
drop policy if exists "Participants can post messages" on public.messages;
drop policy if exists "Authenticated users can view support messages" on public.support_messages;
drop policy if exists "Authenticated users can post support messages" on public.support_messages;
drop policy if exists "buyers_can_view_own_orders" on public.orders;
drop policy if exists "buyers_can_create_orders" on public.orders;
drop policy if exists "buyers_can_update_own_orders" on public.orders;
drop policy if exists "payments_viewable_by_order_owner" on public.payments;
drop policy if exists "payments_insertable_by_server" on public.payments;
drop policy if exists "sellers_can_view_own_credit_purchases" on public.listing_credit_purchases;

create policy "profiles_are_viewable_by_owners"
on public.profiles for select using (auth.uid() = id);
create policy "profiles_can_update_own_profile"
on public.profiles for update using (auth.uid() = id);
create policy "profiles_can_insert_own_profile"
on public.profiles for insert with check (auth.uid() = id);

create policy "Allow public read access"
on public.listings
for select
using (true);
create policy "sellers_can_manage_their_listings"
on public.listings for insert with check (auth.uid() = seller_id);
create policy "Allow owners to update their listings"
on public.listings
for update
to authenticated
using ((select auth.uid()) = seller_id)
with check ((select auth.uid()) = seller_id);
create policy "sellers_can_delete_their_listings"
on public.listings for delete using (auth.uid() = seller_id);

create policy "Users can view their own chat rooms"
on public.chat_rooms for select to authenticated
using ((select auth.uid()) = buyer_id or (select auth.uid()) = seller_id);
create policy "Authenticated users can create rooms"
on public.chat_rooms for insert to authenticated
with check (
  (select auth.uid()) = buyer_id
  and buyer_id <> seller_id
  and exists (select 1 from public.listings where id = listing_id and seller_id = chat_rooms.seller_id)
);

create policy "Participants can view messages"
on public.messages for select to authenticated
using (exists (
  select 1
  from public.chat_rooms
  where chat_rooms.id = messages.room_id
    and ((select auth.uid()) = buyer_id or (select auth.uid()) = seller_id)
));
create policy "Participants can post messages"
on public.messages for insert to authenticated
with check (
  (select auth.uid()) = sender_id
  and exists (
    select 1
    from public.chat_rooms
    where chat_rooms.id = messages.room_id
      and ((select auth.uid()) = buyer_id or (select auth.uid()) = seller_id)
  )
);

create policy "Authenticated users can view support messages"
on public.support_messages for select to authenticated
using ((select auth.uid()) = sender_id);
create policy "Authenticated users can post support messages"
on public.support_messages for insert to authenticated
with check ((select auth.uid()) = sender_id);

create policy "buyers_can_view_own_orders"
on public.orders for select using (auth.uid() = buyer_id or auth.uid() = (select seller_id from public.listings where id = listing_id));
create policy "buyers_can_create_orders"
on public.orders for insert with check (auth.uid() = buyer_id);
create policy "buyers_can_update_own_orders"
on public.orders for update using (auth.uid() = buyer_id);

create policy "payments_viewable_by_order_owner"
on public.payments for select using (
  auth.uid() = (select buyer_id from public.orders where id = order_id)
  or auth.uid() = (select seller_id from public.listings where id = (select listing_id from public.orders where id = order_id))
);
create policy "payments_insertable_by_server"
on public.payments for insert with check (true);

create policy "sellers_can_view_own_credit_purchases"
on public.listing_credit_purchases for select using (auth.uid() = seller_id);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'support_messages'
  ) then
    alter publication supabase_realtime add table public.support_messages;
  end if;
end;
$$;

create or replace function public.add_listing_credits(
  purchase_seller_id uuid,
  purchase_stripe_session_id text,
  purchased_credits integer,
  purchase_amount numeric
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.listing_credit_purchases (seller_id, stripe_session_id, credits, amount)
  values (purchase_seller_id, purchase_stripe_session_id, purchased_credits, purchase_amount)
  on conflict (stripe_session_id) do nothing;

  if found then
    update public.profiles
    set listing_credits = listing_credits + purchased_credits
    where id = purchase_seller_id;
  end if;

  return found;
end;
$$;

revoke all on function public.add_listing_credits(uuid, text, integer, numeric) from public;

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, listing_credits)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name', 3)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.create_profile_for_new_user();

-- Tarot deck authentication batches: one seller upload session, billed at a flat per-deck rate.
create table if not exists public.upload_batches (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  deck_count integer not null check (deck_count > 0),
  fee_amount numeric(10,2) not null check (fee_amount >= 0),
  status text not null default 'pending_authentication' check (status in ('pending_authentication', 'pending_payment', 'paid', 'failed')),
  stripe_session_id text unique,
  created_at timestamptz not null default now()
);

create table if not exists public.tarot_listings (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.upload_batches(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  price numeric(10,2) not null check (price >= 0),
  description text,
  condition text not null default 'good' check (condition in ('new', 'like new', 'good', 'fair', 'poor')),
  images text[] not null default '{}',
  silver_stamp_image text,
  certification_image text,
  is_authenticated boolean not null default false,
  authentication_reason text,
  status text not null default 'pending_authentication' check (status in ('pending_authentication', 'active', 'rejected')),
  created_at timestamptz not null default now()
);

alter table public.upload_batches enable row level security;
alter table public.tarot_listings enable row level security;

drop policy if exists "sellers manage their own upload batches" on public.upload_batches;
create policy "sellers manage their own upload batches" on public.upload_batches
  for select using (seller_id = auth.uid());

drop policy if exists "buyers only see active tarot listings" on public.tarot_listings;
create policy "buyers only see active tarot listings" on public.tarot_listings
  for select using (status = 'active' or seller_id = auth.uid());

-- Atomically activates every authenticated listing in a batch once its fee has been paid.
create or replace function public.activate_tarot_batch(
  target_batch_id uuid,
  payment_stripe_session_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.upload_batches
  set status = 'paid', stripe_session_id = coalesce(stripe_session_id, payment_stripe_session_id)
  where id = target_batch_id and status = 'pending_payment';

  if not found then
    return false;
  end if;

  update public.tarot_listings
  set status = 'active'
  where batch_id = target_batch_id and is_authenticated = true and status = 'pending_authentication';

  return true;
end;
$$;

revoke all on function public.activate_tarot_batch(uuid, text) from public;

-- ============================================================================
-- UNIFIED BATCH PIPELINE: single-listing submissions now route through the same
-- upload_batches table used by the tarot deck authentication flow above (a "batch" of 1).
-- ============================================================================
alter table public.listings add column if not exists batch_id uuid references public.upload_batches(id) on delete set null;
alter table public.listings add column if not exists requires_manual_review boolean not null default false;
alter table public.upload_batches add column if not exists authentication_fee_pence integer not null default 0 check (authentication_fee_pence >= 0);
alter table public.upload_batches add column if not exists insertion_fee_pence integer not null default 0 check (insertion_fee_pence >= 0);
alter table public.upload_batches add column if not exists grand_total_fee_pence integer not null default 0 check (grand_total_fee_pence >= 0);

-- Atomically marks a listings-batch paid AND approves every eligible listing in it, in one statement.
-- Listings flagged requires_manual_review stay pending_review even after payment clears.
create or replace function public.activate_listing_batch(target_batch_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.upload_batches
  set status = 'paid'
  where id = target_batch_id and status = 'pending_payment';

  if not found then
    return false;
  end if;

  update public.listings
  set review_status = 'approved'
  where batch_id = target_batch_id and review_status = 'pending_review' and requires_manual_review = false;

  return true;
end;
$$;

revoke all on function public.activate_listing_batch(uuid) from public;

-- Atomically records the stacked-fee ledger AND approves the listing in a single statement —
-- if either the fee breakdown or the approval itself fails, nothing commits (no partial 'approved' state).
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

