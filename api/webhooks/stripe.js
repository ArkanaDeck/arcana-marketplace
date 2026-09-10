import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { logServerError, logServerEvent } from '../../server/lib/server-logger.js';
import { handleTarotBatchWebhookEvent } from '../../server/lib/tarot-webhook-handler.js';

export const config = { api: { bodyParser: false } };

async function readRawBody(req) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    return Buffer.concat(chunks);
}

// Dedicated PaymentIntent webhook for the tarot batch authentication fee.
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';
    const webhookSecret = process.env.STRIPE_TAROT_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET || '';
    const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!stripeSecretKey.startsWith('sk_') || !webhookSecret || !supabaseUrl || !supabaseServiceRoleKey) {
        return res.status(503).json({ error: 'Webhook configuration is incomplete.' });
    }

    const stripe = new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' });

    // Signature verification: rejects any request that isn't genuinely signed by Stripe, preventing spoofed activation calls.
    let event;
    try {
        event = stripe.webhooks.constructEvent(await readRawBody(req), req.headers['stripe-signature'], webhookSecret);
    } catch (error) {
        logServerError('webhooks/stripe', error);
        return res.status(400).json({ error: 'Invalid webhook signature.' });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    try {
        const result = await handleTarotBatchWebhookEvent(event, { supabase, logServerEvent });
        return res.status(200).json({ received: true, ...result });
    } catch (error) {
        logServerError('webhooks/stripe', error, { eventType: event.type });
        return res.status(400).json({ error: error instanceof Error ? error.message : 'Webhook processing failed.' });
    }
}

