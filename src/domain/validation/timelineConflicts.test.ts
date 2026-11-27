import { describe, expect, it } from 'vitest';
import { RINK } from '@/core/constants';
import { pass, route, skater, template } from '@/data/templates/builder';
import type { Point } from '@/core/types';
import { validateDrillIntelligence } from './coachIntelligence';

/** A skating drill made of the given skaters and routes, with an optional puck chain. */
function drill(
  actors: ReturnType<typeof skater>[],
  routes: ReturnType<typeof route>[],
  puck: { from: string | Point; actions: ReturnType<typeof pass>[] } = { from: { x: 500, y: 400 }, actions: [] }
) {
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
    puck,
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

/** A passes to C along y = 212; B stands at `b`. */
function passDrill(b: Point, team: 'home' | 'away' = 'home') {
  return drill(
    [
      skater('a', 'home', '1', { x: 300, y: 212 }),
      skater('b', team, '2', b),
      skater('c', 'home', '3', { x: 500, y: 212 }),
    ],
    [],
    { from: 'a', actions: [pass('a', 'c', { at: 1, flightSeconds: 1 })] }
  );
}

describe('passes, played through', () => {
  const titlesOf = (document: ReturnType<typeof drill>) =>
    validateDrillIntelligence(document).issues.map(issue => issue.title);

  it('flags a pass that runs through a teammate standing in the lane', () => {
    expect(titlesOf(passDrill({ x: 400, y: 213 }))).toContain('Pass goes through a teammate');
  });

  it('flags a pass that runs through an opponent, once', () => {
    const issues = validateDrillIntelligence(passDrill({ x: 400, y: 213 }, 'away')).issues;
    expect(issues.map(issue => issue.title)).toContain('Pass goes through an opponent');
    // The older mid-flight lane check does not report the same opponent again.
    expect(issues.map(issue => issue.title)).not.toContain('Passing Lane Obstructed');
  });

  it('leaves a clear lane alone', () => {
    const titles = titlesOf(passDrill({ x: 400, y: 320 }));
    expect(titles).not.toContain('Pass goes through a teammate');
    expect(titles).not.toContain('Long pass for the age group');
  });

  it('judges pass length against the age group the drill plays at', () => {
    // 80 ft: fine for U13, too far for most U9 players.
    const document = drill(
      [skater('a', 'home', '1', { x: 300, y: 212 }), skater('c', 'home', '3', { x: 700, y: 212 })],
      [],
      { from: 'a', actions: [pass('a', 'c', { at: 1, flightSeconds: 1.5 })] }
    );
    expect(titlesOf(document)).not.toContain('Long pass for the age group');
    expect(titlesOf({ ...document, presentation: { ...document.presentation, pace: 'u9' } })).toContain('Long pass for the age group');
  });

  it('flags a pass between players practically touching', () => {
    const document = drill(
      [skater('a', 'home', '1', { x: 300, y: 212 }), skater('c', 'home', '3', { x: 320, y: 212 })],
      [],
      { from: 'a', actions: [pass('a', 'c', { at: 1, flightSeconds: 0.3 })] }
    );
    expect(titlesOf(document)).toContain('Very short pass');
  });
});