# Arkana marketplace

## Local setup

1. Copy `.env.example` to `.env.local`.
2. Add the Supabase URL, anon key, service-role key, and payment credentials.
3. Set `VITE_PAYPAL_ENABLED=true` to show PayPal checkout.
4. Use `PAYPAL_ENV=sandbox` with PayPal sandbox credentials while testing. Use `PAYPAL_ENV=live` only with live credentials.
5. Run `npm install`, then `npm run dev`.

PayPal credentials are server-only and must not use the `VITE_` prefix. In Vercel, add `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET_KEY`, `PAYPAL_ENV`, `SUPABASE_SERVICE_ROLE_KEY`, and `VITE_PAYPAL_ENABLED` to the deployment environment, then redeploy.

Seller PayPal payouts also require `profiles.paypal_merchant_id`. Configure the processing fee rates with `STRIPE_PROCESSING_FEE_PERCENT`, `STRIPE_PROCESSING_FEE_FIXED`, `PAYPAL_PROCESSING_FEE_PERCENT`, and `PAYPAL_PROCESSING_FEE_FIXED`; fixed values are in the account currency and default to zero.
