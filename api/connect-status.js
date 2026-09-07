import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';
    const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!stripeSecretKey.startsWith('sk_') || !supabaseUrl || !serviceRoleKey || !token) return res.status(503).json({ error: 'Payout status is not configured yet.' });

    try {
        const supabase = createClient(supabaseUrl, serviceRoleKey);
        const { data: { user }, error: userError } = await supabase.auth.getUser(token);
        if (userError || !user) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
        const { data: profile, error: profileError } = await supabase.from('profiles').select('stripe_connect_account_id').eq('id', user.id).single();
        if (profileError || !profile?.stripe_connect_account_id) return res.status(404).json({ error: 'Stripe Connect account not found.' });
        const account = await new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' }).accounts.retrieve(profile.stripe_connect_account_id);
        const payoutEnabled = Boolean(account.details_submitted && account.payouts_enabled);
        await supabase.from('profiles').update({ seller_payout_status: payoutEnabled ? 'enabled' : 'pending_connect' }).eq('id', user.id);
        return res.status(200).json({ payoutEnabled });
    } catch (error) {
        return res.status(500).json({ error: error instanceof Error ? error.message : 'Unable to validate payout status.' });
    }
}