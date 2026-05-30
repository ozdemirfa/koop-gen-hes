import { defineConfig } from 'vitest/config'
import path from 'path'

// Unit test yapılandırması (build için vite.config.ts ayrı tutulur).
// Şimdilik yalnızca saf yardımcı/lib fonksiyonlarını kapsar (DOM gerekmez) →
// node environment yeterli. React bileşen testi eklenirse environment 'jsdom'
// yapılıp setup dosyası tanımlanmalı.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    globals: false,
  },
})
