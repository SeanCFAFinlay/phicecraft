// ============================================================================
// EXPORT PRACTICE PLAN
//
// Generates printable coaching clipboard sheets, formatted team text summaries,
// and downloadable practice plan documents.
// ============================================================================

import type { PracticeSession } from '@/domain/practice/types';
import { calculatePracticeMetrics } from '@/domain/practice/practiceStore';
import { downloadText } from './download';

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
 * Downloads practice session as a formatted JSON document.
 */
export function exportPracticePlanJson(session: PracticeSession): void {
  const payload = JSON.stringify(session, null, 2);
  const safeTitle = session.title.toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
  downloadText(`${safeTitle || 'practice-plan'}.json`, payload, 'application/json');
}

/**
 * Opens a dedicated printable coaching clipboard window formatted for 1-2 pages
 * with brand lockup, timeline, station split, and equipment summary.
 */
export function printPracticePlan(session: PracticeSession): void {
  if (typeof window === 'undefined') return;

  const metrics = calculatePracticeMetrics(session);
  let currentMinute = 0;

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

      return `
        <div class="drill-block">
          <div class="drill-header">
            <span class="drill-time">${String(startMin).padStart(2, '0')}:00 – ${String(endMin).padStart(2, '0')}:00 (${block.durationMinutes}m)</span>
            <span class="drill-title">${idx + 1}. ${block.title}</span>
            ${stationBadge}
            <span class="area-badge">${block.rinkArea.toUpperCase()}</span>
          </div>
          ${block.drillSummary ? `<div class="drill-summary">${block.drillSummary}</div>` : ''}
          ${pointsHtml}
          ${eqHtml}
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
        @page { size: letter portrait; margin: 12mm 15mm; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
          color: #0f172a;
          background: #fff;
          margin: 0;
          padding: 10px;
          line-height: 1.35;
          font-size: 13px;
        }
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
        .footer-note {
          text-align: center;
          font-size: 10px;
          color: #94a3b8;
          border-top: 1px solid #e2e8f0;
          margin-top: 16px;
          padding-top: 8px;
        }
      </style>
    </head>
    <body>
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

      <script>
        window.addEventListener('load', function() {
          setTimeout(function() { window.print(); }, 250);
        });
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
