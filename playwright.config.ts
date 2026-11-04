import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    },
  },
  webServer: [
    { command: 'node e2e/auth-server.cjs', port: 3101, reuseExistingServer: false },
    {
      command: 'npm run dev -- --hostname 0.0.0.0', url: 'http://localhost:3000/login',
      reuseExistingServer: false, timeout: 120000,
      env: { NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:3101', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture-anon-key', NO_PROXY: [process.env.NO_PROXY,'localhost','127.0.0.1'].filter(Boolean).join(',') },
    },
  ],
});
