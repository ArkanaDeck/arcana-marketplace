import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function checkoutEndpointPlugin() {
  return {
    name: 'checkout-endpoint',
    configureServer(server) {
      server.middlewares.use('/create-checkout-session', (req, res, next) => {
        if (req.method !== 'POST') {
          res.statusCode = 404;
          res.end('Not found');
          return;
        }

        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          client_secret: `cs_test_${Date.now()}`,
          id: `cs_test_${Date.now()}`,
        }));
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), checkoutEndpointPlugin()],
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
});
