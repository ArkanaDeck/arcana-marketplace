create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  legal_name text,
  seller_address_line_1 text,
  seller_address_line_2 text,
  seller_city text,
  seller_postcode text,
  date_of_birth date,
  seller_terms_accepted_at timestamptz,
  seller_payout_status text not null default 'not_started' check (seller_payout_status in ('not_started', 'pending_connect', 'enabled', 'restricted')),
  stripe_connect_account_id text unique,
  paypal_merchant_id text unique,
  listing_credits integer not null default 3 check (listing_credits >= 0),
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists listing_credits integer not null default 3 check (listing_credits >= 0);
alter table public.profiles add column if not exists legal_name text;
alter table public.profiles add column if not exists seller_address_line_1 text;
alter table public.profiles add column if not exists seller_address_line_2 text;
alter table public.profiles add column if not exists seller_city text;
alter table public.profiles add column if not exists seller_postcode text;
alter table public.profiles add column if not exists date_of_birth date;
alter table public.profiles add column if not exists seller_terms_accepted_at timestamptz;
alter table public.profiles add column if not exists seller_payout_status text not null default 'not_started' check (seller_payout_status in ('not_started', 'pending_connect', 'enabled', 'restricted'));
alter table public.profiles add column if not exists stripe_connect_account_id text unique;
alter table public.profiles add column if not exists paypal_merchant_id text unique;

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
  is_free_delivery boolean not null default false check (listing_type <> 'free' or is_free_delivery = false),
  condition text not null default 'good' check (condition in ('new', 'like new', 'good', 'fair', 'poor')),
  created_at timestamptz not null default now()
);

alter table public.listings add column if not exists description text;
alter table public.listings add column if not exists listing_type text not null default 'sale' check (listing_type in ('sale', 'swap', 'free'));
alter table public.listings add column if not exists is_free_delivery boolean not null default false;
update public.listings set is_free_delivery = false where listing_type = 'free' and is_free_delivery = true;
alter table public.listings drop constraint if exists listings_free_delivery_check;
alter table public.listings add constraint listings_free_delivery_check check (listing_type <> 'free' or is_free_delivery = false);
alter table public.listings add column if not exists condition text not null default 'good' check (condition in ('new', 'like new', 'good', 'fair', 'poor'));
alter table public.listings drop constraint if exists listings_price_check;
alter table public.listings drop constraint if exists listings_price_matches_type;
alter table public.listings add constraint listings_price_matches_type check (
  (listing_type = 'sale' and price > 0)
  or (listing_type in ('swap', 'free') and price = 0)
);

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
