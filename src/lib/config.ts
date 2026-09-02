export function getRuntimeConfig() {
    const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
    const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
    const stripePublishableKey = (import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '').trim();
    const paypalEnabled = (import.meta.env.VITE_PAYPAL_ENABLED || '').trim().toLowerCase() === 'true';
    const appUrl = (import.meta.env.VITE_APP_URL || '').trim();
    const stripeSecretKey = (import.meta.env.STRIPE_SECRET_KEY || '').trim();

    const supabaseEnabled = Boolean(supabaseUrl && supabaseAnonKey);
    const stripeEnabled = Boolean(stripePublishableKey || stripeSecretKey);
    const paymentEnabled = stripeEnabled || paypalEnabled;

    const warnings = [
        !supabaseUrl ? 'Supabase URL missing' : null,
        !supabaseAnonKey ? 'Supabase anon key missing' : null,
        !stripePublishableKey ? 'Stripe publishable key missing' : null,
        !stripeSecretKey ? 'Stripe secret key missing' : null,
        !paypalEnabled ? 'PayPal checkout disabled' : null,
        !appUrl ? 'VITE_APP_URL missing' : null,
        !supabaseEnabled ? 'Supabase schema / RLS not applied yet' : null,
    ].filter(Boolean) as string[];

    return {
        supabaseEnabled,
        stripeEnabled,
        isSecureMode: supabaseEnabled && paymentEnabled,
        paypalEnabled,
        appUrl: appUrl || 'http://localhost:5173',
        warnings,
    };
}
