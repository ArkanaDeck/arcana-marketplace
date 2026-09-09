import Stripe from 'stripe';

export default async function handler(req, res) {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';
    const sessionId = String(req.query?.session_id || '');
    if (!stripeSecretKey.startsWith('sk_') || !sessionId) return res.status(400).send('Checkout session is unavailable.');

    try {
        const stripe = new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' });
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        const courierRedirectUrl = session.metadata?.courier_redirect_url;
        if (session.payment_status === 'paid' && session.metadata?.requires_shipping_redirect === 'true' && courierRedirectUrl) {
            return res.redirect(303, courierRedirectUrl);
        }
        return res.redirect(303, process.env.VITE_APP_URL || process.env.APP_URL || '/');
    } catch {
        return res.status(400).send('Unable to verify checkout session.');
    }
}