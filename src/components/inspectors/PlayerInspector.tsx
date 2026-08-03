// ============================================================================
// PLAYER INSPECTOR
//
// Opens only from an explicit gesture: the Details button on the selection
// chip, a second tap on an already-selected player, or Enter from the
// keyboard. Selecting a player no longer throws a fixed 230px panel over the
// rink.
// ============================================================================

import { Sheet } from '../a11y/Sheet';
import { SheetSection } from '../sheets/QuickSheets';
import { useAppState, useCommands } from '@/hooks/useAppState';
import { ROLE_NAMES } from '@/core/constants';
import { distance } from '@/utils/geometry';
import { attackingNetFor, getCurrentPuckHolder } from '@/engine/puck';
import { MAX_COMFORTABLE_CONTROLS, ROUTE_CONTROL_TARGET } from '@/utils/curves';

export function PlayerInspector() {
  const { state } = useAppState();
  const commands = useCommands();

  const inspector = state.ui.inspector;
  if (inspector.kind !== 'player') return null;

  const player = state.drill.players.find(item => item.id === inspector.playerId);
  if (!player) return null;

  const holder = getCurrentPuckHolder(state.drill.players, state.drill.events);
  const hasPuck = holder?.id === player.id;
  const route = state.drill.skatePaths.find(path => path.ownerId === player.id);
  const routeFeet = route
    ? route.points
        .slice(1)
        .reduce((sum, point, index) => sum + distance(route.points[index], point), 0) / 5
    : 0;

  const lastEvent = state.drill.events[state.drill.events.length - 1];
  const loosePuck =
    !holder &&
    Boolean(lastEvent) &&
    (lastEvent.type === 'dump' ||
      (lastEvent.type === 'pass' && lastEvent.catchResult === 'missed') ||
      (lastEvent.type === 'shot' && lastEvent.result === 'rebound'));

  return (
    <Sheet
      open
      title={`#${player.number} — ${ROLE_NAMES[player.role] ?? 'Player'}`}
      description={`${player.team === 'home' ? 'Home' : 'Away'} team${hasPuck ? ' · has the puck' : ''}`}
      onClose={commands.closeInspector}
    >
      <SheetSection title="Position">
        <div className="px-3 pb-2">
          <button
            type="button"
            onClick={() => commands.beginPlayerMove(player.id)}
            className="touch-target w-full rounded-xl border border-app-cyan/40 bg-app-cyan/10 px-3 py-3 text-[14px] font-bold text-app-cyan"
          >
            Move this player
          </button>
          <p className="mt-2 text-[12px] leading-snug text-white/50">
            Then drag anywhere on the rink and release to drop.
          </p>
        </div>
      </SheetSection>

      <SheetSection title="Skating route">
        <div className="px-3 pb-2">
          <div className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2.5 text-[13px]">
            <span className="text-white/50">Route length</span>
            <span className={route ? 'font-bold text-app-cyan' : 'text-white/35'}>
              {route ? `${Math.round(routeFeet)} ft` : 'Not drawn'}
            </span>
          </div>

          <button
            type="button"
            onClick={() => commands.setPendingAction({ kind: 'draw-route', playerId: player.id })}
            className="touch-target mt-2 w-full rounded-xl border border-app-border bg-white/5 px-3 py-3 text-[13px] font-bold text-app-text"
          >
            {route ? 'Redraw route' : 'Draw route'}
          </button>

          {route && (
            <>
              {/* Spline vs polyline: how the line runs between its points. */}
              <div className="mt-3 grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Route shape">
                {(
                  [
                    { shape: 'spline' as const, label: 'Curved', hint: 'Carves through each point' },
                    { shape: 'polyline' as const, label: 'Straight', hint: 'Sharp corners at each point' },
                  ]
                ).map(option => (
                  <button
                    key={option.shape}
                    type="button"
                    role="radio"
                    aria-checked={(route.shape ?? 'spline') === option.shape}
                    onClick={() => commands.setRouteShape(route.id, option.shape)}
                    className={`touch-target rounded-xl border px-2 py-2 text-left ${
                      (route.shape ?? 'spline') === option.shape
                        ? 'border-app-cyan bg-app-cyan/15 text-app-cyan'
                        : 'border-app-border bg-white/5 text-white/75'
                    }`}
                  >
                    <span className="block text-[13px] font-bold">{option.label}</span>
                    <span className="block text-[11px] leading-snug opacity-70">{option.hint}</span>
                  </button>
                ))}
              </div>

              <div className="mt-2 flex items-center justify-between rounded-xl bg-white/5 px-3 py-2.5 text-[13px]">
                <span className="text-white/50">Editable points</span>
                <span className="font-bold text-app-text">{route.points.length}</span>
              </div>
              <p className="mt-1.5 text-[12px] leading-snug text-white/45">
                Drag any handle on the rink to reshape the route. Tap a “+” between two handles to
                add a point, or tap a handle twice to remove it.
              </p>

              {route.points.length > MAX_COMFORTABLE_CONTROLS && (
                <button
                  type="button"
                  onClick={() => commands.simplifyRoute(route.id)}
                  className="touch-target mt-2 w-full rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-3 text-[13px] font-bold text-amber-200"
                >
                  Simplify to {ROUTE_CONTROL_TARGET} editable points
                </button>
              )}

              <div className="mt-3 grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Skating style">
                {(['skate', 'glide', 'backward'] as const).map(mode => (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={(route.mode ?? 'skate') === mode}
                    onClick={() => commands.updateRouteStyle(route.id, { mode })}
                    className={`touch-target rounded-xl border px-1 py-2 text-[12px] font-bold capitalize ${
                      (route.mode ?? 'skate') === mode
                        ? 'border-app-cyan bg-app-cyan/15 text-app-cyan'
                        : 'border-app-border bg-white/5 text-white/75'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() =>
                  commands.updateRouteStyle(route.id, {
                    finish: (route.finish ?? 'stop') === 'stop' ? 'coast' : 'stop',
                  })
                }
                className="touch-target mt-2 w-full rounded-xl border border-app-border bg-white/5 px-3 py-3 text-[13px] font-bold text-white/70"
              >
                Finish: {(route.finish ?? 'stop') === 'stop' ? 'Hockey stop' : 'Coast'}
              </button>

              <button
                type="button"
                onClick={() => commands.removeRoute(route.id)}
                className="touch-target mt-2 w-full rounded-xl border border-app-border bg-white/5 px-3 py-3 text-[13px] font-bold text-white/60"
              >
                Remove route
              </button>
            </>
          )}
        </div>
      </SheetSection>

      <SheetSection title="Puck actions">
        <div className="grid grid-cols-2 gap-2 px-3 pb-2">
          <button
            type="button"
            disabled={!hasPuck}
            onClick={() => commands.setPendingAction({ kind: 'pass', playerId: player.id })}
            className="touch-target rounded-xl border border-app-gold/40 bg-app-gold/10 px-2 py-3 text-[13px] font-bold text-app-gold disabled:opacity-35"
          >
            Pass
          </button>
          {/* No mode to arm: a team attacks one net, so this IS the shot.
              Note the play already ends with an automatic shot - this only
              pins one down explicitly, before any further passes. */}
          <button
            type="button"
            disabled={!hasPuck}
            onClick={() => void commands.requestShot(player.id, attackingNetFor(player.team))}
            className="touch-target rounded-xl border border-app-orange/40 bg-app-orange/10 px-2 py-3 text-[13px] font-bold text-app-orange disabled:opacity-35"
          >
            Shoot
          </button>
        </div>

        {!hasPuck && state.drill.events.length === 0 && (
          <div className="px-3 pb-2">
            <button
              type="button"
              onClick={() => void commands.setPuckCarrier(player.id)}
              className="touch-target w-full rounded-xl border border-app-gold/40 bg-app-gold/10 px-3 py-3 text-[13px] font-bold text-app-gold"
            >
              Start the drill with this player
            </button>
          </div>
        )}

        {loosePuck && (
          <div className="px-3 pb-2">
            <button
              type="button"
              onClick={() => commands.requestPickup(player.id)}
              className="touch-target w-full rounded-xl border border-emerald-400/40 bg-emerald-400/10 px-3 py-3 text-[13px] font-bold text-emerald-200"
            >
              Recover the loose puck
            </button>
          </div>
        )}
      </SheetSection>

      {player.role !== 'G' && (
        <SheetSection title="Skater detail">
          <div className="px-3 pb-2">
            <button
              type="button"
              onClick={() =>
                commands.updatePlayerVisual(player.id, {
                  handedness: player.visual?.handedness === 'left' ? 'right' : 'left',
                })
              }
              className="touch-target w-full rounded-xl border border-app-border bg-white/5 px-3 py-3 text-[13px] font-bold text-white/70"
            >
              Stick: {player.visual?.handedness ?? 'right'}-handed
            </button>
          </div>
        </SheetSection>
      )}

      <div className="px-3 py-3">
        <button
          type="button"
          onClick={() => void commands.removePlayer(player.id)}
          className="touch-target w-full rounded-xl border border-red-400/40 bg-red-500/10 px-3 py-3 text-[13px] font-bold text-red-200"
        >
          Remove #{player.number}
        </button>
      </div>
    </Sheet>
  );
}
