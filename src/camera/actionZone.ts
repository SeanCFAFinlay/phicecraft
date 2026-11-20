// ============================================================================
// WHERE THE PLAY IS
//
// The 3D presets used to frame the whole sheet every time, so a power play in
// one end showed six players the size of ants on a 200 ft rink, and "Net"
// was a distant view down the length of the ice rather than one from behind
// a net. A preset should frame the play.
//
// This reads a drill's skaters - where they start and where their routes go -
// and answers which part of the ice the play lives in, and which net it
// attacks. Goalies are ignored: they stand in their crease whatever the drill
// is about, and would drag every answer toward an end.
// ============================================================================

import type { Drill } from '@/core/types';
import { RINK } from '@/core/constants';
import type { Zone } from './cameraMath';

export interface ActionFrame {
  zone: Zone;
  /** The net the play is heading for: the end a "behind the net" camera sits at. */
  attackedNet: 'left' | 'right';
}

/** Wider than this (in rink units, 5 per foot) and the play needs the whole sheet. */
const ONE_ZONE_SPAN = RINK.width * 0.42;

export function actionFrame(drill: Pick<Drill, 'players' | 'skatePaths' | 'events'>): ActionFrame {
  const skaters = new Set(drill.players.filter(player => player.role !== 'G').map(player => player.id));
  const xs: number[] = [];
  for (const player of drill.players) if (skaters.has(player.id)) xs.push(player.x);
  for (const path of drill.skatePaths) {
    if (!skaters.has(path.ownerId)) continue;
    for (const point of path.points) xs.push(point.x);
  }

  const shot = drill.events.find(event => event.type === 'shot');
  const centre = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : RINK.centerX;
  const attackedNet: 'left' | 'right' = shot?.toPoint
    ? shot.toPoint.x < RINK.centerX ? 'left' : 'right'
    : centre < RINK.centerX ? 'left' : 'right';

  if (xs.length === 0) return { zone: 'full', attackedNet };
  const min = Math.min(...xs);
  const max = Math.max(...xs);
  if (max - min > ONE_ZONE_SPAN) return { zone: 'full', attackedNet };
  if (min >= RINK.blueLineRightX - RINK.width * 0.08) return { zone: 'offensive', attackedNet };
  if (max <= RINK.blueLineLeftX + RINK.width * 0.08) return { zone: 'defensive', attackedNet };
  if (min >= RINK.blueLineLeftX - RINK.width * 0.08 && max <= RINK.blueLineRightX + RINK.width * 0.08) {
    return { zone: 'neutral', attackedNet };
  }
  return { zone: 'full', attackedNet };
}
