import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const BASE = `http://localhost:${PORT}`;

// CI runs only the "smoke" project against a static preview of the built SPA
// (no Google auth, no secrets). The authed game-flow spec is skipped unless a
// logged-in storageState + base URL are provided (see tests/e2e/game.authed.spec.ts).
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: { baseURL: BASE, trace: 'on-first-retry' },
  projects: [
    { name: 'smoke', testMatch: /smoke\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
    // Local-only: run with `npx playwright test --project=authed` after capturing a
    // logged-in session: `npx playwright open --save-storage=tests/e2e/.auth/state.json https://dinnertablecards.xyz`
    {
      name: 'authed',
      testMatch: /game\.authed\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.E2E_BASE_URL || 'https://dinnertablecards.xyz',
        storageState: process.env.E2E_STORAGE || 'tests/e2e/.auth/state.json',
      },
    },
  ],
  // The smoke project serves the pre-built SPA. Build first (`npm run build`),
  // then run the suite — CI does this in sequence; locally too. (Building inside
  // the webServer made every run rebuild and could exceed the start timeout.)
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    url: BASE,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
