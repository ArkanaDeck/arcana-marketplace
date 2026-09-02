import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';
    const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!stripeSecretKey.startsWith('sk_') || !supabaseUrl || !serviceRoleKey) return res.status(503).json({ error: 'Seller payouts are not configured yet.' });
    if (!token) return res.status(401).json({ error: 'Sign in before setting up payouts.' });

    try {
        const supabase = createClient(supabaseUrl, serviceRoleKey);
        const { data: { user }, error: userError } = await supabase.auth.getUser(token);
        if (userError || !user) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
        const { data: profile, error: profileError } = await supabase.from('profiles').select('legal_name, seller_address_line_1, seller_city, seller_postcode, date_of_birth, stripe_connect_account_id').eq('id', user.id).single();
        if (profileError || !profile?.legal_name || !profile.seller_address_line_1 || !profile.seller_city || !profile.seller_postcode || !profile.date_of_birth) {
            return res.status(400).json({ error: 'Save your seller legal information before setting up payouts.' });
        }
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
        return res.status(500).json({ error: error instanceof Error ? error.message : 'Unable to start Stripe Connect onboarding.' });
    }
}