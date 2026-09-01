create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  listing_credits integer not null default 3 check (listing_credits >= 0),
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists listing_credits integer not null default 3 check (listing_credits >= 0);

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
  price numeric(10,2) not null check (price > 0),
  image text,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid references public.profiles(id) on delete set null,
  listing_id uuid references public.listings(id) on delete set null,
  status text not null default 'created',
  subtotal numeric(10,2) not null default 0,
  shipping numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  created_at timestamptz not null default now()
);

alter table public.orders add column if not exists buyer_id uuid references public.profiles(id) on delete set null;
alter table public.orders add column if not exists listing_id uuid references public.listings(id) on delete set null;
alter table public.orders add column if not exists status text not null default 'created';
alter table public.orders add column if not exists subtotal numeric(10,2) not null default 0;
alter table public.orders add column if not exists shipping numeric(10,2) not null default 0;
alter table public.orders add column if not exists total numeric(10,2) not null default 0;

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

alter table public.profiles enable row level security;
alter table public.listings enable row level security;
alter table public.orders enable row level security;
alter table public.payments enable row level security;
alter table public.listing_credit_purchases enable row level security;

drop policy if exists "profiles_are_viewable_by_owners" on public.profiles;
drop policy if exists "profiles_can_update_own_profile" on public.profiles;
drop policy if exists "profiles_can_insert_own_profile" on public.profiles;
drop policy if exists "listings_public_read" on public.listings;
drop policy if exists "sellers_can_manage_their_listings" on public.listings;
drop policy if exists "sellers_can_update_their_listings" on public.listings;
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

create policy "listings_public_read"
on public.listings for select using (true);
create policy "sellers_can_manage_their_listings"
on public.listings for insert with check (auth.uid() = seller_id);
create policy "sellers_can_update_their_listings"
on public.listings for update using (auth.uid() = seller_id);
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
