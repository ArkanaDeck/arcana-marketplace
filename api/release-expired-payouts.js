import { createClient } from '@supabase/supabase-js';
import { sendTransactionalEmail } from '../src/lib/server-email.js';

const HOLD_WINDOW_MS = 48 * 60 * 60 * 1000;

export default async function handler(req, res) {
    const cronSecret = process.env.CRON_SECRET || '';
    if (req.headers.authorization !== `Bearer ${cronSecret}` || !cronSecret) return res.status(401).json({ error: 'Unauthorized.' });
    const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!supabaseUrl || !serviceRoleKey) return res.status(503).json({ error: 'Payout release is not configured yet.' });

    try {
        const supabase = createClient(supabaseUrl, serviceRoleKey);
        const cutoff = new Date(Date.now() - HOLD_WINDOW_MS).toISOString();
        const { data: orders, error } = await supabase.from('orders').select('id, total, listing_id, delivery_email, listings(seller_id)').eq('status', 'delivered').eq('payout_status', 'held').lte('delivered_at', cutoff);
        if (error) throw error;
        const results = [];
        for (const order of orders || []) {
            const sellerId = order.listings?.seller_id;
            const { data: seller } = await supabase.from('profiles').select('stripe_connect_account_id, email').eq('id', sellerId).single();
            try {
                const { error: updateError } = await supabase.from('orders').update({ status: 'completed', payout_status: 'released' }).eq('id', order.id).eq('payout_status', 'held');
                if (updateError) throw updateError;
                await sendTransactionalEmail({ to: seller.email, subject: 'Arkana: seller payout released', text: `Your payout for order ${order.id} has been released.` });
                await sendTransactionalEmail({ to: order.delivery_email, subject: 'Arkana: order completed', text: `The seller payout for order ${order.id} has been released after the delivery review window.` });
                results.push({ orderId: order.id, released: true });
            } catch (releaseError) {
                results.push({ orderId: order.id, released: false, reason: releaseError instanceof Error ? releaseError.message : 'Transfer failed.' });
            }
        }
        return res.status(200).json({ checked: (orders || []).length, results });
    } catch (error) {
        return res.status(500).json({ error: error instanceof Error ? error.message : 'Unable to release expired payouts.' });
    }
}