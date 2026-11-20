import { describe, it, expect } from 'vitest';
import type { Drill } from '@/core/types';
import { actionFrame } from './actionZone';

type Shape = Pick<Drill, 'players' | 'skatePaths' | 'events'>;

function drill(xs: number[], extra: Partial<Shape> = {}): Shape {
  return {
    players: xs.map((x, index) => ({ id: `p${index}`, x, y: 200, team: 'home', role: 'F' })) as Drill['players'],
    skatePaths: [],
    events: [],
    ...extra,
  };
}

describe('actionFrame', () => {
  it('frames one end when the play lives in it', () => {
    expect(actionFrame(drill([700, 800, 880])).zone).toBe('offensive');
    expect(actionFrame(drill([90, 200, 300])).zone).toBe('defensive');
  });

  it('frames the neutral zone for a regroup between the blue lines', () => {
    expect(actionFrame(drill([400, 500, 600])).zone).toBe('neutral');
  });

  it('needs the whole sheet for a full-ice rush', () => {
    expect(actionFrame(drill([120, 880])).zone).toBe('full');
  });

  it('counts where the routes go, not only where players start', () => {
    const rush = drill([150], {
      skatePaths: [{ id: 'r', ownerId: 'p0', points: [{ x: 150, y: 200 }, { x: 860, y: 200 }] }] as Drill['skatePaths'],
    });
    expect(actionFrame(rush).zone).toBe('full');
  });

  it('ignores goalies, who stand in their crease whatever the drill', () => {
    const shape = drill([700, 800]);
    shape.players.push({ id: 'g', x: 80, y: 212, team: 'away', role: 'G' } as Drill['players'][number]);
    expect(actionFrame(shape).zone).toBe('offensive');
  });

  it('sits behind the net the shot goes at', () => {
    const shotLeft = drill([400, 600], {
      events: [{ type: 'shot', toPoint: { x: 55, y: 212 } }] as Drill['events'],
    });
    expect(actionFrame(shotLeft).attackedNet).toBe('left');
    expect(actionFrame(drill([700, 800])).attackedNet).toBe('right');
  });

  it('falls back to the whole sheet for an empty board', () => {
    expect(actionFrame(drill([])).zone).toBe('full');
  });
});
