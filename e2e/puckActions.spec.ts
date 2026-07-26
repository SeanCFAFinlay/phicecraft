// ============================================================================
// PASS, SHOOT AND MOVE, AT THE SPEED A COACH WORKS
//
// The three things this proves:
//   - Pass and Shoot are reachable in ONE tap, not two taps down a sheet
//   - a chain of four passes is four taps of Pass, because each pass hands the
//     selection to the receiver - and the fifth is refused, with a reason
//   - the Move button actually moves somebody, which it did not: it set a
//     pending action the gesture machine could not see, so a coach still had
//     to hold the player for 0.7s and the button appeared inert
// ============================================================================

import { expect, test, type Page } from '@playwright/test';
import { LINEUP, clickWorld, openEditor, worldToScreen } from './support';

interface StoredEvent {
  id: string;
  type: string;
  fromPlayerId: string;
  toPlayerId?: string;
  /** True for the shot the app maintains at the end of every play. */
  auto?: boolean;
}

/** The chain the coach authored, without the automatic finishing shot. */
function authored(events: StoredEvent[]): StoredEvent[] {
  return events.filter(event => !(event.type === 'shot' && event.auto));
}

interface StoredPlayer {
  id: string;
  number: string;
  x: number;
  y: number;
}

async function storedDrill(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ players: StoredPlayer[]; events: StoredEvent[] }>((resolve, reject) => {
        const request = indexedDB.open('phicecraft');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const all = db.transaction('drills', 'readonly').objectStore('drills').getAll();
          all.onsuccess = () => {
            const drills = all.result as {
              document: { players: StoredPlayer[]; events: StoredEvent[] };
            }[];
            resolve(drills[0].document);
            db.close();
          };
        };
      })
  );
}

async function waitForSaved(page: Page): Promise<void> {
  await expect
    .poll(() => page.getByRole('status', { name: /^Save status:/ }).getAttribute('aria-label'), {
      timeout: 20_000,
    })
    .toBe('Save status: Saved');
}

const passButton = (page: Page) => page.getByRole('button', { name: /^Pass from #/ });
const shootButton = (page: Page) => page.getByRole('button', { name: /^Shoot from #/ });
/** The chip's Move, which names its player - not the dock's mode button. */
const moveButton = (page: Page) => page.getByRole('button', { name: /^Move #/ });

/** Pass the puck from the current carrier to `to`, in two taps. */
async function passTo(page: Page, to: { x: number; y: number }): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Editing tools' })
    .getByRole('button', { name: 'Pass' })
    .click();
  await clickWorld(page, to);
}

test.beforeEach(async ({ page }) => {
  await openEditor(page);
});

// ----------------------------------------------------------------------------
// Reachability
// ----------------------------------------------------------------------------

test('Pass is a verb in the dock, not a row inside a sheet', async ({ page }) => {
  const dockPass = page
    .getByRole('navigation', { name: 'Editing tools' })
    .getByRole('button', { name: 'Pass' });

  // #11 starts with the puck, so Pass is live before anything is selected.
  await expect(dockPass).toBeVisible();
  await expect(dockPass).toBeEnabled();
});

test('Shoot appears on the chip for the player holding the puck', async ({ page }) => {
  await expect(shootButton(page)).toHaveCount(0);

  await clickWorld(page, LINEUP.home11);
  await expect(shootButton(page)).toBeVisible();
  await expect(passButton(page)).toBeVisible();
});

test('a shot is a single tap, because a team attacks one net', async ({ page }) => {
  // Shoot lives on the chip, so select the carrier first.
  await clickWorld(page, LINEUP.home11);
  await shootButton(page).click();
  await waitForSaved(page);

  const { events } = await storedDrill(page);
  expect(authored(events)).toHaveLength(1);
  expect(authored(events)[0].type).toBe('shot');
});

test('a pass is arm-then-tap-the-receiver', async ({ page }) => {
  await passTo(page, LINEUP.home13);
  await waitForSaved(page);

  const { events, players } = await storedDrill(page);
  const chain = authored(events);
  expect(chain).toHaveLength(1);
  expect(chain[0].type).toBe('pass');

  const receiver = players.find(player => player.id === chain[0].toPlayerId);
  expect(receiver?.number).toBe('13');
});

// ----------------------------------------------------------------------------
// Chaining, and the cap
// ----------------------------------------------------------------------------

test('four passes chain without hunting for the new carrier', async ({ page }) => {
  // Each pass selects the receiver, so the next Pass button is already theirs.
  await passTo(page, LINEUP.home13);
  await passTo(page, LINEUP.home44);
  await passTo(page, LINEUP.home5);
  await passTo(page, LINEUP.home7);
  await waitForSaved(page);

  const { events } = await storedDrill(page);
  expect(events.filter(event => event.type === 'pass')).toHaveLength(4);
});

test('the fifth pass is refused, and Pass goes dead', async ({ page }) => {
  await passTo(page, LINEUP.home13);
  await passTo(page, LINEUP.home44);
  await passTo(page, LINEUP.home5);
  await passTo(page, LINEUP.home7);
  await waitForSaved(page);

  // The cap is stated on the control itself rather than only on rejection.
  await expect(
    page.getByRole('navigation', { name: 'Editing tools' }).getByRole('button', { name: 'Pass' })
  ).toBeDisabled();

  const { events } = await storedDrill(page);
  expect(events.filter(event => event.type === 'pass')).toHaveLength(4);

  // Shooting is still open - a drill ends with a shot, not with a fifth pass.
  await clickWorld(page, LINEUP.home7);
  await expect(shootButton(page)).toBeEnabled();
});

test('the puck chip counts the passes so far', async ({ page }) => {
  await passTo(page, LINEUP.home13);
  await expect(page.getByRole('button', { name: /Puck/ }).first()).toContainText('1 pass');

  await passTo(page, LINEUP.home44);
  await expect(page.getByRole('button', { name: /Puck/ }).first()).toContainText('2 passes');
});

// ----------------------------------------------------------------------------
// Move
// ----------------------------------------------------------------------------

test('the Move button moves a player to the next tap', async ({ page }) => {
  await clickWorld(page, LINEUP.home13);
  await moveButton(page).click();

  const target = { x: 420, y: 360 };
  await clickWorld(page, target);
  await waitForSaved(page);

  const { players } = await storedDrill(page);
  const moved = players.find(player => player.number === '13')!;

  // This is the regression: the button armed a pending action nothing in the
  // gesture machine could see, so the tap did nothing at all.
  expect(Math.hypot(moved.x - target.x, moved.y - target.y)).toBeLessThan(30);
});

test('the Move button also lets the player be dragged straight away', async ({ page }) => {
  await clickWorld(page, LINEUP.home13);
  await moveButton(page).click();

  const from = await worldToScreen(page, LINEUP.home13.x, LINEUP.home13.y);
  const to = await worldToScreen(page, 430, 330);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  // No 0.7s hold first: the press itself is the move.
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
  await waitForSaved(page);

  const { players } = await storedDrill(page);
  const moved = players.find(player => player.number === '13')!;
  expect(Math.hypot(moved.x - 430, moved.y - 330)).toBeLessThan(30);
});
