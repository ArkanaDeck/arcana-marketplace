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
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-helmet-async'],
          supabase: ['@supabase/supabase-js'],
          capacitor: ['@capacitor/core'],
          qrcode: ['qrcode.react'],
        },
      },
    },
  },
  // Strips in-source test blocks from production bundles.
  define: {
    'import.meta.vitest': 'undefined',
  },
  test: {
    includeSource: ['src/main-layout.tsx'],
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
});
