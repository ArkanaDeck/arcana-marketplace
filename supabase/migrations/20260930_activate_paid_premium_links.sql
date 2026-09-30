-- Premium listings paid before the link-activation fix were saved with external_link_active = false,
-- so their seller web store link never displayed. Activate them for 30 days from when they were paid.
update public.listings
set external_link_active = true,
    external_link_expires_at = coalesce(external_link_expires_at, created_at + interval '30 days')
where is_premium = true
  and premium_stripe_session_id is not null
  and external_store_url ~* '^https?://'
  and external_link_active = false;
