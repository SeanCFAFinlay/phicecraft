import type { Drill } from '@/core/types';
import { jerseyColor } from '@/core/types';

/** Only changes that require new models/materials. Positions and routes update independently. */
export function actorSignature(drill: Drill): string {
  return JSON.stringify([
    drill.players.map(player => [player.id, player.role, player.number, player.name, player.visual?.jerseyTrim]),
    (drill.coaches ?? []).map(coach => coach.id),
    jerseyColor('home', drill.settings), jerseyColor('away', drill.settings),
    drill.players.map(player => player.team),
  ]);
}
