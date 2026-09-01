export function isStripeConfigured(secretKey) {
    return Boolean(secretKey && typeof secretKey === 'string' && secretKey.startsWith('sk_'));
}

export function getCheckoutSessionPayload({
    amount,
    currency = 'gbp',
    itemName,
    successUrl,
    cancelUrl,
}) {
    const safeAmount = Number(amount);

    if (!Number.isFinite(safeAmount) || safeAmount <= 0) {
        throw new Error('Checkout amount must be a positive number.');
    }

    return {
        mode: 'payment',
        line_items: [
            {
                price_data: {
                    currency,
                    product_data: {
                        name: itemName,
                    },
                    unit_amount: Math.round(safeAmount * 100),
                },
                quantity: 1,
            },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
            source: 'arkana-marketplace',
        },
    };
}
