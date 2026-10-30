// ============================================================================
// COACHING INTELLIGENCE PANEL & ACTIONABLE PROPOSALS
//
// Real-time hockey tactical validation and intelligence:
// - Pass timing synchronization (pass arrival vs receiver route arrival)
// - Crease and roster role sufficiency
// - Spatial separation (< 3ft starts)
// - 1-tap actionable corrective proposals
// - Fully responsive: sleek bottom drawer on mobile, floating HUD on desktop
// ============================================================================

import { useState, useMemo } from 'react';
import { useAppState, useCommands } from '@/hooks/useAppState';
import { migrateV2ToV3 } from '@/domain/v3/migrateV2ToV3';
import { projectToV2 } from '@/domain/v3/projectToV2';
import { validateDrillIntelligence } from '@/domain/validation/coachIntelligence';
import type { DrillValidationIssue } from '@/domain/validation/coachIntelligence';

export function IntelligencePanel({
  isOpen = true,
  onClose,
}: {
  isOpen?: boolean;
  onClose?: () => void;
} = {}) {
  const { state, dispatch } = useAppState();
  const commands = useCommands();
  const [appliedIssues, setAppliedIssues] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState<'all' | 'timing' | 'roles' | 'spacing'>('all');

  // Real-time analysis of the working drill
  const v3Doc = useMemo(() => {
    return migrateV2ToV3(state.drill);
  }, [state.drill]);

  const report = useMemo(() => {
    return validateDrillIntelligence(v3Doc);
  }, [v3Doc]);

  if (!isOpen) return null;

  const handleApplyProposal = (issue: DrillValidationIssue) => {
    if (!issue.proposal) return;
    try {
      const fixedV3 = issue.proposal.apply(v3Doc);
      const { drill } = projectToV2(fixedV3);
      dispatch({ type: 'LOAD_DRILL', drill });
      void commands.saveDrill();
      setAppliedIssues(prev => ({ ...prev, [issue.id]: true }));
    } catch (err) {
      console.error('Failed to apply proposal:', err);
    }
  };

  const timingIssues = report.issues.filter(i => i.kind === 'timing_mismatch');
  const roleIssues = report.issues.filter(i => i.kind === 'role_shortage');
  const spatialIssues = report.issues.filter(i => i.kind === 'space_conflict');

  const displayedIssues =
    filter === 'timing'
      ? timingIssues
      : filter === 'roles'
        ? roleIssues
        : filter === 'spacing'
          ? spatialIssues
          : report.issues;

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm sm:hidden"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        role="region"
        aria-label="Coaching Intelligence"
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] w-full flex-col rounded-t-2xl border-t border-app-cyan/30 bg-[#081523]/98 p-4 shadow-2xl backdrop-blur-xl animate-in slide-in-from-bottom duration-200 sm:absolute sm:inset-auto sm:right-3 sm:top-14 sm:max-h-[calc(100vh-120px)] sm:w-96 sm:rounded-2xl sm:border sm:slide-in-from-top-2"
      >
        {/* Mobile pull / grab handle */}
        <div className="mx-auto mb-2 h-1.5 w-12 shrink-0 rounded-full bg-white/20 sm:hidden" />

        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-app-cyan/15 text-[17px] shadow-sm">
              🧠
            </span>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[13px] font-black tracking-wide text-white">
                  COACHING INTELLIGENCE
                </span>
                <span className="rounded-full border border-app-cyan/40 bg-app-cyan/20 px-1.5 py-0.2 text-[8.5px] font-black uppercase text-app-cyan">
                  Live
                </span>
              </div>
              <p className="text-[10.5px] text-white/50">
                Tactical verification & pass synchronization
              </p>
            </div>
          </div>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close intelligence panel"
              className="touch-target flex h-8 w-8 items-center justify-center rounded-xl text-[16px] text-white/60 hover:bg-white/10 hover:text-white transition-colors"
            >
              ✕
            </button>
          )}
        </div>

        {/* Summary Score Bar */}
        <div className="mt-3 flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.03] p-2.5">
          <div>
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-white/40">
              Drill Health
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-[18px] font-black text-white">
                {report.isValid ? '100%' : `${Math.max(60, 100 - report.issues.length * 15)}%`}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[9.5px] font-black uppercase ${
                  report.isValid
                    ? 'border border-emerald-500/40 bg-emerald-500/15 text-emerald-400'
                    : 'border border-amber-500/40 bg-amber-500/15 text-amber-300'
                }`}
              >
                {report.isValid
                  ? 'Verified Structure'
                  : `${report.issues.length} Diagnostic Note(s)`}
              </span>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-white/40">
              Actors
            </span>
            <p className="text-[14px] font-black text-white">
              {v3Doc.actors.length} on ice
            </p>
          </div>
        </div>

        {/* Quick Category Filter Pills */}
        {report.issues.length > 0 && (
          <div className="mt-2.5 flex items-center gap-1 overflow-x-auto scrollbar-hide py-0.5 text-[10.5px] font-bold">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`rounded-lg px-2 py-1 transition-all ${
                filter === 'all'
                  ? 'bg-app-cyan text-[#041019] font-black shadow-sm'
                  : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
              }`}
            >
              All ({report.issues.length})
            </button>
            {timingIssues.length > 0 && (
              <button
                type="button"
                onClick={() => setFilter('timing')}
                className={`rounded-lg px-2 py-1 transition-all ${
                  filter === 'timing'
                    ? 'bg-amber-400 text-[#041019] font-black shadow-sm'
                    : 'bg-white/5 text-amber-200/80 hover:bg-white/10'
                }`}
              >
                ⏱️ Timing ({timingIssues.length})
              </button>
            )}
            {roleIssues.length > 0 && (
              <button
                type="button"
                onClick={() => setFilter('roles')}
                className={`rounded-lg px-2 py-1 transition-all ${
                  filter === 'roles'
                    ? 'bg-cyan-400 text-[#041019] font-black shadow-sm'
                    : 'bg-white/5 text-cyan-200/80 hover:bg-white/10'
                }`}
              >
                🥅 Roles ({roleIssues.length})
              </button>
            )}
            {spatialIssues.length > 0 && (
              <button
                type="button"
                onClick={() => setFilter('spacing')}
                className={`rounded-lg px-2 py-1 transition-all ${
                  filter === 'spacing'
                    ? 'bg-rose-400 text-[#041019] font-black shadow-sm'
                    : 'bg-white/5 text-rose-200/80 hover:bg-white/10'
                }`}
              >
                ↔️ Spacing ({spatialIssues.length})
              </button>
            )}
          </div>
        )}

        {/* Issues & Proposals List */}
        <div className="mt-2.5 flex-1 overflow-y-auto space-y-2.5 pr-1 text-[12px] scrollbar-thin">
          {displayedIssues.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
              <span className="text-[28px]">✅</span>
              <p className="font-bold text-white">Tactical Structure Sound</p>
              <p className="max-w-[240px] text-[11px] text-white/50">
                {filter === 'all'
                  ? 'Pass timing, receiver routes, spatial spacing, and skater roles are fully synchronized.'
                  : `No issues in the ${filter} category.`}
              </p>
            </div>
          ) : (
            displayedIssues.map(issue => {
              const isTiming = issue.kind === 'timing_mismatch';
              const isRole = issue.kind === 'role_shortage';
              const isSpatial = issue.kind === 'space_conflict';

              const borderClass = isTiming
                ? 'border-amber-400/35 bg-amber-500/10 text-amber-100'
                : isRole
                  ? 'border-cyan-400/35 bg-app-cyan/10 text-cyan-100'
                  : isSpatial
                    ? 'border-red-400/35 bg-red-500/10 text-red-100'
                    : 'border-white/10 bg-white/[0.04] text-white/80';

              const badgeColor = isTiming
                ? 'text-amber-300'
                : isRole
                  ? 'text-app-cyan'
                  : isSpatial
                    ? 'text-red-300'
                    : 'text-white/90';

              const icon = isTiming ? '⏱️' : isRole ? '🥅' : isSpatial ? '↔️' : '💡';

              return (
                <div
                  key={issue.id}
                  className={`rounded-xl border p-2.5 transition-all ${borderClass}`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`font-black text-[11.5px] flex items-center gap-1.5 ${badgeColor}`}>
                      <span>{icon}</span>
                      <span>{issue.title || issue.kind.replace('_', ' ').toUpperCase()}</span>
                    </span>
                    {issue.proposal && (
                      <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] uppercase font-bold text-white/70">
                        1-Tap Fix
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed opacity-90">{issue.message}</p>
                  {issue.proposal && (
                    <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-white/10 pt-2">
                      <span className="text-[10.5px] opacity-80 leading-tight">
                        {issue.proposal.description}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleApplyProposal(issue)}
                        disabled={appliedIssues[issue.id]}
                        className={`touch-target flex h-8 shrink-0 items-center justify-center rounded-xl border px-3 text-[11px] font-black transition-all ${
                          appliedIssues[issue.id]
                            ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-300'
                            : isTiming
                              ? 'border-amber-400/50 bg-amber-400/25 text-amber-200 hover:bg-amber-400/35 active:scale-95'
                              : isRole
                                ? 'border-cyan-400/50 bg-cyan-400/25 text-cyan-200 hover:bg-cyan-400/35 active:scale-95'
                                : 'border-red-400/50 bg-red-400/25 text-red-200 hover:bg-red-400/35 active:scale-95'
                        } disabled:opacity-50`}
                      >
                        {appliedIssues[issue.id]
                          ? '✓ Applied'
                          : isTiming
                            ? 'Auto-Sync'
                            : isRole
                              ? 'Add Goalie'
                              : 'Space Out'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Teaching Points Footer */}
        <div className="mt-2.5 border-t border-white/10 pt-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">
            Coaching Cues
          </span>
          <div className="mt-1 flex flex-wrap gap-1">
            {v3Doc.metadata.coachingPoints.length > 0 ? (
              v3Doc.metadata.coachingPoints.slice(0, 3).map((cp, idx) => (
                <span
                  key={idx}
                  className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/70"
                >
                  • {cp}
                </span>
              ))
            ) : (
              <span className="text-[10px] italic text-white/40">No specific cues set</span>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
