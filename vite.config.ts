import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { copyFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// GitHub Pages serves 404.html for unknown paths; make it the SPA shell.
function spa404(): Plugin {
  return {
    name: 'spa-404',
    closeBundle() {
      const out = resolve(__dirname, 'dist')
      if (existsSync(resolve(out, 'index.html'))) copyFileSync(resolve(out, 'index.html'), resolve(out, '404.html'))
    },
  }
}

export default defineConfig({
  base: '/trezure/',
  plugins: [
    react(),
    spa404(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'logo/*.svg', 'sound/*.mp3', 'oki/*.png'],
      manifest: {
        id: '/trezure/',
        name: 'TREZURE',
        short_name: 'TREZURE',
        description: 'יש לך את זה.',
        lang: 'he',
        dir: 'rtl',
        start_url: '/trezure/',
        scope: '/trezure/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F4F8F9',
        theme_color: '#0F7B8A',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,mp3}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: '/trezure/index.html',
        navigateFallbackDenylist: [/^\/trezure\/api\//],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/v1\/object\/public\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'tz-images', expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 30 } },
          },
        ],
      },
    }),
  ],
  build: { target: 'es2020', sourcemap: false },
})
