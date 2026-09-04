import { describe, expect, it } from 'vitest';
import { getProductionChecklist } from './production-checklist';

describe('production checklist', () => {
    it('includes the required launch gates', () => {
        const items = getProductionChecklist({
            VITE_SUPABASE_URL: 'https://example.supabase.co',
            VITE_SUPABASE_ANON_KEY: 'anon-key',
            VITE_STRIPE_PUBLISHABLE_KEY: 'pk_test_123',
            VITE_PAYPAL_ENABLED: 'false',
            VITE_APP_URL: 'https://app.example.com',
        });

        const titles = items.map(item => item.title);

        expect(titles).toEqual(expect.arrayContaining([
            'Secure auth and session handling',
            'Production database + RLS',
            'Server-side payment confirmation',
            'Environment variables and deployment',
            'HTTPS and security headers',
            'Monitoring and incident response',
            'Order lifecycle and seller payouts',
            'Final launch sign-off',
        ]));
        expect(items.find(item => item.title === 'HTTPS and security headers')?.status).toBe('complete');
    });

    it('shows configuration-dependent tasks as pending when environment values are missing', () => {
        const items = getProductionChecklist({});
        const hasPending = items.some(item => item.status === 'pending');

        expect(hasPending).toBe(true);
        expect(items.find(item => item.title === 'Secure auth and session handling')?.status).toBe('pending');
    });

    it('marks implemented order and payout handling complete', () => {
        const lifecycle = getProductionChecklist({}).find(item => item.title === 'Order lifecycle and seller payouts');

        expect(lifecycle?.status).toBe('complete');
    });

    it('accepts PayPal as a configured payment provider', () => {
        const payments = getProductionChecklist({ VITE_PAYPAL_ENABLED: 'true' })
            .find(item => item.title === 'Server-side payment confirmation');

        expect(payments?.status).toBe('complete');
    });

    it('marks the final launch sign-off complete after safeguards are implemented', () => {
        const signOff = getProductionChecklist({}).find(item => item.title === 'Final launch sign-off');

        expect(signOff?.status).toBe('complete');
    });
});
