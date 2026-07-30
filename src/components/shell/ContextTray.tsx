// ============================================================================
// CONTEXT TRAY
//
// The one bottom surface. A first tap selects a player or event and this
// extends upward from the dock to show it - the full inspector only opens
// from the explicit Details button, a second tap, or the keyboard, so
// selecting no longer throws a chip over the rink or a panel over the ice.
//
// The selection row costs the same height as the dock it sits above, so the
// rink loses that height for as long as the selection lasts - and gets it
// back the moment the selection clears. That trade is why this used to be an
// absolutely-positioned chip floating over the ice instead: this task moves
// it into the layout on purpose, because a control that can be mistaken for
// part of the ice is a control a coach can tap through by accident.
// ============================================================================

import { useAppState, useCommands } from '@/hooks/useAppState';
import { useHoldProgress } from '@/hooks/useEditorRuntime';
import { useResponsive } from '@/ui/useResponsive';
import { PuckActionButtons } from './PuckActions';
import { ToolDock } from './ToolDock';

export function ContextTray() {
  const { state } = useAppState();
  const commands = useCommands();
  const hold = useHoldProgress();
  const { isPhone } = useResponsive();

  const playerId = state.selection.selectedPlayerId;
  const eventId = state.selection.selectedEventId;

  const player = playerId ? state.drill.players.find(item => item.id === playerId) ?? null : null;
  const eventIndex = eventId ? state.drill.events.findIndex(item => item.id === eventId) : -1;
  const event = eventIndex >= 0 ? state.drill.events[eventIndex] : null;

  // The row deliberately stays mounted while the inspector is open. Removing
  // it meant the Details button that opened the inspector no longer existed
  // when the inspector closed, so focus had nowhere to return to.
  const showSelection = state.pendingAction.kind === 'none' && (player !== null || event !== null);

  return (
    <div className="shrink-0">
      {showSelection && (
        <div
          role="group"
          aria-label="Selection"
          className="flex h-[var(--tool-dock-height)] items-center gap-2 border-t border-app-border bg-[#0c1825] px-2.5"
        >
          <span className="truncate text-[13px] font-black text-app-text">
            {player ? `#${player.number} · ${player.role}` : `${event!.type} ${eventIndex + 1}`}
          </span>

          {player && (
            <button
              type="button"
              onClick={() => commands.beginPlayerMove(player.id)}
              // Named for its player: the dock has a Move button too, and two
              // controls reading just "Move" are indistinguishable to anyone
              // listening rather than looking.
              aria-label={`Move #${player.number}`}
              className="touch-target relative overflow-hidden rounded-xl border border-app-cyan/40 bg-app-cyan/10 px-3 text-[12px] font-bold text-app-cyan"
            >
              {/* Hold-to-move progress, when that shortcut is being used. */}
              {hold.playerId === player.id && hold.fraction > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 left-0 bg-app-cyan/25"
                  style={{ width: `${hold.fraction * 100}%` }}
                />
              )}
              <span className="relative">Move</span>
            </button>
          )}

          {/* The player holding the puck can pass or shoot from here, which is
              what makes a four-pass chain four taps: each pass selects the
              receiver, so the next Pass button is already under the thumb. */}
          {player && <PuckActionButtons onlyFor={player.id} compact={isPhone} />}

          <button
            type="button"
            onClick={() =>
              player ? commands.openPlayerInspector(player.id) : commands.openEventInspector(event!.id)
            }
            className="touch-target rounded-xl border border-app-border bg-white/5 px-3 text-[12px] font-bold text-app-text"
          >
            Details
          </button>

          <button
            type="button"
            onClick={() => {
              if (player) void commands.removePlayer(player.id);
              else commands.removeEvent(event!.id);
            }}
            className="touch-target rounded-xl border border-red-400/40 bg-red-500/10 px-3 text-[12px] font-bold text-red-200"
          >
            Delete
          </button>
        </div>
      )}
      <ToolDock />
    </div>
  );
}
