import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Sprint qa-review-bugfix-faz3 (2026-05-25, Batch 4):
// manualChunks vendor splitting — 2.18MB single bundle warning'i çözüldü.
// react-vendor / antd / query / supabase ayrı chunk'lara böler; ilk yüklemede
// kullanıcı tabanı sadece gerekli chunk'ları indirir (cache hit oranı artar).
// chunkSizeWarningLimit 800 KB — tipik build için makul tavan.
export default defineConfig({
  plugins: [react()],
  envDir: '../', // Use root .env
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // Vite 8'de manualChunks object literal yerine function bekliyor.
        manualChunks(id: string) {
          if (id.includes('node_modules')) {
            if (id.includes('react-router') || id.includes('/react/') || id.includes('/react-dom/')) {
              return 'react-vendor'
            }
            // PERF-1 (kalite-guvenlik-2026-06): antd chunk'ı 1.5MB'ydi (tek
            // chunk >800KB uyarısı). İkon paketi (@ant-design/icons) ve antd'nin
            // rc-* internal'leri ayrı chunk'lara bölünür → paralel indirme +
            // ayrı cache (ikon seti nadir değişir, antd core'dan bağımsız).
            if (id.includes('@ant-design/icons')) {
              return 'antd-icons'
            }
            if (id.includes('antd') || id.includes('@ant-design')) {
              return 'antd'
            }
            if (id.includes('@tanstack/react-query')) {
              return 'query'
            }
            if (id.includes('@supabase')) {
              return 'supabase'
            }
          }
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        timeout: 60000,
        proxyTimeout: 60000,
      },
    },
  },
})
