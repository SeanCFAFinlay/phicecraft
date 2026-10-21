// ============================================================================
// INTELLIGENCE BADGE
//
// Floating actionable badge on the ice canvas indicating tactical health.
// Clicking toggles the Coaching Intelligence drawer.
// ============================================================================

import { useMemo } from 'react';
import { useAppState } from '@/hooks/useAppState';
import { migrateV2ToV3 } from '@/domain/v3/migrateV2ToV3';
import { validateDrillIntelligence } from '@/domain/validation/coachIntelligence';

export function IntelligenceBadge({
  isOpen = false,
  onToggle,
}: {
  isOpen?: boolean;
  onToggle?: () => void;
} = {}) {
  const { state } = useAppState();

  const report = useMemo(() => {
    const v3 = migrateV2ToV3(state.drill);
    return validateDrillIntelligence(v3);
  }, [state.drill]);

  const hasIssues = report.issues.length > 0;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label="Toggle coaching intelligence"
      aria-expanded={isOpen}
      className={`absolute right-3 top-3 z-20 flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11.5px] font-black shadow-lg backdrop-blur-md transition-all duration-200 ${
        isOpen
          ? 'border-app-cyan bg-app-cyan/25 text-white shadow-[0_0_15px_rgba(0,229,255,0.4)]'
          : hasIssues
            ? 'border-amber-400/50 bg-[#0b1b28]/90 text-amber-300 hover:border-amber-300 hover:bg-amber-500/20'
            : 'border-cyan-500/30 bg-[#081523]/85 text-app-cyan hover:border-cyan-400 hover:bg-app-cyan/15'
      }`}
    >
      <span className="text-[13px]">🧠</span>
      <span>
        {hasIssues ? `${report.issues.length} Tactical Note${report.issues.length > 1 ? 's' : ''}` : 'Intelligence: Verified'}
      </span>
      {hasIssues && (
        <span className="flex h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
      )}
    </button>
  );
}
