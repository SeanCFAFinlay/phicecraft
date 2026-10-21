import { describe, it, expect } from 'vitest';
import {
  calculatePracticeMetrics,
  createBlankPracticeSession,
  createCustomBlock,
} from './practiceStore';
import type { PracticeBlock } from './types';

describe('Practice station concurrency & equipment demand', () => {
  it('three simultaneous ten-minute stations take ten activity minutes for one rotation', () => {
    const session = createBlankPracticeSession(60, '1-Rotation Station Test');
    const stA: PracticeBlock = {
      ...createCustomBlock('Station A', 10),
      stationSplit: 'station_a',
      rotations: 1,
      changeoverMinutes: 0,
    };
    const stB: PracticeBlock = {
      ...createCustomBlock('Station B', 10),
      stationSplit: 'station_b',
      rotations: 1,
      changeoverMinutes: 0,
    };
    const stC: PracticeBlock = {
      ...createCustomBlock('Station C', 10),
      stationSplit: 'station_c',
      rotations: 1,
      changeoverMinutes: 0,
    };

    session.blocks = [stA, stB, stC];
    const metrics = calculatePracticeMetrics(session);

    // 1 rotation of 3 simultaneous 10-min stations = 10 minutes total
    expect(metrics.totalMinutes).toBe(10);
  });

  it('three groups visiting all three stations take thirty activity minutes plus explicit changeovers', () => {
    const session = createBlankPracticeSession(60, '3-Rotation Station Test');
    const stA: PracticeBlock = {
      ...createCustomBlock('Station A', 10),
      stationSplit: 'station_a',
      rotations: 3,
      changeoverMinutes: 2, // 2 minutes total changeovers
    };
    const stB: PracticeBlock = {
      ...createCustomBlock('Station B', 10),
      stationSplit: 'station_b',
      rotations: 3,
      changeoverMinutes: 2,
    };
    const stC: PracticeBlock = {
      ...createCustomBlock('Station C', 10),
      stationSplit: 'station_c',
      rotations: 3,
      changeoverMinutes: 2,
    };

    session.blocks = [stA, stB, stC];
    const metrics = calculatePracticeMetrics(session);

    // 3 rotations of 10 min = 30 min + 2 min changeover = 32 minutes total
    expect(metrics.totalMinutes).toBe(32);
  });

  it('eight reusable cones used sequentially require eight cones in total', () => {
    const session = createBlankPracticeSession(60, 'Sequential Cones');
    const b1: PracticeBlock = {
      ...createCustomBlock('Drill 1', 15),
      stationSplit: 'full',
      equipment: [{ kind: 'cone', count: 8 }],
    };
    const b2: PracticeBlock = {
      ...createCustomBlock('Drill 2', 15),
      stationSplit: 'full',
      equipment: [{ kind: 'cone', count: 8 }],
    };

    session.blocks = [b1, b2];
    const metrics = calculatePracticeMetrics(session);

    // Cones used sequentially are reused; peak demand is 8
    expect(metrics.peakConcurrentEquipment?.['cone']).toBe(8);
  });

  it('three concurrent eight-cone setups require twenty-four cones', () => {
    const session = createBlankPracticeSession(60, 'Concurrent Cones');
    const stA: PracticeBlock = {
      ...createCustomBlock('Station A', 12),
      stationSplit: 'station_a',
      equipment: [{ kind: 'cone', count: 8 }],
    };
    const stB: PracticeBlock = {
      ...createCustomBlock('Station B', 12),
      stationSplit: 'station_b',
      equipment: [{ kind: 'cone', count: 8 }],
    };
    const stC: PracticeBlock = {
      ...createCustomBlock('Station C', 12),
      stationSplit: 'station_c',
      equipment: [{ kind: 'cone', count: 8 }],
    };

    session.blocks = [stA, stB, stC];
    const metrics = calculatePracticeMetrics(session);

    // Concurrently active stations need equipment at the same time: 8 + 8 + 8 = 24
    expect(metrics.peakConcurrentEquipment?.['cone']).toBe(24);
  });
});
