function getRate(name, fallback) {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function calculatePlatformFeeCents(total, provider) {
    const amountCents = Math.round(Number(total) * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) throw new Error('Payment amount must be positive.');
    const percent = getRate(provider === 'paypal' ? 'PAYPAL_PROCESSING_FEE_PERCENT' : 'STRIPE_PROCESSING_FEE_PERCENT', 0);
    const fixedCents = Math.round(getRate(provider === 'paypal' ? 'PAYPAL_PROCESSING_FEE_FIXED' : 'STRIPE_PROCESSING_FEE_FIXED', 0) * 100);
    return Math.max(0, Math.min(amountCents - 1, Math.ceil(amountCents * percent / 100 + fixedCents)));
}