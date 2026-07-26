// ============================================================================
// THE CATALOGUE IS REAL
//
// A template that does not compile, does not validate, or cannot be played is
// worse than no template: a coach finds it in the library, uses it, and hits a
// broken drill at a rink. Every one is checked here rather than trusted.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { DRILL_TEMPLATES, findTemplate } from './registry';
import { RINK_LANDMARKS } from './builder';
import { validateV3Document } from '@/domain/v3/validation';
import { projectToV2 } from '@/domain/v3/projectToV2';
import { compileDrill } from '@/sim/compileDrill';
import { sampleFrame } from '@/sim/sampleFrame';
import { RINK } from '@/core/constants';

describe('every template', () => {
  for (const item of DRILL_TEMPLATES) {
    describe(item.document.metadata.title, () => {
      it('is a coherent v3 document', () => {
        const result = validateV3Document(item.document);
        expect(result.errors, JSON.stringify(result.errors, null, 1)).toEqual([]);
      });

      it('carries the metadata a library needs', () => {
        const meta = item.document.metadata;
        expect(meta.title.length).toBeGreaterThan(3);
        expect(meta.summary.length).toBeGreaterThan(20);
        expect(meta.categories.length).toBeGreaterThan(0);
        expect(meta.ageBands.length).toBeGreaterThan(0);
        expect(meta.durationMinutes).toBeGreaterThan(0);
      });

      it('carries the coaching content that makes it usable at a rink', () => {
        const meta = item.document.metadata;
        expect(meta.setupNotes.length, 'setup notes').toBeGreaterThan(0);
        expect(meta.coachingPoints.length, 'coaching points').toBeGreaterThan(1);
      });

      it('records its provenance, so it is cleared to ship', () => {
        expect(item.document.metadata.source?.author).toBeTruthy();
        expect(item.document.metadata.source?.license).toBeTruthy();
      });

      it('keeps everybody on the ice', () => {
        for (const actor of item.document.actors) {
          expect(actor.position.x, `${actor.id} x`).toBeGreaterThanOrEqual(RINK.x);
          expect(actor.position.x, `${actor.id} x`).toBeLessThanOrEqual(RINK.x + RINK.width);
          expect(actor.position.y, `${actor.id} y`).toBeGreaterThanOrEqual(RINK.y);
          expect(actor.position.y, `${actor.id} y`).toBeLessThanOrEqual(RINK.y + RINK.height);
        }
      });

      it('keeps every route and every puck action on the ice', () => {
        const points = [
          ...item.document.actorTracks.flatMap(track =>
            track.segments.flatMap(segment => segment.points)
          ),
          ...item.document.puckTracks.flatMap(track =>
            track.actions.flatMap(action => [action.fromPoint, ...action.waypoints])
          ),
        ];
        for (const point of points) {
          expect(point.x).toBeGreaterThanOrEqual(RINK.x - 1);
          expect(point.x).toBeLessThanOrEqual(RINK.x + RINK.width + 1);
          expect(point.y).toBeGreaterThanOrEqual(RINK.y - 1);
          expect(point.y).toBeLessThanOrEqual(RINK.y + RINK.height + 1);
        }
      });

      it('plays through without the engine falling over', () => {
        const { drill } = projectToV2(item.document);
        const compiled = compileDrill(drill);

        // Sample across the whole run: a drill that throws or produces a
        // non-finite position halfway through is broken at a rink, not here.
        for (let step = 0; step <= 10; step++) {
          const frame = sampleFrame(compiled, (step / 10) * compiled.durationSeconds);
          for (const player of Object.values(frame.players)) {
            expect(Number.isFinite(player.position.x), `t=${step / 10}`).toBe(true);
            expect(Number.isFinite(player.position.y), `t=${step / 10}`).toBe(true);
          }
        }
      });

      it('only asks for a finishing shot when it means it', () => {
        const policy = item.document.phases[0].finishPolicy;
        const hasShot = item.document.puckTracks.some(track =>
          track.actions.some(action => action.type === 'shot')
        );
        // A drill that ends at a shot should say so, and one that does not
        // must not have a shot bolted onto it.
        if (policy === 'finish-with-shot') expect(hasShot).toBe(true);
      });
    });
  }
});

describe('the catalogue', () => {
  it('holds the catalogue the market review asks for', () => {
    // 24 originals across passing/warm-up, small-area games and
    // transition/rush. Four examples in a menu sheet is what scored 2/10.
    expect(DRILL_TEMPLATES.length).toBeGreaterThanOrEqual(24);
  });

  it('spans all three families of drill', () => {
    const areas = new Set(DRILL_TEMPLATES.map(item => item.document.metadata.rinkArea));
    const categories = new Set(DRILL_TEMPLATES.flatMap(item => item.document.metadata.categories));

    expect(categories.has('passing')).toBe(true);
    expect(categories.has('small-area-game')).toBe(true);
    expect(categories.has('transition')).toBe(true);
    expect(areas.size).toBeGreaterThan(2);
  });

  it('covers the youth age bands a coach filters by', () => {
    const bands = new Set(DRILL_TEMPLATES.flatMap(item => item.document.metadata.ageBands));
    expect(bands.has('u9')).toBe(true);
    expect(bands.has('u13')).toBe(true);
    expect(bands.has('u18')).toBe(true);
  });

  it('includes drills that use equipment, which v2 could not represent', () => {
    const withGear = DRILL_TEMPLATES.filter(item => item.document.equipment.length > 0);
    expect(withGear.length).toBeGreaterThan(3);
  });

  it('has no duplicate ids', () => {
    const ids = DRILL_TEMPLATES.map(item => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('is addressable by id', () => {
    const first = DRILL_TEMPLATES[0];
    expect(findTemplate(first.id)).toBe(first);
    expect(findTemplate('not-a-template')).toBeNull();
  });

  it('covers more than one category', () => {
    const categories = new Set(DRILL_TEMPLATES.flatMap(item => item.document.metadata.categories));
    expect(categories.size).toBeGreaterThan(2);
  });

  it('includes drills that do NOT end with a shot', () => {
    // The point of the finish policy: a passing warm-up or a possession game
    // is a complete drill, and the catalogue has to prove that is expressible.
    const policies = DRILL_TEMPLATES.map(item => item.document.phases[0].finishPolicy);
    expect(policies.some(policy => policy !== 'finish-with-shot')).toBe(true);
  });

  it('includes a drill with more passes than the old cap allowed', () => {
    const most = Math.max(
      ...DRILL_TEMPLATES.map(item =>
        item.document.puckTracks.reduce(
          (total, track) => total + track.actions.filter(action => action.type === 'pass').length,
          0
        )
      )
    );
    expect(most).toBeGreaterThanOrEqual(4);
  });

  it('places drills against real rink landmarks', () => {
    expect(RINK_LANDMARKS.blueLineLeft).toBe(RINK.blueLineLeftX);
    expect(RINK_LANDMARKS.blueLineRight).toBe(RINK.blueLineRightX);
    expect(RINK_LANDMARKS.centreX).toBe(RINK.centerX);
    expect(RINK_LANDMARKS.centreY).toBe(RINK.centerY);
  });
});
