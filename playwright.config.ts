import { defineConfig, devices } from '@playwright/test';

const E2E_JWT_SECRET =
  process.env.JWT_ACCESS_SECRET || 'colony-e2e-deterministic-jwt-secret-32chars!';

process.env.JWT_ACCESS_SECRET = E2E_JWT_SECRET;
process.env.JWT_REFRESH_SECRET = E2E_JWT_SECRET;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30 * 1000,
  expect: {
    timeout: 8000,
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run start --workspace=@colony/web',
    url: 'http://localhost:3000/login',
    reuseExistingServer: false,
    timeout: 60 * 1000,
    env: {
      ...process.env,
      JWT_ACCESS_SECRET: E2E_JWT_SECRET,
      JWT_REFRESH_SECRET: E2E_JWT_SECRET,
    },
  },
  projects: [
    {
      name: 'Desktop Chrome',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'Mobile Pixel 7 (PWA Viewport)',
      use: { ...devices['Pixel 7'] },
    },
  ],
});
