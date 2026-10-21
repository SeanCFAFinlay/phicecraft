import { describe, it, expect, beforeEach } from 'vitest';
import {
  getAssistantStatus,
  configureAssistant,
  resetAssistantConfig,
  proposeAddEquipment,
  proposeAppendCue,
  proposeAdjustPassTiming,
  proposeAssignRole,
  proposeShortenPractice,
  validateProposalFreshness,
  safelyApplyProposal,
} from './assistantService';
import { template, skater, pass } from '@/data/templates/builder';
import type { DrillDocumentV3, EquipmentItem, PassAction } from '@/domain/v3/types';
import type { PracticeSession } from '@/domain/practice/types';
import { createBlankPracticeSession } from '@/domain/practice/practiceStore';

describe('assistantService', () => {
  beforeEach(() => {
    resetAssistantConfig();
  });

  function getBaseDrill(): DrillDocumentV3 {
    const tpl = template({
      id: 'assistant-test-drill',
      title: 'Assistant Test Drill',
      summary: 'Testing allowlisted assistant operations.',
      categories: ['passing'],
      tags: [],
      ageBands: ['u13'],
      skillLevel: 'developing',
      rinkArea: 'half',
      durationMinutes: 10,
      finishPolicy: 'stop-after-sequence',
      setupNotes: [],
      coachingPoints: ['First cue'],
      progressions: [],
      variations: [],
      actors: [
        skater('s1', 'home', '9', { x: 10, y: 10 }, 'LW'),
        skater('s2', 'home', '10', { x: 30, y: 30 }, 'C'),
      ],
      puck: {
        from: 's1',
        actions: [pass('s1', 's2', { at: 1.0, flightSeconds: 0.8 })],
      },
    });

    return structuredClone(tpl.document);
  }

  it('reports unconfigured status by default and configured status when key is provided', () => {
    expect(getAssistantStatus()).toBe('unconfigured');

    configureAssistant({ apiKey: 'test-key-123' });
    expect(getAssistantStatus()).toBe('configured');

    resetAssistantConfig();
    expect(getAssistantStatus()).toBe('unconfigured');
  });

  it('proposes adding equipment with structured diffs and applies cleanly', () => {
    const drill = getBaseDrill();
    const newCones: EquipmentItem[] = [
      { id: 'c1', kind: 'cone', position: { x: 25, y: 25 } },
      { id: 'c2', kind: 'cone', position: { x: 25, y: 35 } },
    ];

    const proposal = proposeAddEquipment(drill, newCones, 'Target passing lane boundary.');
    expect(proposal.kind).toBe('add_equipment');
    expect(proposal.diff.changedFields).toContain('equipment');
    expect(proposal.diff.summary).toContain('0 → 2');

    const result = safelyApplyProposal(proposal, drill);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.document.equipment.length).toBe(2);
      expect(result.document.equipment[0].id).toBe('c1');
    }
  });

  it('proposes appending coaching points and validates schema', () => {
    const drill = getBaseDrill();
    const proposal = proposeAppendCue(drill, 'Drive hard to the net with stick ready.');
    expect(proposal.kind).toBe('append_cue');
    expect(proposal.diff.changedFields).toContain('metadata.coachingPoints');

    const result = safelyApplyProposal(proposal, drill);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.document.metadata.coachingPoints).toContain('Drive hard to the net with stick ready.');
      expect(result.document.metadata.coachingPoints.length).toBe(2);
    }
  });

  it('proposes adjusting pass timing and updates timestamps safely', () => {
    const drill = getBaseDrill();
    const passAction = drill.puckTracks[0].actions[0] as PassAction;
    expect(passAction.arrivalAt).toBeCloseTo(1.8, 1);

    const proposal = proposeAdjustPassTiming(drill, passAction.id, 0.5);
    expect(proposal.kind).toBe('adjust_timing');

    const result = safelyApplyProposal(proposal, drill);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const updatedPass = result.document.puckTracks[0].actions[0] as PassAction;
      expect(updatedPass.arrivalAt).toBeCloseTo(2.3, 1);
    }
  });

  it('proposes assigning role and number to a skater', () => {
    const drill = getBaseDrill();
    const proposal = proposeAssignRole(drill, 's1', 'D', '44');
    expect(proposal.kind).toBe('assign_role');
    expect(proposal.diff.changedFields).toContain('actors.role');

    const result = safelyApplyProposal(proposal, drill);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const skater1 = result.document.actors.find(a => a.id === 's1');
      expect(skater1).toBeDefined();
      if (skater1 && skater1.kind === 'skater') {
        expect(skater1.role).toBe('D');
        expect(skater1.number).toBe('44');
      }
    }
  });

  it('proposes shortening practice while respecting locked block allocations', () => {
    const session: PracticeSession = createBlankPracticeSession(60, 'Peewee Skills');
    session.blocks = [
      {
        id: 'b1',
        title: 'Dynamic Warmup',
        durationMinutes: 10,
        rinkArea: 'full',
        coachingPoints: [],
        equipment: [],
      },
      {
        id: 'b2',
        title: 'Goalie Specialized Crease Work (Locked)',
        durationMinutes: 15,
        rinkArea: 'half',
        coachingPoints: [],
        equipment: [],
        locked: true, // locked allocation!
      },
      {
        id: 'b3',
        title: '3v2 Flow Drill',
        durationMinutes: 20,
        rinkArea: 'full',
        coachingPoints: [],
        equipment: [],
      },
      {
        id: 'b4',
        title: 'Small Area Scrimmage',
        durationMinutes: 15,
        rinkArea: 'half',
        coachingPoints: [],
        equipment: [],
      },
    ];

    // Request shortening practice from 60 to 45 minutes
    const proposal = proposeShortenPractice(session, 45);
    expect(proposal.kind).toBe('scale_duration');
    expect(proposal.diff.beforeSnapshot).toContain('locked');

    const result = safelyApplyProposal(proposal, session);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const updated = result.document;
      expect(updated.targetMinutes).toBe(45);
      // Locked block b2 MUST stay exactly 15 minutes!
      const lockedBlock = updated.blocks.find(b => b.id === 'b2');
      expect(lockedBlock?.durationMinutes).toBe(15);
      // Total duration of blocks should now be approx 45 minutes
      const totalMinutes = updated.blocks.reduce((sum, b) => sum + b.durationMinutes, 0);
      expect(totalMinutes).toBeLessThanOrEqual(46);
      expect(totalMinutes).toBeGreaterThanOrEqual(44);
    }
  });

  it('demonstrates stale-proposal protection when plan or drill changes concurrently', () => {
    const drill = getBaseDrill();
    drill.updatedAt = 1000;

    const proposal = proposeAppendCue(drill, 'Quick feet');
    expect(proposal.sourceRevision).toBe(1000);

    // Concurrent user edit occurs, bumping revision
    const concurrentlyEditedDrill = structuredClone(drill);
    concurrentlyEditedDrill.updatedAt = 1050;

    const freshness = validateProposalFreshness(proposal, concurrentlyEditedDrill);
    expect(freshness.fresh).toBe(false);

    // Applying stale proposal is blocked by default
    const result = safelyApplyProposal(proposal, concurrentlyEditedDrill);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.stale).toBe(true);
      expect(result.error).toContain('Stale proposal');
    }
  });
});
