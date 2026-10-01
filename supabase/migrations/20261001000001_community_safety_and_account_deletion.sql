create table if not exists public.user_blocks (
    blocker_id uuid not null references auth.users(id) on delete cascade,
    blocked_id uuid not null references auth.users(id) on delete cascade,
    created_at timestamptz not null default timezone('utc'::text, now()),
    primary key (blocker_id, blocked_id),
    constraint user_blocks_not_self check (blocker_id <> blocked_id)
);
create index if not exists user_blocks_blocked_id_idx on public.user_blocks (blocked_id);

alter table public.user_blocks enable row level security;
revoke all on public.user_blocks from anon, authenticated;
grant select, insert, delete on public.user_blocks to authenticated;

drop policy if exists "Users can view their own blocks" on public.user_blocks;
drop policy if exists "Users can block other users" on public.user_blocks;
drop policy if exists "Users can unblock other users" on public.user_blocks;

create policy "Users can view their own blocks"
on public.user_blocks for select to authenticated
using (blocker_id = auth.uid());

create policy "Users can block other users"
on public.user_blocks for insert to authenticated
with check (blocker_id = auth.uid() and blocked_id <> auth.uid());

create policy "Users can unblock other users"
on public.user_blocks for delete to authenticated
using (blocker_id = auth.uid());

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create or replace function private.users_have_blocked(p_user_a uuid, p_user_b uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
    select exists (
        select 1 from public.user_blocks
        where (blocker_id = p_user_a and blocked_id = p_user_b)
           or (blocker_id = p_user_b and blocked_id = p_user_a)
    );
$$;
revoke all on function private.users_have_blocked(uuid, uuid) from public, anon;
grant execute on function private.users_have_blocked(uuid, uuid) to authenticated;

drop policy if exists "Dashboard users can view their chats" on public.chats;
drop policy if exists "Dashboard users can create chats" on public.chats;
drop policy if exists "Allow authenticated users to create chats" on public.chats;

create policy "Dashboard users can view their chats"
on public.chats for select to authenticated
using (
    (auth.uid() = buyer_id or auth.uid() = seller_id)
    and not private.users_have_blocked(buyer_id, seller_id)
);

create policy "Dashboard users can create chats"
on public.chats for insert to authenticated
with check (
    auth.uid() = buyer_id
    and buyer_id <> seller_id
    and not private.users_have_blocked(buyer_id, seller_id)
);

drop policy if exists "Users can view their own chat rooms" on public.chat_rooms;
drop policy if exists "Authenticated users can create rooms" on public.chat_rooms;
drop policy if exists "allow public access" on public.chat_rooms;

create policy "Users can view their own chat rooms"
on public.chat_rooms for select to authenticated
using (
    (auth.uid() = buyer_id or auth.uid() = seller_id)
    and not private.users_have_blocked(buyer_id, seller_id)
);

create policy "Authenticated users can create rooms"
on public.chat_rooms for insert to authenticated
with check (
    auth.uid() = buyer_id
    and buyer_id <> seller_id
    and not private.users_have_blocked(buyer_id, seller_id)
    and exists (select 1 from public.listings where id = listing_id and seller_id = chat_rooms.seller_id)
);

drop policy if exists "Participants can view messages" on public.messages;
drop policy if exists "Dashboard users can view chat messages" on public.messages;
drop policy if exists "Participants can post messages" on public.messages;
drop policy if exists "Dashboard users can send chat messages" on public.messages;

create policy "Participants can view messages"
on public.messages for select to authenticated
using (
    exists (
        select 1 from public.chats
        where chats.id = messages.chat_id
          and (auth.uid() = chats.buyer_id or auth.uid() = chats.seller_id)
          and not private.users_have_blocked(chats.buyer_id, chats.seller_id)
    )
    or exists (
        select 1 from public.chat_rooms
        where chat_rooms.id = messages.room_id
          and (auth.uid() = chat_rooms.buyer_id or auth.uid() = chat_rooms.seller_id)
          and not private.users_have_blocked(chat_rooms.buyer_id, chat_rooms.seller_id)
    )
);

create policy "Participants can post messages"
on public.messages for insert to authenticated
with check (
    auth.uid() = sender_id
    and (
        exists (
            select 1 from public.chats
            where chats.id = messages.chat_id
              and (auth.uid() = chats.buyer_id or auth.uid() = chats.seller_id)
              and not private.users_have_blocked(chats.buyer_id, chats.seller_id)
        )
        or exists (
            select 1 from public.chat_rooms
            where chat_rooms.id = messages.room_id
              and (auth.uid() = chat_rooms.buyer_id or auth.uid() = chat_rooms.seller_id)
              and not private.users_have_blocked(chat_rooms.buyer_id, chat_rooms.seller_id)
        )
    )
);

create or replace function public.submit_content_report(
    p_target_type text,
    p_target_id text,
    p_details text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
    current_user_id uuid := auth.uid();
    report_ticket_id uuid;
    report_content text;
begin
    if current_user_id is null then
        raise exception 'Sign in to report content';
    end if;
    if p_target_type is null or p_target_type not in ('listing', 'seller', 'chat') then
        raise exception 'Invalid report target';
    end if;
    if length(trim(coalesce(p_target_id, ''))) = 0 or length(trim(coalesce(p_details, ''))) < 5 then
        raise exception 'A report target and reason are required';
    end if;
    if length(p_target_id) > 100 or length(p_details) > 1500 then
        raise exception 'Report details are too long';
    end if;

    report_content := format(E'Community report\nType: %s\nTarget ID: %s\nDetails: %s', p_target_type, p_target_id, trim(p_details));
    insert into public.support_tickets (user_id, status)
    values (current_user_id, 'open')
    returning id into report_ticket_id;

    insert into public.support_messages (ticket_id, sender_id, text, content)
    values (report_ticket_id, current_user_id, report_content, report_content);

    return report_ticket_id;
end;
$$;
revoke all on function public.submit_content_report(text, text, text) from public, anon;
grant execute on function public.submit_content_report(text, text, text) to authenticated;

create or replace function public.admin_remove_reported_listing(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
    if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
        raise exception 'Not authorized';
    end if;

    update public.listings
    set is_active = false, review_status = 'rejected'
    where id = p_listing_id;
    if not found then
        raise exception 'Listing not found';
    end if;
end;
$$;
revoke all on function public.admin_remove_reported_listing(uuid) from public, anon;
grant execute on function public.admin_remove_reported_listing(uuid) to authenticated;

do $$
begin
    if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'orders' and column_name = 'user_id'
    ) then
        execute 'alter table public.orders alter column user_id drop not null';
    end if;
end;
$$;

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
    current_user_id uuid := auth.uid();
begin
    if current_user_id is null then
        raise exception 'Not authenticated';
    end if;

    update public.orders
    set buyer_id = null,
        delivery_name = null,
        delivery_email = null,
        delivery_address_line_1 = null,
        delivery_address_line_2 = null,
        delivery_city = null,
        delivery_postcode = null,
        delivery_country = 'United Kingdom',
        tracking_reference = null,
        dispute_reason = null
    where buyer_id = current_user_id;

    if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'orders' and column_name = 'user_id'
    ) then
        execute 'update public.orders set user_id = null where user_id::text = $1' using current_user_id::text;
    end if;

    delete from public.support_tickets where user_id = current_user_id;
    delete from public.listings where seller_id = current_user_id;
    delete from public.chats where buyer_id = current_user_id or seller_id = current_user_id;
    delete from public.chat_rooms where buyer_id = current_user_id or seller_id = current_user_id;
    delete from auth.users where id = current_user_id;
end;
$$;

revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;