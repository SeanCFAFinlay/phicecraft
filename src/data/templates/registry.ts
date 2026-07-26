// ============================================================================
// THE TEMPLATE CATALOGUE
//
// Every drill the product ships with. Templates are IMMUTABLE: using one
// creates a user-owned copy with fresh ids, so a coach editing "Gates Passing
// Game" cannot change what the next coach sees.
//
// The library used to be four examples hiding in the menu sheet, with metadata
// consisting of an id, a name and a modification time - not something a coach
// could search, filter, or decide from. Every template here carries the
// metadata a library needs and the coaching content that makes it usable at a
// rink: setup, coaching points, progressions and variations.
//
// All content is FIRST-PARTY. The market review lists drill names as a
// starting point; none of the diagrams or descriptions here are copied from a
// third-party source, and `metadata.source` records that on each one.
// ============================================================================

import type { DrillTemplate } from './builder';
import { PASSING_TEMPLATES } from './passing';

export const DRILL_TEMPLATES: DrillTemplate[] = [...PASSING_TEMPLATES];

const BY_ID = new Map(DRILL_TEMPLATES.map(item => [item.id, item]));

export function findTemplate(id: string): DrillTemplate | null {
  return BY_ID.get(id) ?? null;
}
