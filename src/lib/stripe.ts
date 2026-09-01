export async function createCheckoutSession({
    amount,
    currency = 'gbp',
    itemName,
    successUrl,
    cancelUrl,
}: {
    amount: number;
    currency?: string;
    itemName: string;
    successUrl: string;
    cancelUrl: string;
}) {
    if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error('Checkout amount must be a positive number.');
    }

    const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            amount,
            currency,
            itemName,
            successUrl,
            cancelUrl,
        }),
    });

    if (!response.ok) {
        let errorMessage = 'Checkout session could not be created.';
        try {
            const payload = await response.json();
            errorMessage = payload?.error || errorMessage;
        } catch {
            const fallbackText = await response.text();
            if (fallbackText) {
                errorMessage = fallbackText;
            }
        }
        throw new Error(errorMessage);
    }

    return response.json();
}
