# Arkana marketplace

## Configuration and deployment

Copy `.env.example` to `.env.local`, replace its placeholders, then run `npm install` and `npm run dev`. The example file contains only placeholders and is safe to commit; `.env.local` is ignored.

### Xcode Cloud

Xcode Cloud's `ios/App/ci_scripts/ci_post_clone.sh` delegates to `ci/ci_post_clone.sh`. This script installs dependencies with `npm install`, runs `node ci/generate-apple-secret.js`, builds the web assets, and syncs Capacitor iOS. Configure `APPLE_KEY_ID` and `APPLE_PRIVATE_KEY` as workflow environment variables, along with `APPLE_TEAM_ID` and `APPLE_CLIENT_ID` as appropriate. Alternatively, provide `APPLE_PRIVATE_KEY_PATH` pointing to a securely provisioned P8 file. The generator reads exported environment variables; it does not load local dotenv files. Missing or invalid Apple signing credentials fail the script.

The generated client secret is discarded rather than printed into Cloud logs or bundled into the app. This generation step does not configure Supabase's Apple provider automatically. Configure the app's public `VITE_` values in the workflow environment as well, and never commit private keys or secret env files.

### iOS keyboard controls

The app relies on the system keyboard accessory to finish text entry. It does not render a floating web "Done" button over the bottom tabs. When testing on a device, verify the system checkmark dismisses the keyboard on search and account forms and that the tabs remain unobstructed after dismissal.

In Vercel, add the following values to **Production**, and use the live payment credentials only after testing previews with sandbox/test credentials:

- Public: `VITE_APP_URL`, `VITE_SITE_NAME`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_STRIPE_PUBLISHABLE_KEY`, `VITE_PAYPAL_ENABLED`
- Server-only: `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENV`, `PAYPAL_PARTNER_MERCHANT_ID`, `CRON_SECRET`
- Optional email: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
- Optional fees: `STRIPE_PROCESSING_FEE_PERCENT`, `STRIPE_PROCESSING_FEE_FIXED`, `PAYPAL_PROCESSING_FEE_PERCENT`, `PAYPAL_PROCESSING_FEE_FIXED`

Set `VITE_APP_URL` to the canonical HTTPS production URL without a trailing slash. Configure Stripe's webhook endpoint as `https://your-domain/api/stripe-webhook` and copy its signing secret into `STRIPE_WEBHOOK_SECRET`. Configure `CRON_SECRET` as a long random value; Vercel provides it to the scheduled payout endpoint. The repository's `vercel.json` applies a restrictive CSP, HSTS, clickjacking protection, MIME sniffing protection, referrer policy, permissions policy, and cross-origin opener policy.

### Immediate listing publication and iOS API routing

Standard listing publication sends an authenticated JSON `POST` to `/api/tarot?action=submit-listing-batch`. After validating the listing details and 3-6 uploaded Supabase public image URLs belonging to the seller, the handler saves all submitted listings in one database insert as approved and active. Standard listings have no listing fee, AI authenticity check, external moderation call, or pending-payment gate. Paid store-link promotions retain Stripe checkout or verified App Store purchases.

AI verification and moderation have been permanently removed, including the OpenAI dependency. Remove obsolete `OPENAI_API_KEY`, `VISION_AI_ENDPOINT`, `VISION_AI_API_KEY`, `VISION_AI_MODEL`, and `VITE_VISION_AI_ENDPOINT` settings from deployments if present. Existing database badge columns and historical migrations remain for compatibility, but the app neither reads nor grants AI badges. Retired verification endpoints and the old authenticated tarot submission action return HTTP 410; the batch status and payment handlers remain for earlier purchases.

Native iOS `/api/` requests use `VITE_API_ORIGIN` (default `https://arkcards.com`); configure that origin without an API path in the environment building the iOS web assets. Changing this public value requires rebuilding and syncing the native app, not just redeploying Vercel.

For the production backend at `https://arkcards.com`, open **Vercel project → Settings → Environment Variables**, select **Production**, and configure:

| Name | Value | Purpose |
| --- | --- | --- |
| `VITE_API_ORIGIN` | `https://arkcards.com` | Public native backend origin; also set this in the local or Xcode Cloud environment that builds the iOS assets. |

Redeploy the backend after changing its environment variables. For a local iOS build, set `VITE_API_ORIGIN=https://arkcards.com` in `.env.local`, run `npm run build` and `npm run cap:sync:ios`, then rebuild and install through Xcode. For Xcode Cloud, set the same variable in the workflow environment and create a new build. The website deliberately keeps `/api/` requests same-origin; this variable does not redirect browser requests to a separate backend.

The publish button in `src/main-layout.tsx` calls `publishListingBundle` in `src/lib/listings.ts`. Its standard-listing fetch uses `/api/tarot?action=submit-listing-batch`; startup in `src/main.tsx` installs `src/lib/native-api-routing.ts`, which rewrites that URL to `https://arkcards.com/api/tarot?action=submit-listing-batch` on native devices. `capacitor://localhost` is the local app origin, not the backend destination.

Deploy the updated backend and rebuild the native app to remove the old UI. Verify native connectivity with an `OPTIONS` request to the listing endpoint using `Origin: capacitor://localhost`, `Access-Control-Request-Method: POST`, and `Access-Control-Request-Headers: content-type,authorization`; expect `204` and `Access-Control-Allow-Origin: capacitor://localhost`. An authenticated standard-listing submission should return `requiresPayment: false`, `feePence: 0`, and approved, active `listings`. Database failures return an error and are logged under `[arkana:tarot:submit-listing-batch]`.

PayPal credentials are server-only and must not use the `VITE_` prefix. Set `VITE_PAYPAL_ENABLED=true` only when PayPal is configured. Use `PAYPAL_ENV=sandbox` with PayPal sandbox credentials while testing and `PAYPAL_ENV=live` with live credentials in production. `PAYPAL_SECRET_KEY` remains supported as a temporary compatibility fallback.

Seller PayPal payouts also require `profiles.paypal_merchant_id`. Configure the processing fee rates with `STRIPE_PROCESSING_FEE_PERCENT`, `STRIPE_PROCESSING_FEE_FIXED`, `PAYPAL_PROCESSING_FEE_PERCENT`, and `PAYPAL_PROCESSING_FEE_FIXED`; fixed values are in the account currency and default to zero.

## Monitoring and incident response

Payment-critical serverless functions emit structured JSON logs with an `[arkana:<endpoint>]` prefix. Search these in the Vercel function logs to trace incidents:

- **Failed checkout** — look for `[arkana:create-order-checkout]` or `[arkana:capture-paypal-order]` entries; the log includes the order or PayPal reference and the underlying error message.
- **Failed payment confirmation** — look for `[arkana:stripe-webhook]` entries; verify `STRIPE_WEBHOOK_SECRET` matches the endpoint configured in the Stripe dashboard.
- **Failed payout release** — look for `[arkana:release-expired-payouts]` entries; each failed order is logged with its `orderId` so it can be retried from the scheduled job.
- **Auth issues** — verify `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set for the deployment environment, then ask affected users to sign out and back in.

For any payment incident, check the corresponding `orders` and `payments` rows in Supabase before retrying, and never re-run a Stripe capture without confirming the payment status in the Stripe dashboard.
