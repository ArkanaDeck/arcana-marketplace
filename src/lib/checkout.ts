export interface CheckoutRequest {
    amount: number;
    currency?: string;
    itemName: string;
    successUrl: string;
    cancelUrl: string;
}

export async function createCheckoutRequest(payload: CheckoutRequest) {
    const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        let message = 'Checkout could not be created.';
        try {
            const data = await response.json();
            message = data?.error || message;
        } catch {
            const fallback = await response.text();
            if (fallback) {
                message = fallback;
            }
        }
        throw new Error(message);
    }

    return response.json();
}
