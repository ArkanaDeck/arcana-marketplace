create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
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

create policy "profiles_are_viewable_by_owners"
on public.profiles for select using (auth.uid() = id);
create policy "profiles_can_update_own_profile"
on public.profiles for update using (auth.uid() = id);
create policy "profiles_can_insert_own_profile"
on public.profiles for insert with check (auth.uid() = id);

create policy "listings_public_read"
on public.listings for select using (true);
create policy "sellers_can_manage_their_listings"
on public.listings for insert with check (auth.uid() = seller_id)
  with check (auth.uid() = seller_id);
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
