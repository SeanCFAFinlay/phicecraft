// ============================================================================
// PRACTICE SESSION DOMAIN TYPES
//
// Hockey practice planning domain model. Supports multi-drill practices,
// station splits (ADM model), timeline duration tracking, and equipment totals.
// ============================================================================

import type { RinkArea, EquipmentKind, DrillDocumentV3 } from '@/domain/v3/types';

export type PracticeSessionId = string;
export type PracticeBlockId = string;

export interface EquipmentDemand {
  kind: EquipmentKind | 'pucks';
  count: number;
}

export type StationSplit =
  | 'full'
  | 'station_a'
  | 'station_b'
  | 'station_c'
  | 'third_adm'
  | 'half_cross'
  | 'four_quadrants'
  | 'six_stations';

export interface PracticeBlock {
  id: PracticeBlockId;
  drillId?: string;
  title: string;
  durationMinutes: number;
  rinkArea: RinkArea;
  stationSplit?: StationSplit;
  drillSummary?: string;
  coachingPoints: string[];
  equipment: EquipmentDemand[];
  notes?: string;
  objective?: string;
  instructions?: string;
  roles?: string[];
  rotations?: number;
  changeoverMinutes?: number;
  retainedSetup?: boolean;
  locked?: boolean;
  /** Pinned immutable drill revision at the time this block was added. */
  pinnedRevision?: DrillDocumentV3;
}

export interface PracticeSession {
  id: PracticeSessionId;
  title: string;
  team: string;
  targetMinutes: number; // e.g. 50, 60, 80, 90
  date?: string;
  focus: string; // e.g. "Pace, passing accuracy & neutral zone regroups"
  blocks: PracticeBlock[];
  createdAt: string;
  updatedAt: string;
  notes?: string;
}

export interface PracticeMetrics {
  totalMinutes: number;
  targetMinutes: number;
  remainingMinutes: number;
  status: 'under' | 'exact' | 'over';
  equipmentTotals: Record<string, number>;
  peakConcurrentEquipment?: Record<string, number>;
  blockCount: number;
}

export interface PracticeBundleManifest {
  formatVersion: 'phicecraft-practice-bundle-v1';
  exportedAt: string;
  appVersion: string;
  sessionCount: number;
  snapshotCount: number;
}

export interface PracticeBundle {
  manifest: PracticeBundleManifest;
  practice: PracticeSession;
  drillSnapshots: Record<string, DrillDocumentV3>;
}
