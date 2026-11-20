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
  COLLECTIONS,
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

const CATEGORY_LABELS: Record<string, string> = {
  'power-play': 'Power Play',
  'penalty-kill': 'Penalty Kill',
  'breakout': 'Breakout',
  'rush': 'Rush',
  'forecheck': 'Forecheck',
  'defensive-zone': 'D-Zone',
  'passing': 'Passing',
  'shooting': 'Shooting',
  'small-area-game': 'Small Area',
  'transition': 'Transition',
  'skating': 'Skating',
  'puck-handling': 'Puck Handling',
  'warm-up': 'Warm-Up',
  'goalie': 'Goalie',
  'battle': 'Battle',
  'conditioning': 'Conditioning',
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
  const [showFilters, setShowFilters] = useState(false);

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
  // What the "Filters" button is hiding: everything except the search box,
  // the shelf and the star, which stay on screen and show their own state.
  const hiddenCount =
    filters.categories.length +
    filters.ageBands.length +
    filters.rinkAreas.length +
    (filters.noGoalie ? 1 : 0) +
    (filters.noEquipment ? 1 : 0) +
    (filters.maxMinutes > 0 ? 1 : 0);
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
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-3 pb-16 safe-bottom">
          <div className="hidden items-center gap-3.5 rounded-2xl border border-app-border bg-gradient-to-r from-white/[0.05] to-white/[0.02] p-3 shadow-sm lg:flex">
            <img
              src="/assets/ph-logo.webp"
              alt=""
              width={40}
              height={40}
              className="h-10 w-10 shrink-0 rounded-xl object-contain shadow-sm ring-1 ring-app-cyan/30"
              draggable={false}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[15px] font-black tracking-wider text-white">
                  PH<span className="text-app-cyan">ORMATION</span> PLAYBOOK
                </span>
                <span className="rounded-full border border-app-cyan/30 bg-app-cyan/15 px-2 py-0.5 text-[9.5px] font-black tracking-widest text-app-cyan uppercase">
                  Train · Play · Improve
                </span>
              </div>
              <p className="mt-0.5 text-[12px] text-white/60">
                Official tactical systems, skill progressions and team drills for practices and game plans.
              </p>
            </div>
          </div>

          <label className="block">
            <span className="sr-only">Search drills</span>
            <input
              type="search"
              value={filters.query}
              onChange={event => patch({ query: event.target.value })}
              placeholder="Search drills, tags or age groups"
              className="touch-target w-full rounded-xl border border-app-border bg-white/5 px-3 text-[16px] sm:text-[14px] text-app-text placeholder:text-white/35"
            />
          </label>

          {/* The shelves: what a coach came for, one tap, no filter arithmetic. */}
          <div
            className="-mx-3 flex items-center gap-1.5 overflow-x-auto px-3 pb-1"
            role="group"
            aria-label="Collections"
          >
            <Chip active={filters.collection === null} onClick={() => patch({ collection: null })}>
              All drills
            </Chip>
            {COLLECTIONS.map(collection => (
              <Chip
                key={collection.id}
                active={filters.collection === collection.id}
                onClick={() =>
                  patch({ collection: filters.collection === collection.id ? null : collection.id })
                }
              >
                {collection.label}
              </Chip>
            ))}
            <Chip
              active={filters.favouritesOnly}
              onClick={() => patch({ favouritesOnly: !filters.favouritesOnly })}
            >
              Starred
            </Chip>
          </div>

          <div className="-mx-3 flex items-center gap-1.5 overflow-x-auto px-3 pb-1">
            <button
              type="button"
              onClick={() => setShowFilters(current => !current)}
              aria-expanded={showFilters}
              aria-controls="library-filters"
              className={`touch-target shrink-0 rounded-full border px-3.5 text-[12px] font-black transition-colors ${
                showFilters || hiddenCount > 0
                  ? 'border-app-cyan bg-app-cyan/15 text-app-cyan'
                  : 'border-app-border bg-white/10 text-white/80 hover:bg-white/15'
              }`}
            >
              {hiddenCount > 0 ? `Filters · ${hiddenCount}` : 'Filters'}
              <span aria-hidden="true" className="ml-1.5">
                {showFilters ? '▴' : '▾'}
              </span>
            </button>
            {activeCount > 0 && (
              <Chip active={false} onClick={() => setFilters(EMPTY_FILTERS)}>
                Clear {activeCount}
              </Chip>
            )}
            <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-white/15" />
            <div className="flex items-center gap-1.5" role="group" aria-label="Sort drills">
              {SORTS.map(option => (
                <Chip key={option.value} active={sort === option.value} onClick={() => setSort(option.value)}>
                  {option.label}
                </Chip>
              ))}
            </div>
          </div>

          <div
            id="library-filters"
            hidden={!showFilters}
            className={`flex-col gap-3 rounded-2xl border border-app-border bg-white/[0.03] p-3 ${
              showFilters ? 'flex' : ''
            }`}
          >
          {facets.categories.length > 0 && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by category">
              {facets.categories.map(cat => (
                <Chip
                  key={cat}
                  active={filters.categories.includes(cat)}
                  onClick={() => patch({ categories: toggleFilterValue(filters.categories, cat) })}
                >
                  {CATEGORY_LABELS[cat] ?? cat}
                </Chip>
              ))}
            </div>
          )}

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
          </div>
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
