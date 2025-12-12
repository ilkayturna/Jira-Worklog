import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'robots.txt', 'apple-touch-icon.png'],
      manifest: {
        name: 'WorklogPro - Jira Worklog Manager',
        short_name: 'WorklogPro',
        description: 'Jira worklog\'larınızı kolayca yönetin - Modern, hızlı ve kullanıcı dostu',
        theme_color: '#007AFF',
        background_color: '#f2f2f7',
        display: 'standalone',
        orientation: 'portrait-primary',
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.groq\.com\/.*/i,
            handler: 'NetworkOnly', // AI requests should be online only
          },
          {
            urlPattern: /^https:\/\/.*\.atlassian\.net\/.*/i,
            handler: 'NetworkFirst', // Jira requests try network first, fall back to cache if needed (though for POSTs we need background sync which is complex, let's stick to NetworkFirst for reads)
            options: {
              cacheName: 'jira-api-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 // 1 day
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      }
    })
  ],
  server: {
    host: '0.0.0.0', // Tüm ağ arayüzlerinde dinle (LAN erişimi için)
    port: 5173,
    strictPort: false, // Port meşgulse alternatif port kullan
  }
});