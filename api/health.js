export default function handler(req, res) {
    const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY.startsWith('sk_'));

    res.status(200).json({
        ok: true,
        mode: 'secure-backend',
        stripeConfigured,
        appUrl: process.env.VITE_APP_URL || process.env.APP_URL || 'http://localhost:5173',
    });
}
