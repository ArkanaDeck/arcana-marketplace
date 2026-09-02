import Stripe from 'stripe';

export default async function handler(req, res) {
    return res.status(410).json({ error: 'This checkout route is retired. Use /api/create-order-checkout.' });
}
