import { DEFAULT_DRILL_DURATION, PUCK_FLIGHT_FRACTION } from '@/core/constants';
import type { Drill } from '@/core/types';
import { getMechanicsConfig } from './config';
import { compileRoute } from './routeCompiler';
import type { CompiledDrill } from './types';

const cache = new WeakMap<Drill, CompiledDrill>();

export function compileDrill(drill: Drill): CompiledDrill {
  const cached = cache.get(drill);
  if (cached) return cached;

  const config = getMechanicsConfig(drill);
  const durationSeconds = config.durationSeconds || DEFAULT_DRILL_DURATION;
  const players = new Map(drill.players.map(player => [player.id, player]));
  const pathsByOwner = new Map(drill.skatePaths.map(path => [path.ownerId, path]));
  const routes = new Map(
    drill.players.map(player => [player.id, compileRoute(player, pathsByOwner.get(player.id) ?? null, config)])
  );
  const events = drill.events.map((source, index) => {
    const fallback = drill.events.length ? (index + 0.5) / drill.events.length : 0;
    const departure = source.at ?? fallback;
    const arrival = source.arrivalAt ?? Math.min(1, departure + PUCK_FLIGHT_FRACTION / Math.max(1, drill.events.length));
    return {
      source,
      index,
      departureSeconds: departure * durationSeconds,
      arrivalSeconds: Math.max(departure, arrival) * durationSeconds,
    };
  });

  const compiled: CompiledDrill = { source: drill, config, durationSeconds, players, routes, events };
  cache.set(drill, compiled);
  return compiled;
}
