// ============================================================================
// EXPORT PRACTICE PLAN
//
// Generates printable coaching clipboard sheets, formatted team text summaries,
// downloadable practice plan documents, and cut-out drill cards with screen preview.
// ============================================================================

import type { PracticeSession } from '@/domain/practice/types';
import { calculatePracticeMetrics } from '@/domain/practice/practiceStore';
import { createPracticeBundle } from '@/domain/practice/practiceBundle';
import { downloadText } from './download';
import { projectToV2 } from '@/domain/v3/projectToV2';
import { renderThumbnail } from '@/features/library/thumbnailRenderer';

/**
 * Formats a practice plan into a structured plain text document for email,
 * clipboard, or team group chats.
 */
export function formatPracticePlanText(session: PracticeSession): string {
  const metrics = calculatePracticeMetrics(session);
  const lines: string[] = [];

  lines.push('================================================================');
  lines.push(`PHICECRAFT HOCKEY PRACTICE PLAN · ${session.title.toUpperCase()}`);
  lines.push('================================================================');
  lines.push(`Team: ${session.team || 'Team Practice'} | Date: ${session.date || new Date().toISOString().slice(0, 10)}`);
  lines.push(`Total Duration: ${metrics.totalMinutes} min (Target: ${session.targetMinutes} min)`);
  if (session.focus) {
    lines.push(`Primary Focus: ${session.focus}`);
  }
  lines.push('');
  lines.push('--- PRACTICE TIMELINE ---');

  let currentMinute = 0;
  session.blocks.forEach((block, index) => {
    const startMin = currentMinute;
    const endMin = currentMinute + block.durationMinutes;
    currentMinute = endMin;

    const stationLabel = block.stationSplit && block.stationSplit !== 'full'
      ? ` [${block.stationSplit.toUpperCase().replace('_', ' ')}]`
      : '';

    lines.push(
      `${index + 1}. [${String(startMin).padStart(2, '0')}:00 - ${String(endMin).padStart(2, '0')}:00] (${block.durationMinutes} min) ${block.title}${stationLabel}`
    );
    if (block.drillSummary) {
      lines.push(`   Summary: ${block.drillSummary}`);
    }
    if (block.coachingPoints && block.coachingPoints.length > 0) {
      lines.push('   Key Coaching Points:');
      block.coachingPoints.forEach(point => lines.push(`     • ${point}`));
    }
    if (block.equipment && block.equipment.length > 0) {
      const eqStr = block.equipment.map(e => `${e.count} ${e.kind}`).join(', ');
      lines.push(`   Equipment: ${eqStr}`);
    }
    lines.push('');
  });

  lines.push('--- CONSOLIDATED EQUIPMENT CHECKLIST ---');
  const eqKeys = Object.keys(metrics.equipmentTotals);
  if (eqKeys.length === 0) {
    lines.push('Standard puck supply.');
  } else {
    eqKeys.forEach(key => {
      lines.push(`  • ${key.toUpperCase()}: ${metrics.equipmentTotals[key]}`);
    });
  }
  lines.push('');
  lines.push('================================================================');
  lines.push('PHICECRAFT · TRAIN · PLAY · IMPROVE');
  lines.push('================================================================');

  return lines.join('\n');
}

/**
 * Copies formatted text practice plan to clipboard.
 */
export async function copyPracticePlanText(session: PracticeSession): Promise<boolean> {
  const text = formatPracticePlanText(session);
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Formats a practice plan into a clean GitHub-flavored Markdown document with tables,
 * perfect for team wikis, Notion, Discord, WhatsApp or email.
 */
export function formatPracticePlanMarkdown(session: PracticeSession): string {
  const metrics = calculatePracticeMetrics(session);
  const lines: string[] = [];

  lines.push(`# 🏒 ${session.title}`);
  lines.push('');
  lines.push(`**Team / Level:** ${session.team || 'Team Practice'} | **Date:** ${session.date || new Date().toISOString().slice(0, 10)}`);
  lines.push(`**Ice Time:** ${metrics.totalMinutes} min / ${session.targetMinutes} min target`);
  if (session.focus) {
    lines.push(`**Session Focus:** *${session.focus}*`);
  }
  lines.push('');
  lines.push('### ⏱ Practice Schedule & Stations');
  lines.push('');
  lines.push('| Time | Drill / Activity | Area / Split | Dur | Coaching Points |');
  lines.push('| :--- | :--- | :--- | :---: | :--- |');

  let currentMinute = 0;
  session.blocks.forEach((block, index) => {
    const startMin = currentMinute;
    const endMin = currentMinute + block.durationMinutes;
    currentMinute = endMin;

    const timeWindow = `${String(startMin).padStart(2, '0')}:00–${String(endMin).padStart(2, '0')}:00`;
    const title = `${index + 1}. **${block.title}**`;
    const area = block.stationSplit && block.stationSplit !== 'full'
      ? `${block.rinkArea} (${block.stationSplit})`
      : block.rinkArea;
    const cues = (block.coachingPoints || []).join('; ') || (block.drillSummary || '-');

    lines.push(`| ${timeWindow} | ${title} | ${area} | ${block.durationMinutes}m | ${cues} |`);
  });

  lines.push('');
  lines.push('### 📦 Equipment Checklist');
  lines.push('');
  const eqEntries = Object.entries(metrics.equipmentTotals);
  if (eqEntries.length === 0) {
    lines.push('- Standard puck supply');
  } else {
    for (const [kind, count] of eqEntries) {
      const peak = metrics.peakConcurrentEquipment?.[kind];
      const peakStr = peak && peak !== count ? ` *(Peak concurrent: ${peak})*` : '';
      lines.push(`- **${count}×** ${kind}${peakStr}`);
    }
  }

  lines.push('');
  lines.push('---');
  lines.push('*Generated by PHiceCraft Practice System*');
  return lines.join('\n');
}

/**
 * Copies formatted markdown practice plan to clipboard.
 */
export async function copyPracticePlanMarkdown(session: PracticeSession): Promise<boolean> {
  const md = formatPracticePlanMarkdown(session);
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(md);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Downloads practice session as a portable, versioned PracticeBundle JSON document.
 */
export function exportPracticePlanJson(session: PracticeSession): void {
  const bundle = createPracticeBundle(session);
  const payload = JSON.stringify(bundle, null, 2);
  const safeTitle = session.title.toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
  downloadText(`${safeTitle || 'practice-plan'}.json`, payload, 'application/json');
}

export type PrintLayoutMode = 'sheet' | 'cards' | 'pocket';

/**
 * Opens a dedicated printable coaching clipboard window formatted with on-screen
 * preview modes: full clipboard sheet or cut-out drill cards for the bench.
 */
export function printPracticePlan(
  session: PracticeSession,
  initialMode: PrintLayoutMode = 'sheet'
): void {
  if (typeof window === 'undefined') return;

  const metrics = calculatePracticeMetrics(session);
  let currentMinute = 0;

  // 1. Build Full Practice Sheet Drill Blocks
  const blocksHtml = session.blocks
    .map((block, idx) => {
      const startMin = currentMinute;
      const endMin = currentMinute + block.durationMinutes;
      currentMinute = endMin;

      const stationBadge = block.stationSplit && block.stationSplit !== 'full'
        ? `<span class="station-badge">${block.stationSplit.toUpperCase().replace('_', ' ')}</span>`
        : '';

      const pointsHtml = block.coachingPoints && block.coachingPoints.length > 0
        ? `<ul class="points-list">${block.coachingPoints.map(p => `<li>${p}</li>`).join('')}</ul>`
        : '';

      const eqHtml = block.equipment && block.equipment.length > 0
        ? `<div class="equipment-line"><strong>Gear:</strong> ${block.equipment.map(e => `${e.count} ${e.kind}`).join(', ')}</div>`
        : '';

      let diagramHtml = '';
      if (block.pinnedRevision) {
        try {
          const v2 = projectToV2(block.pinnedRevision);
          const thumb = renderThumbnail(v2.drill, { width: 220, height: 110, scale: 2 });
          if (thumb) {
            diagramHtml = `<div class="drill-diagram"><img src="${thumb}" alt="${block.title} rink diagram" /></div>`;
          }
        } catch {
          // Gracefully omit thumbnail if rendering is unavailable
        }
      }

      return `
        <div class="drill-block">
          <div class="drill-header">
            <span class="drill-time">${String(startMin).padStart(2, '0')}:00 – ${String(endMin).padStart(2, '0')}:00 (${block.durationMinutes}m)</span>
            <span class="drill-title">${idx + 1}. ${block.title}</span>
            ${stationBadge}
            <span class="area-badge">${block.rinkArea.toUpperCase()}</span>
          </div>
          <div class="drill-body">
            ${diagramHtml}
            <div class="drill-content">
              ${block.drillSummary ? `<div class="drill-summary">${block.drillSummary}</div>` : ''}
              ${pointsHtml}
              ${eqHtml}
            </div>
          </div>
        </div>
      `;
    })
    .join('');

  // 2. Build Cut-Out Bench Cards (2-Up / 4-Up)
  const cardsHtml = session.blocks
    .map((block, idx) => {
      let diagramUrl = '';
      if (block.pinnedRevision) {
        try {
          const v2 = projectToV2(block.pinnedRevision);
          const thumb = renderThumbnail(v2.drill, { width: 440, height: 220, scale: 2 });
          if (thumb) diagramUrl = thumb;
        } catch {
          // Graceful fallback
        }
      }

      const pointsHtml = (block.coachingPoints || [])
        .map(p => `<li>${p}</li>`)
        .join('');

      const eqHtml = (block.equipment || [])
        .map(e => `<span class="tag-pill">${e.count} ${e.kind}</span>`)
        .join(' ');

      return `
        <div class="cut-card">
          <div class="cut-marker">✂ CUT OUT · DRILL #${idx + 1}</div>
          <div class="hole-punch" title="Binder ring hole punch guide"></div>
          <div class="cut-card-header">
            <div>
              <div class="cut-card-title">${idx + 1}. ${block.title}</div>
              <div class="cut-badges">
                <span class="badge badge-cyan">${block.rinkArea.toUpperCase()}</span>
                ${block.stationSplit && block.stationSplit !== 'full' ? `<span class="badge badge-amber">${block.stationSplit.toUpperCase().replace('_', ' ')}</span>` : ''}
              </div>
            </div>
            <div class="cut-time">⏱ ${block.durationMinutes} MIN</div>
          </div>

          ${diagramUrl ? `<div class="cut-diagram"><img src="${diagramUrl}" alt="${block.title}" /></div>` : ''}

          ${block.drillSummary ? `<div class="cut-summary">${block.drillSummary}</div>` : ''}

          ${pointsHtml ? `
            <div class="cut-points-title">Coaching Points</div>
            <ul class="cut-points-list">${pointsHtml}</ul>
          ` : ''}

          ${eqHtml ? `<div class="cut-gear-strip"><strong>Gear:</strong> ${eqHtml}</div>` : ''}

          <div class="cut-card-footer">
            <span>PhiceCraft Bench Card</span>
            <span>${session.title}</span>
          </div>
        </div>
      `;
    })
    .join('');

  const equipmentRows = Object.entries(metrics.equipmentTotals)
    .map(([kind, count]) => `<div class="eq-pill"><strong>${kind.toUpperCase()}:</strong> ${count}</div>`)
    .join('');

  const printDoc = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <title>Practice Plan: ${session.title}</title>
      <style>
        @page { size: letter portrait; margin: 10mm 12mm; }
        * { box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
          color: #0f172a;
          background: #f8fafc;
          margin: 0;
          padding: 12px 18px;
          line-height: 1.35;
          font-size: 13px;
        }

        /* Screen Preview Toolbar (Hidden in Print) */
        .preview-toolbar {
          position: sticky;
          top: 0;
          z-index: 999;
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #09131d;
          color: #fff;
          padding: 8px 16px;
          border-radius: 8px;
          box-shadow: 0 4px 16px rgba(0,0,0,0.25);
          margin-bottom: 16px;
        }
        .toolbar-brand {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .toolbar-brand strong { color: #22d3ee; font-size: 13px; }
        .toolbar-modes {
          display: flex;
          gap: 6px;
        }
        .mode-btn {
          background: rgba(255,255,255,0.08);
          color: #cbd5e1;
          border: 1px solid rgba(255,255,255,0.2);
          border-radius: 6px;
          padding: 6px 12px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.15s;
        }
        .mode-btn:hover { background: rgba(255,255,255,0.18); color: #fff; }
        .mode-btn.active {
          background: #0284c7;
          border-color: #38bdf8;
          color: #fff;
        }
        .toolbar-actions {
          display: flex;
          gap: 8px;
        }
        .btn-print {
          background: #22d3ee;
          color: #041019;
          border: none;
          font-weight: 900;
          padding: 6px 14px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 12px;
        }
        .btn-print:hover { background: #67e8f9; }
        .btn-close {
          background: rgba(255,255,255,0.1);
          color: #fff;
          border: 1px solid rgba(255,255,255,0.2);
          padding: 6px 10px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 12px;
        }

        /* Full Practice Sheet Styling */
        #view-sheet { background: #fff; padding: 12px; border-radius: 8px; border: 1px solid #cbd5e1; }
        .header-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 3px solid #0284c7;
          padding-bottom: 8px;
          margin-bottom: 12px;
        }
        .brand-title {
          font-size: 20px;
          font-weight: 900;
          letter-spacing: 0.5px;
          color: #0f172a;
        }
        .brand-title span { color: #0284c7; }
        .tagline { font-size: 10px; font-weight: 700; color: #059669; text-transform: uppercase; letter-spacing: 1px; }
        .meta-strip {
          display: grid;
          grid-template-columns: 2fr 1fr 1fr;
          gap: 10px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 8px 12px;
          margin-bottom: 14px;
        }
        .meta-item label { display: block; font-size: 9px; font-weight: 800; color: #64748b; text-transform: uppercase; }
        .meta-item value { font-size: 13px; font-weight: 700; color: #0f172a; }
        .timeline-section h2, .eq-section h2 {
          font-size: 14px;
          font-weight: 800;
          text-transform: uppercase;
          border-bottom: 1px solid #cbd5e1;
          padding-bottom: 4px;
          margin: 12px 0 8px 0;
          color: #1e293b;
        }
        .drill-block {
          background: #ffffff;
          border: 1px solid #cbd5e1;
          border-left: 4px solid #0284c7;
          border-radius: 6px;
          padding: 8px 10px;
          margin-bottom: 8px;
          page-break-inside: avoid;
        }
        .drill-header {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
        }
        .drill-body {
          display: flex;
          gap: 12px;
          align-items: flex-start;
          margin-top: 6px;
        }
        .drill-content {
          flex: 1;
          min-width: 0;
        }
        .drill-diagram {
          flex-shrink: 0;
          width: 150px;
          height: 80px;
          border: 1px solid #cbd5e1;
          border-radius: 4px;
          overflow: hidden;
          background: #f8fafc;
        }
        .drill-diagram img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          display: block;
        }
        .drill-time {
          font-family: monospace;
          font-weight: 800;
          background: #f1f5f9;
          padding: 2px 6px;
          border-radius: 4px;
          color: #0369a1;
        }
        .drill-title { font-weight: 800; color: #0f172a; flex: 1; }
        .station-badge {
          background: #fef3c7;
          color: #92400e;
          font-weight: 800;
          font-size: 10px;
          padding: 2px 6px;
          border-radius: 4px;
          border: 1px solid #fde68a;
        }
        .area-badge {
          background: #e0f2fe;
          color: #0369a1;
          font-weight: 800;
          font-size: 10px;
          padding: 2px 6px;
          border-radius: 4px;
        }
        .drill-summary {
          font-size: 12px;
          color: #334155;
          margin-top: 4px;
        }
        .points-list {
          margin: 4px 0 0 16px;
          padding: 0;
          font-size: 11.5px;
          color: #1e293b;
        }
        .points-list li { margin-bottom: 2px; }
        .equipment-line {
          font-size: 11px;
          color: #64748b;
          margin-top: 4px;
        }
        .eq-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 6px;
        }
        .eq-pill {
          background: #f1f5f9;
          border: 1px solid #cbd5e1;
          padding: 4px 8px;
          border-radius: 6px;
          font-size: 11px;
        }

        /* Cut-Out Bench Cards Styling */
        #view-cards {
          display: grid;
          grid-template-columns: 1fr;
          gap: 18px;
          max-width: 760px;
          margin: 0 auto;
        }
        .cut-card {
          position: relative;
          background: #fff;
          border: 2px dashed #94a3b8;
          border-radius: 10px;
          padding: 18px 20px 16px 32px;
          page-break-inside: avoid;
          break-inside: avoid;
          box-shadow: 0 2px 6px rgba(0,0,0,0.04);
        }
        .cut-marker {
          position: absolute;
          top: -10px;
          right: 20px;
          background: #fff;
          padding: 0 6px;
          font-size: 10px;
          font-weight: 800;
          color: #64748b;
        }
        .hole-punch {
          position: absolute;
          left: 10px;
          top: 50%;
          transform: translateY(-50%);
          width: 12px;
          height: 12px;
          border: 1.5px dashed #cbd5e1;
          border-radius: 50%;
        }
        .hole-punch::after {
          content: '○';
          display: block;
          text-align: center;
          line-height: 10px;
          font-size: 9px;
          color: #94a3b8;
        }
        .cut-card-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 2px solid #0284c7;
          padding-bottom: 6px;
          margin-bottom: 8px;
        }
        .cut-card-title {
          font-size: 15px;
          font-weight: 800;
          color: #0f172a;
        }
        .cut-badges {
          display: flex;
          gap: 4px;
          margin-top: 3px;
        }
        .badge {
          font-size: 9px;
          font-weight: 800;
          padding: 2px 5px;
          border-radius: 4px;
        }
        .badge-cyan { background: #e0f2fe; color: #0369a1; }
        .badge-amber { background: #fef3c7; color: #92400e; }
        .cut-time {
          font-family: monospace;
          font-weight: 800;
          background: #f1f5f9;
          color: #0284c7;
          padding: 3px 6px;
          border-radius: 4px;
          font-size: 11px;
        }
        .cut-diagram {
          width: 100%;
          border: 1px solid #cbd5e1;
          border-radius: 4px;
          overflow: hidden;
          background: #f8fafc;
          margin-bottom: 8px;
          text-align: center;
        }
        .cut-diagram img {
          max-width: 100%;
          height: auto;
          display: block;
          margin: 0 auto;
        }
        .cut-summary { font-size: 11px; color: #334155; margin-bottom: 6px; }
        .cut-points-title { font-size: 10px; font-weight: 800; text-transform: uppercase; color: #475569; margin-top: 4px; }
        .cut-points-list { margin: 2px 0 6px 14px; padding: 0; font-size: 11px; color: #1e293b; }
        .cut-gear-strip { font-size: 10px; color: #64748b; border-top: 1px solid #f1f5f9; padding-top: 4px; }
        .tag-pill { display: inline-block; background: #f1f5f9; padding: 1px 4px; border-radius: 3px; font-weight: 700; color: #334155; }
        .cut-card-footer {
          margin-top: 8px;
          display: flex;
          justify-content: space-between;
          font-size: 8.5px;
          color: #94a3b8;
          text-transform: uppercase;
        }

        /* 4-Up Pocket Cards Layout */
        #view-pocket {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          max-width: 800px;
          margin: 0 auto;
        }
        #view-pocket .cut-card {
          padding: 12px 14px 10px 22px;
        }
        #view-pocket .cut-card-title { font-size: 13px; }
        #view-pocket .cut-diagram { max-height: 120px; }
        #view-pocket .cut-diagram img { max-height: 115px; }

        .footer-note {
          text-align: center;
          font-size: 10px;
          color: #94a3b8;
          border-top: 1px solid #e2e8f0;
          margin-top: 16px;
          padding-top: 8px;
        }

        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; padding: 0 !important; }
          #view-sheet { border: none !important; padding: 0 !important; }
          .cut-card { box-shadow: none !important; page-break-inside: avoid; break-inside: avoid; }
        }
      </style>
    </head>
    <body>
      <!-- Preview Toolbar -->
      <div class="preview-toolbar no-print">
        <div class="toolbar-brand">
          <strong>🏒 Print & Cut Preview</strong>
        </div>
        <div class="toolbar-modes">
          <button id="btn-sheet" class="mode-btn" onclick="setMode('sheet')">📋 Full Practice Plan</button>
          <button id="btn-cards" class="mode-btn" onclick="setMode('cards')">✂ 2-Up Bench Cards</button>
          <button id="btn-pocket" class="mode-btn" onclick="setMode('pocket')">✂ 4-Up Pocket Cards</button>
        </div>
        <div class="toolbar-actions">
          <button class="btn-print" onclick="window.print()">🖨 Print / Save PDF</button>
          <button class="btn-close" onclick="window.close()">✕ Close</button>
        </div>
      </div>

      <!-- VIEW 1: Full Practice Plan Sheet -->
      <div id="view-sheet">
        <div class="header-bar">
          <div>
            <div class="brand-title">PHICE<span>CRAFT</span> PRACTICE PLAN</div>
            <div class="tagline">Train · Play · Improve · Official Hockey Practice System</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 14px; font-weight: 800;">${session.title}</div>
            <div style="font-size: 11px; color: #64748b;">${session.targetMinutes} Minutes Ice Time</div>
          </div>
        </div>

        <div class="meta-strip">
          <div class="meta-item"><label>Team / Group</label><value>${session.team || 'All Teams'}</value></div>
          <div class="meta-item"><label>Date</label><value>${session.date || new Date().toISOString().slice(0, 10)}</value></div>
          <div class="meta-item"><label>Status</label><value>${metrics.totalMinutes} of ${metrics.targetMinutes} min (${metrics.remainingMinutes >= 0 ? `${metrics.remainingMinutes}m left` : `${Math.abs(metrics.remainingMinutes)}m overtime`})</value></div>
        </div>

        ${session.focus ? `
          <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 6px 10px; margin-bottom: 12px; font-size: 12px;">
            <strong>Practice Objectives:</strong> ${session.focus}
          </div>
        ` : ''}

        <div class="timeline-section">
          <h2>Practice Timeline (${session.blocks.length} Drill Blocks)</h2>
          ${blocksHtml}
        </div>

        <div class="eq-section">
          <h2>Required Equipment Checklist</h2>
          <div class="eq-grid">
            ${equipmentRows || '<div class="eq-pill">Standard pucks</div>'}
          </div>
        </div>

        <div class="footer-note">
          Generated by PhiceCraft · Offline-first Pro Hockey Diagramming & Practice Planning
        </div>
      </div>

      <!-- VIEW 2: 2-Up Bench Cut-Out Cards -->
      <div id="view-cards" style="display: none;">
        ${cardsHtml}
      </div>

      <!-- VIEW 3: 4-Up Pocket Cards -->
      <div id="view-pocket" style="display: none;">
        ${cardsHtml}
      </div>

      <script>
        function setMode(mode) {
          document.getElementById('view-sheet').style.display = mode === 'sheet' ? 'block' : 'none';
          document.getElementById('view-cards').style.display = mode === 'cards' ? 'grid' : 'none';
          document.getElementById('view-pocket').style.display = mode === 'pocket' ? 'grid' : 'none';
          
          document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
          var activeBtn = document.getElementById('btn-' + mode);
          if (activeBtn) activeBtn.classList.add('active');
        }

        // Set initial mode on launch
        setMode('${initialMode}');
      </script>
    </body>
    </html>
  `;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.open();
    printWindow.document.write(printDoc);
    printWindow.document.close();
  }
}
