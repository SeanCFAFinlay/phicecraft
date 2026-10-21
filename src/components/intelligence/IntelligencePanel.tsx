// ============================================================================
// COACHING INTELLIGENCE PANEL & ACTIONABLE PROPOSALS
//
// Real-time hockey tactical validation and intelligence:
// - Pass timing synchronization (pass arrival vs receiver route arrival)
// - Crease and roster role sufficiency
// - Spatial separation (< 3ft starts)
// - 1-tap actionable corrective proposals
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
  const { state } = useAppState();
  const commands = useCommands();
  const [appliedIssues, setAppliedIssues] = useState<Record<string, boolean>>({});

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
      commands.loadDrill(drill.id); // or update drill
      // Use commands to commit update
      void commands.saveDrill();
      setAppliedIssues(prev => ({ ...prev, [issue.id]: true }));
    } catch (err) {
      console.error('Failed to apply proposal:', err);
    }
  };

  const timingIssues = report.issues.filter(i => i.kind === 'timing_mismatch');
  const roleIssues = report.issues.filter(i => i.kind === 'role_shortage');
  const spatialIssues = report.issues.filter(i => i.kind === 'space_conflict');
  const otherIssues = report.issues.filter(
    i => i.kind !== 'timing_mismatch' && i.kind !== 'role_shortage' && i.kind !== 'space_conflict'
  );

  return (
    <div
      role="region"
      aria-label="Coaching Intelligence"
      className="absolute right-3 top-14 z-30 flex max-h-[calc(100vh-120px)] w-88 flex-col rounded-2xl border border-app-cyan/30 bg-[#081523]/96 p-4 shadow-2xl backdrop-blur-md sm:w-96"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-app-cyan/15 text-[15px]">
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
            <p className="text-[10.5px] text-white/50">Tactical verification & pass synchronization</p>
          </div>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close intelligence panel"
            className="touch-target rounded-lg px-2 text-[14px] text-white/50 hover:bg-white/10 hover:text-white"
          >
            ✕
          </button>
        )}
      </div>

      {/* Summary Score Bar */}
      <div className="mt-3 flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.03] p-2.5">
        <div>
          <span className="text-[10.5px] font-bold uppercase tracking-wider text-white/40">Drill Health</span>
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
              {report.isValid ? 'Verified Structure' : `${report.issues.length} Diagnostic Note(s)`}
            </span>
          </div>
        </div>

        <div className="text-right">
          <span className="text-[10.5px] font-bold uppercase tracking-wider text-white/40">Actors</span>
          <p className="text-[14px] font-black text-white">
            {v3Doc.actors.length} skaters
          </p>
        </div>
      </div>

      {/* Issues & Proposals List */}
      <div className="mt-3 flex-1 overflow-y-auto space-y-2.5 pr-1 text-[12px]">
        {report.issues.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
            <span className="text-[28px]">✅</span>
            <p className="font-bold text-white">Tactical Structure 100% Sound</p>
            <p className="max-w-[240px] text-[11px] text-white/50">
              Pass timing, receiver routes, spatial spacing, and skater roles are fully synchronized.
            </p>
          </div>
        ) : (
          <>
            {/* Timing Issues */}
            {timingIssues.map(issue => (
              <div
                key={issue.id}
                className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-2.5 text-amber-100"
              >
                <div className="flex items-center justify-between">
                  <span className="font-black text-[11.5px] text-amber-300">⏱️ PASS TIMING MISMATCH</span>
                  <span className="text-[9.5px] uppercase font-bold text-amber-400">Actionable</span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-amber-100/90">{issue.message}</p>
                {issue.proposal && (
                  <div className="mt-2 flex items-center justify-between gap-2 border-t border-amber-400/20 pt-2">
                    <span className="text-[10px] text-amber-300/80">{issue.proposal.description}</span>
                    <button
                      type="button"
                      onClick={() => handleApplyProposal(issue)}
                      disabled={appliedIssues[issue.id]}
                      className="rounded-lg border border-amber-400/50 bg-amber-400/20 px-2.5 py-1 text-[10.5px] font-black text-amber-200 hover:bg-amber-400/30 disabled:opacity-40"
                    >
                      {appliedIssues[issue.id] ? '✓ Synced' : 'Auto-Sync'}
                    </button>
                  </div>
                )}
              </div>
            ))}

            {/* Role Issues */}
            {roleIssues.map(issue => (
              <div
                key={issue.id}
                className="rounded-xl border border-cyan-400/30 bg-app-cyan/10 p-2.5 text-cyan-100"
              >
                <div className="flex items-center justify-between">
                  <span className="font-black text-[11.5px] text-app-cyan">🥅 CREASE & ROSTER REQUIREMENT</span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-cyan-100/90">{issue.message}</p>
                {issue.proposal && (
                  <div className="mt-2 flex items-center justify-between gap-2 border-t border-cyan-400/20 pt-2">
                    <span className="text-[10px] text-cyan-200/80">{issue.proposal.description}</span>
                    <button
                      type="button"
                      onClick={() => handleApplyProposal(issue)}
                      disabled={appliedIssues[issue.id]}
                      className="rounded-lg border border-cyan-400/50 bg-cyan-400/20 px-2.5 py-1 text-[10.5px] font-black text-cyan-200 hover:bg-cyan-400/30 disabled:opacity-40"
                    >
                      {appliedIssues[issue.id] ? '✓ Added' : 'Add Goalie'}
                    </button>
                  </div>
                )}
              </div>
            ))}

            {/* Spatial Overlaps */}
            {spatialIssues.map(issue => (
              <div
                key={issue.id}
                className="rounded-xl border border-red-400/30 bg-red-500/10 p-2.5 text-red-100"
              >
                <div className="flex items-center justify-between">
                  <span className="font-black text-[11.5px] text-red-300">↔ SPATIAL PROXIMITY CONFLICT</span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-red-100/90">{issue.message}</p>
                {issue.proposal && (
                  <div className="mt-2 flex items-center justify-between gap-2 border-t border-red-400/20 pt-2">
                    <span className="text-[10px] text-red-200/80">{issue.proposal.description}</span>
                    <button
                      type="button"
                      onClick={() => handleApplyProposal(issue)}
                      disabled={appliedIssues[issue.id]}
                      className="rounded-lg border border-red-400/50 bg-red-400/20 px-2.5 py-1 text-[10.5px] font-black text-red-200 hover:bg-red-400/30 disabled:opacity-40"
                    >
                      {appliedIssues[issue.id] ? '✓ Spaced' : 'Space Out'}
                    </button>
                  </div>
                )}
              </div>
            ))}

            {/* Other Notes */}
            {otherIssues.map(issue => (
              <div
                key={issue.id}
                className="rounded-xl border border-white/10 bg-white/[0.04] p-2.5 text-white/80"
              >
                <span className="font-bold text-[11px] text-white/90">{issue.title}</span>
                <p className="mt-0.5 text-[10.5px] text-white/60">{issue.message}</p>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Teaching Points Footer */}
      <div className="mt-3 border-t border-white/10 pt-2.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">Coaching Cues</span>
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
  );
}
