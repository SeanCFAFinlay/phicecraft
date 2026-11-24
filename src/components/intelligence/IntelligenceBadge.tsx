// ============================================================================
// INTELLIGENCE BADGE
//
// Floating actionable badge on the ice canvas indicating tactical health.
// Clicking toggles the Coaching Intelligence drawer.
// ============================================================================

import { useState, useEffect } from 'react';
import { useAppState } from '@/hooks/useAppState';
import { useResponsive } from '@/ui/useResponsive';
import type { DrillValidationReport } from '@/domain/validation/coachIntelligence';

export function IntelligenceBadge({
  isOpen = false,
  onToggle,
}: {
  isOpen?: boolean;
  onToggle?: () => void;
} = {}) {
  const { state } = useAppState();
  const { prefersReducedMotion, isPhone, isCompactLandscape } = useResponsive();
  // On a phone the full sentence sat over the corner of the rink; the icon
  // and a tick or a count say the same thing in a third of the space.
  const isCompact = isPhone || isCompactLandscape;
  const [report, setReport] = useState<DrillValidationReport | null>(null);

  useEffect(() => {
    let cancelled = false;

    const runValidation = async () => {
      try {
        const [{ migrateV2ToV3 }, { validateDrillIntelligence }] = await Promise.all([
          import('@/domain/v3/migrateV2ToV3'),
          import('@/domain/validation/coachIntelligence'),
        ]);
        if (cancelled) return;
        const v3 = migrateV2ToV3(state.drill);
        const rep = validateDrillIntelligence(v3);
        if (!cancelled) {
          setReport(rep);
        }
      } catch (err) {
        console.warn('Intelligence evaluation deferred error:', err);
      }
    };

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      const handle = (
        window as unknown as {
          requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number;
          cancelIdleCallback: (id: number) => void;
        }
      ).requestIdleCallback(
        () => {
          void runValidation();
        },
        { timeout: 500 }
      );
      return () => {
        cancelled = true;
        (window as unknown as { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(
          handle
        );
      };
    } else {
      const timer = setTimeout(() => {
        void runValidation();
      }, 50);
      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }
  }, [state.drill]);

  const hasIssues = report !== null && report.issues.length > 0;
  const issueCount = report ? report.issues.length : 0;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label="Toggle coaching intelligence"
      aria-expanded={isOpen}
      className={`touch-target absolute right-2.5 bottom-2.5 sm:right-3 sm:bottom-3 z-20 flex h-9 sm:h-8 items-center gap-1.5 rounded-full border ${isCompact ? 'px-2.5' : 'px-3'} py-1 text-[12px] font-semibold shadow-md transition-colors ${
        isOpen
          ? 'border-white/30 bg-[#13222f] text-white'
          : hasIssues
            ? 'border-amber-400/40 bg-[#0d1924]/95 text-amber-200 hover:bg-[#13222f]'
            : 'border-white/10 bg-[#0d1924]/90 text-white/70 hover:bg-[#13222f] hover:text-white'
      }`}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${hasIssues ? 'bg-amber-400' : 'bg-emerald-400'} ${hasIssues && !prefersReducedMotion ? 'animate-pulse' : ''}`} aria-hidden="true" />
      {isCompact ? (
        <span>{hasIssues ? issueCount : 'OK'}</span>
      ) : (
        <span>
          {hasIssues
            ? `${issueCount} thing${issueCount > 1 ? 's' : ''} to check`
            : 'Play check: all good'}
        </span>
      )}
    </button>
  );
}
