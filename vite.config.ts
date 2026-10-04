import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'samples/*.musicxml'],
      manifest: {
        name: 'doremifaaa',
        short_name: 'doremifaaa',
        description: 'Piano sight-reading trainer and MIDI score follower',
        theme_color: '#1f2a44',
        background_color: '#f7f4ee',
        display: 'standalone',
        orientation: 'any',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,musicxml,mjs}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/api/library'),
            handler: 'NetworkFirst',
            options: { cacheName: 'library', networkTimeoutSeconds: 4 }
          },
          {
            urlPattern: ({ url }) => /\/api\/pieces\/.+\/(score|pdf)$/.test(url.pathname),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'pieces', expiration: { maxEntries: 200 } }
          }
        ]
      }
    })
  ],
  server: {
    proxy: {
      '/api': process.env.DOREMIFAAA_API ?? 'http://localhost:8080'
    }
  },
  test: {
    environment: 'node'
  }
});
