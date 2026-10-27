begin;

create or replace view public.public_profiles
with (security_invoker = false, security_barrier = true) as
select id, coalesce(display_name, full_name) as full_name, avatar_url, bio,
  case when website_link_active and website_link_expires_at > now() then website_url else null end as website_url,
  direct_payment_link
from public.profiles;

alter view public.public_profiles owner to postgres;
grant select on public.public_profiles to anon, authenticated;

commit;
