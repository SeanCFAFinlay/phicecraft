// ============================================================================
// ASSISTANT TYPES & ALLOWLISTED OPERATIONS
//
// Defines the strict boundary for coaching assistant proposals.
// Every assistant edit is:
// 1. Allowlisted to safe operations only
// 2. Schema-validated before reaching the coach
// 3. Displayed with explicit diffs and assumptions
// 4. Applied as an undoable command only on explicit user approval
// When unconfigured (no remote AI key), it explicitly declares itself
// unconfigured rather than emitting hallucinated text.
// ============================================================================

import type { DrillDocumentV3 } from '@/domain/v3/types';
import type { PracticeSession } from '@/domain/practice/types';

export type AssistantStatus = 'unconfigured' | 'configured' | 'busy' | 'error';

export type AllowlistedOperationKind =
  | 'add_equipment'
  | 'adjust_timing'
  | 'append_cue'
  | 'assign_role'
  | 'scale_duration'
  | 'optimize_rotations';

export interface ProposalDiff {
  changedFields: string[];
  summary: string;
  beforeSnapshot: string;
  afterSnapshot: string;
}

export interface AssistantProposal<T = DrillDocumentV3 | PracticeSession> {
  operationId: string;
  kind: AllowlistedOperationKind;
  affectedRecord: 'drill' | 'practice';
  sourceRevision: string | number;
  summary: string;
  assumptions: string[];
  diff: ProposalDiff;
  status: 'pending' | 'accepted' | 'rejected';
  apply: (source: T) => T;
}

export interface AssistantConfig {
  apiKey?: string;
  endpoint?: string;
  model?: string;
}
