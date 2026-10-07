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
- Server-only: `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENV`, `PAYPAL_PARTNER_MERCHANT_ID`, `CRON_SECRET`
- Optional email: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
- Optional fees: `STRIPE_PROCESSING_FEE_PERCENT`, `STRIPE_PROCESSING_FEE_FIXED`, `PAYPAL_PROCESSING_FEE_PERCENT`, `PAYPAL_PROCESSING_FEE_FIXED`

Set `VITE_APP_URL` to the canonical HTTPS production URL without a trailing slash. Configure Stripe's webhook endpoint as `https://your-domain/api/stripe-webhook` and copy its signing secret into `STRIPE_WEBHOOK_SECRET`. Configure `CRON_SECRET` as a long random value; Vercel provides it to the scheduled payout endpoint. The repository's `vercel.json` applies a restrictive CSP, HSTS, clickjacking protection, MIME sniffing protection, referrer policy, permissions policy, and cross-origin opener policy.

### Listing content moderation and iOS API routing

Standard listing publication sends an authenticated JSON `POST` to `/api/tarot?action=submit-listing-batch`. The handler reads `OPENAI_API_KEY` at request time and moderates the listing text and all 3-6 uploaded Supabase public image URLs with `omni-moderation-latest` before database writes. It does not send multipart files or use the optional authenticity base64 image for moderation. Moderation remains mandatory and publication stops if the provider fails.

Set `OPENAI_API_KEY` in the Vercel environment serving the API, then redeploy; never put this secret in a `VITE_` variable or an iOS build. `VITE_VISION_AI_ENDPOINT` is unused. Native iOS `/api/` requests use `VITE_API_ORIGIN` (default `https://arkcards.com`); configure that origin without an API path in the environment building the iOS web assets. Changing this public value requires rebuilding and syncing the native app, not just redeploying Vercel.

For a moderation outage, check the failed publish response's `code` and Vercel logs prefixed `[arkana:tarot:moderation]`:

- `MODERATION_NOT_CONFIGURED`: the serving deployment has no non-empty `OPENAI_API_KEY`. Check the Vercel project/environment and redeploy.
- `MODERATION_CLIENT_INIT_FAILED`: the SDK could not initialize.
- `MODERATION_PROVIDER_FAILED`: inspect `providerStatus`, `providerCode`, `providerType`, `providerRequestId`, and `providerFailure`. A 401/403 indicates credentials or access, a 429 indicates a rate/quota restriction, and `timeout`/`connection` indicates transport failure. A 400 may indicate invalid input or an image OpenAI cannot access; verify the uploaded URLs are publicly readable.
- `MODERATION_INVALID_RESPONSE`: no valid moderation decision was returned.

Logs deliberately exclude API keys, raw provider messages, listing text, and image data. Do not disable moderation to work around an outage.

PayPal credentials are server-only and must not use the `VITE_` prefix. Set `VITE_PAYPAL_ENABLED=true` only when PayPal is configured. Use `PAYPAL_ENV=sandbox` with PayPal sandbox credentials while testing and `PAYPAL_ENV=live` with live credentials in production. `PAYPAL_SECRET_KEY` remains supported as a temporary compatibility fallback.

Seller PayPal payouts also require `profiles.paypal_merchant_id`. Configure the processing fee rates with `STRIPE_PROCESSING_FEE_PERCENT`, `STRIPE_PROCESSING_FEE_FIXED`, `PAYPAL_PROCESSING_FEE_PERCENT`, and `PAYPAL_PROCESSING_FEE_FIXED`; fixed values are in the account currency and default to zero.

## Monitoring and incident response

Payment-critical serverless functions emit structured JSON logs with an `[arkana:<endpoint>]` prefix. Search these in the Vercel function logs to trace incidents:

- **Failed checkout** — look for `[arkana:create-order-checkout]` or `[arkana:capture-paypal-order]` entries; the log includes the order or PayPal reference and the underlying error message.
- **Failed payment confirmation** — look for `[arkana:stripe-webhook]` entries; verify `STRIPE_WEBHOOK_SECRET` matches the endpoint configured in the Stripe dashboard.
- **Failed payout release** — look for `[arkana:release-expired-payouts]` entries; each failed order is logged with its `orderId` so it can be retried from the scheduled job.
- **Auth issues** — verify `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set for the deployment environment, then ask affected users to sign out and back in.

For any payment incident, check the corresponding `orders` and `payments` rows in Supabase before retrying, and never re-run a Stripe capture without confirming the payment status in the Stripe dashboard.
