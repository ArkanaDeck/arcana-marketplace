import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import Stripe from 'stripe';

function checkoutEndpointPlugin() {
  return {
    name: 'checkout-endpoint',
    configureServer(server) {
      server.middlewares.use('/api/health', (req, res) => {
        const env = loadEnv(process.env.NODE_ENV || 'development', process.cwd(), '');
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          ok: true,
          stripeConfigured: Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_SECRET_KEY.startsWith('sk_')),
          mode: 'secure-backend',
        }));
      });

      server.middlewares.use('/api/create-checkout-session', async (req, res, next) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('Method not allowed');
          return;
        }

        const env = loadEnv(process.env.NODE_ENV || 'development', process.cwd(), '');
        const missingKeys = [];
        if (!env.STRIPE_SECRET_KEY || !env.STRIPE_SECRET_KEY.startsWith('sk_')) {
          missingKeys.push('STRIPE_SECRET_KEY');
        }
        if (!env.VITE_APP_URL) {
          missingKeys.push('VITE_APP_URL');
        }

        if (missingKeys.length > 0) {
          res.statusCode = 503;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            error: `Backend not ready. Missing required config: ${missingKeys.join(', ')}`
          }));
          return;
        }

        let body = {};
        try {
          const chunks = [];
          for await (const chunk of req) {
            chunks.push(typeof chunk === 'string' ? chunk : chunk.toString());
          }
          body = JSON.parse(chunks.join('') || '{}');
        } catch (error) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Invalid JSON body.' }));
          return;
        }

        try {
          const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
          const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            line_items: [{
              price_data: {
                currency: body.currency || 'gbp',
                product_data: { name: body.itemName || 'ArkanaDeck Order' },
                unit_amount: Math.round(Number(body.amount || 0) * 100),
              },
              quantity: 1,
            }],
            success_url: body.successUrl || `${env.VITE_APP_URL || 'http://localhost:5173'}/success`,
            cancel_url: body.cancelUrl || `${env.VITE_APP_URL || 'http://localhost:5173'}/cancel`,
            metadata: { source: 'arkana-marketplace' },
          });

          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            id: session.id,
            url: session.url,
            amount_total: session.amount_total,
            currency: session.currency,
          }));
        } catch (error) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            error: error instanceof Error ? error.message : 'Unable to create checkout session.'
          }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react(), checkoutEndpointPlugin()],
    build: {
      outDir: 'dist',
      sourcemap: false,
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      proxy: {
        '/api': {
          target: env.VITE_APP_URL || 'http://localhost:5173',
          changeOrigin: true,
        },
      },
    },
  };
});
