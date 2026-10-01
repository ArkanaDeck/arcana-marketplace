-- Apple App Store guideline 5.1.1(v) requires in-app account deletion.
-- SECURITY DEFINER is required to reach auth.users, but the delete is hard-scoped to auth.uid().

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    current_user_id uuid := auth.uid();
begin
    if current_user_id is null then
        raise exception 'Not authenticated';
    end if;

    delete from auth.users where id = current_user_id;
end;
$$;

revoke all on function public.delete_own_account() from public;
revoke all on function public.delete_own_account() from anon;
grant execute on function public.delete_own_account() to authenticated;
