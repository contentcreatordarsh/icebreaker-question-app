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
        // Pre-cache JS, CSS, and image assets for fast repeat loads.
        globPatterns: ['**/*.{js,css,svg,png}'],
        // Force the new SW to take over immediately — don't wait for all tabs to close.
        skipWaiting: true,
        clientsClaim: true,
        // Clean up caches from previous SW versions.
        cleanupOutdatedCaches: true,
        // Do NOT use navigateFallback — Cloudflare Workers already handles SPA
        // routing server-side (not_found_handling = "single-page-application").
        // If precache gets cleared/corrupted, navigateFallback would ERR_FAILED
        // because it can't serve index.html from an empty cache. Letting navigation
        // requests pass through to the network is both safer and faster (edge-served).
        navigateFallback: null,
        //
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
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-firebase': ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          'vendor-motion': ['motion'],
          'vendor-ui': ['lucide-react', 'clsx', 'tailwind-merge'],
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
