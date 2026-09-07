import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { paypalRequest } from '../server/lib/server-paypal.js';
import { logServerError } from '../server/lib/server-logger.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
    const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!supabaseUrl || !serviceRoleKey) return res.status(503).json({ error: 'Seller payouts are not configured yet.' });
    if (!token) return res.status(401).json({ error: 'Sign in before setting up payouts.' });

    try {
        const supabase = createClient(supabaseUrl, serviceRoleKey);
        const { data: { user }, error: userError } = await supabase.auth.getUser(token);
        if (userError || !user) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
        if (req.query?.action === 'paypal') return await startPayPalOnboarding(req, res, user.id);
        if (req.query?.action === 'status') return await getStripePayoutStatus(res, supabase, user.id);

        const stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';
        if (!stripeSecretKey.startsWith('sk_')) return res.status(503).json({ error: 'Stripe payouts are not configured yet.' });
        const { data: profile, error: profileError } = await supabase.from('profiles').select('stripe_connect_account_id').eq('id', user.id).single();
        if (profileError || !profile) return res.status(404).json({ error: 'Seller profile not found.' });
        const stripe = new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' });
        const account = profile.stripe_connect_account_id
            ? await stripe.accounts.retrieve(profile.stripe_connect_account_id)
            : await stripe.accounts.create({ type: 'express', country: 'GB', email: user.email || undefined, capabilities: { transfers: { requested: true } }, metadata: { supabase_user_id: user.id } });
        const appUrl = process.env.VITE_APP_URL || 'http://localhost:5173';
        const accountLink = await stripe.accountLinks.create({ account: account.id, refresh_url: `${appUrl}/?connect=refresh`, return_url: `${appUrl}/?connect=complete`, type: 'account_onboarding' });
        const { error: updateError } = await supabase.from('profiles').update({ stripe_connect_account_id: account.id, seller_payout_status: 'pending_connect' }).eq('id', user.id);
        if (updateError) throw updateError;
        return res.status(200).json({ url: accountLink.url });
    } catch (error) {
        logServerError('create-connect-onboarding', error);
        return res.status(500).json({ error: error instanceof Error ? error.message : 'Unable to start Stripe Connect onboarding.' });
    }
}

async function startPayPalOnboarding(req, res, userId) {
    const partnerMerchantId = process.env.PAYPAL_PARTNER_MERCHANT_ID || '';
    if (!partnerMerchantId) return res.status(503).json({ error: 'PayPal seller onboarding is not configured yet.' });
    const referral = await paypalRequest('/v2/customer/partner-referrals', {
        method: 'POST',
        headers: { 'PayPal-Partner-Attribution-Id': partnerMerchantId },
        body: JSON.stringify({
            tracking_id: userId,
            operations: [{ operation: 'API_INTEGRATION', api_integration_preference: { rest_api_integration: { integration_method: 'PAYPAL', integration_type: 'THIRD_PARTY', third_party_details: { features: ['PAYMENT', 'REFUND'] } } } }],
            products: ['EXPRESS_CHECKOUT'],
            legal_consents: [{ type: 'SHARE_DATA_CONSENT', granted: true }],
        }),
    });
    const actionUrl = referral.links?.find((link) => link.rel === 'action_url')?.href;
    if (!actionUrl) throw new Error('PayPal did not return an onboarding link.');
    return res.status(200).json({ url: actionUrl });
}

async function getStripePayoutStatus(res, supabase, userId) {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';
    if (!stripeSecretKey.startsWith('sk_')) return res.status(503).json({ error: 'Payout status is not configured yet.' });
    const { data: profile, error: profileError } = await supabase.from('profiles').select('stripe_connect_account_id').eq('id', userId).single();
    if (profileError || !profile?.stripe_connect_account_id) return res.status(404).json({ error: 'Stripe Connect account not found.' });
    const account = await new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' }).accounts.retrieve(profile.stripe_connect_account_id);
    const payoutEnabled = Boolean(account.details_submitted && account.payouts_enabled);
    await supabase.from('profiles').update({ seller_payout_status: payoutEnabled ? 'enabled' : 'pending_connect' }).eq('id', userId);
    return res.status(200).json({ payoutEnabled });
}