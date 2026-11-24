// ============================================================================
// WALKTHROUGH VIDEOS
//
// Records PHormation's promo / walkthrough videos by driving the real app in
// Chromium, with on-screen captions, title cards and a visible cursor.
//
//   npm run build && npx vite preview --port 4195 --strictPort
//   node scripts/record-videos.mjs output/videos http://localhost:4195 [name]
//
// Writes <name>.webm per video. For MP4:
//   ffmpeg -i in.webm -c:v libx264 -crf 20 -pix_fmt yuv420p -r 30 -movflags +faststart out.mp4
// ============================================================================
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const outDir = process.argv[2];
const BASE = process.argv[3] ?? 'http://localhost:4173';
const only = process.argv[4];
fs.mkdirSync(outDir, { recursive: true });

const OVERLAY = `
(() => {
  if (window.__rec) return;
  const style = document.createElement('style');
  style.textContent = \`
    #rec-cursor{position:fixed;z-index:2147483647;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;
      background:rgba(255,255,255,.9);border:3px solid #00e5ff;box-shadow:0 2px 10px rgba(0,0,0,.45);pointer-events:none;
      transition:transform .12s ease;left:-50px;top:-50px}
    #rec-cursor.down{transform:scale(.7);background:#00e5ff}
    #rec-caption{position:fixed;z-index:2147483646;left:50%;bottom:7%;transform:translateX(-50%);max-width:86vw;
      padding:12px 22px;border-radius:14px;background:rgba(4,14,24,.92);border:1px solid rgba(0,229,255,.45);
      color:#fff;font:800 clamp(15px,2.3vw,26px)/1.3 Inter,system-ui,'Segoe UI',Arial,sans-serif;text-align:center;
      box-shadow:0 10px 40px rgba(0,0,0,.5);opacity:0;transition:opacity .35s ease;pointer-events:none}
    #rec-caption.on{opacity:1}
    #rec-caption b{color:#00e5ff}
    #rec-title{position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;align-items:center;justify-content:center;
      gap:14px;background:radial-gradient(circle at 50% 40%,#0b2a3d,#03090f 70%);color:#fff;text-align:center;
      font-family:Inter,system-ui,'Segoe UI',Arial,sans-serif;opacity:0;transition:opacity .5s ease;pointer-events:none;padding:24px}
    #rec-title.on{opacity:1}
    #rec-title img{width:clamp(70px,12vw,120px);border-radius:18px;box-shadow:0 0 40px rgba(0,229,255,.35)}
    #rec-title h1{margin:0;font-size:clamp(26px,5vw,58px);font-weight:900;letter-spacing:.02em}
    #rec-title h1 span{color:#00e5ff}
    #rec-title p{margin:0;font-size:clamp(15px,2.4vw,26px);color:#9fc3d6;font-weight:700}
  \`;
  document.head.appendChild(style);
  const cursor = document.createElement('div'); cursor.id = 'rec-cursor';
  const caption = document.createElement('div'); caption.id = 'rec-caption';
  const title = document.createElement('div'); title.id = 'rec-title';
  document.body.append(cursor, caption, title);
  const move = e => { cursor.style.left = e.clientX + 'px'; cursor.style.top = e.clientY + 'px'; };
  window.addEventListener('pointermove', move, true);
  window.addEventListener('pointerdown', e => { move(e); cursor.classList.add('down'); }, true);
  window.addEventListener('pointerup', () => cursor.classList.remove('down'), true);
  window.__rec = {
    caption(html) { if (!html) { caption.classList.remove('on'); return; } caption.innerHTML = html; caption.classList.add('on'); },
    title(h, p) { if (!h) { title.classList.remove('on'); return; }
      title.innerHTML = '<img src="/assets/ph-logo.webp" alt=""><h1>' + h + '</h1>' + (p ? '<p>' + p + '</p>' : ''); title.classList.add('on'); },
  };
})();`;

const wait = ms => new Promise(r => setTimeout(r, ms));

function director(page) {
  let mouse = { x: 40, y: 40 };
  const ensure = () => page.evaluate(OVERLAY);
  return {
    async caption(html, hold = 0) { await ensure(); await page.evaluate(h => window.__rec.caption(h), html); if (hold) await wait(hold); },
    async title(h, p, hold = 2600) {
      await ensure(); await page.evaluate(([a, b]) => window.__rec.title(a, b), [h, p]);
      await wait(hold); await page.evaluate(() => window.__rec.title(null)); await wait(500);
    },
    async moveTo(x, y, steps = 28) { await page.mouse.move(x, y, { steps }); mouse = { x, y }; },
    async click(locator, pause = 350) {
      await ensure();
      const el = locator.first();
      await el.waitFor({ state: 'visible', timeout: 15000 });
      await el.scrollIntoViewIfNeeded();
      const box = await el.boundingBox();
      await this.moveTo(box.x + box.width / 2, box.y + box.height / 2);
      await wait(pause);
      await page.mouse.down(); await wait(90); await page.mouse.up();
      await wait(250);
    },
    async drag(from, to, steps = 40) {
      await this.moveTo(from.x, from.y); await wait(250);
      await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps }); await page.mouse.up(); await wait(300);
    },
    get mouse() { return mouse; },
  };
}

async function record(name, viewport, url, scene) {
  if (only && only !== name) return;
  const browser = await chromium.launch({ args: ['--enable-gpu-rasterization', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({
    viewport, deviceScaleFactor: 1, hasTouch: false,
    recordVideo: { dir: path.join(outDir, 'raw', name), size: viewport },
  });
  const page = await ctx.newPage();
  await page.goto(BASE + url);
  await page.waitForFunction(() => window.__phicecraftPaint?.dynamicPaints > 0, null, { timeout: 30000 });
  await wait(800);
  const d = director(page);
  try {
    await scene(page, d);
  } catch (error) {
    console.error(`[${name}] scene failed:`, error.message);
  }
  const video = page.video();
  await ctx.close();
  await browser.close();
  const raw = await video.path();
  fs.renameSync(raw, path.join(outDir, `${name}.webm`));
  console.log('recorded', name);
}

const libraryButton = page => page.getByRole('button', { name: 'Drill playbook library' });
const dismissHint = async page => {
  const b = page.getByRole('button', { name: 'Dismiss hint' });
  if (await b.isVisible().catch(() => false)) await b.click();
};
async function useDrillNamed(page, d, title) {
  await page.getByRole('searchbox', { name: 'Search drills' }).fill('');
  const search = page.getByRole('searchbox', { name: 'Search drills' });
  await d.click(search);
  await search.pressSequentially(title, { delay: 70 });
  await wait(900);
  await d.click(page.getByRole('button', { name: 'Use drill' }));
  await wait(1400);
}
async function play(page, d, seconds) {
  const button = page.getByRole('button', { name: 'Play', exact: true }).last();
  if (await button.isVisible().catch(() => false)) await d.click(button);
  else await page.keyboard.press('Space');
  await wait(seconds * 1000);
}

// ---------------------------------------------------------------------------
// 1. Overview, desktop
// ---------------------------------------------------------------------------
await record('1-phormation-overview', { width: 1600, height: 900 }, '/?welcome', async (page, d) => {
  await d.title('PH<span>ORMATION</span>', 'Hockey plays that skate.', 3200);
  await d.caption('Draw a play, <b>watch it skate</b>, share it with your team.', 2600);
  await d.caption(null);
  await d.click(page.getByRole('button', { name: /watch an example/i }), 700);
  await d.caption('Every play <b>animates</b>: skating, passes, shots and the puck in flight.');
  await wait(6500);
  await d.caption(null, 400);

  await dismissHint(page);
  await d.caption('A library of <b>72 ready-made drills</b>, searchable by age, ice and time.');
  await d.click(libraryButton(page), 600);
  await wait(1600);
  await d.moveTo(800, 700, 40); await page.mouse.wheel(0, 500); await wait(1200); await page.mouse.wheel(0, -500); await wait(800);
  await useDrillNamed(page, d, 'Give-and-Go');
  await d.caption('Pick one and <b>press Play</b>.');
  await page.keyboard.press('Space');
  await wait(6000);
  await d.caption(null, 300);

  await d.caption('See it in <b>3D</b>, from any angle.');
  await d.click(page.getByRole('button', { name: /tabletop 3D view/ }), 500);
  await wait(2500);
  await page.keyboard.press('Space');
  await wait(5000);
  await d.click(page.getByRole('button', { name: /flat top-down view/ }), 500);
  await wait(1200);

  await d.caption('<b>Share it by link</b> or save it as a video for the team chat.');
  await d.click(page.getByRole('button', { name: 'Open main menu' }), 500);
  await wait(500);
  await d.click(page.getByText('Share this play'), 500);
  await wait(3200);
  await page.keyboard.press('Escape');
  await wait(600);
  await d.caption(null, 400);
  await d.title('PH<span>ORMATION</span>', 'phicecraft.vercel.app · free · works offline', 3500);
});

// ---------------------------------------------------------------------------
// 2. On your phone
// ---------------------------------------------------------------------------
await record('2-on-your-phone', { width: 390, height: 844 }, '/?welcome', async (page, d) => {
  await d.title('PH<span>ORMATION</span>', 'Your playbook, in your pocket.', 3000);
  await d.caption('Built for the bench: <b>works on any phone</b>, even offline.', 2400);
  await d.caption(null);
  await d.click(page.getByRole('button', { name: /browse the drill library/i }), 700);
  await wait(1200);
  await d.caption('Find a drill in seconds.');
  await d.moveTo(195, 600, 30); await page.mouse.wheel(0, 700); await wait(1400); await page.mouse.wheel(0, -700); await wait(700);
  await useDrillNamed(page, d, 'Cycle');
  await d.caption('Tap <b>Play</b> to watch it.');
  await play(page, d, 7);
  await d.caption(null, 300);
  await d.caption('Share it to the team chat <b>straight from the bench</b>.', 2600);
  await d.caption(null, 400);
  await d.title('PH<span>ORMATION</span>', 'phicecraft.vercel.app', 3000);
});

// ---------------------------------------------------------------------------
// 3. Draw your own play, desktop
// ---------------------------------------------------------------------------
async function worldToScreen(page, wx, wy) {
  const box = await page.getByRole('application', { name: /hockey rink/i }).boundingBox();
  const zoom = Math.min((box.width - 32) / 1000, (box.height - 32) / 425);
  return { x: box.x + box.width / 2 + (wx - 500) * zoom, y: box.y + box.height / 2 + (wy - 212.5) * zoom };
}
async function drawPath(page, d, worldPoints) {
  const pts = [];
  for (const [x, y] of worldPoints) pts.push(await worldToScreen(page, x, y));
  await d.moveTo(pts[0].x, pts[0].y);
  await wait(300);
  await page.mouse.down();
  for (let i = 1; i < pts.length; i++) await page.mouse.move(pts[i].x, pts[i].y, { steps: 14 });
  await page.mouse.up();
  await wait(700);
}
async function clickWorldAt(page, d, x, y) {
  const p = await worldToScreen(page, x, y);
  await d.moveTo(p.x, p.y);
  await wait(350);
  await page.mouse.down(); await wait(90); await page.mouse.up();
  await wait(600);
}

await record('3-draw-a-play', { width: 1600, height: 900 }, '/', async (page, d) => {
  await d.title('Draw your own play', 'Routes and a pass in under a minute.', 2800);
  await dismissHint(page);
  await d.caption('<b>Drag a player</b> to draw where they skate.');
  await drawPath(page, d, [[360, 212.5], [420, 200], [490, 175], [560, 160]]);
  await drawPath(page, d, [[280, 122.5], [360, 100], [470, 90], [600, 100], [700, 140]]);
  await drawPath(page, d, [[280, 302.5], [380, 320], [520, 315], [640, 285]]);
  await d.caption('Select the puck carrier, tap <b>Pass</b>, then tap the receiver.');
  await clickWorldAt(page, d, 360, 212.5);
  await d.click(page.getByRole('navigation', { name: 'Editing tools' }).getByRole('button', { name: 'Pass' }), 400);
  await wait(900);
  await clickWorldAt(page, d, 280, 122.5);
  await wait(900);
  await d.caption('Press <b>Play</b>: the timing works itself out.');
  await page.keyboard.press('Escape');
  await clickWorldAt(page, d, 500, 395);
  await page.keyboard.press('Space');
  await wait(8000);
  await d.caption('PHormation checks the play for you: <b>timing, passing lanes, positioning</b>.', 1500);
  await d.click(page.getByRole('button', { name: 'Toggle coaching intelligence' }), 400);
  await wait(3800);
  await page.keyboard.press('Escape');
  await d.caption(null, 400);
  await d.title('PH<span>ORMATION</span>', 'phicecraft.vercel.app', 3000);
});

// ---------------------------------------------------------------------------
// 4. Teach the team: present mode + explain
// ---------------------------------------------------------------------------
await record('4-teach-the-team', { width: 1600, height: 900 }, '/', async (page, d) => {
  await d.title('Teach the team', 'Explain every play, rinkside or in the room.', 2800);
  await dismissHint(page);
  await d.click(libraryButton(page), 400);
  await wait(900);
  await useDrillNamed(page, d, 'Power Play');
  await d.caption('<b>Teach</b> writes each player’s job in plain words.');
  await d.click(page.getByRole('button', { name: 'Coach workspace' }), 500);
  await wait(4200);
  await page.keyboard.press('Escape');
  await d.click(page.getByRole('button', { name: 'Rink board' }), 300);
  await wait(600);
  await d.caption('<b>Present</b> mode: full screen and step by step, for a TV or tablet.');
  await d.click(page.getByRole('radiogroup', { name: 'Mode' }).getByRole('radio', { name: 'Present' }), 500);
  await wait(1500);
  await page.keyboard.press('Space');
  await wait(7000);
  await d.caption(null, 400);
  await d.title('PH<span>ORMATION</span>', 'phicecraft.vercel.app', 3000);
});
