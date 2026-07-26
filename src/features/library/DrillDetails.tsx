// ============================================================================
// DRILL DETAILS
//
// Everything a coach needs to run the drill without having invented it: how to
// set it up, what to look for, how to make it harder, and how to make it
// easier. A library that only lists names is a list, not a resource.
// ============================================================================

import { Sheet } from '@/components/a11y/Sheet';
import { SheetSection } from '@/components/sheets/QuickSheets';
import type { DrillTemplate } from '@/data/templates/builder';

function Points({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <SheetSection title={title}>
      <ul className="flex list-disc flex-col gap-1.5 px-7 pb-2 text-[13px] leading-snug text-white/70">
        {items.map(item => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </SheetSection>
  );
}

export interface DrillDetailsProps {
  template: DrillTemplate;
  isFavourite: boolean;
  onToggleFavourite: () => void;
  onUse: () => void;
  onClose: () => void;
}

export function DrillDetails({
  template,
  isFavourite,
  onToggleFavourite,
  onUse,
  onClose,
}: DrillDetailsProps) {
  const meta = template.document.metadata;
  const equipment = template.document.equipment;

  const facts: [string, string][] = [
    ['Rink area', meta.rinkArea],
    ['Duration', `${meta.durationMinutes} min`],
    ['Skaters', String(meta.skaterCount.max)],
    ['Goalies', String(meta.goalieCount)],
    ['Level', meta.skillLevel],
    ['Ages', meta.ageBands.map(band => band.toUpperCase()).join(', ') || '—'],
  ];

  return (
    <Sheet
      open
      title={meta.title}
      description={meta.summary}
      onClose={onClose}
      footer={
        <div className="flex gap-1.5 px-3 py-2">
          <button
            type="button"
            onClick={onToggleFavourite}
            aria-pressed={isFavourite}
            className={`touch-target rounded-xl border px-3 text-[13px] font-bold ${
              isFavourite
                ? 'border-app-gold/50 bg-app-gold/12 text-app-gold'
                : 'border-app-border bg-white/5 text-white/65'
            }`}
          >
            {isFavourite ? 'Starred' : 'Star'}
          </button>
          <button
            type="button"
            onClick={onUse}
            className="touch-target flex-1 rounded-xl border border-app-cyan bg-app-cyan/15 px-3 text-[13px] font-black text-app-cyan"
          >
            Use this drill
          </button>
        </div>
      }
    >
      <SheetSection title="At a glance">
        <dl className="grid grid-cols-2 gap-1.5 px-3 pb-2">
          {facts.map(([label, value]) => (
            <div key={label} className="rounded-xl bg-white/5 px-3 py-2">
              <dt className="text-[11px] uppercase tracking-wide text-white/40">{label}</dt>
              <dd className="text-[13px] font-bold capitalize text-app-text">{value}</dd>
            </div>
          ))}
        </dl>
      </SheetSection>

      <Points title="Setup" items={meta.setupNotes} />
      <Points title="Coaching points" items={meta.coachingPoints} />

      {equipment.length > 0 && (
        <SheetSection title="Equipment">
          <p className="px-3 pb-2 text-[13px] leading-snug text-white/70">
            {meta.equipmentSummary.join(', ') || `${equipment.length} pieces on the ice`}
          </p>
        </SheetSection>
      )}

      <Points title="Progressions" items={meta.progressions} />
      <Points title="Variations" items={meta.variations} />

      <SheetSection title="Source">
        <p className="px-3 pb-3 text-[12px] leading-snug text-white/45">
          {meta.source
            ? `${meta.source.author} · ${meta.source.license}`
            : 'No source recorded for this drill.'}
        </p>
      </SheetSection>
    </Sheet>
  );
}
