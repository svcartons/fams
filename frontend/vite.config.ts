import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['vite.svg'],
      workbox: {
        globIgnores: ['**/models/**', '**/vendor-faceapi*.js'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            // Session and login responses must never be replayed from a service-worker cache.
            urlPattern: /^\/api\/auth(?:\/|$)/,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^\/api\/.*/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 5,
            },
          },
        ],
      },
      manifest: {
        name: 'FAMS Attendance Kiosk',
        short_name: 'FAMS Kiosk',
        description: 'Factory floor face attendance — install on tablets',
        theme_color: '#1D4ED8',
        background_color: '#F5F5F4',
        display: 'standalone',
        orientation: 'any',
        start_url: '/kiosk',
        scope: '/',
        lang: 'en',
        categories: ['business', 'productivity'],
        icons: [
          {
            src: '/vite.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': 'http://localhost:3007',
      '/socket.io': {
        target: 'http://localhost:3007',
        ws: true,
      },
    },
  },
  build: {
    // ── Bundle size optimizations ──────────────────────────────────
    target: 'es2020',
    sourcemap: false,           // No source maps in production (saves ~4 MB)
    minify: 'esbuild',          // esbuild is 20x faster than terser, same output
    cssMinify: true,
    chunkSizeWarningLimit: 1800, // Suppress warning for the large face-api chunk

    rollupOptions: {
      output: {
        // ── Manual Chunking Strategy ───────────────────────────────
        // Splits the bundle so browsers can cache framework code separately
        // from app code. When you update the app, only app chunks re-download.
        manualChunks: {
          // React core — changes rarely, will be cached for a long time
          'vendor-react': ['react', 'react-dom', 'react-router'],
          // Charting library — large but rarely updated
          'vendor-charts': ['recharts'],
          // face-api.js is ~5 MB minified; isolate it so it's cached separately
          'vendor-faceapi': ['face-api.js'],
          // UI libraries
          'vendor-ui': ['lucide-react', 'sonner'],
        },
      },
    },
  },
});
