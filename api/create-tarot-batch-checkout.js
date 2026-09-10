import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { buildTarotBatchPaymentIntentPayload } from '../server/lib/tarot-batch-billing.js';
import { logServerError } from '../server/lib/server-logger.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';
    const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');

    if (!stripeSecretKey.startsWith('sk_') || !supabaseUrl || !supabaseServiceRoleKey) {
        return res.status(503).json({ error: 'Tarot batch billing is not configured yet.' });
    }
    if (!token) return res.status(401).json({ error: 'Sign in before paying an authentication fee.' });

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
        const batchId = body.batchId;
        if (!batchId) return res.status(400).json({ error: 'A batch ID is required.' });

        const { data: batch, error: batchError } = await supabase
            .from('upload_batches')
            .select('id, seller_id, deck_count, fee_amount, status')
            .eq('id', batchId)
            .eq('seller_id', user.id)
            .maybeSingle();
        if (batchError) throw batchError;
        if (!batch) return res.status(404).json({ error: 'Upload batch not found.' });
        if (batch.status !== 'pending_payment') return res.status(409).json({ error: 'This batch is not awaiting payment.' });

        const feePence = Math.round(Number(batch.fee_amount) * 100);
        const paymentIntentPayload = buildTarotBatchPaymentIntentPayload(feePence, batch.id);
        const stripe = new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' });

        let paymentIntent;
        try {
            paymentIntent = await stripe.paymentIntents.create({
                ...paymentIntentPayload,
                receipt_email: user.email || undefined,
                description: `Arkana tarot deck authentication - ${batch.deck_count} deck(s) at 44p each`,
            });
        } catch (stripeError) {
            logServerError('create-tarot-batch-checkout', stripeError, { batchId: batch.id });
            return res.status(402).json({ error: stripeError instanceof Error ? stripeError.message : 'Card was declined. Please try a different payment method.' });
        }

        return res.status(200).json({ clientSecret: paymentIntent.client_secret, feeAmount: batch.fee_amount });
    } catch (error) {
        logServerError('create-tarot-batch-checkout', error, { batchId: req.body?.batchId });
        return res.status(500).json({ error: error instanceof Error ? error.message : 'Unable to create tarot batch payment intent.' });
    }
}
