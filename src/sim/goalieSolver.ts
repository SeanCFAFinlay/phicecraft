import type { PlaybackPlayerFrame, Point } from '@/core/types';
import { RINK } from '@/core/constants';

export interface GoalieFrame {
  position: Point;
  heading: number;
  action: 'set' | 'shuffle' | 'save' | 'freeze';
}

/** A goalie this far from a goal line's centre is playing that net. */
const IN_NET_RANGE = 25 * 5;
/** How far a goalie squares off the line toward a puck straight out front. */
const MIN_DEPTH = 8;
/** Lateral speed (rink units/s) above which the feet read as a shuffle. */
const SHUFFLE_SPEED = 4;

/**
 * Where a goalie stands to be square to the puck.
 *
 * Real goalies play angles: they sit on an arc in front of the goal line, on
 * the line from the puck to the middle of the net, and seal the near post once
 * the puck is level with or below the goal line. A goalie frozen in the middle
 * of the crease while the puck goes to the half wall or behind the net is
 * the first thing a coach notices on a board.
 *
 * The arc tightens toward the posts, so a puck walking down to the goal line
 * slides the goalie onto the post rather than out past it. It is a pure
 * function of where the puck is, so scrubbing and playing agree, and a
 * cross-ice pass reads as a push across the crease.
 */
export function squaredGoaliePosition(rest: Point, puck: Point): Point {
  const leftNet = { x: RINK.goalLineLeftX, y: RINK.centerY };
  const rightNet = { x: RINK.goalLineRightX, y: RINK.centerY };
  const toLeft = Math.hypot(rest.x - leftNet.x, rest.y - leftNet.y);
  const toRight = Math.hypot(rest.x - rightNet.x, rest.y - rightNet.y);
  const net = toLeft <= toRight ? leftNet : rightNet;
  if (Math.min(toLeft, toRight) > IN_NET_RANGE) return rest;

  // From the goal line out toward the ice.
  const outward = net === leftNet ? 1 : -1;
  const depth = Math.max(MIN_DEPTH, Math.hypot(rest.x - net.x, rest.y - net.y));
  const ahead = (puck.x - net.x) * outward;
  const across = puck.y - net.y;
  const limit = Math.PI / 2;
  const angle = Math.max(-limit, Math.min(limit, Math.atan2(across, ahead)));
  // Full depth straight out front, about half of it on the post.
  const share = Math.abs(angle) / limit;
  const radius = depth * (1 - 0.45 * share * share);

  return {
    x: net.x + outward * Math.cos(angle) * radius,
    y: net.y + Math.sin(angle) * radius,
  };
}

export function sampleGoalie(
  base: PlaybackPlayerFrame,
  puck: Point | null,
  saving: boolean,
  /** True when the goalie skates an authored route: then the author places them. */
  authored = false
): GoalieFrame {
  if (!puck) return { position: base.position, heading: base.heading, action: 'set' };
  const position = authored ? base.position : squaredGoaliePosition(base.position, puck);
  const heading = Math.atan2(puck.y - position.y, puck.x - position.x);
  return {
    position,
    heading,
    action: saving ? 'save' : base.speed > SHUFFLE_SPEED ? 'shuffle' : 'set',
  };
}
