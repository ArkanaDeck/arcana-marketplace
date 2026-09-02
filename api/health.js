export default function handler(req, res) {
    const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY.startsWith('sk_'));
    const paypalConfigured = Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_SECRET_KEY);

    res.status(200).json({
        ok: true,
        mode: 'secure-backend',
        stripeConfigured,
        paypalConfigured,
        paypalEnvironment: process.env.PAYPAL_ENV === 'live' ? 'live' : 'sandbox',
        appUrl: process.env.VITE_APP_URL || process.env.APP_URL || 'http://localhost:5173',
    });
}
