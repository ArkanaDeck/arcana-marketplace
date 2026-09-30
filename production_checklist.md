# Arkana Production Checklist

Release owner: __________  Target date: __________  Production URL: __________

Do not treat code or environment-variable presence as proof that a production service is configured. Record evidence for each gate and keep incomplete items unchecked.

Vercel deployment, production variables, domain/HTTPS, and logs/monitoring checks below were marked complete from operator confirmation on 2026-09-30. Reverify them before the next release.

## 1. Deployment and configuration

- [x] Confirm the production domain, DNS, and canonical HTTPS URL. Set `VITE_APP_URL` to that URL without a trailing slash.
- [x] Configure Vercel Production values: `VITE_APP_URL`, `VITE_SITE_NAME`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_STRIPE_PUBLISHABLE_KEY`.
- [x] Configure server-only production values: `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, and `STRIPE_WEBHOOK_SECRET`. Never expose server secrets through `VITE_` variables.
- [ ] If enabling PayPal, set `VITE_PAYPAL_ENABLED=true`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, and `PAYPAL_ENV=live`; confirm the production merchant/account configuration.
- [ ] Configure optional services only when enabled: Resend email credentials, vision provider credentials, and processing-fee settings.
- [x] Confirm all values are set in the Vercel Production environment (not only Preview), then redeploy after changes.
- [ ] Confirm build output contains no secrets and that source maps are not published unintentionally.

## 2. Supabase and account security

- [ ] Apply all intended database migrations to the production Supabase project and confirm the deployed schema is current.
- [ ] Review RLS on every user- or marketplace-owned table. Test anonymous, buyer, seller, and administrative access with separate accounts.
- [ ] Verify storage bucket policies, upload limits, and access to listing images.
- [ ] Configure production auth site URL and redirect URLs; test sign-up, email confirmation, sign-in, sign-out, password reset, and account deletion.
- [ ] Confirm the service-role key is used only in server code and the anon key is subject to RLS.

## 3. Payments and fulfillment

- [ ] Confirm the intended production checkout model with the product owner. The current active app uses direct payment links; the legacy escrow, order-state, and seller-payout UI is disabled.
- [ ] Test a complete purchase using provider test/sandbox credentials before enabling live credentials. Verify amount, currency, seller link, failure, cancellation, and duplicate-submit behavior.
- [ ] Configure the Stripe webhook at `https://<production-domain>/api/stripe-webhook`; verify its signing secret and test successful, failed, and repeated webhook deliveries.
- [ ] If PayPal is enabled, test order creation and capture in sandbox before switching both credentials and `PAYPAL_ENV` to live.
- [ ] Document who handles fulfillment, refunds, disputes, and payment-provider support. Do not represent the legacy scheduled payout flow as active unless escrow is deliberately re-enabled and tested.
- [ ] If escrow/payout code is re-enabled, separately verify Connect onboarding, order transitions, payout eligibility, the `/api/release-expired-payouts` cron, and its `CRON_SECRET` before launch.

## 4. Security, privacy, and operations

- [ ] Inspect deployed response headers. Confirm CSP allows only required origins and that HSTS, clickjacking protection, MIME sniffing protection, referrer policy, and permissions policy are appropriate.
- [ ] Confirm HTTPS redirects, application error handling, and auth-protected routes on the production domain.
- [x] Verify production access to Vercel function logs and assign an owner for payment, auth, and availability incidents.
- [ ] Review the published privacy, terms, refund, and shipping information against the actual checkout and fulfillment model.
- [ ] Confirm backups and recovery procedures for production data; identify who can access and restore them.
- [ ] Review third-party service access, production credentials, and incident contacts. Rotate any credential exposed outside its intended secret store.

## 5. Release verification

- [ ] Run `npm test` successfully.
- [ ] Run `npm run build` successfully using the production build environment.
- [ ] Deploy a Vercel Preview and smoke-test home, search, listing details, account flows, seller listing creation, and payment entry points on desktop and mobile.
- [ ] Verify browser console, network requests, server logs, metadata, sitemap, and `robots.txt` on the preview.
- [ ] Repeat critical smoke tests on the production domain after deployment; verify headers, auth redirects, payment provider mode, and webhook delivery.
- [ ] Confirm Capacitor app identifier and display name match the registered iOS app before submitting a native release.
- [ ] Record test results, deployment URL/build, remaining known issues, rollback owner, and explicit go/no-go approval.

## 6. Rollback

- [ ] Identify the last known-good Vercel deployment and confirm the release owner can promote it.
- [ ] Document how to disable affected payment methods or listing flows without deleting transaction records.
- [ ] For payment incidents, inspect the provider dashboard and corresponding database records before retrying a capture or refund.
- [ ] After rollback, verify the production deployment, auth, and payment state; communicate status to affected users.pls wipe the 5