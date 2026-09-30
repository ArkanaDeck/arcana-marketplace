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
    const hasPaymentProvider = !!env.VITE_STRIPE_PUBLISHABLE_KEY;
    const hasAppUrl = !!env.VITE_APP_URL;

    return [
        {
            title: 'Secure auth and session handling',
            status: hasSupabase ? 'warning' : 'pending',
            detail: 'Verify Supabase Auth redirects, route access, and session persistence in the production deployment.'
        },
        {
            title: 'Production database + RLS',
            status: hasSupabase ? 'warning' : 'pending',
            detail: 'Verify production migrations, row-level security, ownership policies, and storage access with real user roles.'
        },
        {
            title: 'Server-side payment confirmation',
            status: hasPaymentProvider ? 'warning' : 'pending',
            detail: 'Verify server credentials, webhook signatures, and a complete payment/refund flow in the production configuration.'
        },
        {
            title: 'Environment variables and deployment',
            status: hasAppUrl ? 'warning' : 'pending',
            detail: 'Confirm all required Vercel Production variables, canonical HTTPS URL, and a successful production deployment.'
        },
        {
            title: 'HTTPS and security headers',
            status: 'warning',
            detail: 'Security headers are configured in vercel.json; verify the deployed response headers and that CSP permits required services.'
        },
        {
            title: 'Monitoring and incident response',
            status: 'warning',
            detail: 'Structured server logs exist; verify production log access, alert ownership, and incident procedures.'
        },
        {
            title: 'Order lifecycle and seller payouts',
            status: 'warning',
            detail: 'The active app uses direct payment links; the legacy escrow/order/payout workflow is disabled. Verify the intended fulfillment and payout model.'
        },
        {
            title: 'Final launch sign-off',
            status: 'pending',
            detail: 'Complete the production checklist, review test and smoke-test results, and record an explicit launch approval.'
        }
    ];
}
