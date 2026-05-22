import { defineConfig, devices } from '@playwright/test'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// Issue #78 fix: explicitly load root .env so all VITE_* and SUPABASE_* vars are
// available to both the playwright process and the webServer child processes.
dotenv.config({ path: path.resolve(__dirname, '../.env') })

// Collect env vars that must be forwarded to the Vite dev server so the browser
// bundle has the correct Supabase URL / anon key at runtime.
// Without this explicit env passthrough, `npm run dev` spawned by webServer
// may not inherit the parent-process env on some CI/Windows shells.
const sharedEnv: Record<string, string> = {}
const envKeys = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'NODE_ENV']
for (const k of envKeys) {
  if (process.env[k]) sharedEnv[k] = process.env[k]!
}

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'tr-TR',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      command: 'npm run dev:server',
      cwd: '..',
      url: 'http://localhost:3001/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: sharedEnv,
    },
    {
      command: 'npm run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      // Issue #78: explicitly pass VITE_* vars so the browser bundle connects to
      // the correct Supabase instance even on Windows shells where env inheritance
      // from the playwright process to the child process may be incomplete.
      env: sharedEnv,
    },
  ],
})
