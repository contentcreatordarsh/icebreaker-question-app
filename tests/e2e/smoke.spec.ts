import { test, expect } from '@playwright/test';

// CI-safe smoke: no Google auth required. Drives the built SPA via vite preview.
// API calls (/api/stats) aren't served here and fail gracefully — these checks
// only assert that the public, client-rendered surfaces render correctly.

test('landing renders the brand, hero CTAs', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Dinner Table Cards/i);
  await expect(page.getByRole('button', { name: /start free/i })).toBeVisible();
  await expect(page.getByText(/join live session/i).first()).toBeVisible();
});

test('/play shows the room-code form with Join disabled until valid', async ({ page }) => {
  await page.goto('/play');
  await expect(page.getByText(/enter room code/i)).toBeVisible();
  await expect(page.getByText(/host a new session/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /^join session$/i })).toBeDisabled();
});

test('privacy and terms pages render', async ({ page }) => {
  await page.goto('/privacy');
  await expect(page.getByRole('heading').first()).toBeVisible();
  await page.goto('/terms');
  await expect(page.getByRole('heading').first()).toBeVisible();
});
