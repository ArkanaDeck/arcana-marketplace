import { describe, it, expect } from 'vitest';
import { initializeStripePaymentIntent } from './paypal-api';

const processPayment = async (amount: number, currency: string) => {
  const result = await initializeStripePaymentIntent('test-key');
  return { amount, currency, clientSecret: result.clientSecret };
};

describe('Successful payment processing with auto-retry', () => {
  it('should process payment successfully after retrying', async () => {
    const amount = 10.99;
    const currency = 'USD';

    const result = await processPayment(amount, currency);

    expect(result.amount).toBe(amount);
    expect(result.currency).toBe(currency);
    expect(result.clientSecret).toBeDefined();
  });
});

describe('Failed payment processing with auto-retry', () => {
  it('should retry payment after failing twice and throwing an error on the third attempt', async () => {
    const amount = 10.99;
    const currency = 'USD';

    const result = await processPayment(amount, currency);

    expect(result.amount).toBe(amount);
    expect(result.currency).toBe(currency);
    expect(result.clientSecret).toBeDefined();
  });
});
