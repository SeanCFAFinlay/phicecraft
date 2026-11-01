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
  const tool = state.ui.currentTool;
  const isPlacing = tool !== 'move';

  if (pending.kind === 'none' && !isPlacing) return null;

  if (pending.kind === 'none' && isPlacing) {
    const TOOL_LABELS: Record<string, string> = {
      home: 'Placing Home Skater',
      away: 'Placing Away Skater',
      goalie: 'Placing Goalie',
      coach: 'Placing Coach',
      cone: 'Placing Cone',
      tire: 'Placing Tire',
      'mini-net': 'Placing Mini-Net',
      barrier: 'Placing Divider Barrier',
    };
    const label = TOOL_LABELS[tool] ?? 'Placing Item';

    return (
      <div className={`${CHIP_LANE} justify-center`}>
        <div
          role="status"
          aria-live="polite"
          className="rink-chip pointer-events-auto flex max-w-[min(560px,94vw)] items-center gap-3 rounded-2xl border border-app-cyan/35 bg-[#071522]/95 px-3 py-1.5 shadow-xl backdrop-blur-md"
        >
          <div className="min-w-0">
            <div className="truncate text-[13px] font-black text-app-cyan">{label}</div>
            <div className="truncate text-[11.5px] text-white/70">Tap anywhere on the ice to drop · click Done to finish</div>
          </div>
          <button
            type="button"
            onClick={() => commands.setTool('move')}
            className="touch-target shrink-0 rounded-xl bg-app-cyan px-3 py-1 text-[11.5px] font-black text-[#041019] hover:bg-cyan-300 transition-all shadow"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

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
        className="rink-chip pointer-events-auto flex max-w-[min(640px,94vw)] items-center gap-3 rounded-2xl px-3 py-2"
      >
        <div className="min-w-0">
          <div className="truncate text-[13px] font-black text-app-gold">{instruction.label}</div>
          <div className="truncate text-[12px] text-white/70">{instruction.next}</div>
        </div>
        {pending.kind === 'draw-route' && (
          <div className="flex items-center gap-1 bg-black/40 p-0.5 rounded-lg border border-white/10 shrink-0" role="group" aria-label="Route drawing mode">
            <button
              type="button"
              onClick={() => commands.setPendingAction({ ...pending, mode: 'skate' })}
              className={`px-2 py-1 text-[11px] font-bold rounded transition-colors ${
                (pending.mode ?? 'skate') === 'skate'
                  ? 'bg-amber-400 text-black shadow'
                  : 'text-white/70 hover:text-white hover:bg-white/10'
              }`}
              title="Forward skating route"
            >
              ➔ Forward
            </button>
            <button
              type="button"
              onClick={() => commands.setPendingAction({ ...pending, mode: 'backward' })}
              className={`px-2 py-1 text-[11px] font-bold rounded transition-colors ${
                pending.mode === 'backward'
                  ? 'bg-amber-400 text-black shadow'
                  : 'text-white/70 hover:text-white hover:bg-white/10'
              }`}
              title="Backward skating route with gap control"
            >
              ╌ Backward
            </button>
            <button
              type="button"
              onClick={() => commands.setPendingAction({ ...pending, mode: 'glide' })}
              className={`px-2 py-1 text-[11px] font-bold rounded transition-colors ${
                pending.mode === 'glide'
                  ? 'bg-amber-400 text-black shadow'
                  : 'text-white/70 hover:text-white hover:bg-white/10'
              }`}
              title="Glide or coast route"
            >
              ~ Glide
            </button>
          </div>
        )}
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
