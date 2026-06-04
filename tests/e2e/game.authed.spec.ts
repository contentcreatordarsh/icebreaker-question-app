import { test, expect } from '@playwright/test';
import fs from 'node:fs';

// Authed flow — NOT run in CI (real Google OAuth can't run headless). Run locally:
//   1. Capture a logged-in session once:
//      npx playwright open --save-storage=tests/e2e/.auth/state.json https://dinnertablecards.xyz
//      (sign in with Google in the opened browser, then close it)
//   2. npx playwright test --project=authed
//
// Skips automatically when no stored auth state is present.
const STORAGE = process.env.E2E_STORAGE || 'tests/e2e/.auth/state.json';
const hasAuth = fs.existsSync(STORAGE);

test.describe('authed app', () => {
  test.skip(!hasAuth, 'no stored auth state — see header for setup');

  test('signed-in user can pick a Topic and get a topic question', async ({ page }) => {
    await page.goto('/');
    // "Explore by Topic" only renders in the signed-in app (not the landing).
    await expect(page.getByText(/explore by topic/i)).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: /sports/i }).click();
    await page.getByRole('button', { name: /^football$/i }).click();

    // A football question from the curated bank should appear in the question area.
    await expect(
      page.getByText(/footballer|loyalty or heartbreak|football/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('host can create a live session (room code + QR appear)', async ({ page }) => {
    await page.goto('/play');
    await page.getByRole('button', { name: /host a new session/i }).click();
    await expect(page).toHaveURL(/\/host\/[A-Z0-9]{4,5}/, { timeout: 15_000 });
    await expect(page.getByText(/room code/i)).toBeVisible();
    await expect(page.getByText(/scan to join/i)).toBeVisible();
  });
});
