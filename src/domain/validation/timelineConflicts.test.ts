import { describe, expect, it } from 'vitest';
import { RINK } from '@/core/constants';
import { route, skater, template } from '@/data/templates/builder';
import type { Point } from '@/core/types';
import { validateDrillIntelligence } from './coachIntelligence';

/** A puck-free skating drill made of the given skaters and routes. */
function drill(actors: ReturnType<typeof skater>[], routes: ReturnType<typeof route>[]) {
  return template({
    id: 'timeline-test',
    title: 'Timeline test',
    summary: 'Timeline test drill.',
    categories: ['skating'],
    tags: [],
    ageBands: ['u13'],
    skillLevel: 'beginner',
    rinkArea: 'full',
    durationMinutes: 5,
    durationSeconds: 8,
    equipmentSummary: ['none'],
    setupNotes: ['Test.'],
    coachingPoints: ['Test.'],
    progressions: [],
    variations: [],
    actors,
    routes,
    puck: { from: { x: 500, y: 400 }, actions: [] },
    finishPolicy: 'none',
  }).document;
}

const titles = (points: { a: Point; b: Point; teamB?: 'home' | 'away' }) =>
  validateDrillIntelligence(
    drill(
      [skater('a', 'home', '1', points.a), skater('b', points.teamB ?? 'home', '2', points.b)],
      [route('a', [points.a, { x: 500, y: 212 }]), route('b', [points.b, { x: 502, y: 213 }])]
    )
  ).issues.map(issue => issue.title);

describe('timeline conflicts', () => {
  it('flags teammates whose routes run them into each other', () => {
    expect(titles({ a: { x: 400, y: 150 }, b: { x: 600, y: 280 } })).toContain('Teammates collide');
  });

  it('leaves opponents meeting alone - that is a battle, not a mistake', () => {
    expect(titles({ a: { x: 400, y: 150 }, b: { x: 600, y: 280 }, teamB: 'away' })).not.toContain('Teammates collide');
  });

  it('does not flag teammates who stay apart', () => {
    const report = validateDrillIntelligence(
      drill(
        [skater('a', 'home', '1', { x: 400, y: 100 }), skater('b', 'home', '2', { x: 400, y: 320 })],
        [route('a', [{ x: 400, y: 100 }, { x: 600, y: 100 }]), route('b', [{ x: 400, y: 320 }, { x: 600, y: 320 }])]
      )
    );
    expect(report.issues.map(issue => issue.title)).not.toContain('Teammates collide');
  });

  it('flags a skater whose route goes straight through a goal', () => {
    const start = { x: RINK.goalLineRightX - 60, y: RINK.centerY };
    const report = validateDrillIntelligence(
      drill([skater('a', 'home', '1', start)], [route('a', [start, { x: RINK.goalLineRightX + 30, y: RINK.centerY }])])
    );
    expect(report.issues.map(issue => issue.title)).toContain('Skates through the net');
  });
});
