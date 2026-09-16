alter table public.listings
  add column if not exists status text not null default 'active';

alter table public.listings
  drop constraint if exists listings_status_check;

alter table public.listings
  add constraint listings_status_check check (status in ('active', 'sold', 'completed'));

create index if not exists listings_status_idx on public.listings (status);

notify pgrst, 'reload schema';
