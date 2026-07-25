// ============================================================================
// MOBILE FLOWS
//
// The phone-specific disclosure model: compact playback, the sheet-based
// inspector, and the visible pending action with its Cancel.
// ============================================================================

import { expect, test } from '@playwright/test';
import { LINEUP, clickWorld, dragWorld, openEditor, usableRinkHeight } from './support';

test.beforeEach(async ({ page }) => {
  await openEditor(page);
});

test('the possession and workflow bars are collapsed into chips', async ({ page }) => {
  // One compact chip each, not an always-on bar and a four-button row.
  await expect(page.getByRole('button', { name: /^Puck/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Step 1 of 4/ })).toBeVisible();

  await page.getByRole('button', { name: /^Puck/ }).click();
  const possession = page.getByRole('dialog', { name: 'Puck possession' });
  await expect(possession).toBeVisible();
  await possession.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('button', { name: /^Step 1 of 4/ }).click();
  const workflow = page.getByRole('dialog', { name: 'Workflow' });
  await expect(workflow).toBeVisible();
  await expect(workflow.getByRole('button', { name: /Puck actions/ })).toBeVisible();
});

test('selecting a player shows a chip, not a panel; Details opens the inspector', async ({
  page,
}) => {
  const rinkBefore = await usableRinkHeight(page);

  await clickWorld(page, LINEUP.home11);

  // A compact chip with the three things you actually want.
  await expect(page.getByRole('button', { name: 'Move' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Details' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete' })).toBeVisible();
  // And no inspector.
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // Selecting costs no rink height.
  expect(await usableRinkHeight(page)).toBe(rinkBefore);

  await page.getByRole('button', { name: 'Details' }).click();
  const inspector = page.getByRole('dialog', { name: /^#11/ });
  await expect(inspector).toBeVisible();

  // It scrolls internally and never exceeds the viewport.
  const box = (await inspector.boundingBox())!;
  expect(box.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);

  await inspector.getByRole('button', { name: 'Close' }).click();
  await expect(inspector).toBeHidden();
});

test('a pending action is visible, explains the next input, and can be cancelled', async ({
  page,
}) => {
  await clickWorld(page, LINEUP.home11);
  await page.getByRole('button', { name: /Action/ }).click();

  const sheet = page.getByRole('dialog', { name: 'Hockey action' });
  await sheet.getByRole('button', { name: /^Pass/ }).click();

  // The chip names the player and the next input, and offers Cancel.
  const chip = page.getByRole('status').filter({ hasText: 'Pass from #11' });
  await expect(chip).toBeVisible();
  await expect(chip).toContainText(/tap a teammate/i);

  await chip.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByText('Pass from #11')).toBeHidden();
});

test('Escape cancels a pending action', async ({ page }) => {
  await clickWorld(page, LINEUP.home11);
  await page.getByRole('button', { name: /Action/ }).click();
  await page.getByRole('dialog', { name: 'Hockey action' }).getByRole('button', { name: /^Pass/ }).click();

  await expect(page.getByText('Pass from #11')).toBeVisible();
  await page.locator('body').press('Escape');
  await expect(page.getByText('Pass from #11')).toBeHidden();
});

test('the compact transport expands into the full playback sheet', async ({ page }) => {
  // Collapsed: reset, play/pause, progress, expand.
  await expect(page.getByRole('button', { name: 'Reset playback to the start' })).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Playback position' })).toBeVisible();

  await page.getByRole('button', { name: 'Expand playback controls' }).click();
  const sheet = page.getByRole('dialog', { name: 'Playback' });

  // Expanded: the full timeline, speed, step, lifecycle.
  await expect(sheet.getByLabel('Drill timeline')).toBeVisible();
  await expect(sheet.getByRole('radiogroup', { name: 'Playback speed' })).toBeVisible();
  await expect(sheet.getByRole('button', { name: /Step/ })).toBeVisible();
  await expect(sheet).toContainText('Lifecycle:');
});

test('the Add sheet places a player where you tap', async ({ page }) => {
  const countPlayers = () =>
    page.evaluate(
      () =>
        new Promise<number>(resolve => {
          const request = indexedDB.open('phicecraft');
          request.onsuccess = () => {
            const db = request.result;
            const all = db.transaction('drills', 'readonly').objectStore('drills').getAll();
            all.onsuccess = () => {
              const drills = all.result as { document: { players: unknown[] } }[];
              resolve(drills[0]?.document.players.length ?? 0);
              db.close();
            };
          };
        })
    );

  const before = await countPlayers();

  await page.getByRole('button', { name: /Add/ }).click();
  await page
    .getByRole('dialog', { name: 'Add to the rink' })
    .getByRole('button', { name: /Away player/ })
    .click();

  await clickWorld(page, LINEUP.emptyIce);
  await expect
    .poll(countPlayers, { timeout: 15_000, message: 'a player was added and saved' })
    .toBe(before + 1);
});

test('drawing a route by dragging works on touch', async ({ page }) => {
  await dragWorld(page, LINEUP.home13, { x: 520, y: 90 });
  await expect(page.getByRole('status').filter({ hasText: /Route drawn for #13/ }).first()).toBeVisible();
});

test('the top strip fits at phone width with no essential control hidden', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Open main menu' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Play name:/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'More actions' })).toBeVisible();

  // Redo is not on the strip, but it IS reachable.
  await expect(page.getByRole('button', { name: 'Redo' })).toHaveCount(0);
  await page.getByRole('button', { name: 'More actions' }).click();
  await expect(
    page.getByRole('dialog', { name: 'More' }).getByRole('button', { name: /Redo/ })
  ).toBeVisible();
});
