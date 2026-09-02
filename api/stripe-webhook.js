import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export const config = { api: { bodyParser: false } };

async function readRawBody(req) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    return Buffer.concat(chunks);
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
    const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!stripeSecretKey.startsWith('sk_') || !webhookSecret || !supabaseUrl || !supabaseServiceRoleKey) {
        return res.status(503).json({ error: 'Webhook configuration is incomplete.' });
    }

    try {
        const stripe = new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' });
        const event = stripe.webhooks.constructEvent(await readRawBody(req), req.headers['stripe-signature'], webhookSecret);
        if (event.type === 'checkout.session.completed') {
            const session = event.data.object;
            if (session.metadata?.product === 'listing_credits' && session.payment_status === 'paid') {
                const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
                const { error } = await supabase.rpc('add_listing_credits', {
                    purchase_seller_id: session.metadata.seller_id,
                    purchase_stripe_session_id: session.id,
                    purchased_credits: Number(session.metadata.credits || 3),
                    purchase_amount: (session.amount_total || 0) / 100,
                });
                if (error) throw error;
            }
            if (session.metadata?.product === 'marketplace_order' && session.payment_status === 'paid') {
                const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
                const orderIds = (session.metadata.order_ids || session.metadata.order_id || '').split(',').filter(Boolean);
                if (!orderIds.length) throw new Error('Checkout session is missing order metadata.');
                const { error: orderError } = await supabase
                    .from('orders')
                    .update({ status: 'paid' })
                    .in('id', orderIds)
                    .eq('status', 'pending_payment');
                if (orderError) throw orderError;

                const { data: paidOrders, error: paidOrdersError } = await supabase.from('orders').select('id, total').in('id', orderIds).eq('status', 'paid');
                if (paidOrdersError) throw paidOrdersError;
                const { error: paymentError } = await supabase.from('payments').upsert((paidOrders || []).map((order) => ({
                    order_id: order.id, provider: 'stripe', provider_payment_id: `${session.payment_intent || session.id}:${order.id}`,
                    status: 'paid', amount: Number(order.total),
                })), { onConflict: 'provider_payment_id' });
                if (paymentError) throw paymentError;
            }
        }
        return res.status(200).json({ received: true });
    } catch (error) {
        return res.status(400).json({ error: error instanceof Error ? error.message : 'Webhook processing failed.' });
    }
}