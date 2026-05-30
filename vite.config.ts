import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // We manage our own manifest.json in public/ — don't auto-generate one.
      manifest: false,
      includeAssets: ['favicon.svg', 'og-image.svg', 'icons/*.png'],
      workbox: {
        // Pre-cache all JS, CSS, HTML, and SVG assets produced by the build.
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        // Network-first for Firestore so the app always shows fresh data
        // but falls back gracefully if offline.
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/firestore\.googleapis\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'firestore-cache',
              networkTimeoutSeconds: 5,
            },
          },
          {
            urlPattern: /^https:\/\/securetoken\.googleapis\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'auth-token-cache',
              networkTimeoutSeconds: 5,
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
