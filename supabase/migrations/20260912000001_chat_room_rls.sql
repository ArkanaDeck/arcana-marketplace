-- Idempotent chat-room RLS repair.
-- Keeps room creation participant-scoped; do not replace these predicates with USING (true).

alter table public.chat_rooms enable row level security;

drop policy if exists "Allow authenticated users to create chat rooms" on public.chat_rooms;
drop policy if exists "Allow users to view their own chat rooms" on public.chat_rooms;
drop policy if exists "Authenticated users can create rooms" on public.chat_rooms;
drop policy if exists "Users can view their own chat rooms" on public.chat_rooms;

create policy "Authenticated users can create rooms"
on public.chat_rooms
for insert
to authenticated
with check (
  (select auth.uid()) = buyer_id
  and buyer_id <> seller_id
  and exists (
    select 1
    from public.listings
    where listings.id = chat_rooms.listing_id
      and listings.seller_id = chat_rooms.seller_id
      and listings.is_active = true
  )
);

create policy "Users can view their own chat rooms"
on public.chat_rooms
for select
to authenticated
using ((select auth.uid()) = buyer_id or (select auth.uid()) = seller_id);

notify pgrst, 'reload schema';
