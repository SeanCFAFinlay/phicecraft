// ============================================================================
// ACCESSIBILITY
//
// axe against every required surface, plus the structural checks axe cannot
// make: focus containment, the closed menu not being reachable by Tab, and
// reduced motion being honoured.
//
// No serious or critical violation is acceptable.
// ============================================================================

import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { LINEUP, clickWorld, dragWorld, openEditor } from './support';

const require = createRequire(import.meta.url);
const AXE_SOURCE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

interface AxeViolation {
  id: string;
  impact: string | null;
  help: string;
  nodes: { target: string[] }[];
}

/** Run axe over the page and return only serious/critical violations. */
async function seriousViolations(page: Page): Promise<AxeViolation[]> {
  await page.addScriptTag({ content: AXE_SOURCE });
  const results = await page.evaluate(async () => {
    // The canvas is a bitmap; its accessible alternative is the DOM shell
    // around it, which is what these runs are checking.
    const axeResults = await (
      window as unknown as { axe: { run: (options: unknown) => Promise<{ violations: AxeViolation[] }> } }
    ).axe.run({
      resultTypes: ['violations'],
      rules: { 'color-contrast': { enabled: true } },
    });
    return axeResults.violations;
  });

  return results.filter(violation => violation.impact === 'serious' || violation.impact === 'critical');
}

function describeViolations(violations: AxeViolation[]): string {
  return violations
    .map(violation => `${violation.impact} · ${violation.id}: ${violation.help}\n    ${violation.nodes.map(node => node.target.join(' ')).join('\n    ')}`)
    .join('\n');
}

async function expectAccessible(page: Page, surface: string): Promise<void> {
  const violations = await seriousViolations(page);
  expect(violations, `${surface}\n${describeViolations(violations)}`).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await openEditor(page);
});

test('the initial editor has no serious violations', async ({ page }) => {
  await expectAccessible(page, 'initial editor');
});

test('the open menu has no serious violations', async ({ page }) => {
  await page.getByRole('button', { name: 'Open main menu' }).click();
  await expect(page.getByRole('dialog', { name: 'PhiceCraft' })).toBeVisible();
  await expectAccessible(page, 'main menu');
});

test('the rename dialog has no serious violations', async ({ page }) => {
  await page.getByRole('button', { name: /^Play name:/ }).click();
  await expect(page.getByRole('dialog', { name: 'Rename this play' })).toBeVisible();
  await expectAccessible(page, 'rename dialog');
});

test('a destructive confirmation has no serious violations', async ({ page }) => {
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('button', { name: /Reset the board/ }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await expectAccessible(page, 'destructive confirmation');
});

test('the player inspector has no serious violations', async ({ page }) => {
  await clickWorld(page, LINEUP.home11);
  await page.getByRole('button', { name: 'Details' }).click();
  await expect(page.getByRole('dialog', { name: /^#11/ })).toBeVisible();
  await expectAccessible(page, 'player inspector');
});

test('the event inspector has no serious violations', async ({ page }) => {
  await dragWorld(page, LINEUP.home11, LINEUP.home13);
  await clickWorld(page, { x: 320, y: 168 });
  const details = page.getByRole('button', { name: 'Details' });
  if (await details.isVisible()) await details.click();
  await expectAccessible(page, 'event inspector');
});

test('the import preview has no serious violations', async ({ page }) => {
  await page.getByRole('button', { name: 'Open main menu' }).click();
  await page.setInputFiles('input[type="file"]', {
    name: 'import.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        name: 'Accessible Import',
        players: [{ id: 'p', x: 300, y: 200, team: 'home', number: '11', role: 'C', hasPuck: true }],
        skatePaths: [],
        events: [],
      }),
      'utf8'
    ),
  });
  await expect(page.getByRole('dialog', { name: 'Import preview' })).toBeVisible();
  await expectAccessible(page, 'import preview');
});

test('the save-failure recovery state has no serious violations', async ({ page }) => {
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function patched(...args: unknown[]) {
      if (String(args[0]).includes('drills') && args[1] === 'readwrite') {
        throw Object.assign(new Error('injected'), { name: 'QuotaExceededError' });
      }
      return original.apply(this, args as never);
    } as typeof IDBDatabase.prototype.transaction;
  });

  await page.getByRole('button', { name: 'Open main menu' }).click();
  await page.getByRole('dialog', { name: 'PhiceCraft' }).getByRole('button', { name: 'Save play' }).click();
  await page.getByRole('dialog', { name: 'PhiceCraft' }).getByRole('button', { name: 'Close' }).click();

  await expect(page.getByRole('alert').filter({ hasText: 'Save failed' }).first()).toBeVisible();
  await expectAccessible(page, 'save failure recovery');
});

test('the help sheet has no serious violations', async ({ page }) => {
  await page.getByRole('button', { name: 'Open main menu' }).click();
  await page.getByRole('button', { name: /How to use PhiceCraft/ }).click();
  await expect(page.getByRole('dialog', { name: 'How to use PhiceCraft' })).toBeVisible();
  await expectAccessible(page, 'help sheet');
});

// ----------------------------------------------------------------------------
// Structural checks axe cannot make
// ----------------------------------------------------------------------------

test('the closed menu is not reachable by keyboard', async ({ page }) => {
  // Tab through everything and confirm focus never lands on a menu control.
  const reached: string[] = [];
  for (let index = 0; index < 30; index++) {
    await page.keyboard.press('Tab');
    reached.push(
      await page.evaluate(() => {
        const active = document.activeElement as HTMLElement | null;
        return active ? `${active.tagName}:${active.getAttribute('aria-label') ?? active.textContent?.trim() ?? ''}` : 'none';
      })
    );
  }

  expect(reached.join('|')).not.toContain('Save play');
  expect(reached.join('|')).not.toContain('Export all plays');
  expect(reached.join('|')).not.toContain('Swap team colours');
});

test('focus is contained inside an open sheet', async ({ page }) => {
  await page.getByRole('button', { name: 'More actions' }).click();
  await expect(page.getByRole('dialog', { name: 'More' })).toBeVisible();

  const insideSheet: boolean[] = [];
  for (let index = 0; index < 25; index++) {
    await page.keyboard.press('Tab');
    insideSheet.push(
      await page.evaluate(() => {
        const sheet = document.querySelector('[role="dialog"]');
        return Boolean(sheet && document.activeElement && sheet.contains(document.activeElement));
      })
    );
  }

  expect(insideSheet.every(Boolean), 'focus left the sheet while it was open').toBe(true);
});

test('the help content is a list, not a row of no-op buttons', async ({ page }) => {
  await page.getByRole('button', { name: 'Open main menu' }).click();
  await page.getByRole('button', { name: /How to use PhiceCraft/ }).click();

  const sheet = page.getByRole('dialog', { name: 'How to use PhiceCraft' });
  await expect(sheet.getByRole('listitem').first()).toBeVisible();

  // The only button in the sheet is Close.
  const buttons = await sheet.getByRole('button').allTextContents();
  expect(buttons).toEqual(['Close']);
});

test('reduced motion is honoured', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect
    .poll(() => page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches))
    .toBe(true);

  const durations = await page.evaluate(() => {
    const samples: string[] = [];
    for (const element of document.querySelectorAll('header *, nav *')) {
      samples.push(getComputedStyle(element).transitionDuration);
    }
    return samples;
  });

  const animated = durations.filter(duration => {
    const seconds = parseFloat(duration);
    return Number.isFinite(seconds) && seconds > 0.01;
  });
  expect(animated).toEqual([]);
});

test('the live region announces canvas actions', async ({ page }) => {
  const region = page.locator('[role="status"][aria-live="polite"]').last();
  await expect(region).toHaveAttribute('aria-atomic', 'true');

  await clickWorld(page, LINEUP.home11);
  await page.getByRole('button', { name: /Action/ }).click();
  await page.getByRole('dialog', { name: 'Hockey action' }).getByRole('button', { name: /^Pass/ }).click();
  await page.locator('body').press('Escape');

  await expect(region).toHaveText(/cancelled/i);
});
