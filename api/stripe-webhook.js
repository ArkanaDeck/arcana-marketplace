import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { logServerError } from '../server/lib/server-logger.js';

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
            if (session.metadata?.product === 'listing_fee' && session.payment_status === 'paid') {
                const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
                if (session.metadata.requires_manual_review !== 'true') {
                    const { error } = await supabase
                        .from('listings')
                        .update({ review_status: 'approved' })
                        .eq('id', session.metadata.listing_id)
                        .eq('seller_id', session.metadata.sellerId)
                        .eq('review_status', 'pending_review');
                    if (error) throw error;
                }
            }
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
            if (session.metadata?.product === 'external_link_rental' && session.payment_status === 'paid') {
                const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
                const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
                const { error } = await supabase
                    .from('listings')
                    .update({ external_link_active: true, external_link_expires_at: expiresAt })
                    .eq('id', session.metadata.listing_id)
                    .eq('seller_id', session.metadata.seller_id);
                if (error) throw error;
            }
            if (session.metadata?.product === 'website_link_rental' && session.payment_status === 'paid') {
                const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
                const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
                const { error } = await supabase
                    .from('profiles')
                    .update({ website_link_active: true, website_link_expires_at: expiresAt })
                    .eq('id', session.metadata.seller_id);
                if (error) throw error;
            }
            if (session.metadata?.product === 'seller_subscription' && session.mode === 'subscription') {
                const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
                const { error } = await supabase
                    .from('profiles')
                    .update({ subscription_status: 'active', stripe_subscription_id: session.subscription })
                    .eq('id', session.metadata.seller_id);
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
        if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
            const subscription = event.data.object;
            const sellerId = subscription.metadata?.seller_id;
            if (sellerId) {
                const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
                const nextStatus = event.type === 'customer.subscription.deleted' ? 'inactive'
                    : subscription.status === 'active' ? 'active'
                        : subscription.status === 'past_due' ? 'past_due' : 'inactive';
                const { error } = await supabase.from('profiles').update({ subscription_status: nextStatus }).eq('id', sellerId);
                if (error) throw error;
            }
        }
        return res.status(200).json({ received: true });
    } catch (error) {
        logServerError('stripe-webhook', error);
        return res.status(400).json({ error: error instanceof Error ? error.message : 'Webhook processing failed.' });
    }
}