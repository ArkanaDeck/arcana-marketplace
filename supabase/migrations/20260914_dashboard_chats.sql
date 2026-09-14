-- Idempotent dashboard chat compatibility migration.
-- Keeps legacy chat_rooms/messages columns intact while adding the requested chats/chat_id/text shape.

create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.listings(id) on delete cascade not null,
  buyer_id uuid references auth.users(id) on delete cascade not null,
  seller_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  unique (listing_id, buyer_id, seller_id),
  constraint chats_participants_differ check (buyer_id <> seller_id)
);

alter table public.messages alter column room_id drop not null;
alter table public.messages alter column text_content drop not null;
alter table public.messages add column if not exists chat_id uuid references public.chats(id) on delete cascade;
alter table public.messages add column if not exists text text;

alter table public.chats enable row level security;
alter table public.messages enable row level security;

drop policy if exists "Dashboard users can view their chats" on public.chats;
drop policy if exists "Dashboard users can create chats" on public.chats;
drop policy if exists "Dashboard users can view chat messages" on public.messages;
drop policy if exists "Dashboard users can send chat messages" on public.messages;

create policy "Dashboard users can view their chats"
on public.chats for select to authenticated
using (auth.uid() = buyer_id or auth.uid() = seller_id);

create policy "Dashboard users can create chats"
on public.chats for insert to authenticated
with check (auth.uid() = buyer_id and buyer_id <> seller_id);

create policy "Dashboard users can view chat messages"
on public.messages for select to authenticated
using (
  exists (
    select 1 from public.chats
    where chats.id = messages.chat_id
      and (chats.buyer_id = auth.uid() or chats.seller_id = auth.uid())
  )
  or exists (
    select 1 from public.chat_rooms
    where chat_rooms.id = messages.room_id
      and (chat_rooms.buyer_id = auth.uid() or chat_rooms.seller_id = auth.uid())
  )
);

create policy "Dashboard users can send chat messages"
on public.messages for insert to authenticated
with check (
  auth.uid() = sender_id
  and exists (
    select 1 from public.chats
    where chats.id = messages.chat_id
      and (chats.buyer_id = auth.uid() or chats.seller_id = auth.uid())
  )
);

notify pgrst, 'reload schema';
