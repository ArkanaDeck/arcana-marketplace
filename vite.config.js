import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import Sitemap from 'vite-plugin-sitemap';

const coreRoutes = ['/', '/search', '/account', '/help'];

export default defineConfig({
  plugins: [
    react(),
    Sitemap({
      hostname: 'https://arkcards.com',
      dynamicRoutes: coreRoutes.filter((route) => route !== '/'),
    }),
  ],
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
});
