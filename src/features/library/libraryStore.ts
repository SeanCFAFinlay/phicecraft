// ============================================================================
// FINDING A DRILL
//
// Search, filter and sort over the catalogue. Pure functions on plain data, so
// the rules about what matches what are testable without rendering anything.
//
// The library this replaces was four names in a menu sheet. A coach standing
// on the ice with ten minutes left does not want a list; they want "u11,
// half ice, no goalie, eight minutes" and three cards.
//
// Filters are AND across categories and OR within one: choosing two age bands
// widens the result, choosing an age band AND a rink area narrows it. That is
// what people expect from filter chips, and getting it backwards makes a
// library feel broken in a way that is hard to articulate.
// ============================================================================

import type { DrillTemplate } from '@/data/templates/builder';
import type {
  AgeBand,
  DrillCategory,
  DrillDocumentV3,
  RinkArea,
  SkillLevel,
} from '@/domain/v3/types';

export type LibrarySort = 'featured' | 'newest' | 'shortest' | 'title';

export interface LibraryFilters {
  /** Free text, matched against title, summary and tags. */
  query: string;
  categories: DrillCategory[];
  ageBands: AgeBand[];
  skillLevels: SkillLevel[];
  rinkAreas: RinkArea[];
  /** Only drills that need no goalie. */
  noGoalie: boolean;
  /** Only drills using no equipment beyond pucks. */
  noEquipment: boolean;
  /** Only drills the coach has starred. */
  favouritesOnly: boolean;
  /** Fits in this many minutes. 0 means no limit. */
  maxMinutes: number;
}

export const EMPTY_FILTERS: LibraryFilters = {
  query: '',
  categories: [],
  ageBands: [],
  skillLevels: [],
  rinkAreas: [],
  noGoalie: false,
  noEquipment: false,
  favouritesOnly: false,
  maxMinutes: 0,
};

/** What a card needs, without the whole document. */
export interface LibraryEntry {
  id: string;
  title: string;
  summary: string;
  categories: DrillCategory[];
  tags: string[];
  ageBands: AgeBand[];
  skillLevel: SkillLevel;
  rinkArea: RinkArea;
  durationMinutes: number;
  skaterCount: number;
  goalieCount: number;
  equipmentCount: number;
  isFavourite: boolean;
}

export function toEntry(template: DrillTemplate, favourites: ReadonlySet<string>): LibraryEntry {
  const meta: DrillDocumentV3['metadata'] = template.document.metadata;
  return {
    id: template.id,
    title: meta.title,
    summary: meta.summary,
    categories: meta.categories,
    tags: meta.tags,
    ageBands: meta.ageBands,
    skillLevel: meta.skillLevel,
    rinkArea: meta.rinkArea,
    durationMinutes: meta.durationMinutes,
    skaterCount: meta.skaterCount.max,
    goalieCount: meta.goalieCount,
    equipmentCount: template.document.equipment.length,
    isFavourite: favourites.has(template.id),
  };
}

/**
 * Does this entry match the text?
 *
 * Every word has to appear SOMEWHERE - title, summary, tags, categories or age
 * band. Requiring all the words rather than any of them is what lets "u11
 * passing" mean what it looks like it means.
 */
function matchesQuery(entry: LibraryEntry, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;

  const haystack = [
    entry.title,
    entry.summary,
    ...entry.tags,
    ...entry.categories,
    ...entry.ageBands,
    entry.skillLevel,
    entry.rinkArea,
  ]
    .join(' ')
    .toLowerCase();

  return words.every(word => haystack.includes(word));
}

function overlaps<T>(chosen: T[], has: T[]): boolean {
  if (chosen.length === 0) return true;
  return chosen.some(item => has.includes(item));
}

export function matchesFilters(entry: LibraryEntry, filters: LibraryFilters): boolean {
  if (!matchesQuery(entry, filters.query)) return false;
  if (!overlaps(filters.categories, entry.categories)) return false;
  if (!overlaps(filters.ageBands, entry.ageBands)) return false;
  if (!overlaps(filters.skillLevels, [entry.skillLevel])) return false;
  if (!overlaps(filters.rinkAreas, [entry.rinkArea])) return false;
  if (filters.noGoalie && entry.goalieCount > 0) return false;
  if (filters.noEquipment && entry.equipmentCount > 0) return false;
  if (filters.favouritesOnly && !entry.isFavourite) return false;
  if (filters.maxMinutes > 0 && entry.durationMinutes > filters.maxMinutes) return false;
  return true;
}

/**
 * Featured order.
 *
 * Not random and not alphabetical: a coach opening the library for the first
 * time should land on drills that are easy to run and need little setup, so
 * the order is by how much a session has to be built around them - beginner
 * before elite, less equipment before more, shorter before longer.
 */
function featuredRank(entry: LibraryEntry): number {
  const skill = { beginner: 0, developing: 1, advanced: 2, elite: 3 }[entry.skillLevel];
  return skill * 100 + Math.min(entry.equipmentCount, 9) * 10 + Math.min(entry.durationMinutes, 9);
}

export function sortEntries(entries: LibraryEntry[], sort: LibrarySort): LibraryEntry[] {
  const sorted = [...entries];
  switch (sort) {
    case 'featured':
      return sorted.sort(
        (a, b) => featuredRank(a) - featuredRank(b) || a.title.localeCompare(b.title)
      );
    case 'newest':
      // The catalogue is ordered oldest-first, so newest is its reverse. There
      // are no authored timestamps to sort by, and inventing them would make
      // this look more meaningful than it is.
      return sorted.reverse();
    case 'shortest':
      return sorted.sort(
        (a, b) => a.durationMinutes - b.durationMinutes || a.title.localeCompare(b.title)
      );
    case 'title':
      return sorted.sort((a, b) => a.title.localeCompare(b.title));
  }
}

export interface LibraryQuery {
  templates: DrillTemplate[];
  favourites: ReadonlySet<string>;
  filters: LibraryFilters;
  sort: LibrarySort;
}

export function queryLibrary({ templates, favourites, filters, sort }: LibraryQuery): LibraryEntry[] {
  const entries = templates
    .map(template => toEntry(template, favourites))
    .filter(entry => matchesFilters(entry, filters));

  return sortEntries(entries, sort);
}

/** Every value that actually appears, so a filter never offers an empty result. */
export function availableFacets(templates: DrillTemplate[]) {
  const categories = new Set<DrillCategory>();
  const ageBands = new Set<AgeBand>();
  const rinkAreas = new Set<RinkArea>();
  const skillLevels = new Set<SkillLevel>();

  for (const template of templates) {
    const meta = template.document.metadata;
    meta.categories.forEach(item => categories.add(item));
    meta.ageBands.forEach(item => ageBands.add(item));
    rinkAreas.add(meta.rinkArea);
    skillLevels.add(meta.skillLevel);
  }

  const AGE_ORDER: AgeBand[] = ['u7', 'u9', 'u11', 'u13', 'u15', 'u18', 'adult'];
  const AREA_ORDER: RinkArea[] = ['full', 'half', 'third', 'quarter', 'station'];
  const SKILL_ORDER: SkillLevel[] = ['beginner', 'developing', 'advanced', 'elite'];

  return {
    categories: [...categories].sort(),
    ageBands: AGE_ORDER.filter(item => ageBands.has(item)),
    rinkAreas: AREA_ORDER.filter(item => rinkAreas.has(item)),
    skillLevels: SKILL_ORDER.filter(item => skillLevels.has(item)),
  };
}

/** How many filters are on, for a "clear filters" affordance. */
export function activeFilterCount(filters: LibraryFilters): number {
  return (
    (filters.query.trim() ? 1 : 0) +
    filters.categories.length +
    filters.ageBands.length +
    filters.skillLevels.length +
    filters.rinkAreas.length +
    (filters.noGoalie ? 1 : 0) +
    (filters.noEquipment ? 1 : 0) +
    (filters.favouritesOnly ? 1 : 0) +
    (filters.maxMinutes > 0 ? 1 : 0)
  );
}

/** Add or remove one value from a multi-select filter. */
export function toggleFilterValue<T>(current: T[], value: T): T[] {
  return current.includes(value) ? current.filter(item => item !== value) : [...current, value];
}
