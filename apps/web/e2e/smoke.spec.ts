import { expect, test } from '@playwright/test';

/**
 * Bare-minimum smoke test — the most important e2e flow:
 *   1. landing page loads
 *   2. upload dialog opens via the U keyboard shortcut
 *   3. /admin/health responds (even if 302->/signin for unauthenticated user)
 *
 * The full "upload mp3 -> share -> play" test requires the worker container
 * and is added separately in a future PR.
 */

test.describe('torus.fm smoke', () => {
  test('landing page renders the hero', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'share the loop' })).toBeVisible();
  });

  test('upload dialog opens with the U key', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('u');
    await expect(page.getByRole('heading', { name: 'Upload a clip' })).toBeVisible();
    await expect(page.getByText('Drag an audio file here')).toBeVisible();
  });

  test('signin page renders', async ({ page }) => {
    await page.goto('/signin');
    await expect(page.getByRole('heading', { name: 'sign in' })).toBeVisible();
  });

  test('admin pages redirect anonymous users to signin', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/signin/);
  });

  test('moderation log renders publicly', async ({ page }) => {
    await page.goto('/moderation');
    await expect(page.getByRole('heading', { name: 'moderation log' })).toBeVisible();
  });
});
