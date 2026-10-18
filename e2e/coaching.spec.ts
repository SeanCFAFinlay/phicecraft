import { test, expect } from '@playwright/test';
import { openEditor, storedDrill } from './support';
import { writeFile } from 'node:fs/promises';

test('full 3D demo plays, explains the save and can be scrubbed', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openEditor(page);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  const started = Date.now();
  await page.getByRole('button', { name: 'Watch 3D demo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause playback', exact: true })).toBeVisible();
  await page.waitForFunction(() => window.__phicecraftBoard3d?.actorsBuilt);
  const launchMilliseconds = Date.now() - started;
  await expect(page.locator('canvas[data-board3d]')).toBeVisible();
  const timing = await page.evaluate(() => new Promise<{ intervals: number[]; counters: unknown }>(resolve => {
    const intervals: number[] = [];
    const start = performance.now();
    let previous = start;
    const tick = (time: number) => {
      intervals.push(time - previous);
      previous = time;
      if (time - start < 7500) requestAnimationFrame(tick);
      else {
        const counters = window.__phicecraftBoard3d;
        resolve({ intervals, counters: counters ? { ...counters, reset: undefined } : null });
      }
    };
    requestAnimationFrame(tick);
  }));
  await expect(page.getByLabel('Drill replay display')).toContainText('Shot outcome: save');
  await expect(page.getByLabel('Drill replay display')).toContainText('Planned save scenario');
  await page.screenshot({ path: testInfo.outputPath('demo-finish.png') });
  await page.getByRole('button', { name: 'Expand playback controls' }).click();
  const dialog = page.getByRole('dialog', { name: 'Playback', exact: true });
  const slider = dialog.getByRole('slider', { name: 'Playback position' });
  await expect(slider).toBeEnabled();
  // The native range keyboard controls exercise the same seek path as a coach.
  await slider.focus();
  await slider.press('Home');
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByLabel('Drill replay display')).toContainText('Compete for possession');
  await page.screenshot({ path: testInfo.outputPath('demo-faceoff.png') });
  for (const [steps, name, narration] of [[4, 'receive', 'Receive and support'], [8, 'shot', 'Shot on net']] as const) {
    await page.getByRole('button', { name: 'Expand playback controls' }).click();
    await slider.focus();
    await slider.press('Home');
    for (let step = 0; step < steps; step++) await slider.press('PageUp');
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.getByLabel('Drill replay display')).toContainText(narration);
    await page.screenshot({ path: testInfo.outputPath(`demo-${name}.png`) });
  }
  expect(errors).toEqual([]);
  const sorted = timing.intervals.slice(1).sort((a, b) => a - b);
  const graphics = await page.locator('canvas[data-board3d]').evaluate(element => {
    const gl = (element as HTMLCanvasElement).getContext('webgl2');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    return info ? gl?.getParameter(info.UNMASKED_RENDERER_WEBGL) as string : 'unavailable';
  });
  await writeFile(testInfo.outputPath('demo-performance.json'), JSON.stringify({
    viewport: testInfo.project.use.viewport, graphics, launchMilliseconds,
    rafMedianMs: sorted[Math.floor(sorted.length * 0.5)],
    rafP95Ms: sorted[Math.floor(sorted.length * 0.95)],
    rafAverageFps: 1000 * sorted.length / sorted.reduce((a, b) => a + b, 0),
    ...timing,
  }, null, 2));
});

async function openCoach(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Coach workspace/ }).click();
  await expect(page.getByRole('dialog', { name: 'Coach workspace' })).toBeVisible();
}

test('quick commands place special teams, a chosen faceoff and a playable dump-in', async ({ page }, testInfo) => {
  await openEditor(page);
  const openBuilder = async () => {
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    return page.getByRole('dialog', { name: 'Add to the rink' });
  };
  let builder = await openBuilder();
  await expect(builder.getByRole('button', { name: /Centre faceoff/ })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('quick-drill-commands.png'), animations: 'disabled' });
  await builder.getByRole('button', { name: /5v4 power play/ }).click();
  await expect.poll(async () => {
    const players = (await storedDrill(page)).players.filter(player => player.role !== 'G');
    return [players.filter(player => player.team === 'home').length, players.filter(player => player.team === 'away').length];
  }).toEqual([5, 4]);
  builder = await openBuilder();
  await builder.getByRole('button', { name: /4v5 penalty kill/ }).click();
  await expect.poll(async () => (await storedDrill(page)).players.filter(player => player.team === 'home' && player.role !== 'G').length).toBe(4);
  builder = await openBuilder();
  await builder.getByLabel('Rink end').selectOption('left');
  await builder.getByLabel('Board side').selectOption('top');
  await builder.getByRole('button', { name: /Zone faceoff/ }).click();
  await expect.poll(async () => (await storedDrill(page)).initialPuck).toEqual({ x: 155, y: 102.5 });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Puck loose', exact: true })).toBeVisible();
  builder = await openBuilder();
  await builder.getByRole('button', { name: /Dump-in/ }).click();
  await expect.poll(async () => (await storedDrill(page)).events[0]?.type).toBe('dump');
  await expect.poll(async () => (await storedDrill(page)).skatePaths.length).toBe(2);
  await page.getByRole('button', { name: 'Play drill' }).click();
  await expect(page.getByRole('button', { name: 'Stop playback' })).toBeVisible();
  await page.getByRole('button', { name: 'Stop playback' }).click();
  builder = await openBuilder();
  await builder.getByRole('button', { name: /1v1 battle/ }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  expect((await storedDrill(page)).events[0]?.type).toBe('dump');
  builder = await openBuilder();
  await builder.getByRole('button', { name: /2v2 battle/ }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Apply formation', exact: true }).click();
  await expect.poll(async () => (await storedDrill(page)).players.length).toBe(4);
  await expect.poll(async () => (await storedDrill(page)).skatePaths.length).toBe(4);
});

test('coach assigns an imported roster, saves notes and traces an imported sketch', async ({ page }, testInfo) => {
  await openEditor(page);
  await openCoach(page);
  await page.getByRole('button', { name: 'Teams', exact: true }).click();
  await page.getByLabel('Home team', { exact: true }).fill('Ice Hawks');
  await page.getByRole('button', { name: 'Apply team names' }).click();
  await page.getByLabel('Import roster CSV').first().setInputFiles({ name: 'team.csv', mimeType: 'text/csv', buffer: Buffer.from('name,number,role\nAlex Morgan,27,C\nSam Lee,31,G') });
  await expect(page.getByText('2 players imported.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Save team', exact: true }).first().click();
  await expect(page.getByText('Team saved on this device.', { exact: false })).toBeVisible();
  await page.getByLabel(/Roster player for/).first().selectOption('0');
  await page.getByRole('button', { name: 'Apply', exact: true }).first().click();
  await page.getByRole('button', { name: 'Explain', exact: true }).click();
  await page.getByLabel('What are we learning?').fill('Receive in stride');
  await page.getByRole('button', { name: 'Apply coaching notes' }).click();
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await page.getByLabel('Sketch image').setInputFiles('public/assets/ph-logo.webp');
  await expect(page.getByAltText('Attached play sketch')).toBeVisible();
  await page.getByRole('button', { name: 'Draw on the rink' }).click();
  await page.getByRole('button', { name: 'Overlay to trace' }).click();
  await expect(page.getByRole('button', { name: 'Reference beside rink' })).toBeVisible();
  await expect.poll(async () => (await storedDrill(page)).settings?.coaching?.objective).toBe('Receive in stride');
  await expect.poll(async () => (await storedDrill(page)).players[0].name).toBe('Alex Morgan');
  await page.reload();
  await openCoach(page);
  await expect(page.getByLabel('What are we learning?')).toHaveValue('Receive in stride');
  await page.getByRole('button', { name: 'Teams', exact: true }).click();
  await expect(page.getByLabel('Home team', { exact: true })).toHaveValue('Ice Hawks');
  await expect(page.getByLabel('Player name').first()).toHaveValue('Alex Morgan');
  await expect(page.getByLabel('home saved team').locator('option')).toContainText(['Choose a saved team', 'Ice Hawks (2)']);
  await page.screenshot({ path: testInfo.outputPath('coach-teams.png'), animations: 'disabled' });
});

test('editing coaching notes in 3D does not rebuild player models', async ({ page }, testInfo) => {
  test.skip((testInfo.project.use.viewport?.width ?? 1366) < 768, 'Desktop 3D check');
  await openEditor(page);
  await page.getByRole('button', { name: /tabletop 3D view/ }).click();
  await page.waitForFunction(() => window.__phicecraftBoard3d?.actorsBuilt);
  const builds = await page.evaluate(() => window.__phicecraftBoard3d?.actorBuilds);
  await openCoach(page);
  await page.getByLabel('What are we learning?').fill('Keep the passing lane open');
  await page.getByRole('button', { name: 'Apply coaching notes' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await expect.poll(async () => (await storedDrill(page)).settings?.coaching?.objective).toBe('Keep the passing lane open');
  expect(await page.evaluate(() => window.__phicecraftBoard3d?.actorBuilds)).toBe(builds);
  await expect(page.getByLabel('Drill replay display')).toBeVisible();
  await page.getByRole('button', { name: 'Broadcast 3D camera angle', exact: true }).click();
  await expect(page.locator('canvas[data-board3d]')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('coach-3d.png'), animations: 'disabled' });
});
