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
import { useAppState } from '@/hooks/useAppState';
import { CHIP_LANE } from './RinkChips';

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
  const { state } = useAppState();
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
  if (state.pendingAction.kind !== 'none') return null;
  if (stage === null) return null;

  const dismiss = () => {
    writeDone();
    setDone(true);
  };

  return (
    <div className={`${CHIP_LANE} justify-center`}>
      <div
        role="status"
        aria-live="polite"
        className="rink-chip pointer-events-auto flex max-w-[min(560px,94vw)] items-center gap-3 rounded-2xl px-3 py-2"
      >
        <div className="min-w-0 truncate text-[13px] font-black text-app-gold">
          {MESSAGE[stage]}
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss hint"
          className="touch-target shrink-0 rounded-xl border border-app-border bg-white/5 px-3 text-[12px] font-bold text-app-text hover:bg-white/10"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
