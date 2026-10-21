// ============================================================================
// FIRST-RUN HINT
//
// A three-step nudge for a coach's very first drill: place a player, draw a
// route, connect a pass. `createNewDrill()` seeds a 12-player demo lineup, so
// "no players" is NOT the normal first-run state - it is a drill emptied by
// hand. The sequence instead starts wherever the drill actually is:
//
//   no players           -> "Tap Add to place your first player."
//   players, no routes   -> "Select a player, then tap Skate to draw their route."
//   routes, no events     -> "Tap Pass with the puck carrier selected to connect a pass."
//
// One instruction shows at a time and advances on its own as the drill state
// satisfies it. Dismissing at any stage, or reaching the end of the last one,
// marks the whole sequence done - permanently, via `phicecraft.firstRunHintDone`
// in localStorage - so a coach who already knows the tools never sees it again.
// ============================================================================

import { useEffect, useState } from 'react';
import { useAppState, useCommands } from '@/hooks/useAppState';
import { useResponsive } from '@/ui/useResponsive';

const FLAG_KEY = 'phicecraft.firstRunHintDone';

function readDone(): boolean {
  try {
    return localStorage.getItem(FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

function writeDone(): void {
  try {
    localStorage.setItem(FLAG_KEY, '1');
  } catch {
    /* a coach with storage disabled just sees the hint again next visit */
  }
}

type Stage = 'players' | 'routes' | 'events';

const MESSAGE: Record<Stage, string> = {
  players: 'Tap Add to place your first player.',
  routes: 'Select a player, then tap Skate to draw their route.',
  events: 'Tap Pass with the puck carrier selected to connect a pass.',
};

function stageFor(drill: {
  players: unknown[];
  skatePaths: unknown[];
  events: unknown[];
}): Stage | null {
  if (drill.players.length === 0) return 'players';
  if (drill.skatePaths.length === 0) return 'routes';
  if (drill.events.length === 0) return 'events';
  return null;
}

export function FirstRunHint() {
  const { state, dispatch } = useAppState();
  const commands = useCommands();
  const { isCompactLandscape } = useResponsive();
  const [done, setDone] = useState(readDone);

  const stage = done ? null : stageFor(state.drill);

  // Reaching the end of the sequence dismisses it exactly like an explicit
  // Dismiss: the flag is written once and the hint never returns for this
  // drill or any other.
  useEffect(() => {
    if (done || stage !== null) return;
    writeDone();
    setDone(true);
  }, [done, stage]);

  if (state.ui.mode !== 'build') return null;
  if (isCompactLandscape) return null;
  if (state.pendingAction.kind !== 'none') return null;
  if (state.ui.currentTool !== 'move') return null;
  if (stage === null) return null;

  const dismiss = () => {
    writeDone();
    setDone(true);
  };

  return (
    <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 z-30 flex w-full max-w-[min(680px,94vw)] justify-center px-2">
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-auto flex w-full flex-wrap items-center gap-2 rounded-2xl border border-app-cyan/30 bg-[#071522]/95 px-3 py-1.5 shadow-2xl backdrop-blur-md">
        <div className="min-w-0 flex-1 [text-wrap:balance] text-[13px] font-black leading-tight text-app-gold">
          {MESSAGE[stage]}
        </div>
        <button
          type="button"
          onClick={async () => {
            await commands.useTemplate('tpl-play-131-power-play');
            dismiss();
          }}
          className="touch-target inline-flex shrink-0 items-center gap-1 rounded-xl bg-app-cyan px-2.5 py-1 text-[11.5px] font-black text-[#041019] shadow hover:bg-cyan-300 transition-all"
        >
          ▶ Load Example Play
        </button>
        <button
          type="button"
          onClick={() => {
            dispatch({ type: 'OPEN_SHEET', sheet: 'library' });
            dismiss();
          }}
          className="touch-target hidden sm:inline-flex shrink-0 items-center gap-1 rounded-xl border border-app-cyan/40 bg-app-cyan/15 px-2.5 py-1 text-[11.5px] font-bold text-app-cyan hover:bg-app-cyan/25 transition-all"
        >
          📚 Browse Drills
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss hint"
          className="touch-target shrink-0 rounded-xl border border-app-border bg-white/5 px-2.5 text-[12px] font-bold text-app-text hover:bg-white/10"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
