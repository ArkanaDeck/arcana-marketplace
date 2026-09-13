-- Idempotent guest/authenticated support-chat migration.

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  status text not null default 'open' check (status in ('open', 'closed'))
);

alter table public.support_messages
  alter column sender_id drop not null;

alter table public.support_messages
  add column if not exists ticket_id uuid references public.support_tickets(id) on delete cascade;

alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;

drop policy if exists "Allow anyone to create support tickets" on public.support_tickets;
drop policy if exists "Allow users to view their own tickets" on public.support_tickets;
drop policy if exists "Allow anyone to send support messages" on public.support_messages;
drop policy if exists "Allow anyone to read support messages" on public.support_messages;
drop policy if exists "Allow users to reply to their own tickets" on public.support_messages;
drop policy if exists "Allow users to read their own ticket messages" on public.support_messages;
drop policy if exists "Authenticated users can view support messages" on public.support_messages;
drop policy if exists "Authenticated users can post support messages" on public.support_messages;

create policy "Allow anyone to create support tickets"
on public.support_tickets
for insert
with check (true);

create policy "Allow users to view their own tickets"
on public.support_tickets
for select to authenticated
using (auth.uid() = user_id or user_id is null);

create policy "Allow users to reply to their own tickets"
on public.support_messages
for insert to authenticated
with check (
  exists (
    select 1 from public.support_tickets
    where public.support_tickets.id = support_messages.ticket_id
      and public.support_tickets.user_id = auth.uid()
  )
);

create policy "Allow users to read their own ticket messages"
on public.support_messages
for select to authenticated
using (
  exists (
    select 1 from public.support_tickets
    where public.support_tickets.id = support_messages.ticket_id
      and public.support_tickets.user_id = auth.uid()
  )
);

notify pgrst, 'reload schema';
