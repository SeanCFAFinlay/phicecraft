import { describe, expect, it } from 'vitest';
import { goalie, pass, route, shot, skater, template } from '@/data/templates/builder';
import { validateDrillIntelligence } from './coachIntelligence';

const keeper = goalie('g', 'away', '30', { x: 922, y: 212.5 });

const titles = (document: Parameters<typeof validateDrillIntelligence>[0]) =>
  validateDrillIntelligence(document).issues.map(issue => issue.title);

/** A 2-on-1 entry: the carrier passes across as they reach the blue line. */
function entry(winger: { holdUntil?: number }) {
  return template({
    id: 'test-entry',
    title: 'Entry',
    summary: 'A two-on-one entry used to test the offside check.',
    categories: ['rush'],
    tags: [],
    ageBands: ['u13'],
    skillLevel: 'developing',
    rinkArea: 'full',
    durationMinutes: 5,
    durationSeconds: 8,
    setupNotes: ['x'],
    coachingPoints: ['x', 'y'],
    actors: [
      skater('c', 'home', '19', { x: 420, y: 212 }, 'C'),
      skater('w', 'home', '11', { x: 500, y: 90 }, 'LW'),
      skater('x', 'away', '3', { x: 700, y: 180 }, 'D'),
      keeper,
    ],
    routes: [
      route('c', [{ x: 420, y: 212 }, { x: 640, y: 225 }, { x: 760, y: 240 }], { startAt: 0 }),
      winger.holdUntil === undefined
        ? route('w', [{ x: 500, y: 90 }, { x: 700, y: 110 }, { x: 820, y: 150 }], { startAt: 0 })
        : route('w', [{ x: 500, y: 90 }, { x: 612, y: 100 }], { startAt: 0 }),
      ...(winger.holdUntil === undefined
        ? []
        : [route('w', [{ x: 612, y: 100 }, { x: 720, y: 115 }, { x: 820, y: 150 }], { startAt: winger.holdUntil })]),
    ],
    puck: { from: 'c', actions: [pass('c', 'w', { at: 2.4, flightSeconds: 0.8 })] },
    finishPolicy: 'none',
  }).document;
}

describe('offside', () => {
  it('flags an attacker over the blue line before the puck', () => {
    expect(titles(entry({}))).toContain('Offside');
  });

  it('is happy when the winger holds at the line until the puck is in', () => {
    expect(titles(entry({ holdUntil: 2.6 }))).not.toContain('Offside');
  });

  it('offers a fix that puts the play back onside', () => {
    const document = entry({});
    const issue = validateDrillIntelligence(document).issues.find(item => item.title === 'Offside');
    expect(issue?.proposal).toBeDefined();
    expect(titles(issue!.proposal!.apply(document))).not.toContain('Offside');
  });

  it('does not apply to a passing loop with no opponent', () => {
    const document = entry({});
    document.actors = document.actors.filter(actor => actor.id !== 'x');
    document.actorTracks = document.actorTracks.filter(track => track.actorId !== 'x');
    expect(titles(document)).not.toContain('Offside');
  });
});

function pointShot(screen: boolean) {
  return template({
    id: 'test-point-shot',
    title: 'Point Shot',
    summary: 'A low-to-high point shot used to test the net-front check.',
    categories: ['shooting', 'passing'],
    tags: [],
    ageBands: ['u13'],
    skillLevel: 'developing',
    rinkArea: 'half',
    durationMinutes: 5,
    durationSeconds: 5,
    setupNotes: ['x'],
    coachingPoints: ['x', 'y'],
    actors: [
      skater('w', 'home', '17', { x: 800, y: 370 }, 'RW'),
      skater('d', 'home', '4', { x: 660, y: 260 }, 'D'),
      skater('f', 'home', '9', screen ? { x: 880, y: 222 } : { x: 760, y: 120 }, 'F'),
      keeper,
    ],
    puck: { from: 'w', actions: [pass('w', 'd', { at: 0.5 }), shot('d', { at: 2.2 })] },
    finishPolicy: 'finish-with-shot',
  }).document;
}

describe('net-front presence', () => {
  it('notes a point shot with nobody at the net', () => {
    expect(titles(pointShot(false))).toContain('Nobody at the Net');
  });

  it('is satisfied by a forward screening the goalie', () => {
    expect(titles(pointShot(true))).not.toContain('Nobody at the Net');
  });

  it('can send the nearest forward to the net', () => {
    const document = pointShot(false);
    const issue = validateDrillIntelligence(document).issues.find(item => item.title === 'Nobody at the Net');
    expect(issue?.proposal?.label).toBe('Send to Net');
    expect(issue?.affectedActorIds).toContain('f');
    const fixed = issue!.proposal!.apply(document);
    expect(fixed.actorTracks.find(track => track.actorId === 'f')?.segments.length).toBeGreaterThan(0);
  });

  it('leaves goalie and warm-up shooting drills alone', () => {
    const document = pointShot(false);
    document.metadata.categories = ['goalie', 'shooting'];
    expect(titles(document)).not.toContain('Nobody at the Net');
  });
});
