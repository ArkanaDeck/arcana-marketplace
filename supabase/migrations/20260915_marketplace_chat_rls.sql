-- Ensure marketplace chat rooms and messages are usable by authenticated participants only.

alter table public.chats enable row level security;
alter table public.messages enable row level security;
alter table public.chat_rooms enable row level security;

revoke insert on public.chats from anon;
revoke insert on public.messages from anon;
revoke insert on public.chat_rooms from anon;

drop policy if exists "Dashboard users can view their chats" on public.chats;
drop policy if exists "Dashboard users can create chats" on public.chats;
drop policy if exists "Allow authenticated users to create chats" on public.chats;

create policy "Dashboard users can view their chats"
on public.chats for select to authenticated
using (auth.uid() = buyer_id or auth.uid() = seller_id);

create policy "Dashboard users can create chats"
on public.chats for insert to authenticated
with check (auth.uid() = buyer_id and buyer_id <> seller_id);

drop policy if exists "Dashboard users can view chat messages" on public.messages;
drop policy if exists "Dashboard users can send chat messages" on public.messages;

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