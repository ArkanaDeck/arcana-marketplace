# Arkana marketplace

## Configuration and deployment

Copy `.env.example` to `.env.local`, replace its placeholders, then run `npm install` and `npm run dev`. The example file contains only placeholders and is safe to commit; `.env.local` is ignored.

In Vercel, add the following values to **Production**, and use the live payment credentials only after testing previews with sandbox/test credentials:

- Public: `VITE_APP_URL`, `VITE_SITE_NAME`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_STRIPE_PUBLISHABLE_KEY`, `VITE_PAYPAL_ENABLED`
- Server-only: `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENV`, `CRON_SECRET`
- Optional email: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
- Optional fees: `STRIPE_PROCESSING_FEE_PERCENT`, `STRIPE_PROCESSING_FEE_FIXED`, `PAYPAL_PROCESSING_FEE_PERCENT`, `PAYPAL_PROCESSING_FEE_FIXED`

Set `VITE_APP_URL` to the canonical HTTPS production URL without a trailing slash. Configure Stripe's webhook endpoint as `https://your-domain/api/stripe-webhook` and copy its signing secret into `STRIPE_WEBHOOK_SECRET`. Configure `CRON_SECRET` as a long random value; Vercel provides it to the scheduled payout endpoint. The repository's `vercel.json` applies a restrictive CSP, HSTS, clickjacking protection, MIME sniffing protection, referrer policy, permissions policy, and cross-origin opener policy.

PayPal credentials are server-only and must not use the `VITE_` prefix. Set `VITE_PAYPAL_ENABLED=true` only when PayPal is configured. Use `PAYPAL_ENV=sandbox` with PayPal sandbox credentials while testing and `PAYPAL_ENV=live` with live credentials in production. `PAYPAL_SECRET_KEY` remains supported as a temporary compatibility fallback.

Seller PayPal payouts also require `profiles.paypal_merchant_id`. Configure the processing fee rates with `STRIPE_PROCESSING_FEE_PERCENT`, `STRIPE_PROCESSING_FEE_FIXED`, `PAYPAL_PROCESSING_FEE_PERCENT`, and `PAYPAL_PROCESSING_FEE_FIXED`; fixed values are in the account currency and default to zero.
