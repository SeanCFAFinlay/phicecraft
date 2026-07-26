// ============================================================================
// PASS AND SHOOT, ONE TAP AWAY
//
// Both used to live two taps deep, behind the Action sheet: open Action, read
// four rows, pick one. For the two things a coach does most while drawing a
// drill that is the wrong depth, so they now sit directly on the rink chips.
//
//   Pass   arms the pass, then you tap the receiver
//   Shoot  fires immediately - a team attacks exactly one net, so there is
//          nothing to aim and nothing to confirm
//
// Both are rendered from one place so the puck chip and the selection chip
// cannot drift apart on which is enabled and why.
// ============================================================================

import { useCommands } from '@/hooks/useAppState';
import { usePuckActions } from '@/hooks/usePuckActions';
import { attackingNetFor } from '@/engine/puck';

interface PuckActionButtonsProps {
  /**
   * Only offer these for this player. The selection chip passes the selected
   * player so the buttons never silently act on somebody else; the puck chip
   * leaves it undefined and acts on whoever is carrying.
   */
  onlyFor?: string;
  /** Drop the words and keep the icons, for a 320px phone. */
  compact?: boolean;
}

export function PuckActionButtons({ onlyFor, compact }: PuckActionButtonsProps) {
  const commands = useCommands();
  const { carrier, canPass, canShoot, passesLeft, passBlockedReason } = usePuckActions();

  if (!carrier) return null;
  if (onlyFor && carrier.id !== onlyFor) return null;

  const startPass = () => {
    commands.setTool('move');
    commands.setPendingAction({ kind: 'pass', playerId: carrier.id });
  };

  // No mode, no second tap: a team attacks one net, so the shot is the tap.
  const shoot = () => {
    commands.setTool('move');
    void commands.requestShot(carrier.id, attackingNetFor(carrier.team));
  };

  return (
    <>
      <button
        type="button"
        onClick={startPass}
        disabled={!canPass}
        title={passBlockedReason ?? `Pass from #${carrier.number} — ${passesLeft} left`}
        aria-label={`Pass from #${carrier.number}`}
        className="touch-target shrink-0 rounded-xl border border-app-gold/45 bg-app-gold/12 px-3 text-[12px] font-bold text-app-gold disabled:opacity-35"
      >
        <span aria-hidden="true">⟶</span>
        {!compact && <span className="ml-1.5">Pass</span>}
        {/* How many are left is part of the label, not a surprise at tap four. */}
        {!compact && canPass && <span className="ml-1 opacity-60">{passesLeft}</span>}
      </button>

      <button
        type="button"
        onClick={shoot}
        disabled={!canShoot}
        title={canShoot ? `Shoot from #${carrier.number}` : 'The drill has already ended'}
        aria-label={`Shoot from #${carrier.number}`}
        className="touch-target shrink-0 rounded-xl border border-app-orange/45 bg-app-orange/12 px-3 text-[12px] font-bold text-app-orange disabled:opacity-35"
      >
        <span aria-hidden="true">🥅</span>
        {!compact && <span className="ml-1.5">Shoot</span>}
      </button>
    </>
  );
}
