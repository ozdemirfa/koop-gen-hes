import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
//
// Sprint 20260520-perf (PR1):
// `build.rolldownOptions.output.manualChunks` ile vendor chunk'lar ayrıldı.
// Ana app chunk'ı route-level lazy ile zaten küçülmüştü; vendor chunk'ları
// uzun-yaşamlı (vendor sürümleri sık değişmez) → tarayıcı cache'inden faydalanılır.
//
// Chunk stratejisi:
//   react-vendor   → react, react-dom, react-router-dom
//   antd-vendor    → antd, @ant-design/icons (en büyük bağımlılık)
//   data-vendor    → @tanstack/react-query, axios
//   supabase-vendor → @supabase/supabase-js
//   utils-vendor   → dayjs

export default defineConfig({
  plugins: [react()],
  envDir: '../', // Use root .env
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
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
  build: {
    chunkSizeWarningLimit: 600,
    rolldownOptions: {
      output: {
        manualChunks: (id: string) => {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('antd') || id.includes('@ant-design')) return 'antd-vendor'
          if (id.includes('react-router')) return 'react-vendor'
          if (id.includes('react-dom') || id.includes('/react/')) return 'react-vendor'
          if (id.includes('@tanstack') || id.includes('axios')) return 'data-vendor'
          if (id.includes('@supabase')) return 'supabase-vendor'
          if (id.includes('dayjs')) return 'utils-vendor'
          return undefined
        },
      },
    },
  },
})
