import { expect, test } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(__dirname, 'fixtures', 'test.wav');

test.describe('upload to playback', () => {
  test('uploads wav, processes, and plays audio', async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto('/');
    await page.keyboard.press('u');
    await expect(page.getByRole('heading', { name: 'Upload a clip' })).toBeVisible();

    await page.locator('input[type="file"]').setInputFiles(fixture);

    await page.waitForURL(/\/[A-Z0-9]{6,12}$/i, { timeout: 30_000 });
    const shareUrl = page.url();
    const shareCode = shareUrl.split('/').pop()!;

    await expect
      .poll(
        async () => {
          const res = await page.request.get(`/api/clips/${shareCode}/stream`, {
            headers: { Accept: 'text/event-stream' },
          });
          return res.status();
        },
        { timeout: 5_000 },
      )
      .toBe(200);

    const audio = page.locator('audio');
    await expect
      .poll(async () => {
        const src = await audio.getAttribute('src');
        return src && src.length > 0 ? src : null;
      }, { timeout: 90_000 })
      .not.toBeNull();

    await expect(async () => {
      const played = await page.evaluate(() => {
        const el = document.querySelector('audio');
        if (!el) return false;
        return el.play().then(() => true).catch(() => false);
      });
      expect(played).toBe(true);
    }).toPass({ timeout: 15_000 });
  });
});
