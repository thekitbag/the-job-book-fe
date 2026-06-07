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
        name: 'Job Book',
        short_name: 'Job Book',
        description: 'Voice notes for the site',
        theme_color: '#1a6f38',
        background_color: '#f4f4f0',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        // Cache app shell and static assets for offline load
        globPatterns: ['**/*.{js,css,html,svg}'],
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
