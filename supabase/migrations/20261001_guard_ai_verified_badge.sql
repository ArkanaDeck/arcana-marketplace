-- The AI Verified badge is now shown to buyers, so only the server (service role) may grant it.
alter table public.listings add column if not exists is_ai_authenticated boolean not null default false;

create or replace function public.guard_listing_ai_badge()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- anon/authenticated are the roles PostgREST uses for browser requests.
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.authenticated := false;
      new.is_ai_authenticated := false;
    elsif new.images is distinct from old.images or new.image is distinct from old.image then
      -- New photos were never checked, so the badge no longer applies.
      new.authenticated := false;
      new.is_ai_authenticated := false;
    else
      new.authenticated := old.authenticated;
      new.is_ai_authenticated := old.is_ai_authenticated;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists listings_guard_ai_badge on public.listings;
create trigger listings_guard_ai_badge
before insert or update on public.listings
for each row execute function public.guard_listing_ai_badge();

notify pgrst, 'reload schema';
