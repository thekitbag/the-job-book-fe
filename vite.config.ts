import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    basicSsl(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'The Job Book',
        short_name: 'The Job Book',
        description: 'Voice notes for the site',
        // Ledger theme: ink chrome (the standalone PWA's top bar / splash) and a
        // white splash background, matching the app's ink hero band and paper.
        theme_color: '#111111',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        // Maskable and any are separate entries — a single "any maskable" makes
        // Android crop the un-padded icon. The maskable art carries its own
        // safe-zone; the any art is the tight tile.
        icons: [
          { src: 'app-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'app-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'app-icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'app-icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      // Precache the favicon/apple-touch referenced from index.html so they load
      // offline; the built-in registration keeps them fresh on update.
      includeAssets: ['favicon.svg', 'favicon-32.png', 'favicon-16.png', 'apple-touch-icon-180.png'],
      workbox: {
        // Cache app shell, static assets, icon PNGs, and fonts for offline load
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
  server: {
    // basicSsl plugin handles HTTPS automatically; host exposes to LAN for phone testing
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
