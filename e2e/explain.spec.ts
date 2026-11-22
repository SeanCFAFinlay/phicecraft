// ============================================================================
// EXPLAIN, PRESENT AT THE RINK, BUILD A PRACTICE
//
// The three coach-facing explanation tools, end to end in the real app:
//   - the coach workspace explains a library drill step by step and gives
//     every player a job card;
//   - Present mode captions each step, steps forward and back, and loops one;
//   - the practice planner builds a full practice from a typed request and
//     grades it for the age group.
// ============================================================================

import { expect, test, type Page } from '@playwright/test';
import { openEditor } from './support';

async function useLibraryDrill(page: Page, title: RegExp) {
  await page.getByRole('button', { name: 'Open main menu' }).click();
  await page.getByRole('button', { name: /Browse the drill library/ }).click();
  const library = page.getByRole('dialog', { name: 'Drill library' });
  await expect(library).toBeVisible();
  await library.getByRole('searchbox').first().fill('Stop-Up Cycle');
  const card = library.getByRole('article').filter({ hasText: title }).first();
  await card.getByRole('button', { name: 'Use drill' }).click();
  await expect(library).toBeHidden();
}

test.beforeEach(async ({ page }) => {
  await openEditor(page);
});

/** Desktop has a Teach button in the header; a phone opens it from the menu. */
async function openCoachWorkspace(page: Page) {
  const header = page.getByRole('button', { name: 'Coach workspace', exact: true });
  if (await header.isVisible()) await header.click();
  else {
    await page.getByRole('button', { name: 'Open main menu' }).click();
    await page.getByRole('button', { name: /^Coach workspace/ }).click();
  }
}

/** Desktop shows the three modes; a phone opens them in a Mode sheet. */
async function enterPresent(page: Page) {
  if ((page.viewportSize()?.width ?? 1366) < 640) {
    await page.getByRole('button', { name: /^Mode:/ }).click();
    await page.getByRole('dialog', { name: 'Mode' }).getByRole('radio', { name: 'Present' }).click();
  } else {
    await page.getByRole('radiogroup', { name: 'Mode' }).getByRole('radio', { name: 'Present' }).click();
  }
}

test('the coach workspace explains a drill and gives every player a job', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await useLibraryDrill(page, /Stop-Up Cycle/);

  await openCoachWorkspace(page);
  const sheet = page.getByRole('dialog', { name: 'Coach workspace' });
  await expect(sheet.getByText('How this drill works')).toBeVisible();
  await expect(sheet.getByText('STEP 1 ·')).toBeVisible();
  await expect(sheet.getByText(/#17 passes to #4/).first()).toBeVisible();
  await expect(sheet.getByRole('heading', { name: 'Watch for' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('explain.png') });

  await sheet.getByRole('button', { name: 'Players', exact: true }).click();
  const cards = sheet.getByRole('article', { name: /^Job card/ });
  await expect(cards).toHaveCount(5);
  const winger = sheet.getByRole('article', { name: /Job card #17/ });
  await expect(winger).toContainText('Pass to #4');
  await expect(winger).toContainText('with the puck');
  await page.screenshot({ path: testInfo.outputPath('player-cards.png') });

  // Print opens the cards in a new tab.
  const [popup] = await Promise.all([
    page.waitForEvent('popup'),
    sheet.getByRole('button', { name: 'Print all cards' }).click(),
  ]);
  await expect(popup.locator('.card')).toHaveCount(5);
  await expect(popup.locator('.card').first()).toContainText('Remember:');
  await popup.close();
  expect(errors).toEqual([]);
});

test('Present mode captions each step, steps through them and loops one', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await useLibraryDrill(page, /Stop-Up Cycle/);

  await enterPresent(page);
  await expect(page.getByRole('button', { name: 'Exit presentation' })).toBeVisible();
  await expect(page.getByText(/Step 1 of \d/)).toBeVisible();

  await page.getByRole('button', { name: 'Next step' }).click();
  await expect(page.getByText(/Step 2 of \d/)).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByText(/Step 3 of \d/)).toBeVisible();
  await page.getByRole('button', { name: 'Previous step' }).click();
  await expect(page.getByText(/Step 2 of \d/)).toBeVisible();

  // Loop step 2 at quarter speed: playback keeps coming back to it.
  await page.getByRole('radio', { name: '¼×' }).click();
  await page.getByRole('button', { name: 'Loop this step' }).click();
  await expect(page.getByText('· looping')).toBeVisible();
  await page.getByRole('button', { name: 'Start playback' }).click();
  await page.waitForTimeout(4000);
  await expect(page.getByText(/Step 2 of \d/)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('present.png') });
  await expect(page.getByRole('button', { name: 'Pause playback' })).toBeVisible();

  // The controls fade out while the play runs; a touch brings them back.
  await page.mouse.move(150, 300);
  await page.mouse.move(170, 320);
  await page.getByRole('button', { name: 'Step captions' }).click();
  await expect(page.getByText(/Step 2 of \d/)).toBeHidden();
  expect(errors).toEqual([]);
});

test('the planner builds a practice from a typed request and grades it for the age', async ({ page }, testInfo) => {
  await page.getByRole('button', { name: 'Open main menu' }).click();
  await page.getByRole('button', { name: /Practice Session Planner/ }).click();
  const planner = page.getByRole('dialog', { name: 'Practice Session Planner' });
  await expect(planner).toBeVisible();

  await planner.getByRole('button', { name: /Build a Practice/ }).click();
  await planner.getByLabel('Describe the practice').fill('50 min U9 skating and passing, no goalies, 12 kids');
  await expect(planner.getByRole('radio', { name: 'U9' })).toHaveAttribute('aria-checked', 'true');
  await expect(planner.getByRole('radio', { name: '50m' })).toHaveAttribute('aria-checked', 'true');
  await planner.getByRole('button', { name: 'Generate practice' }).click();

  await expect(planner.getByText(/Built "U9 Skating, Passing \(50 min\)"/)).toBeVisible();
  await expect(planner.getByText('50 / 50 MIN').first()).toBeVisible();
  const check = planner.getByRole('region', { name: 'Age-appropriate check' });
  await expect(check).toContainText(/Great|Good/);
  await expect(check).toContainText('in stations and small-area games');
  await check.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('practice-builder.png') });

  // Re-grading for a different age changes the verdict, not the plan.
  await check.getByLabel('Age group for this plan').selectOption('u18');
  await expect(check).not.toContainText('in stations and small-area games');
});

test('a play sent as a link opens as a copy, and saves as a video', async ({ page, context }, testInfo) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await useLibraryDrill(page, /Stop-Up Cycle/);

  await page.getByRole('button', { name: 'Open main menu' }).click();
  await page.getByRole('button', { name: /^Share this play/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Share this play' });
  await expect(sheet).toBeVisible();
  const linkBox = sheet.getByRole('textbox', { name: 'Play link' });
  await expect(linkBox).toHaveValue(/#play=z/);
  const link = await linkBox.inputValue();
  await page.screenshot({ path: testInfo.outputPath('share-sheet.png') });

  // Saved as a video, recorded on the device.
  await sheet.getByRole('radio', { name: /Slow motion/ }).click();
  await sheet.getByRole('radio', { name: 'Game speed' }).click();
  await sheet.getByRole('button', { name: 'Make video' }).click();
  await expect(sheet.getByRole('progressbar', { name: 'Making the video' })).toBeVisible();
  await expect(sheet.getByText(/^Ready: stop-up-cycle.*\.(mp4|webm)/)).toBeVisible({ timeout: 30_000 });
  const duration = await sheet.locator('video').evaluate(
    video =>
      new Promise<number>(resolve => {
        const element = video as HTMLVideoElement;
        if (element.readyState >= 1) resolve(element.duration);
        else element.addEventListener('loadedmetadata', () => resolve(element.duration), { once: true });
      })
  );
  // MediaRecorder WebM can report Infinity until fully scanned; either way it has length.
  expect(duration).toBeGreaterThan(0);

  // Someone else opens the link: the play arrives through the import preview.
  const other = await context.newPage();
  await other.emulateMedia({ reducedMotion: 'reduce' });
  await other.goto(link);
  const preview = other.getByRole('dialog', { name: /import/i });
  await expect(preview).toBeVisible({ timeout: 15_000 });
  await expect(preview).toContainText('Stop-Up Cycle');
  await other.screenshot({ path: testInfo.outputPath('share-import.png') });
  expect(new URL(other.url()).hash).toBe('');
  expect(errors).toEqual([]);
});
