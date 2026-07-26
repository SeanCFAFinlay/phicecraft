// ============================================================================
// OFFLINE, INSTALLABLE, AND HONEST ABOUT IT
//
// `index.html` has advertised "Works offline" since before there was anything
// making it true. IndexedDB kept a coach's DRILLS on the device, but a cold
// reload with no network could not fetch the application itself - so the claim
// failed in exactly the situation it was for: an arena with no signal.
//
// The gate here is the one the rebuild spec names: a cold offline reload must
// open the app AND the saved drills.
// ============================================================================

import { expect, test, type Page } from '@playwright/test';
import { openEditor } from './support';

async function waitForController(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return false;
    await navigator.serviceWorker.ready;
    // `ready` resolves on activation; control of THIS page can take a moment.
    for (let attempt = 0; attempt < 40; attempt++) {
      if (navigator.serviceWorker.controller) return true;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return !!navigator.serviceWorker.controller;
  });
}

test('the app declares a web manifest a browser can install from', async ({ page }) => {
  await openEditor(page);

  const href = await page.getAttribute('link[rel="manifest"]', 'href');
  expect(href).toBe('/manifest.webmanifest');

  const manifest = await page.evaluate(async () => {
    const response = await fetch('/manifest.webmanifest');
    return response.ok ? await response.json() : null;
  });

  expect(manifest).not.toBeNull();
  expect(manifest.name).toContain('PhiceCraft');
  expect(manifest.display).toBe('standalone');
  expect(manifest.start_url).toBe('/');
  // Without an icon a browser will not offer to install it.
  expect(manifest.icons.length).toBeGreaterThan(0);
  expect(manifest.icons.some((icon: { purpose: string }) => icon.purpose === 'maskable')).toBe(true);
});

test('a service worker takes control of the page', async ({ page }) => {
  await openEditor(page);
  expect(await waitForController(page)).toBe(true);
});

test('a cold reload with NO network still opens the app and the saved drill', async ({
  page,
  context,
}) => {
  await openEditor(page);
  expect(await waitForController(page)).toBe(true);

  // Wait until the coach's work is actually on the device.
  await expect(page.getByRole('status', { name: /^Save status:/ })).toHaveAccessibleName(
    /Saved/,
    { timeout: 20_000 }
  );

  // Cut the network completely, then reload from cold.
  await context.setOffline(true);
  await page.reload();

  // The application itself came from the cache.
  await expect(page.getByRole('application', { name: /hockey rink/i })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole('navigation', { name: 'Editing tools' })).toBeVisible();

  // And so did the coach's work, from IndexedDB.
  const stored = await page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const request = indexedDB.open('phicecraft');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const all = db.transaction('drills', 'readonly').objectStore('drills').getAll();
          all.onsuccess = () => {
            resolve(all.result.length);
            db.close();
          };
        };
      })
  );
  expect(stored, 'saved drills survive a cold offline start').toBeGreaterThan(0);

  await context.setOffline(false);
});

test('the rink is usable offline, not just visible', async ({ page, context }) => {
  await openEditor(page);
  expect(await waitForController(page)).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('application', { name: /hockey rink/i })).toBeVisible({
    timeout: 20_000,
  });

  // The lazily-loaded chunks were cached too, so a coach in an arena can still
  // reach the library rather than finding half the product missing.
  await page.getByRole('button', { name: 'Open main menu' }).click();
  await page.getByRole('button', { name: /Browse the drill library/ }).click();
  await expect(page.getByRole('dialog', { name: 'Drill library' })).toBeVisible();
  expect(await page.getByRole('article').count()).toBeGreaterThan(0);

  await context.setOffline(false);
});
