// ============================================================================
// OFFLINE DRILL RECOMMENDATION ENGINE
//
// Fast, deterministic, 100% offline coaching recommendation system.
// Scores and ranks drills based on coaching criteria:
// - Age band and development level fit
// - Rink area / available ice footprint
// - Goalie and player attendance constraints
// - Equipment availability
// - Target practice focus and category alignment
// Provides transparent scoring breakdowns and reason badges for coach confidence.
// ============================================================================

import type {
  AgeBand,
  DrillCategory,
  DrillDocumentV3,
  RinkArea,
  SkillLevel,
} from '@/domain/v3/types';

export interface RecommendationCriteria {
  /** Target team age band */
  ageBand?: AgeBand;
  /** Team skill / competition level */
  skillLevel?: SkillLevel;
  /** Available sheet size on ice */
  rinkArea?: RinkArea;
  /** Goalie attendance count (0 = no goalie today) */
  goalieCount?: number;
  /** Approximate skater count attending */
  skaterCount?: number;
  /** Max duration in minutes for this drill slot */
  maxMinutes?: number;
  /** Primary focus categories */
  categories?: DrillCategory[];
  /** Search keywords or focus text */
  query?: string;
  /** Equipment kinds that coach does NOT have */
  excludedEquipment?: string[];
  /** Strict filter: exclude drills requiring more goalies than available */
  strictGoalies?: boolean;
}

export interface ScoreFactor {
  label: string;
  points: number;
  isPositive: boolean;
}

export interface DrillRecommendation {
  drill: DrillDocumentV3;
  score: number;
  matchPercentage: number;
  factors: ScoreFactor[];
  reasons: string[];
}

const AGE_WEIGHTS: Record<AgeBand, number> = {
  u7: 1,
  u9: 2,
  u11: 3,
  u13: 4,
  u15: 5,
  u18: 6,
  adult: 7,
};

const SKILL_WEIGHTS: Record<SkillLevel, number> = {
  beginner: 1,
  developing: 2,
  advanced: 3,
  elite: 4,
};

export function scoreDrill(
  drill: DrillDocumentV3,
  criteria: RecommendationCriteria
): DrillRecommendation | null {
  const meta = drill.metadata;
  const factors: ScoreFactor[] = [];
  let score = 40;
  factors.push({ label: 'Core tactical drill', points: 40, isPositive: true });
  const maxPossibleScore = 100;

  // 1. Strict Goalie Filter
  if (criteria.strictGoalies && criteria.goalieCount !== undefined) {
    if (meta.goalieCount > criteria.goalieCount) {
      return null; // Excluded by hard constraint
    }
  }

  // 2. Goalie Suitability
  if (criteria.goalieCount !== undefined) {
    if (criteria.goalieCount === 0) {
      if (meta.goalieCount === 0) {
        score += 25;
        factors.push({ label: 'No goalie needed (Perfect for no-goalie practice)', points: 25, isPositive: true });
      } else {
        score -= 30;
        factors.push({ label: `Requires ${meta.goalieCount} goalie(s) (None available)`, points: -30, isPositive: false });
      }
    } else {
      if (meta.goalieCount === criteria.goalieCount) {
        score += 20;
        factors.push({ label: `Matches exact goalie count (${criteria.goalieCount})`, points: 20, isPositive: true });
      } else if (meta.goalieCount <= criteria.goalieCount) {
        score += 10;
        factors.push({ label: `Fits within available goalies (${meta.goalieCount} / ${criteria.goalieCount})`, points: 10, isPositive: true });
      }
    }
  }

  // 3. Rink Area Fit
  if (criteria.rinkArea) {
    if (meta.rinkArea === criteria.rinkArea) {
      score += 25;
      factors.push({ label: `Matches target ice footprint (${criteria.rinkArea})`, points: 25, isPositive: true });
    } else {
      // Station drills fit well on half or third ice
      const areaFit =
        (criteria.rinkArea === 'half' && meta.rinkArea === 'station') ||
        (criteria.rinkArea === 'third' && meta.rinkArea === 'station');
      if (areaFit) {
        score += 15;
        factors.push({ label: `Station activity fits on ${criteria.rinkArea} ice`, points: 15, isPositive: true });
      } else if (criteria.rinkArea === 'half' && meta.rinkArea === 'full') {
        score -= 25;
        factors.push({ label: 'Full ice drill does not fit half-sheet allotment', points: -25, isPositive: false });
      }
    }
  }

  // 4. Age Band Match
  if (criteria.ageBand) {
    if (meta.ageBands.includes(criteria.ageBand)) {
      score += 20;
      factors.push({ label: `Designed for ${criteria.ageBand.toUpperCase()} age group`, points: 20, isPositive: true });
    } else {
      // Check distance in age
      const targetWeight = AGE_WEIGHTS[criteria.ageBand];
      const closestWeight = Math.min(
        ...meta.ageBands.map(b => Math.abs(AGE_WEIGHTS[b] - targetWeight))
      );
      if (closestWeight === 1) {
        score += 10;
        factors.push({ label: `Adjacent age band (${meta.ageBands.join(', ').toUpperCase()})`, points: 10, isPositive: true });
      } else {
        score -= 15;
        factors.push({ label: `Age mismatch (${meta.ageBands.join(', ').toUpperCase()})`, points: -15, isPositive: false });
      }
    }
  }

  // 5. Skill Level Match
  if (criteria.skillLevel) {
    if (meta.skillLevel === criteria.skillLevel) {
      score += 15;
      factors.push({ label: `Matches ${criteria.skillLevel} skill level`, points: 15, isPositive: true });
    } else {
      const diff = Math.abs(SKILL_WEIGHTS[meta.skillLevel] - SKILL_WEIGHTS[criteria.skillLevel]);
      if (diff === 1) {
        score += 5;
        factors.push({ label: `Close skill match (${meta.skillLevel})`, points: 5, isPositive: true });
      }
    }
  }

  // 6. Category / Focus Match
  if (criteria.categories && criteria.categories.length > 0) {
    const matched = meta.categories.filter(c => criteria.categories!.includes(c));
    if (matched.length > 0) {
      const pts = matched.length * 10;
      score += pts;
      factors.push({ label: `Focus match: ${matched.join(', ')}`, points: pts, isPositive: true });
    }
  }

  // 7. Skater Attendance Fit
  if (criteria.skaterCount !== undefined && meta.skaterCount) {
    if (criteria.skaterCount >= meta.skaterCount.min && criteria.skaterCount <= meta.skaterCount.max) {
      score += 15;
      factors.push({ label: `Optimal attendance range (${meta.skaterCount.min}–${meta.skaterCount.max} players)`, points: 15, isPositive: true });
    } else if (criteria.skaterCount < meta.skaterCount.min) {
      score -= 20;
      factors.push({ label: `Needs at least ${meta.skaterCount.min} players (have ${criteria.skaterCount})`, points: -20, isPositive: false });
    }
  }

  // 8. Max Duration Constraint
  if (criteria.maxMinutes && criteria.maxMinutes > 0) {
    if (meta.durationMinutes <= criteria.maxMinutes) {
      score += 10;
      factors.push({ label: `Fits slot duration (${meta.durationMinutes}m ≤ ${criteria.maxMinutes}m)`, points: 10, isPositive: true });
    } else {
      score -= 15;
      factors.push({ label: `Exceeds slot duration (${meta.durationMinutes}m > ${criteria.maxMinutes}m)`, points: -15, isPositive: false });
    }
  }

  // 9. Equipment Filter
  if (criteria.excludedEquipment && criteria.excludedEquipment.length > 0) {
    const hasForbidden = drill.equipment.some(e => criteria.excludedEquipment!.includes(e.kind));
    if (hasForbidden) {
      score -= 40;
      factors.push({ label: 'Requires equipment excluded from rink session', points: -40, isPositive: false });
    }
  }

  // 10. Text Query Bonus
  if (criteria.query && criteria.query.trim()) {
    const words = criteria.query.toLowerCase().trim().split(/\s+/);
    const haystack = [meta.title, meta.summary, ...meta.tags, ...meta.categories].join(' ').toLowerCase();
    const allMatch = words.every(w => haystack.includes(w));
    if (allMatch) {
      score += 15;
      factors.push({ label: `Search match for "${criteria.query}"`, points: 15, isPositive: true });
    }
  }

  // Bound score and calculate match percentage
  const boundedScore = Math.min(100, Math.max(0, score));
  const matchPercentage = Math.min(100, Math.round((boundedScore / maxPossibleScore) * 100));

  const reasons = factors.map(f => (f.isPositive ? `+${f.points} ${f.label}` : `${f.points} ${f.label}`));

  return {
    drill,
    score: boundedScore,
    matchPercentage,
    factors,
    reasons,
  };
}

/**
 * Recommends and ranks drills from a collection against coach criteria.
 */
export function recommendDrills(
  candidates: DrillDocumentV3[],
  criteria: RecommendationCriteria,
  limit: number = 10
): DrillRecommendation[] {
  const scored: DrillRecommendation[] = [];

  for (const doc of candidates) {
    const res = scoreDrill(doc, criteria);
    if (res !== null && res.score > 0) {
      scored.push(res);
    }
  }

  // Sort descending by score, then shortest duration
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.drill.metadata.durationMinutes - b.drill.metadata.durationMinutes;
  });

  return scored.slice(0, limit);
}
