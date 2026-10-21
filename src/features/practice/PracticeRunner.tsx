// ============================================================================
// PRACTICE RUNNER
//
// Dedicated live session runner for coaches on the bench or ice.
// Features timestamp-based timer, explicit completion tracking, rotation
// management, session recovery across reloads, and coach observation notes.
// ============================================================================

import { useState, useEffect, useMemo } from 'react';
import type { PracticeSession, PracticeBlock } from '@/domain/practice/types';
import {
  type SessionRunState,
  loadSessionRunState,
  saveSessionRunState,
} from './practiceRunnerStorage';

export type { SessionRunState };

export interface PracticeRunnerProps {
  session: PracticeSession;
  onClose: () => void;
  onOpenDrillOnIce?: (block: PracticeBlock) => void;
}

export function PracticeRunner({ session, onClose, onOpenDrillOnIce }: PracticeRunnerProps) {
  const [runState, setRunState] = useState<SessionRunState>(() => loadSessionRunState(session.id));
  const [nowTimestamp, setNowTimestamp] = useState<number>(Date.now());
  const [observationInput, setObservationInput] = useState<string>('');

  const currentBlockIndex = Math.min(Math.max(0, runState.currentBlockIndex), session.blocks.length - 1);
  const currentBlock: PracticeBlock | undefined = session.blocks[currentBlockIndex];
  const nextBlock: PracticeBlock | undefined = session.blocks[currentBlockIndex + 1];

  // Timer tick interval
  useEffect(() => {
    if (!runState.isRunning) return;
    const interval = setInterval(() => {
      setNowTimestamp(Date.now());
    }, 500);
    return () => clearInterval(interval);
  }, [runState.isRunning]);

  // Persist state on change
  useEffect(() => {
    saveSessionRunState(runState);
  }, [runState]);

  // Sync current observation input when block changes
  useEffect(() => {
    if (currentBlock) {
      setObservationInput(runState.observations[currentBlock.id] || '');
    }
  }, [currentBlock, runState.observations]);

  // Calculate live elapsed seconds
  const liveElapsedSeconds = useMemo(() => {
    if (!runState.isRunning || !runState.timerStartedAtTimestamp) {
      return runState.accumulatedSeconds;
    }
    const delta = Math.max(0, Math.floor((nowTimestamp - runState.timerStartedAtTimestamp) / 1000));
    return runState.accumulatedSeconds + delta;
  }, [runState.isRunning, runState.timerStartedAtTimestamp, runState.accumulatedSeconds, nowTimestamp]);

  const blockDurationSeconds = (currentBlock?.durationMinutes || 10) * 60;
  const remainingSeconds = Math.max(0, blockDurationSeconds - liveElapsedSeconds);
  const isOvertime = liveElapsedSeconds > blockDurationSeconds;
  const overtimeSeconds = isOvertime ? liveElapsedSeconds - blockDurationSeconds : 0;

  const formatTime = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const handleToggleTimer = () => {
    if (runState.isRunning) {
      // Pause
      setRunState(prev => ({
        ...prev,
        isRunning: false,
        accumulatedSeconds: liveElapsedSeconds,
        timerStartedAtTimestamp: null,
      }));
    } else {
      // Start
      const now = Date.now();
      setRunState(prev => ({
        ...prev,
        isRunning: true,
        timerStartedAtTimestamp: now,
      }));
    }
  };

  const handleResetBlockTimer = () => {
    setRunState(prev => ({
      ...prev,
      accumulatedSeconds: 0,
      timerStartedAtTimestamp: prev.isRunning ? Date.now() : null,
    }));
  };

  const handleSaveObservation = (text: string) => {
    setObservationInput(text);
    if (!currentBlock) return;
    setRunState(prev => ({
      ...prev,
      observations: {
        ...prev.observations,
        [currentBlock.id]: text,
      },
    }));
  };

  const advanceToNext = (updatedState: Partial<SessionRunState>) => {
    setRunState(prev => {
      const nextIdx = Math.min(session.blocks.length - 1, prev.currentBlockIndex + 1);
      return {
        ...prev,
        ...updatedState,
        currentBlockIndex: nextIdx,
        accumulatedSeconds: 0,
        timerStartedAtTimestamp: prev.isRunning ? Date.now() : null,
      };
    });
  };

  const handleCompleteBlock = () => {
    if (!currentBlock) return;
    if (runState.completedBlockIds.includes(currentBlock.id)) return; // prevent duplicate completion
    advanceToNext({
      completedBlockIds: [...runState.completedBlockIds, currentBlock.id],
    });
  };

  const handleModifyBlock = () => {
    if (!currentBlock) return;
    if (runState.modifiedBlockIds.includes(currentBlock.id)) return;
    advanceToNext({
      modifiedBlockIds: [...runState.modifiedBlockIds, currentBlock.id],
    });
  };

  const handleSkipBlock = () => {
    if (!currentBlock) return;
    if (runState.skippedBlockIds.includes(currentBlock.id)) return;
    advanceToNext({
      skippedBlockIds: [...runState.skippedBlockIds, currentBlock.id],
    });
  };

  return (
    <div className="fixed inset-0 z-[150] flex flex-col bg-[#050e17] text-white safe-top safe-bottom">
      {/* Top Header */}
      <header className="flex items-center justify-between border-b border-white/10 bg-[#0a1827] px-4 py-3 shadow-md">
        <div className="flex items-center gap-3 min-w-0">
          <span className="rounded-lg bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 text-[11px] font-black tracking-widest text-emerald-400 uppercase">
            Live Session
          </span>
          <h2 className="text-[16px] font-extrabold text-white truncate">{session.title}</h2>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="touch-target rounded-xl border border-white/20 bg-white/10 px-3.5 py-1.5 text-[12.5px] font-bold text-white hover:bg-white/20"
        >
          Exit Runner
        </button>
      </header>

      {/* Main Runner Body */}
      <div className="flex-1 overflow-y-auto p-4 max-w-4xl mx-auto w-full flex flex-col gap-4">
        {/* Large Prominent Timer Display */}
        <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-[#0e2238] to-[#071320] p-6 shadow-xl text-center">
          <div className="text-[12px] font-extrabold uppercase tracking-widest text-white/50 mb-1">
            {isOvertime ? 'Overtime Activity Time' : 'Time Remaining in Block'}
          </div>

          <div
            className={`font-mono text-[64px] sm:text-[84px] font-black leading-none tracking-tight ${
              isOvertime ? 'text-amber-400 animate-pulse' : 'text-app-cyan'
            }`}
          >
            {isOvertime ? `+${formatTime(overtimeSeconds)}` : formatTime(remainingSeconds)}
          </div>

          <div className="mt-2 text-[13px] font-bold text-white/60">
            Total Elapsed in Block: {formatTime(liveElapsedSeconds)} / {formatTime(blockDurationSeconds)}
          </div>

          {/* Large Touch Transport Controls */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={handleToggleTimer}
              className={`touch-target min-w-[140px] rounded-2xl px-6 py-3.5 text-[16px] font-black uppercase tracking-wider shadow-lg transition-all ${
                runState.isRunning
                  ? 'bg-amber-500 text-[#041019] hover:bg-amber-400'
                  : 'bg-app-cyan text-[#041019] hover:bg-cyan-300'
              }`}
            >
              {runState.isRunning ? '⏸ Pause' : '▶ Start Timer'}
            </button>

            <button
              type="button"
              onClick={handleResetBlockTimer}
              className="touch-target rounded-2xl border border-white/20 bg-white/10 px-5 py-3.5 text-[14px] font-bold text-white hover:bg-white/20"
            >
              ↺ Reset Timer
            </button>
          </div>
        </div>

        {/* Current Activity Card */}
        {currentBlock && (
          <div className="rounded-3xl border border-cyan-500/30 bg-[#0c1c2e] p-5 shadow-lg flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-app-cyan">
                  Activity {currentBlockIndex + 1} of {session.blocks.length}
                </span>
                <h3 className="text-[20px] font-black text-white">{currentBlock.title}</h3>
              </div>

              <div className="flex items-center gap-2">
                {currentBlock.stationSplit && currentBlock.stationSplit !== 'full' && (
                  <span className="rounded-full border border-amber-500/40 bg-amber-500/20 px-3 py-1 text-[11px] font-black uppercase text-amber-300">
                    {currentBlock.stationSplit.replace('_', ' ')}
                  </span>
                )}
                <span className="rounded-full border border-sky-500/30 bg-sky-500/15 px-3 py-1 text-[11px] font-bold uppercase text-sky-300">
                  {currentBlock.rinkArea} Ice
                </span>
                {onOpenDrillOnIce && (
                  <button
                    type="button"
                    onClick={() => onOpenDrillOnIce(currentBlock)}
                    className="touch-target rounded-xl border border-app-cyan bg-app-cyan/20 px-3 py-1 text-[11px] font-black text-app-cyan hover:bg-app-cyan/30"
                  >
                    View on Rink
                  </button>
                )}
              </div>
            </div>

            {currentBlock.drillSummary && (
              <p className="text-[13.5px] leading-relaxed text-white/80">{currentBlock.drillSummary}</p>
            )}

            {currentBlock.coachingPoints && currentBlock.coachingPoints.length > 0 && (
              <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-3">
                <span className="text-[11px] font-black uppercase tracking-wider text-white/50 block mb-1.5">
                  Key Coaching Cues
                </span>
                <ul className="space-y-1 text-[12.5px] text-white/90">
                  {currentBlock.coachingPoints.map((pt, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-app-cyan font-bold">•</span>
                      <span>{pt}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Quick Coach Observation Note */}
            <div>
              <label className="text-[11px] font-black uppercase tracking-wider text-white/50 block mb-1">
                Coach Live Observation / Flow Notes
              </label>
              <input
                type="text"
                placeholder="e.g. F2 struggled with stick angling; high compete on rebounds."
                value={observationInput}
                onChange={e => handleSaveObservation(e.target.value)}
                className="w-full rounded-xl border border-white/20 bg-white/5 px-3.5 py-2 text-[13px] text-white placeholder-white/30 focus:border-app-cyan focus:outline-none"
              />
            </div>

            {/* Explicit Completion Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/10">
              <span className="text-[12px] font-bold text-white/50">Mark block outcome:</span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleCompleteBlock}
                  className="touch-target rounded-xl bg-emerald-500 px-4 py-2 text-[12.5px] font-black text-[#041019] shadow hover:bg-emerald-400"
                >
                  ✓ Complete & Next
                </button>
                <button
                  type="button"
                  onClick={handleModifyBlock}
                  className="touch-target rounded-xl border border-amber-500/40 bg-amber-500/20 px-3.5 py-2 text-[12.5px] font-bold text-amber-300 hover:bg-amber-500/30"
                >
                  ✎ Modified & Next
                </button>
                <button
                  type="button"
                  onClick={handleSkipBlock}
                  className="touch-target rounded-xl border border-white/20 bg-white/10 px-3.5 py-2 text-[12.5px] font-bold text-white/70 hover:bg-white/20 hover:text-white"
                >
                  ⏭ Skip Block
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Up Next Preview */}
        {nextBlock && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex items-center justify-between gap-3">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-white/40 block">
                Up Next (Activity {currentBlockIndex + 2})
              </span>
              <span className="text-[14px] font-bold text-white/90">{nextBlock.title}</span>
            </div>
            <span className="font-mono text-[12px] font-bold text-app-cyan">{nextBlock.durationMinutes} min</span>
          </div>
        )}
      </div>
    </div>
  );
}
