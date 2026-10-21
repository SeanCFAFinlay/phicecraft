import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PracticeRunner } from './PracticeRunner';
import { loadSessionRunState } from './practiceRunnerStorage';
import { createBlankPracticeSession, createCustomBlock } from '@/domain/practice/practiceStore';
import type { PracticeSession } from '@/domain/practice/types';

describe('PracticeRunner', () => {
  let session: PracticeSession;

  beforeEach(() => {
    localStorage.clear();
    session = createBlankPracticeSession(60, 'Peewee Game Prep');
    session.blocks = [
      createCustomBlock('Station A: Passing', 10),
      createCustomBlock('Station B: Battles', 12),
      createCustomBlock('Full Team Scrimmage', 15),
    ];
  });

  it('renders initial runner state with large timer and first block', () => {
    render(<PracticeRunner session={session} onClose={() => {}} />);

    expect(screen.getByText('Station A: Passing')).toBeDefined();
    expect(screen.getByText('10:00')).toBeDefined();
    expect(screen.getByText('Up Next (Activity 2)')).toBeDefined();
  });

  it('starts and pauses the timer on button click', () => {
    render(<PracticeRunner session={session} onClose={() => {}} />);

    const toggleBtn = screen.getByText('▶ Start Timer');
    fireEvent.click(toggleBtn);

    expect(screen.getByText('⏸ Pause')).toBeDefined();

    fireEvent.click(screen.getByText('⏸ Pause'));
    expect(screen.getByText('▶ Start Timer')).toBeDefined();
  });

  it('explicitly advances on Complete Block without duplicate completion', () => {
    render(<PracticeRunner session={session} onClose={() => {}} />);

    const completeBtn = screen.getByText('✓ Complete & Next');
    fireEvent.click(completeBtn);

    // Advanced to block 2
    expect(screen.getByText('Station B: Battles')).toBeDefined();

    // Verify stored session run state
    const stored = loadSessionRunState(session.id);
    expect(stored.completedBlockIds).toHaveLength(1);
    expect(stored.completedBlockIds[0]).toBe(session.blocks[0].id);
  });

  it('records coach observations per block', () => {
    render(<PracticeRunner session={session} onClose={() => {}} />);

    const input = screen.getByPlaceholderText(/F2 struggled/i);
    fireEvent.change(input, { target: { value: 'Good stick positioning by defense.' } });

    const stored = loadSessionRunState(session.id);
    expect(stored.observations[session.blocks[0].id]).toBe('Good stick positioning by defense.');
  });
});
