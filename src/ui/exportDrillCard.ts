// ============================================================================
// EXPORT DRILL CARD (CUT-OUT BENCH CARD)
//
// Generates a dedicated printable index cut-out card for individual drills.
// Formatted with dashed cutting guides, binder hole-punch marker, high-resolution
// rink diagram, setup notes, coaching points, and equipment checklist.
// ============================================================================

import type { DrillDocumentV3 } from '@/domain/v3/types';
import { projectToV2 } from '@/domain/v3/projectToV2';
import { renderThumbnail } from '@/features/library/thumbnailRenderer';

export interface PrintDrillCardOptions {
  autoPrint?: boolean;
}

/**
 * Opens a dedicated printable cut-out drill card in a new preview window.
 */
export function printSingleDrillCard(
  documentV3: DrillDocumentV3,
  options: PrintDrillCardOptions = {}
): void {
  if (typeof window === 'undefined') return;

  const { autoPrint = false } = options;
  const meta = documentV3.metadata;
  const v2 = projectToV2(documentV3);
  const diagramUrl = renderThumbnail(v2.drill, { width: 480, height: 240, scale: 2 });

  const coachingPointsHtml = (meta.coachingPoints || [])
    .map(p => `<li>${p}</li>`)
    .join('');

  const setupNotesHtml = (meta.setupNotes || [])
    .map(n => `<li>${n}</li>`)
    .join('');

  const equipmentList = (documentV3.equipment || [])
    .map(e => `${e.kind}`)
    .reduce<Record<string, number>>((acc, kind) => {
      acc[kind] = (acc[kind] || 0) + 1;
      return acc;
    }, {});

  const equipmentHtml = Object.entries(equipmentList)
    .map(([kind, count]) => `<span class="gear-tag">${count}× ${kind}</span>`)
    .join(' ');

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <title>Drill Card: ${meta.title}</title>
      <style>
        @page { size: letter portrait; margin: 10mm; }
        * { box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
          color: #0f172a;
          background: #f1f5f9;
          margin: 0;
          padding: 20px;
        }

        /* Screen Preview Toolbar */
        .preview-toolbar {
          position: sticky;
          top: 0;
          z-index: 100;
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #09131d;
          color: #ffffff;
          padding: 10px 18px;
          border-radius: 10px;
          box-shadow: 0 4px 16px rgba(0,0,0,0.25);
          margin-bottom: 24px;
        }
        .toolbar-title {
          font-size: 14px;
          font-weight: 800;
          color: #22d3ee;
        }
        .toolbar-actions {
          display: flex;
          gap: 10px;
        }
        .btn-print {
          background: #0284c7;
          color: #fff;
          border: none;
          font-weight: 800;
          font-size: 13px;
          padding: 8px 16px;
          border-radius: 6px;
          cursor: pointer;
        }
        .btn-print:hover { background: #0369a1; }
        .btn-close {
          background: rgba(255,255,255,0.12);
          color: #fff;
          border: 1px solid rgba(255,255,255,0.2);
          font-weight: 700;
          font-size: 13px;
          padding: 8px 14px;
          border-radius: 6px;
          cursor: pointer;
        }

        /* Bench Card Container */
        .card-page {
          max-width: 680px;
          margin: 0 auto;
        }
        .cut-card {
          position: relative;
          background: #ffffff;
          border: 2px dashed #94a3b8;
          border-radius: 12px;
          padding: 22px 24px 20px 36px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.06);
          page-break-inside: avoid;
        }
        .cut-guide {
          position: absolute;
          top: -11px;
          right: 24px;
          background: #ffffff;
          padding: 0 8px;
          font-size: 11px;
          font-weight: 800;
          color: #64748b;
          letter-spacing: 0.5px;
        }
        .punch-guide {
          position: absolute;
          left: 10px;
          top: 50%;
          transform: translateY(-50%);
          width: 14px;
          height: 14px;
          border: 1.5px dashed #cbd5e1;
          border-radius: 50%;
          background: #f8fafc;
        }
        .punch-guide::after {
          content: '○';
          display: block;
          text-align: center;
          line-height: 12px;
          font-size: 10px;
          color: #94a3b8;
        }

        /* Card Content */
        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 2px solid #0284c7;
          padding-bottom: 8px;
          margin-bottom: 12px;
        }
        .card-title {
          font-size: 18px;
          font-weight: 900;
          color: #0f172a;
          margin: 0 0 4px 0;
        }
        .card-badges {
          display: flex;
          gap: 6px;
          align-items: center;
        }
        .badge {
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          padding: 2px 6px;
          border-radius: 4px;
        }
        .badge-cyan { background: #e0f2fe; color: #0369a1; }
        .badge-amber { background: #fef3c7; color: #92400e; }
        .duration-pill {
          font-family: monospace;
          font-weight: 800;
          background: #f1f5f9;
          color: #0284c7;
          padding: 4px 8px;
          border-radius: 6px;
          font-size: 12px;
        }

        .diagram-frame {
          width: 100%;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          overflow: hidden;
          background: #f8fafc;
          margin-bottom: 14px;
          text-align: center;
        }
        .diagram-frame img {
          max-width: 100%;
          height: auto;
          display: block;
          margin: 0 auto;
        }

        .details-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          font-size: 12px;
        }
        .section-h {
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
          color: #475569;
          margin: 0 0 4px 0;
          border-bottom: 1px solid #e2e8f0;
          padding-bottom: 2px;
        }
        ul {
          margin: 0 0 8px 16px;
          padding: 0;
          color: #1e293b;
        }
        li { margin-bottom: 3px; }
        .gear-strip {
          margin-top: 10px;
          font-size: 11px;
          color: #64748b;
          border-top: 1px solid #e2e8f0;
          padding-top: 6px;
        }
        .gear-tag {
          display: inline-block;
          background: #f1f5f9;
          padding: 2px 6px;
          border-radius: 4px;
          font-weight: 700;
          color: #334155;
          margin-right: 4px;
        }

        .card-footer {
          margin-top: 12px;
          display: flex;
          justify-content: space-between;
          font-size: 9px;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; padding: 0 !important; }
          .cut-card { box-shadow: none !important; }
        }
      </style>
    </head>
    <body>
      <div class="preview-toolbar no-print">
        <div>
          <div class="toolbar-title">✂ PHICECRAFT · PRINT & CUT BENCH CARD PREVIEW</div>
          <div style="font-size: 11px; color: #94a3b8;">Review layout on screen before printing. Use scissors to cut along the dashed guide.</div>
        </div>
        <div class="toolbar-actions">
          <button class="btn-print" onclick="window.print()">🖨 Print / Save PDF</button>
          <button class="btn-close" onclick="window.close()">✕ Close</button>
        </div>
      </div>

      <div class="card-page">
        <div class="cut-card">
          <div class="cut-guide">✂ CUT ALONG DASHED LINE · BENCH POCKET CARD</div>
          <div class="punch-guide" title="Hole punch guide for binder ring"></div>

          <div class="card-header">
            <div>
              <h1 class="card-title">${meta.title}</h1>
              <div class="card-badges">
                <span class="badge badge-cyan">${meta.categories?.[0]?.toUpperCase() || 'DRILL'}</span>
                <span class="badge badge-amber">${documentV3.actors?.length || 0} PLAYERS</span>
              </div>
            </div>
            <div class="duration-pill">
              ⏱ ${Math.round((documentV3.presentation?.durationSeconds || 60) / 60)} MIN
            </div>
          </div>

          ${
            diagramUrl
              ? `<div class="diagram-frame"><img src="${diagramUrl}" alt="${meta.title} diagram" /></div>`
              : ''
          }

          <div class="details-grid">
            <div>
              <div class="section-h">Key Coaching Points</div>
              <ul>
                ${coachingPointsHtml || '<li>Focus on puck protection and skating speed.</li>'}
              </ul>
            </div>
            <div>
              <div class="section-h">Setup & Rules</div>
              <ul>
                ${setupNotesHtml || '<li>Standard station boundaries apply.</li>'}
              </ul>
            </div>
          </div>

          ${
            equipmentHtml
              ? `<div class="gear-strip"><strong>Required Gear:</strong> ${equipmentHtml}</div>`
              : ''
          }

          <div class="card-footer">
            <span>PhiceCraft Bench Card System</span>
            <span>Train · Play · Improve</span>
          </div>
        </div>
      </div>

      <script>
        ${autoPrint ? "window.addEventListener('load', function() { setTimeout(function() { window.print(); }, 300); });" : ''}
      </script>
    </body>
    </html>
  `;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  }
}
