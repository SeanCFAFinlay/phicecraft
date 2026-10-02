// ============================================================================
// PRACTICE SESSION DOMAIN TYPES
//
// Hockey practice planning domain model. Supports multi-drill practices,
// station splits (ADM model), timeline duration tracking, and equipment totals.
// ============================================================================

import type { RinkArea, EquipmentKind } from '@/domain/v3/types';

export type PracticeSessionId = string;
export type PracticeBlockId = string;

export interface EquipmentDemand {
  kind: EquipmentKind | 'pucks';
  count: number;
}

export interface PracticeBlock {
  id: PracticeBlockId;
  drillId?: string;
  title: string;
  durationMinutes: number;
  rinkArea: RinkArea;
  stationSplit?: 'full' | 'station_a' | 'station_b' | 'station_c';
  drillSummary?: string;
  coachingPoints: string[];
  equipment: EquipmentDemand[];
  notes?: string;
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
}

export interface PracticeMetrics {
  totalMinutes: number;
  targetMinutes: number;
  remainingMinutes: number;
  status: 'under' | 'exact' | 'over';
  equipmentTotals: Record<string, number>;
  blockCount: number;
}
