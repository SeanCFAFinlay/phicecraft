// ============================================================================
// PRINTABLE PLAYER CARDS
//
// One card per player - "your job in this drill" - laid out two to a row so a
// coach can print, cut and hand them out on the bench. Each card carries the
// drill diagram, where the player starts, their jobs in order, and their cues.
// ============================================================================

import type { Drill } from '@/core/types';
import { jerseyColor } from '@/core/types';
import { renderThumbnail } from '@/features/library/thumbnailRenderer';
import type { DrillStory, PlayerCard } from './drillStory';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function playerCardsHtml(drill: Drill, story: DrillStory, playerIds?: string[]): string {
  let diagram = '';
  try {
    const thumb = renderThumbnail(drill, { width: 300, height: 128, scale: 2 });
    if (thumb) diagram = `<img class="diagram" src="${thumb}" alt="Drill diagram" />`;
  } catch {
    // The cards still work without a picture.
  }

  const chosen = playerIds ? story.players.filter(card => playerIds.includes(card.playerId)) : story.players;
  const card = (item: PlayerCard) => `
    <section class="card">
      <header style="border-color:${jerseyColor(item.team, drill.settings)}">
        <span class="number" style="background:${jerseyColor(item.team, drill.settings)}">#${escapeHtml(item.number)}</span>
        <div>
          <div class="who">${escapeHtml(item.name || item.role)}</div>
          <div class="team">${escapeHtml(item.teamName)} · ${escapeHtml(item.role)}</div>
        </div>
      </header>
      <div class="drill">${escapeHtml(story.title)}</div>
      ${diagram}
      <p class="start"><strong>Start:</strong> ${escapeHtml(item.start)}</p>
      <ol>${item.duties.map(duty => `<li><span class="t">${duty.atSeconds.toFixed(1)}s</span> ${escapeHtml(duty.text)}</li>`).join('')}</ol>
      <div class="cues"><strong>Remember:</strong> ${item.cues.map(escapeHtml).join(' ')}</div>
    </section>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<title>${escapeHtml(story.title)} - player cards</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, Segoe UI, sans-serif; margin: 16px; color: #0f172a; }
  .bar { display: flex; gap: 8px; margin-bottom: 12px; }
  .bar button { font: inherit; font-weight: 700; padding: 8px 14px; border-radius: 8px; border: 1px solid #94a3b8; background: #f1f5f9; cursor: pointer; }
  .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
  .card { border: 2px dashed #94a3b8; border-radius: 12px; padding: 12px; break-inside: avoid; page-break-inside: avoid; }
  header { display: flex; align-items: center; gap: 10px; border-left: 6px solid; padding-left: 8px; }
  .number { color: #fff; font-weight: 900; font-size: 22px; border-radius: 8px; padding: 4px 10px; text-shadow: 0 1px 2px #0006; }
  .who { font-weight: 800; font-size: 17px; }
  .team { font-size: 12px; color: #475569; }
  .drill { margin-top: 8px; font-size: 12px; font-weight: 700; color: #334155; text-transform: uppercase; letter-spacing: .04em; }
  .diagram { width: 100%; margin-top: 6px; border-radius: 6px; border: 1px solid #cbd5e1; }
  .start { margin: 8px 0 4px; font-size: 13px; }
  ol { margin: 0; padding-left: 20px; font-size: 13.5px; line-height: 1.45; }
  .t { display: inline-block; min-width: 38px; font-variant-numeric: tabular-nums; color: #64748b; font-size: 11.5px; }
  .cues { margin-top: 8px; font-size: 12.5px; background: #f1f5f9; border-radius: 8px; padding: 6px 8px; }
  @media print { .bar { display: none; } body { margin: 8mm; } }
  @media (max-width: 640px) { .grid { grid-template-columns: 1fr; } }
</style></head>
<body>
  <div class="bar"><button onclick="window.print()">Print / Save PDF</button><button onclick="window.close()">Close</button></div>
  <div class="grid">${chosen.map(card).join('')}</div>
</body></html>`;
}

/** Opens the cards in a new tab, ready to print. False when pop-ups are blocked. */
export function printPlayerCards(drill: Drill, story: DrillStory, playerIds?: string[]): boolean {
  if (typeof window === 'undefined') return false;
  const printWindow = window.open('', '_blank');
  if (!printWindow) return false;
  printWindow.document.open();
  printWindow.document.write(playerCardsHtml(drill, story, playerIds));
  printWindow.document.close();
  return true;
}
