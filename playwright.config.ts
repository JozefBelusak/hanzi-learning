import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests', testMatch: '**/*.spec.ts', fullyParallel: false,
  use: { baseURL: 'http://127.0.0.1:5180', channel: process.platform === 'win32' ? 'msedge' : 'chromium', headless: true, screenshot: 'only-on-failure' },
  webServer: {
    command: 'npm run dev -- --port 5180', url: 'http://127.0.0.1:5180', reuseExistingServer: false,
    env: { VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_browser_tests_only' },
  },
})
