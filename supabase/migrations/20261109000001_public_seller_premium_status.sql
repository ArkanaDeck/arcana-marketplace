begin;

create index if not exists listings_active_promotion_seller_idx
on public.listings (seller_id, external_link_expires_at)
where external_link_active;

create or replace view public.public_profiles
with (security_invoker = false, security_barrier = true) as
select id, coalesce(display_name, full_name) as full_name, avatar_url, bio,
  case when website_link_active and website_link_expires_at > now() then website_url else null end as website_url,
  direct_payment_link,
  exists (
    select 1 from public.listings as promoted
    where promoted.seller_id = profiles.id
      and promoted.external_link_active
      and promoted.external_link_expires_at > now()
      and promoted.external_store_url ~* '^https://'
  ) as is_premium
from public.profiles;

alter view public.public_profiles owner to postgres;
grant select on public.public_profiles to anon, authenticated;

notify pgrst, 'reload schema';

commit;
