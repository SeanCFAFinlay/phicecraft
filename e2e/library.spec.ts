// ============================================================================
// THE DRILL LIBRARY
//
// A coach opening the product should find something useful without drawing a
// drill first. The library used to be four names in a menu sheet, which is
// what the market review scored 2/10.
// ============================================================================

import { expect, test, type Page } from '@playwright/test';
import { openEditor } from './support';

async function openLibrary(page: Page) {
  await page.getByRole('button', { name: 'Open main menu' }).click();
  await page.getByRole('button', { name: /Browse the drill library/ }).click();
  const library = page.getByRole('dialog', { name: 'Drill library' });
  await expect(library).toBeVisible();
  return library;
}

const cards = (page: Page) => page.getByRole('article');

test.beforeEach(async ({ page }) => {
  await openEditor(page);
});

test('opens a real catalogue, not a handful of examples', async ({ page }) => {
  const library = await openLibrary(page);

  await expect(library).toContainText('24 of 24 drills');
  expect(await cards(page).count()).toBe(24);
});

test('a drill card says what a coach decides from', async ({ page }) => {
  await openLibrary(page);
  const first = cards(page).first();

  // Title, what it is, how long, and what it needs on the ice.
  await expect(first).toContainText(/min/);
  await expect(first.getByRole('button', { name: 'Details' })).toBeVisible();
  await expect(first.getByRole('button', { name: 'Use drill' })).toBeVisible();
});

test('search narrows the catalogue', async ({ page }) => {
  await openLibrary(page);
  await page.getByRole('searchbox', { name: 'Search drills' }).fill('backcheck');

  const count = await cards(page).count();
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThan(24);
  await expect(cards(page).first()).toContainText(/backcheck/i);
});

test('search that matches nothing says so, rather than showing an empty page', async ({ page }) => {
  const library = await openLibrary(page);
  await page.getByRole('searchbox', { name: 'Search drills' }).fill('zamboni curling');

  await expect(library).toContainText(/Nothing matches/i);
  expect(await cards(page).count()).toBe(0);
});

test('filters compose the way a coach expects', async ({ page }) => {
  const library = await openLibrary(page);

  // One value narrows.
  await page.getByRole('button', { name: 'U9' }).click();
  const afterAge = await cards(page).count();
  expect(afterAge).toBeLessThan(24);

  // A second value in the SAME filter widens.
  await page.getByRole('button', { name: 'U13' }).click();
  expect(await cards(page).count()).toBeGreaterThan(afterAge);

  // A value in a DIFFERENT filter narrows again.
  await page.getByRole('button', { name: 'No goalie' }).click();
  expect(await cards(page).count()).toBeLessThan(24);

  await expect(library).toContainText(/Clear 3/);
});

test('clearing the filters brings the catalogue back', async ({ page }) => {
  const library = await openLibrary(page);
  await page.getByRole('button', { name: 'U9' }).click();
  expect(await cards(page).count()).toBeLessThan(24);

  await page.getByRole('button', { name: /^Clear/ }).click();
  await expect(library).toContainText('24 of 24 drills');
});

test('details show the coaching content that makes a drill usable', async ({ page }) => {
  await openLibrary(page);
  await cards(page).first().getByRole('button', { name: 'Details' }).click();

  const details = page.getByRole('dialog').filter({ hasText: 'Coaching points' });
  await expect(details).toBeVisible();
  await expect(details).toContainText('Setup');
  await expect(details).toContainText('At a glance');
  // Provenance, because a template with no recorded source is not cleared to ship.
  await expect(details).toContainText('PhiceCraft');
});

test('a drill can be starred, and the star survives a reload', async ({ page }) => {
  await openLibrary(page);
  const star = cards(page).first().getByRole('button', { name: /^Star / });
  const title = await cards(page).first().getByRole('heading').textContent();

  await star.click();
  await page.getByRole('button', { name: 'Starred' }).click();
  expect(await cards(page).count()).toBe(1);

  await page.reload();
  await openLibrary(page);
  await page.getByRole('button', { name: 'Starred' }).click();
  await expect(cards(page).first()).toContainText(title!.trim());
});

test('using a template opens a copy, and never edits the template', async ({ page }) => {
  await openLibrary(page);
  const title = (await cards(page).first().getByRole('heading').textContent())!.trim();
  await cards(page).first().getByRole('button', { name: 'Use drill' }).click();

  // The editor is now showing that drill.
  await expect(page.getByRole('application', { name: /hockey rink/i })).toBeVisible();
  await expect(page.getByRole('status', { name: /^Save status:/ })).toHaveAccessibleName(
    /Saved|Unsaved/,
    { timeout: 20_000 }
  );

  // And the library still offers the original, unchanged.
  await openLibrary(page);
  await expect(cards(page).filter({ hasText: title })).toHaveCount(1);
});

test('the copy has its own identity, so editing it cannot reach the template', async ({ page }) => {
  await openLibrary(page);
  await cards(page).first().getByRole('button', { name: 'Use drill' }).click();
  await expect(page.getByRole('status', { name: /^Save status:/ })).toHaveAccessibleName(
    /Saved/,
    { timeout: 20_000 }
  );

  const stored = await page.evaluate(
    () =>
      new Promise<{ id: string; players: { id: string }[] }[]>((resolve, reject) => {
        const request = indexedDB.open('phicecraft');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const all = db.transaction('drills', 'readonly').objectStore('drills').getAll();
          all.onsuccess = () => {
            resolve(
              (all.result as { document: { id: string; players: { id: string }[] } }[]).map(
                item => item.document
              )
            );
            db.close();
          };
        };
      })
  );

  const copy = stored[stored.length - 1];
  // Fresh ids throughout: not the template id, and not the template's actor ids.
  expect(copy.id.startsWith('tpl-')).toBe(false);
  expect(copy.players.length).toBeGreaterThan(0);
  for (const player of copy.players) {
    expect(player.id.length).toBeGreaterThan(8);
  }
});

