// ============================================================================
// PLAYBACK SMOOTHNESS
//
// What a coach sees as "jagged": a body that snaps round in one frame, or a
// player who jumps. Sampled at 60 frames a second across the whole library,
// no skater may turn or travel further in one frame than a skater could.
// ============================================================================

import { describe, expect, it } from 'vitest';
import { DRILL_TEMPLATES } from '@/data/templates/registry';
import { projectToV2 } from '@/domain/v3/projectToV2';
import { compileDrill } from './compileDrill';
import { sampleFrame } from './sampleFrame';

const FRAME = 1 / 60;

function angleBetween(a: number, b: number): number {
  return Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a)));
}

interface Worst {
  turn: number;
  turnAt: string;
  turnsOver45: number;
  jump: number;
  jumpAt: string;
}

function measure(): Worst {
  const worst: Worst = { turn: 0, turnAt: '', turnsOver45: 0, jump: 0, jumpAt: '' };
  for (const template of DRILL_TEMPLATES) {
    const drill = projectToV2(template.document).drill;
    const compiled = compileDrill(drill);
    const goalies = new Set(drill.players.filter(player => player.role === 'G').map(player => player.id));
    let previous = sampleFrame(compiled, 0);
    for (let t = FRAME; t <= compiled.durationSeconds; t += FRAME) {
      const frame = sampleFrame(compiled, t);
      for (const [id, player] of Object.entries(frame.players)) {
        const before = previous.players[id];
        if (!before || goalies.has(id)) continue;
        const turn = angleBetween(before.heading, player.heading);
        if (turn > Math.PI / 4) worst.turnsOver45 += 1;
        if (turn > worst.turn) {
          worst.turn = turn;
          worst.turnAt = `${template.document.metadata.title} ${id} @${t.toFixed(2)}s`;
        }
        const jump = Math.hypot(player.position.x - before.position.x, player.position.y - before.position.y);
        if (jump > worst.jump) {
          worst.jump = jump;
          worst.jumpAt = `${template.document.metadata.title} ${id} @${t.toFixed(2)}s`;
        }
      }
      previous = frame;
    }
  }
  return worst;
}

describe('playback smoothness', () => {
  it('no skater snaps round or jumps between frames', () => {
    const worst = measure();
    expect(worst.turnsOver45).toBe(0);
    // A body turns at most 12 radians a second: no more than ~35 degrees a frame.
    expect(worst.turn).toBeLessThan(0.65);
    // Top skating speed is 110 world units a second: under 2 units a frame.
    expect(worst.jump).toBeLessThan(4);
  });

  it('a scrubbed frame is the same frame playback showed', () => {
    const template = DRILL_TEMPLATES.find(t => /Give-and-Go/.test(t.document.metadata.title))!;
    const times = [3.1, 0.7, 2.25, 1.5, 0.05, 1.517];
    const played = compileDrill(projectToV2(template.document).drill);
    const playedHeadings = new Map<number, number>();
    for (let frame = 0; frame * FRAME <= played.durationSeconds; frame++) sampleFrame(played, frame * FRAME);
    for (const t of times) playedHeadings.set(t, sampleFrame(played, t).players.p2.heading);
    // A fresh compile sampled out of order, as a coach dragging the scrubber does.
    const scrubbed = compileDrill(projectToV2(template.document).drill);
    for (const t of times) expect(sampleFrame(scrubbed, t).players.p2.heading).toBeCloseTo(playedHeadings.get(t)!, 9);
  });
});
