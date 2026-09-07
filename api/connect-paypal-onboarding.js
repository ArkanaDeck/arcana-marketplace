import { createClient } from '@supabase/supabase-js';
import { paypalRequest } from '../src/lib/server-paypal.js';
import { logServerError } from '../src/lib/server-logger.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

    const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const partnerMerchantId = process.env.PAYPAL_PARTNER_MERCHANT_ID || '';
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!supabaseUrl || !serviceRoleKey || !partnerMerchantId) return res.status(503).json({ error: 'PayPal seller onboarding is not configured yet.' });
    if (!token) return res.status(401).json({ error: 'Sign in before setting up payouts.' });

    try {
        const supabase = createClient(supabaseUrl, serviceRoleKey);
        const { data: { user }, error: userError } = await supabase.auth.getUser(token);
        if (userError || !user) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });

        const referral = await paypalRequest('/v2/customer/partner-referrals', {
            method: 'POST',
            headers: { 'PayPal-Partner-Attribution-Id': partnerMerchantId },
            body: JSON.stringify({
                tracking_id: user.id,
                operations: [{ operation: 'API_INTEGRATION', api_integration_preference: { rest_api_integration: { integration_method: 'PAYPAL', integration_type: 'THIRD_PARTY', third_party_details: { features: ['PAYMENT', 'REFUND'] } } } }],
                products: ['EXPRESS_CHECKOUT'],
                legal_consents: [{ type: 'SHARE_DATA_CONSENT', granted: true }],
            }),
        });
        const actionUrl = referral.links?.find((link) => link.rel === 'action_url')?.href;
        if (!actionUrl) throw new Error('PayPal did not return an onboarding link.');
        return res.status(200).json({ url: actionUrl });
    } catch (error) {
        logServerError('connect-paypal-onboarding', error);
        return res.status(500).json({ error: error instanceof Error ? error.message : 'Unable to start PayPal onboarding.' });
    }
}