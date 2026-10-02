// ============================================================================
// PRACTICE SESSION PLANNER
//
// Full-featured multi-drill practice builder for coaches.
// Combines drills into 50/60/80-min practice plans with timeline visualization,
// station splits (ADM model), equipment aggregation, and print/export tools.
// ============================================================================

import { useState, useMemo } from 'react';
import { Sheet } from '@/components/a11y/Sheet';
import { useAppState, useCommands } from '@/hooks/useAppState';
import { DRILL_TEMPLATES } from '@/data/templates/registry';
import {
  loadPracticeSessions,
  upsertPracticeSession,
  deletePracticeSession,
  createBlankPracticeSession,
  calculatePracticeMetrics,
  createBlockFromTemplate,
} from '@/domain/practice/practiceStore';
import type { PracticeSession, PracticeBlock } from '@/domain/practice/types';
import {
  printPracticePlan,
  copyPracticePlanText,
  exportPracticePlanJson,
} from '@/ui/exportPracticePlan';

const EQUIPMENT_ICONS: Record<string, string> = {
  cones: '🔶',
  pucks: '🏒',
  tires: '🔘',
  nets: '🥅',
  hurdles: '🚧',
  bumpers: '🟦',
};

const TARGET_PRESETS = [45, 50, 60, 75, 80, 90];

export function PracticePage({ isOpen }: { isOpen?: boolean } = {}) {
  const { state, dispatch } = useAppState();
  const commands = useCommands();

  const [sessions, setSessions] = useState<PracticeSession[]>(() => loadPracticeSessions());
  const [activeSessionId, setActiveSessionId] = useState<string>(() => {
    const list = loadPracticeSessions();
    return list[0]?.id || '';
  });

  const [isAddingDrill, setIsAddingDrill] = useState(false);
  const [drillSearch, setDrillSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [copyFeedback, setCopyFeedback] = useState(false);

  const activeSession = useMemo(() => {
    return sessions.find(s => s.id === activeSessionId) || sessions[0] || null;
  }, [sessions, activeSessionId]);

  const metrics = useMemo(() => {
    return activeSession ? calculatePracticeMetrics(activeSession) : null;
  }, [activeSession]);

  const open = isOpen ?? (state.ui.openSheet === 'practice');
  const close = () => dispatch({ type: 'CLOSE_SHEET' });

  const updateActiveSession = (updated: PracticeSession) => {
    upsertPracticeSession(updated);
    setSessions(loadPracticeSessions());
  };

  const handleCreateNew = (targetMin: number = 60) => {
    const newSession = createBlankPracticeSession(targetMin, `Practice Plan (${targetMin} min)`);
    upsertPracticeSession(newSession);
    setSessions(loadPracticeSessions());
    setActiveSessionId(newSession.id);
  };

  const handleDeleteActive = () => {
    if (!activeSession) return;
    if (confirm(`Delete "${activeSession.title}"?`)) {
      deletePracticeSession(activeSession.id);
      const remaining = loadPracticeSessions();
      setSessions(remaining);
      setActiveSessionId(remaining[0]?.id || '');
    }
  };

  const handleAddBlockFromTemplate = (templateId: string) => {
    const tpl = DRILL_TEMPLATES.find(t => t.id === templateId);
    if (!tpl || !activeSession) return;

    const block = createBlockFromTemplate(tpl);
    const updated: PracticeSession = {
      ...activeSession,
      blocks: [...activeSession.blocks, block],
    };
    updateActiveSession(updated);
    setIsAddingDrill(false);
    setDrillSearch('');
  };

  const handleAddCustomBlock = () => {
    if (!activeSession) return;
    const newBlock: PracticeBlock = {
      id: `blk-custom-${Date.now()}`,
      title: 'Custom Drill / Station',
      durationMinutes: 10,
      rinkArea: 'half',
      stationSplit: 'full',
      drillSummary: 'Coach-directed skills, small-area game, or team system.',
      coachingPoints: ['Focus on execution, tempo, and high repetitions.'],
      equipment: [{ kind: 'pucks', count: 20 }],
    };
    const updated: PracticeSession = {
      ...activeSession,
      blocks: [...activeSession.blocks, newBlock],
    };
    updateActiveSession(updated);
  };

  const handleRemoveBlock = (blockId: string) => {
    if (!activeSession) return;
    const updated: PracticeSession = {
      ...activeSession,
      blocks: activeSession.blocks.filter(b => b.id !== blockId),
    };
    updateActiveSession(updated);
  };

  const handleMoveBlock = (index: number, direction: -1 | 1) => {
    if (!activeSession) return;
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= activeSession.blocks.length) return;

    const blocks = [...activeSession.blocks];
    const [moved] = blocks.splice(index, 1);
    blocks.splice(targetIdx, 0, moved);

    updateActiveSession({ ...activeSession, blocks });
  };

  const handleDurationChange = (blockId: string, deltaMinutes: number) => {
    if (!activeSession) return;
    const updated: PracticeSession = {
      ...activeSession,
      blocks: activeSession.blocks.map(b => {
        if (b.id !== blockId) return b;
        const newDur = Math.max(2, Math.min(60, b.durationMinutes + deltaMinutes));
        return { ...b, durationMinutes: newDur };
      }),
    };
    updateActiveSession(updated);
  };

  const handleLoadDrillOnIce = async (block: PracticeBlock) => {
    if (block.drillId) {
      close();
      await commands.useTemplate(block.drillId);
      return;
    }
    // If not a template, close to let coach draw it
    close();
  };

  const handleCopyClipboard = async () => {
    if (!activeSession) return;
    const ok = await copyPracticePlanText(activeSession);
    if (ok) {
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    }
  };

  // Filter templates for the drill picker
  const filteredTemplates = useMemo(() => {
    return DRILL_TEMPLATES.filter(tpl => {
      const q = drillSearch.toLowerCase().trim();
      const matchesText = !q ||
        tpl.document.metadata.title.toLowerCase().includes(q) ||
        tpl.document.metadata.summary.toLowerCase().includes(q) ||
        tpl.document.metadata.categories.some(c => c.toLowerCase().includes(q));

      const matchesCat = selectedCategory === 'all' ||
        tpl.document.metadata.categories.includes(selectedCategory as never);

      return matchesText && matchesCat;
    });
  }, [drillSearch, selectedCategory]);

  return (
    <Sheet
      open={open}
      title="Practice Session Planner"
      description="Plan complete practices, station splits, timelines, and equipment"
      onClose={close}
      size="full"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-3 pb-8">
        {/* Brand Header Banner */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-app-border bg-gradient-to-r from-white/[0.06] to-white/[0.02] p-3.5 shadow-sm">
          <div className="flex items-center gap-3">
            <img
              src="/assets/ph-logo.webp"
              alt=""
              width={42}
              height={42}
              className="h-10 w-10 shrink-0 rounded-xl object-contain shadow-sm ring-1 ring-app-cyan/30"
              draggable={false}
            />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[16px] font-black tracking-wider text-white">
                  PHICE<span className="text-app-cyan">CRAFT</span> PRACTICE SYSTEM
                </span>
                <span className="rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-[9.5px] font-black tracking-widest text-emerald-400 uppercase">
                  Pro Planner
                </span>
              </div>
              <p className="text-[12px] text-white/60">
                Multi-drill sessions, station-based ice splits, timeline scheduling & equipment checklists.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleCreateNew(60)}
              className="touch-target inline-flex items-center gap-1.5 rounded-xl border border-app-cyan/40 bg-app-cyan/15 px-3.5 py-1.5 text-[12.5px] font-bold text-app-cyan hover:bg-app-cyan/25"
            >
              + New Practice Plan
            </button>
          </div>
        </div>

        {/* Practice Plan Selector Bar */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <span className="text-[12px] font-bold text-white/50 shrink-0">Plans:</span>
          {sessions.map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => setActiveSessionId(s.id)}
              className={`touch-target shrink-0 rounded-xl border px-3 py-1 text-[12px] font-bold transition-all ${
                s.id === activeSession?.id
                  ? 'border-app-cyan bg-app-cyan text-[#041019] shadow-sm'
                  : 'border-app-border bg-white/5 text-white/70 hover:bg-white/10'
              }`}
            >
              {s.title} ({s.targetMinutes}m)
            </button>
          ))}
        </div>

        {activeSession && metrics && (
          <>
            {/* Session Settings & Metadata */}
            <div className="grid grid-cols-1 gap-3 rounded-2xl border border-app-border bg-[#0b1723] p-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-white/50">
                  Plan Title
                </label>
                <input
                  type="text"
                  value={activeSession.title}
                  onChange={e => updateActiveSession({ ...activeSession, title: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-app-border bg-white/5 px-3 py-1.5 text-[13px] font-bold text-white focus:border-app-cyan focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-white/50">
                  Team / Age Group
                </label>
                <input
                  type="text"
                  value={activeSession.team}
                  onChange={e => updateActiveSession({ ...activeSession, team: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-app-border bg-white/5 px-3 py-1.5 text-[13px] text-white focus:border-app-cyan focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-white/50">
                  Target Ice Time
                </label>
                <div className="mt-1 flex items-center gap-1.5">
                  {TARGET_PRESETS.map(min => (
                    <button
                      key={min}
                      type="button"
                      onClick={() => updateActiveSession({ ...activeSession, targetMinutes: min })}
                      className={`rounded-lg px-2 py-1 text-[11px] font-bold transition-colors ${
                        activeSession.targetMinutes === min
                          ? 'bg-app-cyan text-[#041019]'
                          : 'bg-white/10 text-white/70 hover:bg-white/15'
                      }`}
                    >
                      {min}m
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-white/50">
                  Date
                </label>
                <input
                  type="date"
                  value={activeSession.date || ''}
                  onChange={e => updateActiveSession({ ...activeSession, date: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-app-border bg-white/5 px-3 py-1.5 text-[13px] text-white focus:border-app-cyan focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2 lg:col-span-4">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-white/50">
                  Primary Practice Focus / Objectives
                </label>
                <input
                  type="text"
                  value={activeSession.focus || ''}
                  placeholder="e.g. Neutral zone angling, passing precision, and quick breakout support"
                  onChange={e => updateActiveSession({ ...activeSession, focus: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-app-border bg-white/5 px-3 py-1.5 text-[13px] text-white placeholder-white/30 focus:border-app-cyan focus:outline-none"
                />
              </div>
            </div>

            {/* Timeline Progress Bar & Duration Meter */}
            <div className="rounded-2xl border border-app-border bg-[#0b1723] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-bold text-white">Timeline Schedule</span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wider ${
                      metrics.status === 'exact'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                        : metrics.status === 'under'
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    }`}
                  >
                    {metrics.totalMinutes} / {metrics.targetMinutes} MIN
                    {metrics.remainingMinutes > 0
                      ? ` (${metrics.remainingMinutes}m remaining)`
                      : metrics.remainingMinutes < 0
                      ? ` (${Math.abs(metrics.remainingMinutes)}m overtime)`
                      : ' (Perfect Balance)'}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-[11px] text-white/50">
                  <span>{activeSession.blocks.length} Drill Blocks</span>
                </div>
              </div>

              {/* Graphical Gantt Bar */}
              <div className="mt-1 flex h-6 w-full overflow-hidden rounded-xl border border-app-border bg-white/5">
                {activeSession.blocks.map((block, i) => {
                  const pct = (block.durationMinutes / (metrics.targetMinutes || 60)) * 100;
                  const colors = [
                    'bg-cyan-600',
                    'bg-emerald-600',
                    'bg-indigo-600',
                    'bg-amber-600',
                    'bg-rose-600',
                    'bg-teal-600',
                  ];
                  const barColor = colors[i % colors.length];

                  return (
                    <div
                      key={block.id}
                      style={{ width: `${pct}%` }}
                      className={`relative flex items-center justify-center border-r border-[#0b1723] px-1 text-[10px] font-black text-white ${barColor} overflow-hidden whitespace-nowrap`}
                      title={`${block.title}: ${block.durationMinutes} min`}
                    >
                      <span className="truncate">{block.durationMinutes}m</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Drill Blocks Section */}
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-[14px] font-black uppercase tracking-wider text-white">
                  Practice Drill Sequence
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAddingDrill(true)}
                    className="touch-target inline-flex items-center gap-1.5 rounded-xl border border-app-cyan bg-app-cyan/20 px-3.5 py-1.5 text-[12px] font-bold text-app-cyan hover:bg-app-cyan/30"
                  >
                    + Add Drill from Playbook
                  </button>
                  <button
                    type="button"
                    onClick={handleAddCustomBlock}
                    className="touch-target rounded-xl border border-white/20 bg-white/5 px-3 py-1.5 text-[12px] font-bold text-white/80 hover:bg-white/10"
                  >
                    + Custom Block
                  </button>
                </div>
              </div>

              {activeSession.blocks.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-app-border p-8 text-center text-white/50">
                  <p className="text-[14px] font-bold">No drills added to this practice plan yet.</p>
                  <p className="mt-1 text-[12px]">
                    Click “Add Drill from Playbook” above to select drills from the catalogue.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {(() => {
                    let cumulativeMin = 0;
                    return activeSession.blocks.map((block, idx) => {
                      const startM = cumulativeMin;
                      const endM = cumulativeMin + block.durationMinutes;
                      cumulativeMin = endM;

                      return (
                        <div
                          key={block.id}
                          className="relative flex flex-col gap-2.5 rounded-2xl border border-white/10 bg-[#081523] p-4 transition-all hover:border-cyan-500/30 hover:bg-[#0c1c2e] hover:shadow-[0_4px_16px_rgba(0,0,0,0.4)] overflow-hidden"
                        >
                          <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-cyan-400 to-blue-500" />
                          <div className="flex flex-wrap items-center justify-between gap-2 pl-1.5">
                            <div className="flex items-center gap-2.5">
                              <span className="font-mono text-[12px] font-black rounded-lg bg-cyan-500/15 border border-cyan-500/30 px-2 py-0.5 text-app-cyan shadow-sm">
                                {String(startM).padStart(2, '0')}:00 – {String(endM).padStart(2, '0')}:00
                              </span>
                              <span className="text-[14px] font-black text-white">
                                {idx + 1}. {block.title}
                              </span>
                              {block.stationSplit && block.stationSplit !== 'full' && (
                                <span className="rounded-full border border-amber-500/40 bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-black text-amber-300 uppercase tracking-wider">
                                  {block.stationSplit.replace('_', ' ')}
                                </span>
                              )}
                              <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-bold text-sky-300 uppercase tracking-wider">
                                {block.rinkArea}
                              </span>
                            </div>

                            {/* Duration & Reordering Controls */}
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleDurationChange(block.id, -2)}
                                aria-label="Decrease drill duration"
                                className="touch-target h-7 w-7 rounded-lg border border-white/10 bg-white/5 text-center font-bold text-white hover:border-cyan-500/30 hover:bg-white/15 transition-all"
                              >
                                –
                              </button>
                              <span className="min-w-[42px] text-center font-mono text-[13px] font-bold text-white">
                                {block.durationMinutes}m
                              </span>
                              <button
                                type="button"
                                onClick={() => handleDurationChange(block.id, 2)}
                                aria-label="Increase drill duration"
                                className="touch-target h-7 w-7 rounded-lg border border-white/10 bg-white/5 text-center font-bold text-white hover:border-cyan-500/30 hover:bg-white/15 transition-all"
                              >
                                +
                              </button>

                              <button
                                type="button"
                                disabled={idx === 0}
                                onClick={() => handleMoveBlock(idx, -1)}
                                aria-label="Move drill up"
                                className="touch-target ml-1 h-7 w-7 rounded-lg border border-white/10 bg-white/5 text-[11px] text-white/70 hover:border-cyan-500/30 hover:bg-white/15 hover:text-white transition-all disabled:opacity-30"
                              >
                                ▲
                              </button>
                              <button
                                type="button"
                                disabled={idx === activeSession.blocks.length - 1}
                                onClick={() => handleMoveBlock(idx, 1)}
                                aria-label="Move drill down"
                                className="touch-target h-7 w-7 rounded-lg border border-white/10 bg-white/5 text-[11px] text-white/70 hover:border-cyan-500/30 hover:bg-white/15 hover:text-white transition-all disabled:opacity-30"
                              >
                                ▼
                              </button>

                              <button
                                type="button"
                                onClick={() => handleLoadDrillOnIce(block)}
                                className="touch-target ml-2 rounded-xl border border-app-cyan/40 bg-app-cyan/15 px-3 py-1 text-[11px] font-extrabold text-app-cyan hover:bg-app-cyan/25 hover:shadow-[0_0_10px_rgba(0,229,255,0.25)] transition-all"
                              >
                                Open on Ice
                              </button>

                              <button
                                type="button"
                                onClick={() => handleRemoveBlock(block.id)}
                                aria-label="Remove drill from practice"
                                className="touch-target ml-1 h-7 w-7 rounded-lg text-[13px] text-white/40 hover:bg-red-500/20 hover:text-red-300 transition-all"
                              >
                                ✕
                              </button>
                            </div>
                          </div>

                          {block.drillSummary && (
                            <p className="text-[12px] text-white/70 pl-1.5">{block.drillSummary}</p>
                          )}

                          {block.coachingPoints && block.coachingPoints.length > 0 && (
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-white/60 pl-1.5">
                              {block.coachingPoints.map((pt, pIdx) => (
                                <span key={pIdx} className="inline-flex items-center gap-1">
                                  <span className="text-app-cyan">•</span> {pt}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>
              )}
            </div>

            {/* Consolidated Equipment Checklist */}
            <div className="rounded-2xl border border-app-border bg-[#0b1723] p-4">
              <h3 className="text-[13px] font-black uppercase tracking-wider text-white">
                Consolidated Equipment Checklist
              </h3>
              <p className="text-[11px] text-white/50">
                Total gear needed at the rink to run this practice smoothly without delays.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {Object.keys(metrics.equipmentTotals).length === 0 ? (
                  <span className="text-[12px] italic text-white/40">Standard puck bucket.</span>
                ) : (
                  Object.entries(metrics.equipmentTotals).map(([kind, count]) => (
                    <div
                      key={kind}
                      className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-[12px] text-white shadow-sm hover:border-cyan-500/30 hover:bg-white/[0.08] transition-all"
                    >
                      <span className="text-[14px]">{EQUIPMENT_ICONS[kind] ?? '📦'}</span>
                      <span className="font-extrabold text-app-cyan">{count}×</span>
                      <span className="font-bold uppercase tracking-wider text-white/90">{kind}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Action Buttons: Print, Export, Copy */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => printPracticePlan(activeSession)}
                  className="touch-target inline-flex items-center gap-2 rounded-xl bg-app-cyan px-4 py-2 text-[13px] font-black text-[#041019] shadow-md hover:bg-cyan-300"
                >
                  Print Coaching Sheet / PDF
                </button>
                <button
                  type="button"
                  onClick={handleCopyClipboard}
                  className="touch-target rounded-xl border border-white/20 bg-white/10 px-3.5 py-2 text-[13px] font-bold text-white hover:bg-white/15"
                >
                  {copyFeedback ? '✓ Copied to Clipboard!' : 'Copy Plan Text'}
                </button>
                <button
                  type="button"
                  onClick={() => exportPracticePlanJson(activeSession)}
                  className="touch-target rounded-xl border border-white/20 bg-white/10 px-3.5 py-2 text-[13px] font-bold text-white hover:bg-white/15"
                >
                  Export JSON
                </button>
              </div>

              <button
                type="button"
                onClick={handleDeleteActive}
                className="touch-target rounded-xl px-3 py-2 text-[12px] font-bold text-red-400 hover:bg-red-500/15"
              >
                Delete Practice Plan
              </button>
            </div>
          </>
        )}

        {/* Drill Picker Modal */}
        {isAddingDrill && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
            <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-app-border bg-[#0b1723] p-4 shadow-2xl">
              <div className="flex items-center justify-between border-b border-app-border pb-3">
                <h3 className="text-[16px] font-black text-white">Add Drill to Practice</h3>
                <button
                  type="button"
                  onClick={() => setIsAddingDrill(false)}
                  className="touch-target rounded-lg px-2 text-[14px] text-white/50 hover:text-white"
                >
                  ✕
                </button>
              </div>

              {/* Search & Category Filter */}
              <div className="mt-3 flex flex-col gap-2">
                <input
                  type="text"
                  placeholder="Search drills by name or skill..."
                  value={drillSearch}
                  onChange={e => setDrillSearch(e.target.value)}
                  className="w-full rounded-xl border border-app-border bg-white/5 px-3 py-2 text-[13px] text-white focus:border-app-cyan focus:outline-none"
                />

                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  {['all', 'warm-up', 'passing', 'small-area-game', 'transition', 'breakout', 'power-play'].map(
                    cat => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setSelectedCategory(cat)}
                        className={`touch-target shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-bold capitalize ${
                          selectedCategory === cat
                            ? 'border-app-cyan bg-app-cyan/20 text-app-cyan'
                            : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10'
                        }`}
                      >
                        {cat.replace('-', ' ')}
                      </button>
                    )
                  )}
                </div>
              </div>

              {/* Filtered Drill List */}
              <div className="mt-3 flex-1 overflow-y-auto space-y-2 pr-1">
                {filteredTemplates.length === 0 ? (
                  <p className="p-4 text-center text-[13px] text-white/40">No drills match search.</p>
                ) : (
                  filteredTemplates.map(tpl => {
                    const meta = tpl.document.metadata;
                    return (
                      <div
                        key={tpl.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-app-border bg-white/5 p-3 transition-colors hover:border-app-cyan/50 hover:bg-white/[0.08]"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-[13px] text-white">{meta.title}</span>
                            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-white/70 uppercase">
                              {meta.rinkArea}
                            </span>
                            <span className="font-mono text-[11px] text-app-cyan">
                              {meta.durationMinutes}m
                            </span>
                          </div>
                          <p className="mt-1 line-clamp-2 text-[11.5px] text-white/60">
                            {meta.summary}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleAddBlockFromTemplate(tpl.id)}
                          className="touch-target shrink-0 rounded-xl bg-app-cyan px-3 py-1.5 text-[12px] font-black text-[#041019] hover:bg-cyan-300"
                        >
                          + Add
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}
