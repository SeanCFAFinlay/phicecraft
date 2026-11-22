import { describe, expect, it } from 'vitest';
import { DRILL_TEMPLATES, findTemplate } from '@/data/templates/registry';
import { projectToV2 } from '@/domain/v3/projectToV2';
import { prepareImport } from '@/persistence/importService';
import { FakeRepository } from '@/test/fakeRepository';
import { buildDrillStory } from '@/features/coaching/drillStory';
import {
  MAX_SHARE_URL_LENGTH,
  buildShareUrl,
  decodeShareCode,
  encodeShareCode,
  shareCodeFromHash,
  sharePayloadJson,
} from './shareLink';
import { captionAt, wrapText } from './exportVideo';

const BASE = 'https://phicecraft.vercel.app/';
const drillOf = (id: string) => projectToV2(findTemplate(id)!.document).drill;

describe('share codes', () => {
  it('round-trips text, compressed and plain', async () => {
    const text = JSON.stringify({ name: 'Ça va – 2-on-1 “slot” drive', n: Array.from({ length: 50 }, (_, i) => i) });
    const code = await encodeShareCode(text);
    expect(code[0]).toBe('z');
    expect(code).toMatch(/^[zj][A-Za-z0-9_-]+$/);
    expect(await decodeShareCode(code)).toBe(text);

    const plain = 'j' + btoa(unescape(encodeURIComponent(text))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(await decodeShareCode(plain)).toBe(text);
  });

  it('rejects damaged codes instead of throwing', async () => {
    expect(await decodeShareCode('z!!!')).toBeNull();
    expect(await decodeShareCode('zAAAA')).toBeNull();
    expect(await decodeShareCode('x123')).toBeNull();
  });

  it('reads only well-formed #play= hashes', () => {
    expect(shareCodeFromHash('#play=zAbc_-1')).toBe('zAbc_-1');
    expect(shareCodeFromHash('#other=1&play=jQQ')).toBe('jQQ');
    expect(shareCodeFromHash('#play=<script>')).toBeNull();
    expect(shareCodeFromHash('')).toBeNull();
  });
});

describe('share links', () => {
  it('a shared play imports back as the same play', async () => {
    const drill = drillOf(DRILL_TEMPLATES[0].id);
    const url = await buildShareUrl(drill, BASE);
    expect(url.startsWith(`${BASE}#play=z`)).toBe(true);

    const decoded = await decodeShareCode(shareCodeFromHash(new URL(url).hash)!);
    expect(decoded).toBe(sharePayloadJson(drill, JSON.parse(decoded!).exportedAt));

    const preview = await prepareImport(decoded!, new FakeRepository());
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.value.candidates).toHaveLength(1);
    expect(preview.value.failures).toHaveLength(0);
  });

  it('every library drill fits in a link', async () => {
    let longest = 0;
    for (const template of DRILL_TEMPLATES) {
      const url = await buildShareUrl(projectToV2(template.document).drill, BASE);
      longest = Math.max(longest, url.length);
    }
    expect(longest).toBeLessThan(MAX_SHARE_URL_LENGTH);
  });
});

describe('video captions', () => {
  it('wraps to the width and ellipsizes past the line limit', () => {
    const measure = (text: string) => text.length * 10;
    expect(wrapText(measure, 'one two three four', 100, 3)).toEqual(['one two', 'three four']);
    const lines = wrapText(measure, 'aa bb cc dd ee ff gg hh', 50, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1].endsWith('…')).toBe(true);
  });

  it('captions the setup, each step and falls back to the overview', () => {
    const story = buildDrillStory(drillOf(DRILL_TEMPLATES[0].id));
    expect(captionAt(story, null).heading).toBe('Setup');
    const first = story.steps[0];
    expect(captionAt(story, first.startSeconds + 0.01).heading).toMatch(/^Step 1 of \d+ · /);
  });
});

describe('video framing', () => {
  it('zooms into a one-zone drill and keeps the picture shape', async () => {
    const { actionView } = await import('./exportVideo');
    const { compileDrill } = await import('@/sim/compileDrill');
    const { RINK } = await import('@/core/constants');
    for (const template of DRILL_TEMPLATES) {
      const drill = projectToV2(template.document).drill;
      const compiled = compileDrill(drill);
      const view = actionView(drill, compiled, compiled.durationSeconds, 2.2);
      expect(view.x).toBeGreaterThanOrEqual(RINK.x - 0.01);
      expect(view.y).toBeGreaterThanOrEqual(RINK.y - 0.01);
      expect(view.x + view.width).toBeLessThanOrEqual(RINK.x + RINK.width + 0.01);
      expect(view.y + view.height).toBeLessThanOrEqual(RINK.y + RINK.height + 0.01);
      if (view.width < RINK.width) expect(view.width / view.height).toBeCloseTo(2.2, 3);
    }
    const cycle = drillOf(DRILL_TEMPLATES.find(t => /Stop-Up Cycle/.test(t.document.metadata.title))!.id);
    const compiled = compileDrill(cycle);
    expect(actionView(cycle, compiled, compiled.durationSeconds, 2.2).width).toBeLessThan(RINK.width * 0.7);
  });
});
