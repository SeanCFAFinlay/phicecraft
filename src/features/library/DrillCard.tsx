// ============================================================================
// A DRILL CARD
//
// What a coach decides from at a glance: what it is, who it suits, how long it
// takes, and what it needs on the ice. The two things they will actually do -
// read more, or use it - are separate, full-size targets rather than one
// ambiguous tap on the card.
// ============================================================================

import { useMemo } from 'react';
import type { LibraryEntry } from './libraryStore';
import { cachedThumbnail } from './thumbnailRenderer';
import { findTemplate } from '@/data/templates/registry';
import { projectToV2 } from '@/domain/v3/projectToV2';

/** Card image size. Wider than tall, because a rink is. */
const THUMB = { width: 400, height: 170 };

const AREA_LABELS: Record<string, string> = {
  full: 'Full ice',
  half: 'Half ice',
  third: 'Third',
  quarter: 'Quarter',
  station: 'Station',
};

function Star({ filled }: { filled: boolean }) {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 3.6l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 17l-5.2 2.8 1-5.9L3.5 9.8l5.9-.8z" />
    </svg>
  );
}

export interface DrillCardProps {
  entry: LibraryEntry;
  onOpen: () => void;
  onToggleFavourite: () => void;
  onUse: () => void;
}

export function DrillCard({ entry, onOpen, onToggleFavourite, onUse }: DrillCardProps) {
  // Drawn once per drill and cached. Null in an environment with no canvas, in
  // which case the card falls back to its words.
  const thumbnail = useMemo(() => {
    const template = findTemplate(entry.id);
    if (!template) return null;
    return cachedThumbnail(entry.id, projectToV2(template.document).drill, THUMB);
  }, [entry.id]);

  const needs = [
    `${entry.skaterCount} skater${entry.skaterCount === 1 ? '' : 's'}`,
    entry.goalieCount > 0 ? `${entry.goalieCount} goalie` : 'no goalie',
    entry.equipmentCount > 0 ? `${entry.equipmentCount} pieces` : 'pucks only',
  ].join(' · ');

  return (
    <article className="flex h-full flex-col rounded-2xl border border-app-border bg-white/5 p-3">
      <div className="flex items-start gap-2">
        <h3 className="min-w-0 flex-1 text-[15px] font-black leading-snug text-app-text">
          {entry.title}
        </h3>
        <button
          type="button"
          onClick={onToggleFavourite}
          aria-pressed={entry.isFavourite}
          aria-label={entry.isFavourite ? `Unstar ${entry.title}` : `Star ${entry.title}`}
          className={`touch-target -mr-1 -mt-1 flex shrink-0 items-center justify-center rounded-xl ${
            entry.isFavourite ? 'text-app-gold' : 'text-white/35 hover:text-white/60'
          }`}
        >
          <Star filled={entry.isFavourite} />
        </button>
      </div>

      {thumbnail && (
        <img
          src={thumbnail}
          // Decorative: the title, summary and tags below already say what the
          // drill is, so describing the diagram again is noise to a screen
          // reader rather than information.
          alt=""
          width={THUMB.width}
          height={THUMB.height}
          className="mt-2 w-full rounded-xl border border-app-border bg-white"
        />
      )}

      <p className="mt-2 line-clamp-3 text-[13px] leading-snug text-white/60">{entry.summary}</p>

      <div className="mt-2 flex flex-wrap gap-1">
        <span className="rounded-full bg-app-cyan/12 px-2 py-0.5 text-[11px] font-bold text-app-cyan">
          {AREA_LABELS[entry.rinkArea] ?? entry.rinkArea}
        </span>
        <span className="rounded-full bg-white/8 px-2 py-0.5 text-[11px] font-bold text-white/65">
          {entry.durationMinutes} min
        </span>
        {entry.ageBands.slice(0, 3).map(band => (
          <span
            key={band}
            className="rounded-full bg-white/8 px-2 py-0.5 text-[11px] font-bold uppercase text-white/65"
          >
            {band}
          </span>
        ))}
      </div>

      <p className="mt-1.5 text-[11px] text-white/40">{needs}</p>

      <div className="mt-3 flex gap-1.5 pt-1">
        <button
          type="button"
          onClick={onOpen}
          className="touch-target flex-1 rounded-xl border border-app-border bg-white/5 px-3 text-[13px] font-bold text-app-text hover:bg-white/10"
        >
          Details
        </button>
        <button
          type="button"
          onClick={onUse}
          className="touch-target flex-1 rounded-xl border border-app-cyan bg-app-cyan/15 px-3 text-[13px] font-bold text-app-cyan"
        >
          Use drill
        </button>
      </div>
    </article>
  );
}
