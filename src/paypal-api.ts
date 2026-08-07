import { PayPalEnvironment } from '@paypal/sdk-core';
import { PayPalClient } from '@paypal/paypal-client';

const paypalEnvironment = PayPalEnvironment.SANDBOX;

const paypalClient = new PayPalClient({
  clientID: 'YOUR_CLIENT_ID',
  secret: 'YOUR_SECRET',
});

async function processPayment(amount, currency) {
  try {
    const paymentIntent = await paypalClient.createPaymentIntent({
      amount,
      currency,
      return_url: 'https://your-website.com/success',
      cancel_url: 'https://your-website.com/cancel',
    });

    // Redirect the user to PayPal for payment processing
    res.redirect(paymentIntent.url);
  } catch (error) {
    console.error(error);
    throw error;
  }
}