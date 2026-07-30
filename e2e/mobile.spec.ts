// ============================================================================
// MOBILE FLOWS
//
// The phone-specific disclosure model: compact playback, the sheet-based
// inspector, and the visible pending action with its Cancel.
// ============================================================================

import { expect, test, type Page } from '@playwright/test';
import {
  LINEUP,
  clickWorld,
  dismissFirstRunHint,
  dragWorld,
  openEditor,
  storedDrill,
} from './support';

test.beforeEach(async ({ page }) => {
  await openEditor(page);
  // A fresh context has no `phicecraft.firstRunHintDone`, so the hint would
  // otherwise sit in the same top-of-rink lane every one of these specs taps
  // near. None of them are about the hint itself, so it is dismissed once,
  // up front, for the whole file.
  await dismissFirstRunHint(page);
});

test('possession lives on the transport and the guide lives in the menu', async ({ page }) => {
  // Possession is a button at the transport's left end, not a floating chip.
  await expect(page.getByRole('button', { name: /^Puck/ })).toBeVisible();
  await page.getByRole('button', { name: /^Puck/ }).click();
  const possession = page.getByRole('dialog', { name: 'Puck possession' });
  await expect(possession).toBeVisible();
  await possession.getByRole('button', { name: 'Close' }).click();

  // The workflow guide is no longer a standalone chip - it is behind the
  // main menu, as a "Guide - Step N of 4" item.
  await expect(page.getByRole('button', { name: /^Step 1 of 4/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Open main menu' }).click();
  const menu = page.getByRole('dialog', { name: 'PhiceCraft' });
  await expect(menu).toBeVisible();

  await menu.getByRole('button', { name: /^Guide · Step 1 of 4/ }).click();
  const workflow = page.getByRole('dialog', { name: 'Workflow' });
  await expect(workflow).toBeVisible();
  await expect(workflow.getByRole('button', { name: /Puck actions/ })).toBeVisible();
});

test('selecting a player shows a tray row, not a panel; Details opens the inspector', async ({
  page,
}) => {
  await clickWorld(page, LINEUP.home11);

  // The selection lives in its own labelled group in the tray, not a chip
  // floating over the ice.
  const selection = page.getByRole('group', { name: 'Selection' });
  await expect(selection).toBeVisible();
  await expect(selection.getByRole('button', { name: /^Move #/ })).toBeVisible();
  await expect(selection.getByRole('button', { name: 'Details' })).toBeVisible();
  await expect(selection.getByRole('button', { name: 'Delete' })).toBeVisible();
  // And no inspector.
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await selection.getByRole('button', { name: 'Details' }).click();
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
  // Pass is a dock button now, not a row inside an Action sheet.
  await clickWorld(page, LINEUP.home11);
  await page.getByRole('navigation', { name: 'Editing tools' })
    .getByRole('button', { name: 'Pass' })
    .click();

  // The chip names the player and the next input, and offers Cancel.
  const chip = page.getByRole('status').filter({ hasText: 'Pass from #11' });
  await expect(chip).toBeVisible();
  await expect(chip).toContainText(/highlighted teammate/i);

  await chip.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByText('Pass from #11')).toBeHidden();
});

test('Escape cancels a pending action', async ({ page }) => {
  await clickWorld(page, LINEUP.home11);
  await page.getByRole('navigation', { name: 'Editing tools' })
    .getByRole('button', { name: 'Pass' })
    .click();

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
  const countPlayers = async () => (await storedDrill(page)).players.length;

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

/** Open the phone's Mode sheet and pick a mode, by name. */
async function switchMode(page: Page, mode: string): Promise<void> {
  await page.getByRole('button', { name: /^Mode:/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Mode' });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('radio', { name: mode }).click();
  await expect(sheet).toBeHidden();
}

test('a phone switches to Preview and Present through the Mode sheet', async ({ page }) => {
  // Three 44px targets do not fit a phone-width top strip, so the phone gets
  // one trigger button (naming the current mode) that opens a sheet with the
  // full radiogroup - see ModeSwitch.tsx and TopStrip.tsx.
  await expect(page.getByRole('button', { name: 'Mode: Build. Activate to switch.' })).toBeVisible();

  // Preview: read-only playback surface, taps on the ice do not select or edit.
  await switchMode(page, 'Preview');
  await expect(page.getByRole('button', { name: /^Mode: Preview/ })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Preview' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Editing tools' })).toHaveCount(0);

  await clickWorld(page, LINEUP.home11);
  await expect(page.getByRole('group', { name: 'Selection' })).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Present: chrome-free full-bleed playback. The top strip (and the mode
  // trigger with it) disappears, so getting back is Exit or Escape.
  await switchMode(page, 'Build');
  await switchMode(page, 'Present');
  await expect(page.getByRole('button', { name: 'Exit presentation' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Mode:/ })).toHaveCount(0);
  await expect(page.getByRole('banner')).toHaveCount(0);

  await page.locator('body').press('Escape');
  await expect(page.getByRole('button', { name: /^Mode: Build/ })).toBeVisible();
});

test('Preview is read-only: no Undo in the top strip, and More has no Clear controls', async ({
  page,
}) => {
  await switchMode(page, 'Preview');

  // Undo mutates the document by definition - it has nothing to do once
  // Preview stops accepting edits, so it should not be sitting on the strip.
  await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0);

  await page.getByRole('button', { name: 'More actions' }).click();
  const sheet = page.getByRole('dialog', { name: 'More' });
  await expect(sheet).toBeVisible();

  await expect(sheet.getByRole('button', { name: /Clear puck actions/ })).toHaveCount(0);
  await expect(sheet.getByRole('button', { name: /Clear skating routes/ })).toHaveCount(0);
  await expect(sheet.getByRole('button', { name: /Reset the board/ })).toHaveCount(0);
  await expect(sheet.getByRole('button', { name: /Redo/ })).toHaveCount(0);
});
