import type { PlaybackPlayerFrame, Point } from '@/core/types';

export interface GoalieFrame {
  position: Point;
  heading: number;
  action: 'set' | 'shuffle' | 'save' | 'freeze';
}

export function sampleGoalie(base: PlaybackPlayerFrame, puck: Point | null, saving: boolean): GoalieFrame {
  if (!puck) return { position: base.position, heading: base.heading, action: 'set' };
  const heading = Math.atan2(puck.y - base.position.y, puck.x - base.position.x);
  return {
    position: base.position,
    heading,
    action: saving ? 'save' : Math.abs(puck.y - base.position.y) > 10 ? 'shuffle' : 'set',
  };
}
