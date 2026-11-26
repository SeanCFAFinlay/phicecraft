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
  const { isCompactLandscape, isPhone } = useResponsive();
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
  if (state.ui.activeToast !== null) return null;
  if (stage === null) return null;

  const dismiss = () => {
    writeDone();
    setDone(true);
  };

  return (
    <div className={`pointer-events-none absolute left-1/2 -translate-x-1/2 z-30 ${
      // On a phone the top of the rink is where the zone's players stand.
      isPhone ? 'bottom-14' : 'top-14 xl:top-2'
    } flex w-full max-w-[min(580px,94vw)] justify-center px-2`}>
      <div
        role="status"
        aria-live="polite"
        className="rink-chip pointer-events-auto flex w-full items-center justify-between gap-2 rounded-xl px-3 py-1.5">
        <div className="min-w-0 flex-1 text-[12.5px] font-medium leading-snug text-white/85">
          {MESSAGE[stage]}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={async () => {
              await commands.useTemplate('tpl-play-131-power-play');
              dismiss();
            }}
            className="touch-target inline-flex items-center rounded-lg border border-white/10 bg-white/[0.05] px-2.5 py-0.5 text-[12px] font-semibold text-white/90 hover:bg-white/[0.1] transition-colors"
          >
            See an example
          </button>
          <button
            type="button"
            onClick={() => {
              dispatch({ type: 'OPEN_SHEET', sheet: 'library' });
              dismiss();
            }}
            className="touch-target hidden md:inline-flex items-center rounded-lg border border-white/10 bg-white/[0.05] px-2.5 py-0.5 text-[12px] font-semibold text-white/90 hover:bg-white/[0.1] transition-colors"
          >
            Browse drills
          </button>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss hint"
            className="touch-target flex items-center justify-center rounded-lg px-2 py-0.5 text-white/60 hover:bg-white/[0.08] hover:text-white"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}
