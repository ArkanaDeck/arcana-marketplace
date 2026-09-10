import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

// LEGACY: Checkout Session (redirect) flow for the tarot batch fee, preserved in case the
// PaymentIntent/Stripe Elements flow in create-tarot-batch-checkout.js needs to be rolled back.
// Not wired into the webhook or frontend — kept here for reference/reuse only.
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

        const appUrl = process.env.VITE_APP_URL || process.env.APP_URL || 'http://localhost:5173';
        const stripe = new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' });
        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            customer_email: user.email || undefined,
            line_items: [{
                price_data: {
                    currency: 'gbp',
                    product_data: { name: 'Arkana tarot deck authentication', description: `${batch.deck_count} deck(s) at 44p each` },
                    unit_amount: Math.round(Number(batch.fee_amount) * 100),
                },
                quantity: 1,
            }],
            success_url: body.successUrl || `${appUrl}/?tarot-batch=success`,
            cancel_url: body.cancelUrl || `${appUrl}/?tarot-batch=cancelled`,
            metadata: { seller_id: user.id, batch_id: batch.id, product: 'tarot_batch_fee' },
        });
        return res.status(200).json({ url: session.url });
    } catch (error) {
        return res.status(500).json({ error: error instanceof Error ? error.message : 'Unable to create tarot batch checkout.' });
    }
}

// LEGACY companion webhook branch (previously lived in api/stripe-webhook.js under 'checkout.session.completed').
// If you revert to this Checkout Session flow, add this block back into that handler's checkout.session.completed case:
//
// if (session.metadata?.product === 'tarot_batch_fee' && session.payment_status === 'paid') {
//     const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
//     const { error } = await supabase.rpc('activate_tarot_batch', {
//         target_batch_id: session.metadata.batch_id,
//         payment_stripe_session_id: session.id,
//     });
//     if (error) throw error;
// }

