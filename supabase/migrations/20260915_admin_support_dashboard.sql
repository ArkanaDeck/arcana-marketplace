-- Adds an admin flag and locks support_tickets/support_messages down to
-- "owner or admin" instead of the previous anon/authenticated "true" policies.

alter table public.profiles add column if not exists is_admin boolean not null default false;

drop policy if exists "Allow anyone to create support tickets" on public.support_tickets;
drop policy if exists "Allow users to view their own tickets" on public.support_tickets;
drop policy if exists "Allow support insertions" on public.support_messages;
drop policy if exists "Allow public support views" on public.support_messages;
drop policy if exists "Allow users to reply to their own tickets" on public.support_messages;
drop policy if exists "Allow users to read their own ticket messages" on public.support_messages;

create policy "Allow anyone to create support tickets"
on public.support_tickets
for insert
with check (true);

create policy "Owners and admins can view tickets"
on public.support_tickets
for select to authenticated
using (
  auth.uid() = user_id
  or exists (select 1 from public.profiles where id = auth.uid() and is_admin)
);

create policy "Admins can update tickets"
on public.support_tickets
for update to authenticated
using (exists (select 1 from public.profiles where id = auth.uid() and is_admin));

create policy "Owners and admins can send support messages"
on public.support_messages
for insert to authenticated
with check (
  sender_id = auth.uid()
  and exists (
    select 1 from public.support_tickets
    where support_tickets.id = support_messages.ticket_id
      and (
        support_tickets.user_id = auth.uid()
        or exists (select 1 from public.profiles where id = auth.uid() and is_admin)
      )
  )
);

create policy "Owners and admins can read support messages"
on public.support_messages
for select to authenticated
using (
  exists (
    select 1 from public.support_tickets
    where support_tickets.id = support_messages.ticket_id
      and (
        support_tickets.user_id = auth.uid()
        or exists (select 1 from public.profiles where id = auth.uid() and is_admin)
      )
  )
);

notify pgrst, 'reload schema';
