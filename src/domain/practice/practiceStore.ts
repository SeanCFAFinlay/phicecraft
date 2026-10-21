// ============================================================================
// PRACTICE SESSION STORE
//
// Manages multi-drill practice plans, station configurations, equipment
// consolidation, and persistence in localStorage.
// ============================================================================

import type { DrillTemplate } from '@/data/templates/builder';
import { findTemplate } from '@/data/templates/registry';
import type { DrillDocumentV3 } from '@/domain/v3/types';
import type { PracticeBlock, PracticeMetrics, PracticeSession } from './types';

export const PRACTICE_STORAGE_KEY = 'phicecraft:practice_sessions_v1';
export const PRACTICE_INITIALIZED_KEY = 'phicecraft:practice_sessions_initialized';

export const PRESET_PRACTICE_SESSIONS: PracticeSession[] = [
  {
    id: 'preset-60-team-pace',
    title: '60-Min Team Pace, Breakout & Neutral Zone Flow',
    team: 'U13 / U15 Rep',
    targetMinutes: 60,
    focus: 'Fast puck movement, D-to-D regroup support, and transition speed',
    date: new Date().toISOString().slice(0, 10),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    blocks: [
      {
        id: 'blk-1',
        drillId: 'tpl-four-dot-warm-up',
        title: 'Four Dot Flow Warm-up',
        durationMinutes: 10,
        rinkArea: 'full',
        stationSplit: 'full',
        drillSummary: 'Continuous warm-up with puck touches at all four circle face-off dots.',
        coachingPoints: [
          'Call for the puck with stick blade flat on the ice.',
          'Open hips on the turn before receiving.',
          'Accelerate out of each turn with crossover power.',
        ],
        equipment: [{ kind: 'cone', count: 4 }, { kind: 'pucks', count: 25 }],
      },
      {
        id: 'blk-2',
        drillId: 'tpl-gates-passing',
        title: 'Station A: Gates Passing & Stickhandling',
        durationMinutes: 12,
        rinkArea: 'station',
        stationSplit: 'station_a',
        drillSummary: 'Pair passing through cone gates at increasing tempo.',
        coachingPoints: [
          'Firm sweep pass on the tape.',
          'Soft hands when absorbing the puck.',
        ],
        equipment: [{ kind: 'gate', count: 4 }, { kind: 'cone', count: 8 }, { kind: 'pucks', count: 15 }],
      },
      {
        id: 'blk-3',
        drillId: 'tpl-corner-half-wall-2v1',
        title: 'Station B: Corner & Half-Wall 2v1 Battle',
        durationMinutes: 12,
        rinkArea: 'station',
        stationSplit: 'station_b',
        drillSummary: 'Tight area battle winning pucks off the wall and attacking the slot.',
        coachingPoints: [
          'Body position between defender and puck.',
          'Quick release from the prime scoring area.',
        ],
        equipment: [{ kind: 'tire', count: 2 }, { kind: 'pucks', count: 15 }],
      },
      {
        id: 'blk-4',
        drillId: 'tpl-play-dzone-breakout',
        title: '5v0 / 5v2 D-Zone Breakout & Quick Regroup',
        durationMinutes: 14,
        rinkArea: 'full',
        stationSplit: 'full',
        drillSummary: 'Full team breakout structure: wheel, over, reverse with center support.',
        coachingPoints: [
          'Strong vocal communication from goaltender and defensemen.',
          'Wingers present low target at hash marks.',
          'Center swings through low and on time.',
        ],
        equipment: [{ kind: 'pucks', count: 20 }],
      },
      {
        id: 'blk-5',
        drillId: 'tpl-3v3-add-defender',
        title: '3v3 Small-Area Game with Trailer Option',
        durationMinutes: 12,
        rinkArea: 'half',
        stationSplit: 'full',
        drillSummary: 'Cross-ice small-area scrimmage emphasizing rapid transition and quick shots.',
        coachingPoints: [
          'Change angles to create open shooting lanes.',
          'Compete hard on loose pucks around the net.',
        ],
        equipment: [{ kind: 'barrier', count: 2 }, { kind: 'mini-net', count: 2 }, { kind: 'pucks', count: 12 }],
      },
    ],
  },
  {
    id: 'preset-50-adm-stations',
    title: '50-Min Skills & Small-Area Stations (ADM Model)',
    team: 'U11 / U13 Development',
    targetMinutes: 50,
    focus: 'High repetitions, station circuits, puck protection & small-area competition',
    date: new Date().toISOString().slice(0, 10),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    blocks: [
      {
        id: 'blk-50-1',
        drillId: 'tpl-one-touch-warm-up',
        title: 'Dynamic Edge Work & One-Touch Passing',
        durationMinutes: 8,
        rinkArea: 'half',
        stationSplit: 'full',
        drillSummary: 'Quick feet edge warmup transitioning directly into one-touch partner passing.',
        coachingPoints: ['Deep knee bend and full blade contact.', 'Keep head up at all times.'],
        equipment: [{ kind: 'cone', count: 6 }, { kind: 'pucks', count: 20 }],
      },
      {
        id: 'blk-50-2',
        drillId: 'tpl-tire-target',
        title: 'Station 1: Tire Target Precision Shooting',
        durationMinutes: 10,
        rinkArea: 'station',
        stationSplit: 'station_a',
        drillSummary: 'Shooting off the pass into elevated tire targets.',
        coachingPoints: ['Weight transfer from back foot to front foot.', 'Follow through at the target.'],
        equipment: [{ kind: 'tire', count: 4 }, { kind: 'pucks', count: 20 }],
      },
      {
        id: 'blk-50-3',
        drillId: 'tpl-get-open-passing',
        title: 'Station 2: Get Open Support Box',
        durationMinutes: 10,
        rinkArea: 'station',
        stationSplit: 'station_b',
        drillSummary: '4-player keep-away box with rapid pass-and-move rules.',
        coachingPoints: ['Relocate instantly after making a pass.', 'Create clean diagonal passing triangles.'],
        equipment: [{ kind: 'cone', count: 4 }, { kind: 'pucks', count: 10 }],
      },
      {
        id: 'blk-50-4',
        drillId: 'tpl-2v2-transition',
        title: 'Station 3: 2v2 Rapid Transition Game',
        durationMinutes: 12,
        rinkArea: 'half',
        stationSplit: 'full',
        drillSummary: 'Continuous 2v2 counter-attack game within the neutral and offensive zones.',
        coachingPoints: ['Immediate switch from offense to defense.', 'Gap control by the defending pair.'],
        equipment: [{ kind: 'mini-net', count: 2 }, { kind: 'pucks', count: 15 }],
      },
      {
        id: 'blk-50-5',
        drillId: 'tpl-puck-race',
        title: 'Puck Race Battle & Shootout Relay',
        durationMinutes: 10,
        rinkArea: 'full',
        stationSplit: 'full',
        drillSummary: 'Full-ice competitive puck races with finish on net.',
        coachingPoints: ['Explosive first 3 strides.', 'Protect the puck with hip leverage.'],
        equipment: [{ kind: 'cone', count: 6 }, { kind: 'pucks', count: 12 }],
      },
    ],
  },
  {
    id: 'preset-80-comprehensive',
    title: '80-Min Comprehensive High-Performance Camp',
    team: 'U15 / U18 High Performance',
    targetMinutes: 80,
    focus: 'Full ice flow, forecheck pressure, special teams and situational scrimmage',
    date: new Date().toISOString().slice(0, 10),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    blocks: [
      {
        id: 'blk-80-1',
        drillId: 'tpl-pivot-out-warm-up',
        title: 'Dynamic Flow & Pivot Out Warm-Up',
        durationMinutes: 12,
        rinkArea: 'full',
        stationSplit: 'full',
        drillSummary: 'Full ice timing warmup focusing on forwards pivoting toward the boards and timing entries.',
        coachingPoints: ['Catch passes in stride.', 'Shoot to score, not just to shoot.'],
        equipment: [{ kind: 'pucks', count: 30 }],
      },
      {
        id: 'blk-80-2',
        drillId: 'tpl-play-122-forecheck',
        title: '1-2-2 Forecheck System & Angling',
        durationMinutes: 16,
        rinkArea: 'full',
        stationSplit: 'full',
        drillSummary: 'System execution: F1 steers puck carrier, F2 locks the half-wall, F3 covers mid-ice.',
        coachingPoints: ['F1 stick on the ice steering outside.', 'Defensemen hold aggressive offensive blue line.'],
        equipment: [{ kind: 'cone', count: 4 }, { kind: 'pucks', count: 20 }],
      },
      {
        id: 'blk-80-3',
        drillId: 'tpl-play-131-power-play',
        title: 'Special Teams: 1-3-1 Power Play vs 4v5 Box',
        durationMinutes: 18,
        rinkArea: 'half',
        stationSplit: 'full',
        drillSummary: 'Power play bumper and flank rotation against aggressive diamond/box PK.',
        coachingPoints: ['Bumper player is the release valve.', 'One-touch puck movement to move the penalty killers.'],
        equipment: [{ kind: 'pucks', count: 25 }],
      },
      {
        id: 'blk-80-4',
        drillId: 'tpl-3v2-race-to-five',
        title: '3v2 Continuous Rush Attack with Backcheck',
        durationMinutes: 18,
        rinkArea: 'full',
        stationSplit: 'full',
        drillSummary: 'Wave after wave of 3v2 rushes with trailing backchecker applying back pressure.',
        coachingPoints: ['Attack the defensemen with speed.', 'Defensemen protect the middle and communicate switches.'],
        equipment: [{ kind: 'pucks', count: 20 }],
      },
      {
        id: 'blk-80-5',
        drillId: 'tpl-3v3-empty-net',
        title: 'Small-Area Conditioning & Shootout',
        durationMinutes: 16,
        rinkArea: 'half',
        stationSplit: 'full',
        drillSummary: 'High-intensity small-area game followed by high-pressure shootout competition.',
        coachingPoints: ['Compete through fatigue.', 'Deceptive head/shoulder fakes on breakaways.'],
        equipment: [{ kind: 'mini-net', count: 2 }, { kind: 'pucks', count: 15 }],
      },
    ],
  },
];

/**
 * Loads all practice sessions from storage.
 * Seeds with presets on first application run, but preserves an intentionally
 * empty list if the user deletes all practices.
 */
export function loadPracticeSessions(): PracticeSession[] {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return PRESET_PRACTICE_SESSIONS;
  }

  try {
    const isInitialized = localStorage.getItem(PRACTICE_INITIALIZED_KEY);
    const raw = localStorage.getItem(PRACTICE_STORAGE_KEY);

    if (isInitialized === 'true') {
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? (parsed as PracticeSession[]) : [];
      } catch {
        return [];
      }
    }

    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          localStorage.setItem(PRACTICE_INITIALIZED_KEY, 'true');
          return parsed as PracticeSession[];
        }
      } catch {
        /* proceed to initial seed */
      }
    }

    localStorage.setItem(PRACTICE_INITIALIZED_KEY, 'true');
    savePracticeSessions(PRESET_PRACTICE_SESSIONS);
    return PRESET_PRACTICE_SESSIONS;
  } catch {
    return [];
  }
}

/**
 * Saves all practice sessions to storage and marks initialized.
 */
export function savePracticeSessions(sessions: PracticeSession[]): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(PRACTICE_STORAGE_KEY, JSON.stringify(sessions));
    localStorage.setItem(PRACTICE_INITIALIZED_KEY, 'true');
  } catch (err) {
    console.error('Failed to save practice sessions', err);
  }
}

/**
 * Finds a single practice session by ID.
 */
export function getPracticeSession(id: string): PracticeSession | null {
  const sessions = loadPracticeSessions();
  return sessions.find(s => s.id === id) ?? null;
}

/**
 * Adds or updates a practice session.
 */
export function upsertPracticeSession(session: PracticeSession): void {
  const sessions = loadPracticeSessions();
  const index = sessions.findIndex(s => s.id === session.id);
  const updated = {
    ...session,
    updatedAt: new Date().toISOString(),
  };

  if (index >= 0) {
    sessions[index] = updated;
  } else {
    sessions.unshift(updated);
  }
  savePracticeSessions(sessions);
}

/**
 * Deletes a practice session by ID.
 * Leaves an empty list truthfully without re-seeding presets.
 */
export function deletePracticeSession(id: string): void {
  const sessions = loadPracticeSessions();
  const filtered = sessions.filter(s => s.id !== id);
  savePracticeSessions(filtered);
}

/**
 * Creates a new blank practice session.
 */
export function createBlankPracticeSession(
  targetMinutes: number = 60,
  title: string = 'New Practice Session'
): PracticeSession {
  const now = new Date().toISOString();
  return {
    id: `practice-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title,
    team: 'Team Practice',
    targetMinutes,
    date: now.slice(0, 10),
    focus: 'Pace, execution, and competitive habits',
    blocks: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Converts a drill template into a PracticeBlock with an immutable pinned revision.
 */
export function createBlockFromTemplate(
  template: DrillTemplate,
  durationMinutes?: number
): PracticeBlock {
  const meta = template.document.metadata;

  const equipmentMap = new Map<string, number>();
  for (const item of template.document.equipment) {
    equipmentMap.set(item.kind, (equipmentMap.get(item.kind) ?? 0) + 1);
  }
  equipmentMap.set('pucks', Math.max(15, template.document.actors.length * 2));

  const equipmentDemands = Array.from(equipmentMap.entries()).map(([kind, count]) => ({
    kind: kind as PracticeBlock['equipment'][0]['kind'],
    count,
  }));

  return {
    id: `blk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    drillId: template.id,
    title: meta.title,
    durationMinutes: durationMinutes ?? meta.durationMinutes ?? 10,
    rinkArea: meta.rinkArea,
    stationSplit: meta.rinkArea === 'station' ? 'station_a' : 'full',
    drillSummary: meta.summary,
    coachingPoints: [...meta.coachingPoints],
    equipment: equipmentDemands,
    objective: meta.categories?.join(', '),
    instructions: meta.summary,
    pinnedRevision: structuredClone(template.document),
  };
}

/**
 * Converts a personal saved drill (v3 document) into a PracticeBlock with an immutable pinned revision.
 */
export function createBlockFromDrill(
  drill: DrillDocumentV3,
  durationMinutes?: number
): PracticeBlock {
  const meta = drill.metadata;

  const equipmentMap = new Map<string, number>();
  for (const item of drill.equipment) {
    equipmentMap.set(item.kind, (equipmentMap.get(item.kind) ?? 0) + 1);
  }
  equipmentMap.set('pucks', Math.max(15, drill.actors.length * 2));

  const equipmentDemands = Array.from(equipmentMap.entries()).map(([kind, count]) => ({
    kind: kind as PracticeBlock['equipment'][0]['kind'],
    count,
  }));

  return {
    id: `blk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    drillId: drill.id,
    title: meta.title,
    durationMinutes: durationMinutes ?? meta.durationMinutes ?? 10,
    rinkArea: meta.rinkArea,
    stationSplit: meta.rinkArea === 'station' ? 'station_a' : 'full',
    drillSummary: meta.summary,
    coachingPoints: [...meta.coachingPoints],
    equipment: equipmentDemands,
    objective: meta.categories?.join(', '),
    instructions: meta.summary,
    pinnedRevision: structuredClone(drill),
  };
}

/**
 * Creates a fully customizable practice block.
 */
export function createCustomBlock(
  title: string = 'Custom Drill / Station',
  durationMinutes: number = 10,
  options: Partial<PracticeBlock> = {}
): PracticeBlock {
  return {
    id: `blk-custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title,
    durationMinutes,
    rinkArea: options.rinkArea ?? 'half',
    stationSplit: options.stationSplit ?? 'full',
    drillSummary: options.drillSummary ?? 'Coach-directed skills, small-area game, or team system.',
    coachingPoints: options.coachingPoints ? [...options.coachingPoints] : ['Focus on execution, tempo, and high repetitions.'],
    equipment: options.equipment ? [...options.equipment] : [{ kind: 'pucks', count: 20 }],
    objective: options.objective ?? 'Skill Development',
    instructions: options.instructions ?? '',
    roles: options.roles ? [...options.roles] : [],
    notes: options.notes ?? '',
    ...options,
  };
}

/**
 * Calculates duration metrics, time balance, and consolidated equipment demand.
 * Accurately models ADM station concurrency:
 * - Contiguous stations running concurrently count the max station duration per rotation.
 * - Reusable equipment (cones, tires, etc.) demand is calculated as peak concurrent
 *   need across simultaneous stations/blocks, rather than a naive sum.
 */
export function calculatePracticeMetrics(session: PracticeSession): PracticeMetrics {
  const targetMinutes = session.targetMinutes || 60;

  interface ActivityUnit {
    kind: 'sequential' | 'stations';
    blocks: PracticeBlock[];
    durationMinutes: number;
    equipmentDemand: Record<string, number>;
  }

  const units: ActivityUnit[] = [];
  let currentStationCluster: PracticeBlock[] = [];

  const flushStationCluster = () => {
    if (currentStationCluster.length === 0) return;
    const maxDur = Math.max(...currentStationCluster.map(b => b.durationMinutes || 0), 0);
    const clusterRotations = currentStationCluster[0]?.rotations ?? (currentStationCluster.length > 1 ? currentStationCluster.length : 1);
    const changeover = currentStationCluster[0]?.changeoverMinutes ?? (clusterRotations > 1 ? clusterRotations - 1 : 0);
    const clusterDuration = maxDur * clusterRotations + changeover;

    // Concurrent equipment demand during this station cluster:
    // Because all stations in the cluster run simultaneously on the ice, their equipment is concurrently in use!
    const concurrentEquip: Record<string, number> = {};
    for (const block of currentStationCluster) {
      for (const eq of block.equipment) {
        concurrentEquip[eq.kind] = (concurrentEquip[eq.kind] ?? 0) + eq.count;
      }
    }

    units.push({
      kind: 'stations',
      blocks: [...currentStationCluster],
      durationMinutes: clusterDuration,
      equipmentDemand: concurrentEquip,
    });
    currentStationCluster = [];
  };

  for (const block of session.blocks) {
    const isStation = block.stationSplit && block.stationSplit !== 'full';
    if (isStation) {
      currentStationCluster.push(block);
    } else {
      flushStationCluster();
      const blockEquip: Record<string, number> = {};
      for (const eq of block.equipment) {
        blockEquip[eq.kind] = (blockEquip[eq.kind] ?? 0) + eq.count;
      }
      units.push({
        kind: 'sequential',
        blocks: [block],
        durationMinutes: block.durationMinutes || 0,
        equipmentDemand: blockEquip,
      });
    }
  }
  flushStationCluster();

  const totalMinutes = units.reduce((sum, u) => sum + u.durationMinutes, 0);
  const remainingMinutes = targetMinutes - totalMinutes;

  let status: 'under' | 'exact' | 'over' = 'exact';
  if (remainingMinutes > 0) status = 'under';
  else if (remainingMinutes < 0) status = 'over';

  // Calculate equipment totals:
  // equipmentTotals: consolidated checklist across all activities (gross equipment need).
  // peakConcurrentEquipment: peak simultaneous reusable equipment demand across concurrent stations/blocks.
  const equipmentTotals: Record<string, number> = {};
  for (const block of session.blocks) {
    for (const eq of block.equipment) {
      equipmentTotals[eq.kind] = (equipmentTotals[eq.kind] ?? 0) + eq.count;
    }
  }

  const peakConcurrentEquipment: Record<string, number> = {};
  const allEquipmentKinds = new Set<string>();

  for (const u of units) {
    for (const kind of Object.keys(u.equipmentDemand)) {
      allEquipmentKinds.add(kind);
    }
  }

  for (const kind of allEquipmentKinds) {
    let peak = 0;
    for (const u of units) {
      peak = Math.max(peak, u.equipmentDemand[kind] ?? 0);
    }
    peakConcurrentEquipment[kind] = peak;
  }

  return {
    totalMinutes,
    targetMinutes,
    remainingMinutes,
    status,
    equipmentTotals,
    peakConcurrentEquipment,
    blockCount: session.blocks.length,
  };
}

/**
 * Resolves full DrillTemplate if block references a template.
 */
export function getTemplateForBlock(block: PracticeBlock): DrillTemplate | null {
  if (!block.drillId) return null;
  return findTemplate(block.drillId);
}
