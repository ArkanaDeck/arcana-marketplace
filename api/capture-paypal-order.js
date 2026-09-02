import { createClient } from '@supabase/supabase-js';
import { paypalRequest } from '../src/lib/server-paypal.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const paypalOrderId = req.body?.paypalOrderId || (typeof req.body === 'string' ? JSON.parse(req.body || '{}').paypalOrderId : '');
    if (!token || !paypalOrderId || !supabaseUrl || !serviceRoleKey) return res.status(400).json({ error: 'A valid PayPal order and signed-in buyer are required.' });

    try {
        const supabase = createClient(supabaseUrl, serviceRoleKey);
        const { data: { user }, error: userError } = await supabase.auth.getUser(token);
        if (userError || !user) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
        const paypalOrder = await paypalRequest(`/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`, { method: 'POST', body: '{}' });
        if (paypalOrder.status !== 'COMPLETED') return res.status(400).json({ error: 'PayPal payment was not completed.' });
        const orderIds = paypalOrder.purchase_units?.[0]?.payments?.captures?.[0] ? paypalOrder.purchase_units[0].reference_id : '';
        const customIds = paypalOrder.purchase_units?.[0]?.custom_id?.split(',').filter(Boolean) || (orderIds ? [orderIds] : []);
        if (!customIds.length) return res.status(400).json({ error: 'PayPal payment did not contain an Arkana order reference.' });
        const { error: updateError } = await supabase.from('orders').update({ status: 'paid' }).in('id', customIds).eq('buyer_id', user.id);
        if (updateError) throw updateError;
        return res.status(200).json({ orderIds: customIds, status: 'paid' });
    } catch (error) {
        return res.status(500).json({ error: error instanceof Error ? error.message : 'Unable to confirm PayPal payment.' });
    }
}