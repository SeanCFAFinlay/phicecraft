import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadPracticeSessions,
  getPracticeSession,
  upsertPracticeSession,
  deletePracticeSession,
  calculatePracticeMetrics,
  createBlankPracticeSession,
  createBlockFromTemplate,
} from './practiceStore';
import { findTemplate } from '@/data/templates/registry';

describe('practiceStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('loads preset practice sessions when storage is empty', () => {
    const sessions = loadPracticeSessions();
    expect(sessions.length).toBeGreaterThanOrEqual(3);
    expect(sessions[0].id).toBe('preset-60-team-pace');
    expect(sessions[0].targetMinutes).toBe(60);
  });

  it('can upsert, retrieve, and delete a custom practice session', () => {
    const newSession = createBlankPracticeSession(50, 'Friday Night Peewee Practice');
    newSession.focus = 'Breakout angling and passing';
    upsertPracticeSession(newSession);

    const retrieved = getPracticeSession(newSession.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.title).toBe('Friday Night Peewee Practice');
    expect(retrieved?.targetMinutes).toBe(50);

    // Update session
    retrieved!.targetMinutes = 55;
    upsertPracticeSession(retrieved!);
    expect(getPracticeSession(newSession.id)?.targetMinutes).toBe(55);

    // Delete session
    deletePracticeSession(newSession.id);
    expect(getPracticeSession(newSession.id)).toBeNull();
  });

  it('calculates practice duration metrics correctly', () => {
    const session = createBlankPracticeSession(60, 'Timing Test');
    session.blocks = [
      {
        id: 'b1',
        title: 'Warmup',
        durationMinutes: 10,
        rinkArea: 'full',
        coachingPoints: [],
        equipment: [{ kind: 'cone', count: 4 }, { kind: 'pucks', count: 20 }],
      },
      {
        id: 'b2',
        title: 'Drill 2',
        durationMinutes: 30,
        rinkArea: 'half',
        coachingPoints: [],
        equipment: [{ kind: 'cone', count: 6 }, { kind: 'tire', count: 2 }],
      },
    ];

    const metrics1 = calculatePracticeMetrics(session);
    expect(metrics1.totalMinutes).toBe(40);
    expect(metrics1.targetMinutes).toBe(60);
    expect(metrics1.remainingMinutes).toBe(20);
    expect(metrics1.status).toBe('under');
    expect(metrics1.equipmentTotals.cone).toBe(10);
    expect(metrics1.equipmentTotals.tire).toBe(2);
    expect(metrics1.equipmentTotals.pucks).toBe(20);

    // Add another block to make it exact 60 min
    session.blocks.push({
      id: 'b3',
      title: 'Scrimmage',
      durationMinutes: 20,
      rinkArea: 'full',
      coachingPoints: [],
      equipment: [],
    });
    const metrics2 = calculatePracticeMetrics(session);
    expect(metrics2.totalMinutes).toBe(60);
    expect(metrics2.remainingMinutes).toBe(0);
    expect(metrics2.status).toBe('exact');

    // Add overtime block
    session.blocks.push({
      id: 'b4',
      title: 'Extra',
      durationMinutes: 10,
      rinkArea: 'full',
      coachingPoints: [],
      equipment: [],
    });
    const metrics3 = calculatePracticeMetrics(session);
    expect(metrics3.totalMinutes).toBe(70);
    expect(metrics3.remainingMinutes).toBe(-10);
    expect(metrics3.status).toBe('over');
  });

  it('creates a practice block accurately from a drill template', () => {
    const tpl = findTemplate('tpl-gates-passing');
    expect(tpl).not.toBeNull();
    if (!tpl) return;

    const block = createBlockFromTemplate(tpl, 15);
    expect(block.title).toBe(tpl.document.metadata.title);
    expect(block.durationMinutes).toBe(15);
    expect(block.rinkArea).toBe(tpl.document.metadata.rinkArea);
    expect(block.coachingPoints.length).toBeGreaterThan(0);
    expect(block.equipment.some(e => e.kind === 'pucks')).toBe(true);
  });
});
