import { getSupabaseSession } from './supabase';

export async function createOrderCheckout(input: {
    listingIds: string[];
    shippingOption: 'evri_standard' | 'royal_mail_48' | 'royal_mail_24';
    deliveryAddress: {
        name: string;
        email: string;
        addressLineOne: string;
        addressLineTwo?: string;
        city: string;
        postcode: string;
    };
}) {
    const session = await getSupabaseSession();
    if (!session?.access_token) throw new Error('Sign in before checking out.');

    const response = await fetch('/api/create-order-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
            ...input,
            successUrl: `${window.location.origin}/success`,
            cancelUrl: `${window.location.origin}/cancel`,
        }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || 'Unable to start checkout.');
    return payload as { orderIds: string[]; url: string };
}

export async function createPayPalOrder(input: Parameters<typeof createOrderCheckout>[0]) {
    const session = await getSupabaseSession();
    if (!session?.access_token) throw new Error('Sign in before checking out.');

    const response = await fetch('/api/create-paypal-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
            ...input,
            successUrl: `${window.location.origin}/?paypal=success`,
            cancelUrl: `${window.location.origin}/?paypal=cancelled`,
        }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || 'Unable to start PayPal checkout.');
    return payload as { orderIds: string[]; paypalOrderId: string; url: string };
}