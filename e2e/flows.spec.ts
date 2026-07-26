// ============================================================================
// REQUIRED END-TO-END FLOWS
//
// Each of these is a defect from the repair checklist, exercised through the
// real UI against the real IndexedDB store.
// ============================================================================

import { expect, test, type Page } from '@playwright/test';
import {
  LINEUP,
  clickWorld,
  confirmDialog,
  dragWorld,
  openEditor,
  openSheet,
} from './support';

/** Read the drills currently in IndexedDB, straight from the page. */
async function storedDrills(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ id: string; name: string; document: Record<string, unknown> }[]>(
        (resolve, reject) => {
          const request = indexedDB.open('phicecraft');
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction('drills', 'readonly');
            const all = tx.objectStore('drills').getAll();
            all.onsuccess = () => {
              resolve(all.result);
              db.close();
            };
            all.onerror = () => reject(all.error);
          };
        }
      )
  );
}

/**
 * Wait until nothing is outstanding.
 *
 * Polling the status rather than asserting it once: the auto-save debounce can
 * make it flicker back to "Unsaved changes" under parallel load, and these
 * tests care that the work lands, not about a single instant.
 */
async function waitForSaved(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page
          .getByRole('status', { name: /^Save status:/ })
          .getAttribute('aria-label'),
      { timeout: 20_000, message: 'the drill reached storage' }
    )
    .toBe('Save status: Saved');
}

test.beforeEach(async ({ page }) => {
  await openEditor(page);
});

// ----------------------------------------------------------------------------
// 1. Create, change jerseys, undo, redo, save, reload
// ----------------------------------------------------------------------------

test('jerseys survive undo, redo, save and reload', async ({ page }) => {
  await page.getByRole('button', { name: 'Open main menu' }).click();
  const menu = page.getByRole('dialog', { name: 'PhiceCraft' });
  await expect(menu).toBeVisible();

  await menu.getByRole('radiogroup', { name: 'home jersey colour' }).getByRole('radio', { name: 'Green' }).click();
  await expect(
    menu.getByRole('radiogroup', { name: 'home jersey colour' }).getByRole('radio', { name: 'Green' })
  ).toBeChecked();

  await menu.getByRole('button', { name: 'Close' }).click();

  // Undo must reverse the jersey change - the snapshot now includes settings.
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.getByRole('button', { name: 'Open main menu' }).click();
  await expect(
    menu.getByRole('radiogroup', { name: 'home jersey colour' }).getByRole('radio', { name: 'Green' })
  ).not.toBeChecked();

  await menu.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Redo' }).click();

  await page.getByRole('button', { name: 'Open main menu' }).click();
  await expect(
    menu.getByRole('radiogroup', { name: 'home jersey colour' }).getByRole('radio', { name: 'Green' })
  ).toBeChecked();
  await menu.getByRole('button', { name: 'Save play' }).click();
  await waitForSaved(page);
  await menu.getByRole('button', { name: 'Close' }).click();

  await page.reload();
  await expect(page.getByRole('application', { name: /hockey rink/i })).toBeVisible();

  const drills = await storedDrills(page);
  const jerseys = drills.map(
    drill => (drill.document as { settings?: { jerseys?: { home?: string } } }).settings?.jerseys?.home
  );
  expect(jerseys).toContain('#129d5a');
});

// ----------------------------------------------------------------------------
// 2. Save As New preserves complete route semantics
// ----------------------------------------------------------------------------

test('Save As New preserves a backward, coasting route', async ({ page }) => {
  // Draw a route for #13 by dragging them.
  await dragWorld(page, LINEUP.home13, { x: 520, y: 90 });
  await expect(page.getByRole('button', { name: 'Details' })).toBeVisible();

  await page.getByRole('button', { name: 'Details' }).click();
  const inspector = page.getByRole('dialog', { name: /^#13/ });
  await expect(inspector).toBeVisible();

  await inspector.getByRole('radio', { name: 'backward' }).click();
  await inspector.getByRole('button', { name: /^Finish:/ }).click();
  await expect(inspector.getByRole('button', { name: /^Finish: Coast/ })).toBeVisible();
  await inspector.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('button', { name: 'Open main menu' }).click();
  const menu = page.getByRole('dialog', { name: 'PhiceCraft' });
  await menu.getByRole('button', { name: /Save as a new play/ }).click();

  const prompt = page.getByRole('dialog', { name: 'Save as a new play' });
  await prompt.getByRole('textbox').fill('Coast Copy');
  await prompt.getByRole('button', { name: 'Save copy' }).click();

  await expect(page.getByRole('button', { name: /^Play name: Coast Copy/ })).toBeVisible();

  // Wait for the copy to be DURABLE rather than for a status string: under
  // parallel load the status can flicker back to "Unsaved changes" as the
  // auto-save debounce catches up, which is not what this test is about.
  await expect
    .poll(async () => (await storedDrills(page)).some(drill => drill.name === 'Coast Copy'), {
      timeout: 20_000,
      message: 'the copy reached storage',
    })
    .toBe(true);

  await page.reload();
  await expect(page.getByRole('application', { name: /hockey rink/i })).toBeVisible();

  const drills = await storedDrills(page);
  const copy = drills.find(drill => drill.name === 'Coast Copy');
  expect(copy, 'the copy survived a reload').toBeTruthy();

  const routes = (copy!.document as { skatePaths: { mode?: string; finish?: string }[] }).skatePaths;
  expect(routes).toHaveLength(1);
  // The defect: duplicateDrill rebuilt routes from a subset of fields and
  // silently dropped mode and finish.
  expect(routes[0].mode).toBe('backward');
  expect(routes[0].finish).toBe('coast');
});

// ----------------------------------------------------------------------------
// 3 & 4. Import
// ----------------------------------------------------------------------------

const ID_LESS_DRILL = JSON.stringify({
  name: 'No Identity',
  players: [
    { id: 'p1', x: 300, y: 200, team: 'home', number: '11', role: 'C', hasPuck: true },
    { id: 'p2', x: 400, y: 200, team: 'home', number: '13', role: 'LW', hasPuck: false },
  ],
  skatePaths: [],
  events: [],
});

async function importFile(page: Page, contents: string, filename = 'import.json') {
  await page.getByRole('button', { name: 'Open main menu' }).click();
  const menu = page.getByRole('dialog', { name: 'PhiceCraft' });
  await expect(menu).toBeVisible();

  await page.setInputFiles('input[type="file"]', {
    name: filename,
    mimeType: 'application/json',
    buffer: Buffer.from(contents, 'utf8'),
  });

  return page.getByRole('dialog', { name: 'Import preview' });
}

test('an ID-less drill imports with a fresh, visible ID', async ({ page }) => {
  const preview = await importFile(page, ID_LESS_DRILL);
  await expect(preview).toContainText('No Identity');
  await expect(preview).toContainText('Imported as a new play with fresh IDs');

  await preview.getByRole('button', { name: 'Import as copies' }).click();
  await expect(page.getByRole('button', { name: /^Play name: No Identity/ })).toBeVisible();

  const drills = await storedDrills(page);
  const imported = drills.find(drill => drill.name === 'No Identity');
  expect(imported).toBeTruthy();
  // Never stored under the literal key "undefined".
  expect(imported!.id).toBeTruthy();
  expect(imported!.id).not.toBe('undefined');
  expect(drills.map(drill => drill.id)).not.toContain('undefined');

  // And it is in the visible library.
  await page.getByRole('button', { name: 'Open main menu' }).click();
  await expect(
    page.getByRole('dialog', { name: 'PhiceCraft' }).getByRole('button', { name: 'No Identity', exact: true })
  ).toBeVisible();
});

test('a colliding ID never overwrites local work without confirmation', async ({ page }) => {
  await waitForSaved(page);
  const before = await storedDrills(page);
  const localId = before[0].id;
  const localName = before[0].name;

  const colliding = JSON.stringify({
    id: localId,
    name: 'Someone Else’s Version',
    players: [{ id: 'x', x: 300, y: 200, team: 'away', number: '9', role: 'C', hasPuck: true }],
    skatePaths: [],
    events: [],
  });

  const preview = await importFile(page, colliding);
  await expect(preview).toContainText('shares an ID with your local play');
  // The default is a copy: replacing requires an explicit choice.
  await expect(preview.getByRole('radio', { name: 'Import as a copy' })).toBeChecked();

  await preview.getByRole('button', { name: 'Import as copies' }).click();

  const after = await storedDrills(page);
  const local = after.find(drill => drill.id === localId);
  expect(local!.name, 'the local play is untouched').toBe(localName);
  expect(after.find(drill => drill.name === 'Someone Else’s Version')?.id).not.toBe(localId);
});

test('replacement happens only when explicitly chosen, and keeps a recovery copy', async ({
  page,
}) => {
  await waitForSaved(page);
  const before = await storedDrills(page);
  const localId = before[0].id;

  const colliding = JSON.stringify({
    id: localId,
    name: 'Replacement Version',
    players: [{ id: 'x', x: 300, y: 200, team: 'away', number: '9', role: 'C', hasPuck: true }],
    skatePaths: [],
    events: [],
  });

  const preview = await importFile(page, colliding);
  await preview.getByRole('radio', { name: 'Replace matching drill' }).click();
  await preview.getByRole('button', { name: /Import \(1 replacement\)/ }).click();

  const after = await storedDrills(page);
  expect(after.find(drill => drill.id === localId)!.name).toBe('Replacement Version');

  const recovery = await page.evaluate(
    () =>
      new Promise<unknown[]>((resolve, reject) => {
        const request = indexedDB.open('phicecraft');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const all = db.transaction('recovery', 'readonly').objectStore('recovery').getAll();
          all.onsuccess = () => {
            resolve(all.result);
            db.close();
          };
        };
      })
  );
  expect(recovery.length, 'the replaced version is kept for recovery').toBeGreaterThan(0);
});

// ----------------------------------------------------------------------------
// 5. Cross-team passes are rejected in every path
// ----------------------------------------------------------------------------

test('dragging the puck onto an opponent does not create a pass', async ({ page }) => {
  // #11 (home, carrier) dragged onto #87 (away).
  await dragWorld(page, LINEUP.home11, LINEUP.away87);

  const drills = await storedDrills(page);
  const events = (drills[0]?.document as { events?: unknown[] })?.events ?? [];
  const passes = (events as { type: string }[]).filter(event => event.type === 'pass');
  expect(passes, 'no cross-team pass was created').toHaveLength(0);
});

test('the tap pass path rejects an opponent with an explanation', async ({ page }) => {
  // Arm a pass from the carrier with the dock's Pass button, then tap an
  // opponent. The Action sheet is gone; Pass is a verb in its own right.
  await clickWorld(page, LINEUP.home11);
  await page.getByRole('navigation', { name: 'Editing tools' })
    .getByRole('button', { name: 'Pass' })
    .click();

  await expect(page.getByText(/^Pass from #11/)).toBeVisible();

  await clickWorld(page, LINEUP.away87);
  await expect(page.getByRole('status').filter({ hasText: 'other team' }).first()).toBeVisible();

  const drills = await storedDrills(page);
  const events = (drills[0]?.document as { events?: unknown[] })?.events ?? [];
  expect(events).toHaveLength(0);
});

test('a pass to a teammate is accepted', async ({ page }) => {
  await dragWorld(page, LINEUP.home11, LINEUP.home13);
  await expect(page.getByRole('status').filter({ hasText: 'Pass to #13' }).first()).toBeVisible();
  await waitForSaved(page);

  const drills = await storedDrills(page);
  const events = ((drills[0].document as { events: { type: string }[] }).events ?? []).filter(
    event => event.type === 'pass'
  );
  expect(events).toHaveLength(1);
});

// ----------------------------------------------------------------------------
// 6. Pinch release must not become an edit
// ----------------------------------------------------------------------------

test('pinching over a player while a Pass is armed creates nothing', async ({ page, browser }) => {
  test.skip(browser.browserType().name() !== 'chromium', 'Touch dispatch needs CDP');

  // Erase is gone, so the armed Pass is now the mode where a stray release
  // would do real damage: it would commit a pass to whoever was pinched over.
  await page.getByRole('navigation', { name: 'Editing tools' })
    .getByRole('button', { name: /Pass/ })
    .click();
  const before = await storedDrills(page);
  const beforeCount = (before[0].document as { events: unknown[] }).events.length;

  const { pinchThenReleaseSequentially } = await import('./support');
  await pinchThenReleaseSequentially(page, LINEUP.home13);
  await page.waitForTimeout(300);

  const after = await storedDrills(page);
  expect((after[0].document as { events: unknown[] }).events).toHaveLength(beforeCount);
});

test('pinching over empty ice while Add is active places nothing', async ({ page, browser }) => {
  test.skip(browser.browserType().name() !== 'chromium', 'Touch dispatch needs CDP');

  await page.getByRole('button', { name: /Add/ }).click();
  await page.getByRole('dialog', { name: 'Add to the rink' }).getByRole('button', { name: /Home player/ }).click();

  const before = await storedDrills(page);
  const beforeCount = (before[0].document as { players: unknown[] }).players.length;

  const { pinchThenReleaseSequentially } = await import('./support');
  await pinchThenReleaseSequentially(page, LINEUP.emptyIce);
  await page.waitForTimeout(300);

  const after = await storedDrills(page);
  expect((after[0].document as { players: unknown[] }).players).toHaveLength(beforeCount);
});

// ----------------------------------------------------------------------------
// 7. Every Play surface behaves identically
// ----------------------------------------------------------------------------

test('every Play surface applies the same validation', async ({ page }) => {
  // An empty drill cannot be played, whichever button is used.
  const dockPlay = page.getByRole('button', { name: 'Play drill' });
  await dockPlay.click();
  await expect(page.getByRole('status').filter({ hasText: /Add a skating route/ }).first()).toBeVisible();

  // The keyboard shortcut takes the same path.
  await page.locator('body').press('Space');
  await expect(page.getByRole('status').filter({ hasText: /Add a skating route/ }).first()).toBeVisible();

  // And so does the expanded transport.
  await page.getByRole('button', { name: 'Expand playback controls' }).click();
  const sheet = page.getByRole('dialog', { name: 'Playback' });
  await sheet.getByRole('button', { name: /Play$/ }).click();
  await expect(page.getByRole('status').filter({ hasText: /Add a skating route/ }).first()).toBeVisible();
});

// ----------------------------------------------------------------------------
// 8 & 9. The clears are separate
// ----------------------------------------------------------------------------

async function buildRouteAndPass(page: Page): Promise<void> {
  await dragWorld(page, LINEUP.home13, { x: 520, y: 90 });
  await dragWorld(page, LINEUP.home11, LINEUP.home44);
  await waitForSaved(page);

  const drills = await storedDrills(page);
  const document = drills[0].document as { skatePaths: unknown[]; events: unknown[] };
  expect(document.skatePaths.length).toBeGreaterThan(0);
  expect(document.events.length).toBeGreaterThan(0);
}

test('clearing puck actions keeps the routes', async ({ page }) => {
  await buildRouteAndPass(page);

  await openSheet(page, 'More actions', 'More');
  await page.getByRole('button', { name: /Clear puck actions/ }).click();
  await confirmDialog(page, 'Clear puck actions');
  await waitForSaved(page);

  const drills = await storedDrills(page);
  const document = drills[0].document as { skatePaths: unknown[]; events: unknown[] };
  expect(document.events).toHaveLength(0);
  expect(document.skatePaths.length).toBeGreaterThan(0);
});

test('clearing routes keeps the puck actions', async ({ page }) => {
  await buildRouteAndPass(page);

  await openSheet(page, 'More actions', 'More');
  await page.getByRole('button', { name: /Clear skating routes/ }).click();
  await confirmDialog(page, 'Clear routes');
  await waitForSaved(page);

  const drills = await storedDrills(page);
  const document = drills[0].document as { skatePaths: unknown[]; events: unknown[] };
  expect(document.skatePaths).toHaveLength(0);
  expect(document.events.length).toBeGreaterThan(0);
});

// ----------------------------------------------------------------------------
// 10. Keyboard, with focus restoration
// ----------------------------------------------------------------------------

test('menu, dialog and inspector open and close by keyboard, restoring focus', async ({ page }) => {
  const menuButton = page.getByRole('button', { name: 'Open main menu' });
  await menuButton.focus();
  await page.keyboard.press('Enter');

  const menu = page.getByRole('dialog', { name: 'PhiceCraft' });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('button', { name: 'Close' })).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(menuButton).toBeFocused();

  // A destructive confirmation, opened and cancelled by keyboard.
  await openSheet(page, 'More actions', 'More');
  await page.getByRole('button', { name: /Reset the board/ }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Reset the board?' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // An inspector, opened from the selection chip.
  await clickWorld(page, LINEUP.home11);
  const details = page.getByRole('button', { name: 'Details' });
  await details.focus();
  await page.keyboard.press('Enter');

  const inspector = page.getByRole('dialog', { name: /^#11/ });
  await expect(inspector).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(inspector).toBeHidden();
  await expect(details).toBeFocused();
});

// ----------------------------------------------------------------------------
// 11. Review completes on playback, and reopens on an edit
// ----------------------------------------------------------------------------

test('playing to the end completes Review for that revision', async ({ page }) => {
  // This one waits out a real 8-second playback run on top of the usual setup,
  // so under a fully parallel suite it lands close to the 45s default and has
  // flaked twice. The work is genuinely slow rather than genuinely stuck.
  test.setTimeout(90_000);

  await dragWorld(page, LINEUP.home13, { x: 520, y: 90 });
  await dragWorld(page, LINEUP.home11, LINEUP.home44);
  await waitForSaved(page);

  await page.getByRole('button', { name: 'Play drill' }).click();
  await expect(page.getByRole('button', { name: 'Stop playback' })).toBeVisible();
  // The default drill runs for 8 seconds at 1x.
  await expect(page.getByRole('button', { name: 'Play drill' })).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: 'Expand playback controls' }).click();
  const sheet = page.getByRole('dialog', { name: 'Playback' });
  await expect(sheet).toContainText('complete for this version');
  await sheet.getByRole('button', { name: 'Close' }).click();

  // Any edit reopens it.
  await dragWorld(page, LINEUP.home5, { x: 400, y: 160 });
  await page.getByRole('button', { name: 'Expand playback controls' }).click();
  await expect(sheet).toContainText('not complete for this version');
});

// ----------------------------------------------------------------------------
// Persistence honesty
// ----------------------------------------------------------------------------

test('a save failure is reported, not announced as success', async ({ page }) => {
  await waitForSaved(page);

  // Break the object store behind the app's back.
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function patched(...args: unknown[]) {
      const names = String(args[0]);
      const mode = args[1];
      if (names.includes('drills') && mode === 'readwrite') {
        throw Object.assign(new Error('injected quota failure'), { name: 'QuotaExceededError' });
      }
      return original.apply(this, args as never);
    } as typeof IDBDatabase.prototype.transaction;
  });

  await page.getByRole('button', { name: 'Open main menu' }).click();
  await page.getByRole('dialog', { name: 'PhiceCraft' }).getByRole('button', { name: 'Save play' }).click();

  // The top-strip status is the persistent one; a toast may also appear.
  const failure = page.getByRole('alert').filter({ hasText: 'Save failed' }).first();
  await expect(failure).toBeVisible();
  await expect(failure.getByRole('button', { name: 'Retry' })).toBeVisible();
  await expect(failure.getByRole('button', { name: 'Export' })).toBeVisible();

  // "Play saved" must never have been shown.
  await expect(page.getByText('Play saved')).toBeHidden();

  // And it is still there after any toast would have expired.
  await page.waitForTimeout(4000);
  await expect(failure).toBeVisible();
});
