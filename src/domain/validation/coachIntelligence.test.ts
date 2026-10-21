import { describe, it, expect } from 'vitest';
import {
  validateDrillIntelligence,
  estimateActorPositionAtTime,
} from './coachIntelligence';
import { template, skater, route } from '@/data/templates/builder';
import type { DrillDocumentV3, PassAction } from '@/domain/v3/types';

describe('coachIntelligence', () => {
  function createTestDrill(): DrillDocumentV3 {
    const tpl = template({
      id: 'test-drill-1',
      title: 'Pass and Breakout Test Drill',
      summary: 'Testing coach intelligence pass timing and roles.',
      categories: ['passing', 'breakout'],
      tags: ['passing'],
      ageBands: ['u13', 'u15'],
      skillLevel: 'developing',
      rinkArea: 'half',
      durationMinutes: 10,
      finishPolicy: 'stop-after-sequence',
      goalieCount: 1,
      equipmentSummary: ['cones'],
      setupNotes: [],
      coachingPoints: ['Stay on tape', 'Accelerate through cone gate'],
      progressions: [],
      variations: [],
      actors: [
        skater('skater-1', 'home', '9', { x: 0, y: 0 }, 'LW'),
        skater('skater-2', 'home', '17', { x: 20, y: 20 }, 'C'),
      ],
      routes: [
        route('skater-2', [{ x: 20, y: 20 }, { x: 50, y: 20 }], { durationSeconds: 5 }),
      ],
    });

    return structuredClone(tpl.document);
  }

  it('estimates actor position along movement segments accurately', () => {
    const actor = {
      id: 'act-1',
      kind: 'skater' as const,
      team: 'home' as const,
      number: '10',
      role: 'RW' as const,
      position: { x: 0, y: 0 },
    };

    const segments = [
      {
        id: 'seg-1',
        phaseId: 'ph-1',
        startAtSeconds: 0,
        durationSeconds: 4,
        points: [{ x: 0, y: 0 }, { x: 40, y: 0 }],
        curve: 'spline' as const,
        movement: 'forward' as const,
      },
    ];

    // Halfway (2s) should be at x: 20
    const halfway = estimateActorPositionAtTime(actor, segments, 2);
    expect(halfway.position.x).toBeCloseTo(20);
    expect(halfway.position.y).toBeCloseTo(0);

    // End (4s) should be at x: 40
    const atEnd = estimateActorPositionAtTime(actor, segments, 4);
    expect(atEnd.position.x).toBeCloseTo(40);
  });

  it('detects missing goalie when drill requires a goalie', () => {
    const drill = createTestDrill();
    // Test drill has goalieCount: 1 but no goalie actor added yet
    const report = validateDrillIntelligence(drill);

    const goalieIssue = report.issues.find(i => i.kind === 'role_shortage' && i.id === 'role-missing-goalie');
    expect(goalieIssue).toBeDefined();
    expect(goalieIssue?.severity).toBe('warning');
    expect(goalieIssue?.proposal).toBeDefined();

    // Apply the proposal to add goalie
    const fixed = goalieIssue!.proposal!.apply(drill);
    const updatedReport = validateDrillIntelligence(fixed);
    expect(updatedReport.issues.some(i => i.id === 'role-missing-goalie')).toBe(false);
  });

  it('flags pass release/arrival order errors and provides an auto-fix proposal', () => {
    const drill = createTestDrill();
    // Add a backwards pass where arrival is before release
    const passAction: PassAction = {
      id: 'pass-err-1',
      phaseId: drill.phases[0].id,
      fromActorId: 'skater-1',
      fromPoint: { x: 0, y: 0 },
      toActorId: 'skater-2',
      targetMode: 'actor',
      target: { x: 50, y: 20 },
      releaseAt: 4.0,
      arrivalAt: 2.0, // Error: arrival before release!
      waypoints: [],
      shape: 'spline',
      passType: 'flat',
      receiveMode: 'control',
      type: 'pass',
    };

    drill.puckTracks.push({
      id: 'puck-track-1',
      initialSource: { kind: 'actor', actorId: 'skater-1' },
      actions: [passAction],
    });

    const report = validateDrillIntelligence(drill);
    expect(report.isValid).toBe(false);
    expect(report.errorCount).toBeGreaterThan(0);

    const timingIssue = report.issues.find(i => i.id === 'pass-order-pass-err-1');
    expect(timingIssue).toBeDefined();

    // Apply corrective proposal
    const fixed = timingIssue!.proposal!.apply(drill);
    const fixedReport = validateDrillIntelligence(fixed);
    expect(fixedReport.issues.some(i => i.id === 'pass-order-pass-err-1')).toBe(false);
  });

  it('flags pass timing mismatches when pass arrives before receiver gets there', () => {
    const drill = createTestDrill();
    // Receiver skates from (20,20) to (50,20) over 5 seconds (arriving at (50,20) around 5.0s).
    // Let's send a pass to (50,20) arriving at 1.5s (receiver is nowhere near!)
    const passAction: PassAction = {
      id: 'pass-mismatch-1',
      phaseId: drill.phases[0].id,
      fromActorId: 'skater-1',
      fromPoint: { x: 0, y: 0 },
      toActorId: 'skater-2',
      targetMode: 'actor',
      target: { x: 50, y: 20 },
      releaseAt: 0.5,
      arrivalAt: 1.5,
      waypoints: [],
      shape: 'spline',
      passType: 'flat',
      receiveMode: 'control',
      type: 'pass',
    };

    drill.puckTracks.push({
      id: 'puck-track-1',
      initialSource: { kind: 'actor', actorId: 'skater-1' },
      actions: [passAction],
    });

    const report = validateDrillIntelligence(drill);
    const mismatchIssue = report.issues.find(i => i.id === 'pass-timing-pass-mismatch-1');
    expect(mismatchIssue).toBeDefined();
    expect(mismatchIssue?.kind).toBe('timing_mismatch');
    expect(mismatchIssue?.message).toMatch(/lands.*away.*Puck arrives.*too early/);
    expect(mismatchIssue?.proposal).toBeDefined();

    // Apply synchronized timing proposal
    const synced = mismatchIssue!.proposal!.apply(drill);
    const syncedPass = synced.puckTracks[0].actions[0] as PassAction;
    expect(syncedPass.arrivalAt).toBeCloseTo(5.0, 0.5);
  });

  it('detects overlapping starting positions and offers an offset proposal', () => {
    const drill = createTestDrill();
    // Place skater-2 at the same position as skater-1
    drill.actors[1].position = { x: 0.5, y: 0.5 }; // within 3ft

    const report = validateDrillIntelligence(drill);
    const spaceIssue = report.issues.find(i => i.kind === 'space_conflict');
    expect(spaceIssue).toBeDefined();
    expect(spaceIssue?.proposal).toBeDefined();

    const fixed = spaceIssue!.proposal!.apply(drill);
    expect(fixed.actors[1].position.x).toBeGreaterThan(5);
  });

  it('flags equipment shortages when contextual inventory is limited', () => {
    const drill = createTestDrill();
    drill.equipment.push(
      { id: 'c1', kind: 'cone', position: { x: 10, y: 10 } },
      { id: 'c2', kind: 'cone', position: { x: 20, y: 10 } },
      { id: 'c3', kind: 'cone', position: { x: 30, y: 10 } }
    );

    const report = validateDrillIntelligence(drill, {
      availableEquipment: { cone: 1 }, // Only 1 cone available, but drill needs 3
    });

    const equipIssue = report.issues.find(i => i.id === 'equip-shortage-cone');
    expect(equipIssue).toBeDefined();
    expect(equipIssue?.message).toContain('Drill requires 3 cone(s), but current rink inventory only has 1.');
  });
});
