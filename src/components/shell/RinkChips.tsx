// ============================================================================
// RINK CHIPS
//
// The one compact overlay that still sits on the rink, pinned to the top
// edge so the centre and lower-middle of the ice - where the play actually
// happens - stay clear while editing.
//
//   ActionChip   the pending hockey action, its next input, and Cancel
//
// Selection (Move / Details / Delete, plus Pass and Shoot for the player in
// hand) now lives in the context tray at the bottom, not here - see
// `ContextTray.tsx`. Possession and the workflow guide moved to `Transport`
// and the menu sheet respectively.
// ============================================================================

import { useAppState, useCommands } from '@/hooks/useAppState';
import { useResponsive } from '@/ui/useResponsive';
import { instructionFor } from '@/editor/instructions';
import { getCurrentPuckHolder } from '@/engine/puck';

/**
 * The lane chip lives across the top of the rink, below the toast strip.
 * Exported so `FirstRunHint` shares it: the two are mutually exclusive (a
 * pending action always outranks the hint), so there is never a moment where
 * both would occupy the lane at once.
 */
export const CHIP_LANE = 'pointer-events-none absolute inset-x-0 top-11 z-30 flex px-2';

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
