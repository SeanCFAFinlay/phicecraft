// ============================================================================
// FINDING A DRILL
//
// These run against the REAL catalogue, not fixtures, because the thing worth
// checking is that a coach can actually find something in it. A filter that
// works on invented data and returns nothing from the shipped drills is a
// filter that fails at a rink.
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  EMPTY_FILTERS,
  activeFilterCount,
  availableFacets,
  matchesFilters,
  queryLibrary,
  sortEntries,
  toEntry,
  toggleFilterValue,
  type LibraryFilters,
} from './libraryStore';
import { DRILL_TEMPLATES } from '@/data/templates/registry';

const NO_FAVOURITES = new Set<string>();

function run(overrides: Partial<LibraryFilters> = {}, sort: 'featured' | 'newest' | 'shortest' | 'title' = 'featured') {
  return queryLibrary({
    templates: DRILL_TEMPLATES,
    favourites: NO_FAVOURITES,
    filters: { ...EMPTY_FILTERS, ...overrides },
    sort,
  });
}

// ----------------------------------------------------------------------------

describe('no filters', () => {
  it('returns the whole catalogue', () => {
    expect(run()).toHaveLength(DRILL_TEMPLATES.length);
  });

  it('gives every entry what a card needs', () => {
    for (const entry of run()) {
      expect(entry.title.length).toBeGreaterThan(3);
      expect(entry.durationMinutes).toBeGreaterThan(0);
      expect(entry.skaterCount).toBeGreaterThan(0);
      expect(Array.isArray(entry.tags)).toBe(true);
    }
  });
});

// ----------------------------------------------------------------------------

describe('search', () => {
  it('finds a drill by a word in its title', () => {
    const results = run({ query: 'backcheck' });
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(entry => entry.title.toLowerCase().includes('backcheck'))).toBe(true);
  });

  it('finds a drill by a tag', () => {
    expect(run({ query: 'pivot' }).length).toBeGreaterThan(0);
  });

  it('finds a drill by its age band', () => {
    expect(run({ query: 'u11' }).length).toBeGreaterThan(0);
  });

  it('requires ALL the words, not any of them', () => {
    // "u11 passing" should mean what it looks like it means. Matching on ANY
    // word would return most of the catalogue for almost any input.
    const both = run({ query: 'u11 passing' });
    const passing = run({ query: 'passing' });
    expect(both.length).toBeLessThanOrEqual(passing.length);
    expect(both.length).toBeGreaterThan(0);
  });

  it('ignores case and stray whitespace', () => {
    expect(run({ query: '  BACKCHECK  ' }).length).toBe(run({ query: 'backcheck' }).length);
  });

  it('returns nothing for a word that is not there', () => {
    expect(run({ query: 'zamboni curling' })).toEqual([]);
  });
});

// ----------------------------------------------------------------------------

describe('filters', () => {
  it('narrows by category', () => {
    const results = run({ categories: ['small-area-game'] });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(entry => entry.categories.includes('small-area-game'))).toBe(true);
  });

  it('WIDENS when a second value is added to the same filter', () => {
    const one = run({ categories: ['small-area-game'] });
    const two = run({ categories: ['small-area-game', 'transition'] });
    expect(two.length).toBeGreaterThan(one.length);
  });

  it('NARROWS when a different filter is added', () => {
    const wide = run({ categories: ['transition'] });
    const narrow = run({ categories: ['transition'], rinkAreas: ['full'] });
    expect(narrow.length).toBeLessThanOrEqual(wide.length);
    expect(narrow.every(entry => entry.rinkArea === 'full')).toBe(true);
  });

  it('finds the drills that need no goalie', () => {
    const results = run({ noGoalie: true });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(entry => entry.goalieCount === 0)).toBe(true);
  });

  it('finds the drills that need no equipment', () => {
    const results = run({ noEquipment: true });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(entry => entry.equipmentCount === 0)).toBe(true);
  });

  it('finds drills that fit the time left in a session', () => {
    const results = run({ maxMinutes: 8 });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(entry => entry.durationMinutes <= 8)).toBe(true);
  });

  it('filters by age band', () => {
    const results = run({ ageBands: ['u9'] });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(entry => entry.ageBands.includes('u9'))).toBe(true);
  });

  it('filters by skill level', () => {
    const results = run({ skillLevels: ['beginner'] });
    expect(results.every(entry => entry.skillLevel === 'beginner')).toBe(true);
  });

  it('answers a real question a coach would ask', () => {
    // "Ten minutes left, u11, half ice or smaller, no goalie."
    const results = run({
      ageBands: ['u11'],
      rinkAreas: ['half', 'third', 'quarter'],
      noGoalie: true,
      maxMinutes: 10,
    });

    expect(results.length, 'the catalogue can answer this').toBeGreaterThan(0);
    for (const entry of results) {
      expect(entry.ageBands).toContain('u11');
      expect(entry.goalieCount).toBe(0);
      expect(entry.durationMinutes).toBeLessThanOrEqual(10);
    }
  });
});

// ----------------------------------------------------------------------------

describe('favourites', () => {
  it('shows only starred drills when asked', () => {
    const starred = new Set([DRILL_TEMPLATES[0].id, DRILL_TEMPLATES[3].id]);
    const results = queryLibrary({
      templates: DRILL_TEMPLATES,
      favourites: starred,
      filters: { ...EMPTY_FILTERS, favouritesOnly: true },
      sort: 'title',
    });

    expect(results).toHaveLength(2);
    expect(results.every(entry => entry.isFavourite)).toBe(true);
  });

  it('marks the starred ones even when not filtering', () => {
    const starred = new Set([DRILL_TEMPLATES[1].id]);
    const entry = toEntry(DRILL_TEMPLATES[1], starred);
    expect(entry.isFavourite).toBe(true);
    expect(toEntry(DRILL_TEMPLATES[2], starred).isFavourite).toBe(false);
  });
});

// ----------------------------------------------------------------------------

describe('sorting', () => {
  it('puts the easiest drills to run first when featured', () => {
    const results = run({}, 'featured');
    // Beginner drills with little setup lead, so a coach opening the library
    // for the first time is not met with an elite full-ice system drill.
    expect(results[0].skillLevel).toBe('beginner');
  });

  it('orders by duration when shortest', () => {
    const results = run({}, 'shortest');
    for (let index = 1; index < results.length; index++) {
      expect(results[index].durationMinutes).toBeGreaterThanOrEqual(
        results[index - 1].durationMinutes
      );
    }
  });

  it('orders alphabetically by title', () => {
    const results = run({}, 'title');
    const titles = results.map(entry => entry.title);
    expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b)));
  });

  it('does not lose or duplicate entries', () => {
    for (const sort of ['featured', 'newest', 'shortest', 'title'] as const) {
      const results = run({}, sort);
      expect(results, sort).toHaveLength(DRILL_TEMPLATES.length);
      expect(new Set(results.map(entry => entry.id)).size, sort).toBe(DRILL_TEMPLATES.length);
    }
  });

  it('does not mutate the array it was given', () => {
    const entries = DRILL_TEMPLATES.map(template => toEntry(template, NO_FAVOURITES));
    const before = entries.map(entry => entry.id);
    sortEntries(entries, 'title');
    expect(entries.map(entry => entry.id)).toEqual(before);
  });
});

// ----------------------------------------------------------------------------

describe('facets', () => {
  it('offers only values that actually appear', () => {
    const facets = availableFacets(DRILL_TEMPLATES);

    for (const category of facets.categories) {
      expect(run({ categories: [category] }).length, category).toBeGreaterThan(0);
    }
    for (const band of facets.ageBands) {
      expect(run({ ageBands: [band] }).length, band).toBeGreaterThan(0);
    }
    for (const area of facets.rinkAreas) {
      expect(run({ rinkAreas: [area] }).length, area).toBeGreaterThan(0);
    }
  });

  it('orders age bands youngest first, not alphabetically', () => {
    // Alphabetical would put u11 before u9, which reads as an error.
    const bands = availableFacets(DRILL_TEMPLATES).ageBands;
    expect(bands.indexOf('u9')).toBeLessThan(bands.indexOf('u11'));
    expect(bands.indexOf('u13')).toBeLessThan(bands.indexOf('u15'));
  });
});

// ----------------------------------------------------------------------------

describe('filter bookkeeping', () => {
  it('counts what is switched on', () => {
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
    expect(
      activeFilterCount({ ...EMPTY_FILTERS, query: 'rush', ageBands: ['u11', 'u13'], noGoalie: true })
    ).toBe(4);
  });

  it('ignores a query that is only whitespace', () => {
    expect(activeFilterCount({ ...EMPTY_FILTERS, query: '   ' })).toBe(0);
  });

  it('toggles a value on and back off', () => {
    expect(toggleFilterValue<string>([], 'a')).toEqual(['a']);
    expect(toggleFilterValue(['a', 'b'], 'a')).toEqual(['b']);
  });
});

// ----------------------------------------------------------------------------

describe('matchesFilters directly', () => {
  it('accepts everything with empty filters', () => {
    const entry = toEntry(DRILL_TEMPLATES[0], NO_FAVOURITES);
    expect(matchesFilters(entry, EMPTY_FILTERS)).toBe(true);
  });
});
