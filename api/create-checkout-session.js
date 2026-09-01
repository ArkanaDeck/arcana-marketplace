import Stripe from 'stripe';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed.' });
    }

    const secretKey = process.env.STRIPE_SECRET_KEY || '';
    const appUrl = process.env.VITE_APP_URL || process.env.APP_URL || 'http://localhost:5173';

    if (!secretKey || !secretKey.startsWith('sk_')) {
        return res.status(503).json({
            error: 'Backend not ready. Missing required config: STRIPE_SECRET_KEY',
        });
    }

    try {
        const stripe = new Stripe(secretKey, { apiVersion: '2024-06-20' });
        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

        const amount = Number(body.amount || 0);
        if (!Number.isFinite(amount) || amount <= 0) {
            return res.status(400).json({ error: 'Checkout amount must be a positive number.' });
        }

        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            line_items: [{
                price_data: {
                    currency: body.currency || 'gbp',
                    product_data: { name: body.itemName || 'ArkanaDeck Order' },
                    unit_amount: Math.round(amount * 100),
                },
                quantity: 1,
            }],
            success_url: body.successUrl || `${appUrl}/success`,
            cancel_url: body.cancelUrl || `${appUrl}/cancel`,
            metadata: { source: 'arkana-marketplace' },
        });

        return res.status(200).json({
            id: session.id,
            url: session.url,
            amount_total: session.amount_total,
            currency: session.currency,
        });
    } catch (error) {
        return res.status(500).json({
            error: error instanceof Error ? error.message : 'Unable to create checkout session.',
        });
    }
}
