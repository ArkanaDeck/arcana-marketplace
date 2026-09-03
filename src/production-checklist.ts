export type ChecklistStatus = 'complete' | 'pending' | 'warning';

export interface ProductionChecklistItem {
    title: string;
    status: ChecklistStatus;
    detail: string;
}

export interface ProductionChecklistInput {
    VITE_SUPABASE_URL?: string;
    VITE_SUPABASE_ANON_KEY?: string;
    VITE_STRIPE_PUBLISHABLE_KEY?: string;
    VITE_APP_URL?: string;
    VITE_SITE_NAME?: string;
}

export function getProductionChecklist(env: ProductionChecklistInput): ProductionChecklistItem[] {
    const hasSupabase = !!env.VITE_SUPABASE_URL && !!env.VITE_SUPABASE_ANON_KEY;
    const hasStripe = !!env.VITE_STRIPE_PUBLISHABLE_KEY;
    const hasAppUrl = !!env.VITE_APP_URL;

    return [
        {
            title: 'Secure auth and session handling',
            status: hasSupabase ? 'complete' : 'pending',
            detail: 'Connect Supabase Auth, protect routes, and persist user sessions securely across pages.'
        },
        {
            title: 'Production database + RLS',
            status: hasSupabase ? 'complete' : 'pending',
            detail: 'Create tables for profiles, listings, orders, and payments with row-level security and ownership policies.'
        },
        {
            title: 'Server-side payment confirmation',
            status: hasStripe ? 'complete' : 'pending',
            detail: 'Use Stripe or PayPal server endpoints to confirm payments before creating an order or crediting sellers.'
        },
        {
            title: 'Environment variables and deployment',
            status: hasAppUrl ? 'complete' : 'pending',
            detail: 'Set Vercel env vars for Supabase, Stripe, and the public app URL, then verify production builds and redeploys.'
        },
        {
            title: 'HTTPS and security headers',
            status: 'warning',
            detail: 'Security headers are configured in vercel.json. Verify them on the deployed HTTPS domain before launch.'
        },
        {
            title: 'Monitoring and incident response',
            status: 'warning',
            detail: 'Add error logging, payment monitoring, and basic playbooks for failed checkout, missing stock, and auth issues.'
        },
        {
            title: 'Order lifecycle and seller payouts',
            status: 'complete',
            detail: 'Orders progress from payment through dispatch and delivery, with buyer confirmation and a scheduled payout release.'
        },
        {
            title: 'Final launch sign-off',
            status: 'pending',
            detail: 'Complete QA, backup verification, legal checks, and the final deployment approval checklist before opening sales.'
        }
    ];
}
