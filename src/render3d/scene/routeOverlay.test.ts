import { describe, it, expect } from 'vitest';
import { createRouteOverlay3D } from './routeOverlay';
import { buildDrill, buildRoute, buildPass } from '@/test/builders';

describe('routeOverlay', () => {
  it('creates 3D tubes for routes and events and disposes cleanly', () => {
    const drill = buildDrill({
      skatePaths: [
        buildRoute({
          id: 'route-1',
          ownerId: 'p1',
          points: [
            { x: 100, y: 100 },
            { x: 200, y: 150 },
            { x: 300, y: 100 },
          ],
        }),
      ],
      events: [
        buildPass({
          id: 'event-1',
          fromPlayerId: 'p1',
          toPlayerId: 'p2',
          fromPoint: { x: 300, y: 100 },
          toPoint: { x: 450, y: 200 },
        }),
      ],
    });

    const overlay = createRouteOverlay3D(drill);
    expect(overlay.root).toBeDefined();
    expect(overlay.root.children.length).toBe(2);

    expect(() => overlay.dispose()).not.toThrow();
  });
});
