// ============================================================================
// RINK CHIPS
//
// The compact overlays that sit on the rink. All of them are pinned to the top
// edge, so the centre and lower-middle of the ice - where the play actually
// happens - stay clear while editing.
//
//   ActionChip     the pending hockey action, its next input, and Cancel
//   SelectionChip  what is selected, with Move / Details / Delete
//   ContextChips   possession and workflow step, one compact chip each
// ============================================================================

import { useAppState, useCommands } from '@/hooks/useAppState';
import { useHoldProgress } from '@/hooks/useEditorRuntime';
import { useResponsive } from '@/ui/useResponsive';
import { instructionFor } from '@/editor/instructions';
import { isReviewComplete } from '@/commands';
import { getCurrentPuckHolder } from '@/engine/puck';
import { PuckActionButtons } from './PuckActions';
import { usePuckActions } from '@/hooks/usePuckActions';

const STEP_NAMES = { setup: 'Setup', movement: 'Movement', puck: 'Puck actions', review: 'Review' } as const;
const STEP_ORDER = ['setup', 'movement', 'puck', 'review'] as const;

/**
 * The lane chips live in: across the top of the rink, below the toast strip.
 * ActionChip and SelectionChip are mutually exclusive, so they share it.
 */
const CHIP_LANE = 'pointer-events-none absolute inset-x-0 top-11 z-30 flex px-2';

/**
 * The visible pending action. Route, Pass and Shoot can no longer become
 * invisible modes: whenever one is armed, this chip states which player it is
 * for, what to do next, and offers Cancel.
 */
export function ActionChip() {
  const { state } = useAppState();
  const commands = useCommands();
  const { isTouch } = useResponsive();

  const pending = state.pendingAction;
  if (pending.kind === 'none') return null;

  const subjectId =
    'playerId' in pending ? pending.playerId : 'coachId' in pending ? pending.coachId : null;
  const subject = subjectId
    ? state.drill.players.find(player => player.id === subjectId) ?? null
    : null;

  const instruction = instructionFor({
    tool: state.ui.currentTool,
    pendingAction: pending,
    carrier: getCurrentPuckHolder(state.drill.players, state.drill.events),
    subject,
    pointer: isTouch ? 'touch' : 'mouse',
    holdToMoveEnabled: true,
  });

  return (
    // Pinned under the toast strip at the TOP of the rink: the centre and the
    // lower middle are where the play happens and must stay clear.
    <div className={`${CHIP_LANE} justify-center`}>
      <div
        role="status"
        aria-live="polite"
        className="rink-chip pointer-events-auto flex max-w-[min(560px,94vw)] items-center gap-3 rounded-2xl px-3 py-2"
      >
        <div className="min-w-0">
          <div className="truncate text-[13px] font-black text-app-gold">{instruction.label}</div>
          <div className="truncate text-[12px] text-white/70">{instruction.next}</div>
        </div>
        <button
          type="button"
          onClick={commands.cancelPendingAction}
          className="touch-target shrink-0 rounded-xl border border-app-border bg-white/5 px-3 text-[12px] font-bold text-app-text hover:bg-white/10"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/**
 * A first tap selects and shows this. The full inspector only opens from the
 * explicit Details button, a second tap, or the keyboard - selecting a player
 * no longer throws a 230px panel over the rink.
 */
export function SelectionChip() {
  const { state } = useAppState();
  const commands = useCommands();
  const hold = useHoldProgress();
  const { isPhone } = useResponsive();

  const playerId = state.selection.selectedPlayerId;
  const eventId = state.selection.selectedEventId;

  if (state.pendingAction.kind !== 'none') return null;
  if (!playerId && !eventId) return null;
  // The chip deliberately stays mounted while the inspector is open. Removing
  // it meant the Details button that opened the inspector no longer existed
  // when the inspector closed, so focus had nowhere to return to.

  const player = playerId ? state.drill.players.find(item => item.id === playerId) : null;
  const eventIndex = eventId ? state.drill.events.findIndex(item => item.id === eventId) : -1;
  const event = eventIndex >= 0 ? state.drill.events[eventIndex] : null;

  if (!player && !event) return null;

  return (
    <div className={`${CHIP_LANE} justify-center`}>
      <div className="rink-chip pointer-events-auto flex max-w-[min(560px,94vw)] items-center gap-2 rounded-2xl px-2.5 py-2">
        <span className="truncate text-[13px] font-black text-app-text">
          {player ? `#${player.number} · ${player.role}` : `${event!.type} ${eventIndex + 1}`}
        </span>

        {player && (
          <button
            type="button"
            onClick={() => commands.beginPlayerMove(player.id)}
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
    </div>
  );
}

/**
 * Possession and workflow, collapsed to one chip each on a phone. The
 * always-on possession bar and the four-button workflow row cost 72px of
 * vertical space that a landscape phone does not have.
 */
export function ContextChips() {
  const { state, dispatch } = useAppState();
  const { isPhone, isCompactLandscape } = useResponsive();
  const puckActions = usePuckActions();

  if (isCompactLandscape) return null;
  // While an action is pending, its chip is the only thing that matters.
  if (state.pendingAction.kind !== 'none') return null;

  const carrier = getCurrentPuckHolder(state.drill.players, state.drill.events);
  const { passesUsed } = puckActions;
  const stepIndex = STEP_ORDER.indexOf(state.ui.editorStep);
  const reviewed = isReviewComplete(state);

  return (
    // A single row above the chip lane, so the two never overlap. Centred,
    // not top-aligned: Pass and Shoot carry the full 44px touch target and the
    // readout chips do not, so aligning to the top left the row ragged.
    <div className="pointer-events-none absolute left-2 right-2 top-1.5 z-20 flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={() => dispatch({ type: 'OPEN_SHEET', sheet: 'possession' })}
        aria-haspopup="dialog"
        className="rink-chip pointer-events-auto flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[12px] font-bold"
      >
        <span className="text-white/45">Puck</span>
        <span className={carrier ? 'text-app-gold' : 'text-white/40'}>
          {carrier ? `#${carrier.number}` : 'loose'}
        </span>
        {passesUsed > 0 && (
          <span className="text-white/35">· {passesUsed} pass{passesUsed === 1 ? '' : 'es'}</span>
        )}
      </button>

      {/* Pass and Shoot live here too, so they are reachable without first
          selecting anybody - the carrier is already known. */}
      <div className="pointer-events-auto flex items-center gap-1.5">
        <PuckActionButtons compact={isPhone} />
      </div>

      <button
        type="button"
        onClick={() => dispatch({ type: 'OPEN_SHEET', sheet: 'workflow' })}
        aria-haspopup="dialog"
        className="rink-chip pointer-events-auto flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[12px] font-bold"
      >
        <span className="text-white/45">
          Step {stepIndex + 1} of {STEP_ORDER.length}
        </span>
        <span className="text-app-cyan">{STEP_NAMES[state.ui.editorStep]}</span>
        {state.ui.editorStep === 'review' && reviewed && (
          <span className="text-emerald-300" aria-label="Review complete">
            ✓
          </span>
        )}
      </button>

      {!isPhone && state.playback.lifecycle !== 'ready' && (
        <span className="rink-chip pointer-events-none rounded-xl px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-cyan-200">
          {state.playback.lifecycle}
        </span>
      )}
    </div>
  );
}
