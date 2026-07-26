// ============================================================================
// THE DRILL LIBRARY
//
// A full-screen surface, because finding a drill is a task in its own right
// rather than a menu item. It used to be four names in the menu sheet.
//
// The layout is one column on a phone, two on a tablet, three on a desktop -
// the coach on the ice gets big cards they can hit with a glove on, and the
// coach at a laptop gets the overview.
// ============================================================================

import { useMemo, useState } from 'react';
import { Sheet } from '@/components/a11y/Sheet';
import { useAppState, useCommands } from '@/hooks/useAppState';
import { DRILL_TEMPLATES, findTemplate } from '@/data/templates/registry';
import {
  EMPTY_FILTERS,
  activeFilterCount,
  availableFacets,
  queryLibrary,
  toggleFilterValue,
  type LibraryFilters,
  type LibrarySort,
} from './libraryStore';
import { useFavourites } from './useFavourites';
import { DrillCard } from './DrillCard';
import { DrillDetails } from './DrillDetails';

const SORTS: { value: LibrarySort; label: string }[] = [
  { value: 'featured', label: 'Featured' },
  { value: 'newest', label: 'Newest' },
  { value: 'shortest', label: 'Shortest' },
  { value: 'title', label: 'A–Z' },
];

const AREA_LABELS: Record<string, string> = {
  full: 'Full ice',
  half: 'Half ice',
  third: 'Third',
  quarter: 'Quarter',
  station: 'Station',
};

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`touch-target shrink-0 rounded-full border px-3 text-[12px] font-bold transition-colors ${
        active
          ? 'border-app-cyan bg-app-cyan/15 text-app-cyan'
          : 'border-app-border bg-white/5 text-white/60 hover:bg-white/10'
      }`}
    >
      {children}
    </button>
  );
}

export function LibraryPage() {
  const { state, dispatch } = useAppState();
  const commands = useCommands();
  const { favourites, toggle } = useFavourites();

  const [filters, setFilters] = useState<LibraryFilters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<LibrarySort>('featured');
  const [openId, setOpenId] = useState<string | null>(null);

  const open = state.ui.openSheet === 'library';
  const close = () => {
    dispatch({ type: 'CLOSE_SHEET' });
    setOpenId(null);
  };

  const facets = useMemo(() => availableFacets(DRILL_TEMPLATES), []);
  const entries = useMemo(
    () => queryLibrary({ templates: DRILL_TEMPLATES, favourites, filters, sort }),
    [favourites, filters, sort]
  );

  const activeCount = activeFilterCount(filters);
  const openTemplate = openId ? findTemplate(openId) : null;

  const patch = (changes: Partial<LibraryFilters>) =>
    setFilters(current => ({ ...current, ...changes }));

  return (
    <>
      <Sheet
        open={open && !openTemplate}
        title="Drill library"
        description={`${entries.length} of ${DRILL_TEMPLATES.length} drills`}
        onClose={close}
        size="full"
      >
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-3 pb-4">
          <label className="block">
            <span className="sr-only">Search drills</span>
            <input
              type="search"
              value={filters.query}
              onChange={event => patch({ query: event.target.value })}
              placeholder="Search drills, tags or age groups"
              className="touch-target w-full rounded-xl border border-app-border bg-white/5 px-3 text-[14px] text-app-text placeholder:text-white/35"
            />
          </label>

          <div
            className="flex items-center gap-1.5 overflow-x-auto pb-1"
            role="group"
            aria-label="Sort drills"
          >
            {SORTS.map(option => (
              <Chip key={option.value} active={sort === option.value} onClick={() => setSort(option.value)}>
                {option.label}
              </Chip>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by age group">
            {facets.ageBands.map(band => (
              <Chip
                key={band}
                active={filters.ageBands.includes(band)}
                onClick={() => patch({ ageBands: toggleFilterValue(filters.ageBands, band) })}
              >
                {band.toUpperCase()}
              </Chip>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by rink area">
            {facets.rinkAreas.map(area => (
              <Chip
                key={area}
                active={filters.rinkAreas.includes(area)}
                onClick={() => patch({ rinkAreas: toggleFilterValue(filters.rinkAreas, area) })}
              >
                {AREA_LABELS[area] ?? area}
              </Chip>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by requirements">
            <Chip active={filters.noGoalie} onClick={() => patch({ noGoalie: !filters.noGoalie })}>
              No goalie
            </Chip>
            <Chip
              active={filters.noEquipment}
              onClick={() => patch({ noEquipment: !filters.noEquipment })}
            >
              No equipment
            </Chip>
            <Chip
              active={filters.maxMinutes === 8}
              onClick={() => patch({ maxMinutes: filters.maxMinutes === 8 ? 0 : 8 })}
            >
              8 min or less
            </Chip>
            <Chip
              active={filters.favouritesOnly}
              onClick={() => patch({ favouritesOnly: !filters.favouritesOnly })}
            >
              Starred
            </Chip>
            {activeCount > 0 && (
              <Chip active={false} onClick={() => setFilters(EMPTY_FILTERS)}>
                Clear {activeCount}
              </Chip>
            )}
          </div>

          {entries.length === 0 ? (
            <p className="px-1 py-8 text-center text-[13px] text-white/50">
              Nothing matches those filters. Try clearing one.
            </p>
          ) : (
            <ul className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {entries.map(entry => (
                <li key={entry.id}>
                  <DrillCard
                    entry={entry}
                    onOpen={() => setOpenId(entry.id)}
                    onToggleFavourite={() => toggle(entry.id)}
                    onUse={() => void commands.useTemplate(entry.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </Sheet>

      {openTemplate && (
        <DrillDetails
          template={openTemplate}
          isFavourite={favourites.has(openTemplate.id)}
          onToggleFavourite={() => toggle(openTemplate.id)}
          onUse={() => {
            void commands.useTemplate(openTemplate.id);
            setOpenId(null);
          }}
          onClose={() => setOpenId(null)}
        />
      )}
    </>
  );
}
