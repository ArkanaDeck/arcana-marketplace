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
                    const authenticationFeePence = Number(session.metadata.authentication_fee_pence || 0);
                    const insertionFeePence = Number(session.metadata.insertion_fee_pence || 0);
                    const grandTotalPence = Number(session.metadata.grand_total_fee_pence || 0);
                    console.log(`[arkana:stripe-webhook] approving listing ${session.metadata.listing_id}: authentication=${authenticationFeePence}p insertion=${insertionFeePence}p grandTotal=${grandTotalPence}p`);
                    // Atomic: ledger breakdown + review_status flip happen in one DB transaction — see approve_paid_listing().
                    const { data: approved, error } = await supabase.rpc('approve_paid_listing', {
                        target_listing_id: session.metadata.listing_id,
                        target_seller_id: session.metadata.sellerId,
                        p_authentication_fee_pence: authenticationFeePence,
                        p_insertion_fee_pence: insertionFeePence,
                        p_grand_total_pence: grandTotalPence,
                    });
                    if (error) throw error;
                    if (!approved) console.log(`[arkana:stripe-webhook] listing ${session.metadata.listing_id} was not in pending_review — skipped (already approved or belongs to a different seller).`);
                }
            }
            if (session.metadata?.product === 'listing_batch_fee' && session.payment_status === 'paid') {
                const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
                console.log(`[arkana:stripe-webhook] activating listing batch ${session.metadata.batch_id}`);
                // Atomic: batch status flip + every eligible listing's approval happen in one DB transaction.
                const { data: activated, error } = await supabase.rpc('activate_listing_batch', {
                    target_batch_id: session.metadata.batch_id,
                });
                if (error) throw error;
                if (!activated) console.log(`[arkana:stripe-webhook] batch ${session.metadata.batch_id} was not pending_payment — skipped.`);
            }
            if (session.metadata?.product === 'premium_listing' && session.payment_status === 'paid') {
                const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
                const { data: existingPremium, error: existingError } = await supabase
                    .from('listings')
                    .select('id')
                    .eq('premium_stripe_session_id', session.id)
                    .maybeSingle();
                if (existingError) throw existingError;
                if (!existingPremium) {
                    const { title, price, description, condition, direct_payment_link, seller_id, image_url } = session.metadata;
                    try {
                        const { data, error } = await supabase
                            .from('listings')
                            .insert([{
                                seller_id,
                                name: title,
                                price: parseFloat(price || '0'),
                                description,
                                condition: condition || 'good',
                                external_store_url: direct_payment_link,
                                image: image_url || null,
                                images: image_url ? [image_url] : [],
                                listing_type: session.metadata.listing_type || 'sale',
                                is_free_delivery: session.metadata.free_delivery === 'true',
                                is_premium: true,
                                authenticated: true,
                                review_status: 'approved',
                                premium_stripe_session_id: session.id,
                            }])
                            .select('id')
                            .single();
                        if (error) throw error;
                        console.log('[arkana:stripe-webhook] premium listing created:', data?.id);
                    } catch (insertError) {
                        console.error('[arkana:stripe-webhook] premium listing insert failed:', insertError);
                        throw insertError;
                    }
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
        if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
            const subscription = event.data.object;
            await syncSellerSubscriptionStatus(createClient(supabaseUrl, supabaseServiceRoleKey), subscription, event.type === 'customer.subscription.deleted' ? 'inactive' : subscriptionStatus(subscription.status));
        }
        if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
            const invoice = event.data.object;
            if (invoice.subscription) {
                const stripe = new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' });
                const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
                await syncSellerSubscriptionStatus(createClient(supabaseUrl, supabaseServiceRoleKey), subscription, event.type === 'invoice.paid' ? 'active' : 'past_due');
            }
        }
        return res.status(200).json({ received: true });
    } catch (error) {
        logServerError('stripe-webhook', error);
        return res.status(400).json({ error: error instanceof Error ? error.message : 'Webhook processing failed.' });
    }
}

function subscriptionStatus(stripeStatus) {
    return stripeStatus === 'active' || stripeStatus === 'trialing' ? 'active'
        : stripeStatus === 'past_due' || stripeStatus === 'unpaid' ? 'past_due'
            : 'inactive';
}

async function syncSellerSubscriptionStatus(supabase, subscription, nextStatus) {
    const sellerId = subscription.metadata?.seller_id;
    if (!sellerId) {
        console.warn('[arkana:stripe-webhook] Subscription event missing seller_id metadata:', subscription.id);
        return;
    }
    const { error } = await supabase
        .from('profiles')
        .update({ subscription_status: nextStatus, stripe_subscription_id: subscription.id })
        .eq('id', sellerId);
    if (error) throw error;
}