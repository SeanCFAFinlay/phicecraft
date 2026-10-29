// ============================================================================
// PRINT PREVIEW MODAL
//
// In-app interactive preview before printing or cutting drill cards.
// Supports both Cut-Out Bench Pocket Card and Full Drill Sheet layouts,
// with direct Print/PDF trigger and high-resolution PNG export.
// ============================================================================

import { useState, useEffect } from 'react';
import { useAppState } from '@/hooks/useAppState';
import { renderThumbnail } from '@/features/library/thumbnailRenderer';
import { exportDrillImageFile } from '@/ui/exportImage';
import { migrateV2ToV3 } from '@/domain/v3/migrateV2ToV3';

interface PrintPreviewModalProps {
  onClose: () => void;
}

type PreviewLayout = 'card' | 'sheet';

export function PrintPreviewModal({ onClose }: PrintPreviewModalProps) {
  const { state } = useAppState();
  const [layout, setLayout] = useState<PreviewLayout>('card');

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const drill = state.drill;
  const docV3 = migrateV2ToV3(drill);
  const meta = docV3.metadata;
  const diagramUrl = renderThumbnail(drill, { width: 560, height: 280, scale: 2 });

  const homeCount = drill.players.filter(p => p.team === 'home' && p.role !== 'G').length;
  const awayCount = drill.players.filter(p => p.team === 'away' && p.role !== 'G').length;
  const goalieCount = drill.players.filter(p => p.role === 'G').length;

  const equipmentList = (docV3.equipment || []).reduce<Record<string, number>>((acc, item) => {
    acc[item.kind] = (acc[item.kind] || 0) + 1;
    return acc;
  }, {});

  const handlePrint = () => {
    window.print();
  };

  const handleSaveImage = () => {
    exportDrillImageFile(drill);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Print Preview"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-2 sm:p-4 backdrop-blur-md animate-in fade-in duration-150"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[95vh] w-full max-w-4xl flex-col rounded-2xl border border-cyan-500/30 bg-[#07131e] shadow-2xl overflow-hidden">
        {/* Top Control Bar (Hidden on print) */}
        <div className="no-print flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#091827] px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/20 text-[18px]">
              🖨️
            </span>
            <div>
              <h2 className="text-sm sm:text-base font-extrabold text-white">
                Print & Bench Card Preview
              </h2>
              <p className="text-[11px] text-white/60">
                Live preview of your rink diagram, coaching cues, and setup instructions
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Layout Mode Selector */}
            <div className="flex rounded-lg border border-white/15 bg-black/30 p-0.5">
              <button
                type="button"
                onClick={() => setLayout('card')}
                className={`rounded-md px-2.5 py-1 text-xs font-bold transition-all ${
                  layout === 'card'
                    ? 'bg-app-cyan text-[#041019] shadow-sm'
                    : 'text-white/70 hover:text-white'
                }`}
              >
                ✂ Bench Pocket Card
              </button>
              <button
                type="button"
                onClick={() => setLayout('sheet')}
                className={`rounded-md px-2.5 py-1 text-xs font-bold transition-all ${
                  layout === 'sheet'
                    ? 'bg-app-cyan text-[#041019] shadow-sm'
                    : 'text-white/70 hover:text-white'
                }`}
              >
                📋 Full Drill Sheet
              </button>
            </div>

            {/* Action Buttons */}
            <button
              type="button"
              onClick={handlePrint}
              aria-label="Print or save as PDF"
              className="touch-target flex items-center gap-1.5 rounded-lg bg-app-cyan px-3 py-1.5 text-xs font-black text-[#041019] hover:bg-cyan-300 shadow-md transition-all"
            >
              <span>🖨️</span>
              <span>Print / PDF</span>
            </button>

            <button
              type="button"
              onClick={handleSaveImage}
              aria-label="Download diagram PNG"
              className="touch-target flex items-center gap-1 rounded-lg border border-white/15 bg-white/10 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-white/20 transition-all"
            >
              <span>📷</span>
              <span className="hidden sm:inline">PNG</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close print preview"
              className="touch-target flex h-8 w-8 items-center justify-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white transition-all ml-1"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Scrollable Preview Canvas */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-[#1a232f] p-4 sm:p-8 flex justify-center">
          {layout === 'card' ? (
            /* ✂ BENCH POCKET CARD VIEW */
            <div className="print-surface relative w-full max-w-[620px] rounded-xl border-2 border-dashed border-slate-400 bg-white p-6 shadow-2xl text-slate-900 transition-all">
              {/* Cut and Punch Guides */}
              <div className="absolute -top-3 right-6 bg-white px-2 text-[10px] font-extrabold uppercase tracking-wider text-slate-500 border border-slate-300 rounded">
                ✂ CUT ALONG DASHED LINE · BENCH POCKET CARD
              </div>
              <div
                className="absolute left-2.5 top-1/2 -translate-y-1/2 flex h-4 w-4 items-center justify-center rounded-full border border-dashed border-slate-400 bg-slate-100 text-[10px] text-slate-400"
                title="Binder hole-punch guide"
              >
                ○
              </div>

              {/* Card Header */}
              <div className="flex items-start justify-between border-b-2 border-cyan-600 pb-2.5 pl-3">
                <div>
                  <h1 className="text-xl font-black text-slate-950 tracking-tight">
                    {drill.name || 'Untitled Hockey Play'}
                  </h1>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="rounded bg-sky-100 px-2 py-0.5 text-[10px] font-black uppercase text-sky-800">
                      {meta.categories?.[0] || 'TACTICAL DRILL'}
                    </span>
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                      🔵 {homeCount} Home · 🔴 {awayCount} Away
                      {goalieCount > 0 ? ` · 🥅 ${goalieCount} G` : ''}
                    </span>
                  </div>
                </div>
                <div className="rounded-lg bg-slate-100 px-2.5 py-1 text-center font-mono text-xs font-black text-cyan-700">
                  ⏱ {Math.round((docV3.presentation?.durationSeconds || 60) / 60)} MIN
                </div>
              </div>

              {/* Diagram */}
              <div className="mt-3 overflow-hidden rounded-lg border border-slate-300 bg-slate-50 pl-3">
                <img
                  src={diagramUrl || undefined}
                  alt={`${drill.name} rink diagram`}
                  className="mx-auto block max-h-[260px] w-auto object-contain"
                />
              </div>

              {/* Drill Details & Notes */}
              <div className="mt-4 grid grid-cols-2 gap-4 pl-3 text-xs">
                <div>
                  <h3 className="border-b border-slate-200 pb-1 text-[11px] font-extrabold uppercase tracking-wide text-slate-700">
                    Key Coaching Points
                  </h3>
                  <ul className="mt-1.5 space-y-1 pl-4 list-disc text-slate-800">
                    {meta.coachingPoints && meta.coachingPoints.length > 0 ? (
                      meta.coachingPoints.map((pt, i) => <li key={i}>{pt}</li>)
                    ) : (
                      <>
                        <li>Maintain low athletic hockey stance and head up.</li>
                        <li>Firm tape-to-tape passes with follow-through.</li>
                        <li>Communicate loudly and drive the middle lane.</li>
                      </>
                    )}
                  </ul>
                </div>

                <div>
                  <h3 className="border-b border-slate-200 pb-1 text-[11px] font-extrabold uppercase tracking-wide text-slate-700">
                    Setup & Progression
                  </h3>
                  <ul className="mt-1.5 space-y-1 pl-4 list-disc text-slate-800">
                    {meta.setupNotes && meta.setupNotes.length > 0 ? (
                      meta.setupNotes.map((note, i) => <li key={i}>{note}</li>)
                    ) : (
                      <>
                        <li>Position players according to diagram coordinates.</li>
                        <li>Rotate lines quickly on whistle.</li>
                        <li>High pace with active sticks defending the slot.</li>
                      </>
                    )}
                  </ul>
                </div>
              </div>

              {/* Equipment Strip */}
              {Object.keys(equipmentList).length > 0 && (
                <div className="mt-3.5 border-t border-slate-200 pt-2 pl-3 text-[11px] text-slate-600">
                  <span className="font-bold text-slate-800">Required Equipment: </span>
                  {Object.entries(equipmentList).map(([kind, count]) => (
                    <span
                      key={kind}
                      className="mr-2 inline-block rounded bg-slate-100 px-1.5 py-0.5 font-bold text-slate-700"
                    >
                      {count}× {kind}
                    </span>
                  ))}
                </div>
              )}

              {/* Footer */}
              <div className="mt-3.5 flex items-center justify-between border-t border-slate-200 pt-2 pl-3 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                <span>PhiceCraft Pocket Bench Card</span>
                <span>Cut & Laminate for Rinkside Use</span>
              </div>
            </div>
          ) : (
            /* 📋 FULL DRILL SHEET VIEW */
            <div className="print-surface w-full max-w-[720px] rounded-xl border border-slate-300 bg-white p-8 shadow-2xl text-slate-900 transition-all">
              <div className="flex items-start justify-between border-b-2 border-slate-900 pb-3">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-cyan-700">
                    PRACTICE & PLAY SHEET
                  </div>
                  <h1 className="text-2xl font-black text-slate-950 tracking-tight">
                    {drill.name || 'Untitled Hockey Play'}
                  </h1>
                  <p className="mt-0.5 text-xs text-slate-600">
                    Roster: {homeCount} Home skaters, {awayCount} Away skaters, {goalieCount} Goalies
                  </p>
                </div>
                <div className="text-right">
                  <span className="inline-block rounded-md bg-slate-100 px-3 py-1 font-mono text-sm font-black text-slate-800">
                    ⏱ {Math.round((docV3.presentation?.durationSeconds || 60) / 60)} MIN
                  </span>
                </div>
              </div>

              <div className="mt-4 overflow-hidden rounded-lg border border-slate-300 bg-slate-50">
                <img
                  src={diagramUrl || undefined}
                  alt={`${drill.name} full sheet diagram`}
                  className="mx-auto block max-h-[360px] w-auto object-contain"
                />
              </div>

              <div className="mt-6 grid grid-cols-2 gap-6 text-xs">
                <div>
                  <h3 className="border-b border-slate-300 pb-1.5 text-xs font-black uppercase tracking-wider text-slate-800">
                    Coaching Keys & Tactics
                  </h3>
                  <ul className="mt-2 space-y-1.5 pl-4 list-disc text-slate-800">
                    {meta.coachingPoints && meta.coachingPoints.length > 0 ? (
                      meta.coachingPoints.map((pt, i) => <li key={i}>{pt}</li>)
                    ) : (
                      <>
                        <li>Maintain low athletic hockey stance and head up.</li>
                        <li>Firm tape-to-tape passes with follow-through.</li>
                        <li>Communicate loudly and drive the middle lane.</li>
                      </>
                    )}
                  </ul>
                </div>

                <div>
                  <h3 className="border-b border-slate-300 pb-1.5 text-xs font-black uppercase tracking-wider text-slate-800">
                    Drill Setup & Rules
                  </h3>
                  <ul className="mt-2 space-y-1.5 pl-4 list-disc text-slate-800">
                    {meta.setupNotes && meta.setupNotes.length > 0 ? (
                      meta.setupNotes.map((note, i) => <li key={i}>{note}</li>)
                    ) : (
                      <>
                        <li>Position players according to diagram coordinates.</li>
                        <li>Rotate lines quickly on whistle.</li>
                        <li>High pace with active sticks defending the slot.</li>
                      </>
                    )}
                  </ul>
                </div>
              </div>

              {/* Roster & Equipment Table */}
              <div className="mt-6 border-t border-slate-200 pt-4 text-xs">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">
                  Lineup Roster
                </h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {drill.players.map(p => (
                    <span
                      key={p.id}
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold ${
                        p.team === 'home'
                          ? 'bg-blue-50 text-blue-800 border border-blue-200'
                          : 'bg-red-50 text-red-800 border border-red-200'
                      }`}
                    >
                      <span>{p.team === 'home' ? '🔵' : '🔴'}</span>
                      <span>#{p.number}</span>
                      <span className="text-[10px] text-slate-500">({p.role})</span>
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-slate-200 pt-3 text-[10px] font-bold text-slate-400">
                <span>Created with PhiceCraft Tactical Whiteboard</span>
                <span>https://phicecraft.vercel.app</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
