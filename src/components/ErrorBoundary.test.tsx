// ============================================================================
// ERROR BOUNDARY
//
// The requirement this exists for: when the editor crashes, the drill on
// screen may be the only copy of the user's work, so exporting it has to be
// possible from the crash screen itself - and recovery must never delete
// durable data.
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorBoundary } from './ErrorBoundary';
import { __setRepositoryForTests, getSaveCoordinator } from '@/persistence';
import { FakeRepository } from '@/test/fakeRepository';
import { buildDrill } from '@/test/builders';
import { installFakeLocalStorage } from '@/test/utils';

function Exploding(): never {
  throw new Error('deliberate test explosion');
}

let downloads: { filename: string; contents: string }[];

vi.mock('@/ui/download', () => ({
  downloadTextFile: (filename: string, contents: string) => {
    downloads.push({ filename, contents });
    return true;
  },
}));

beforeEach(() => {
  downloads = [];
  __setRepositoryForTests(new FakeRepository());
  // React logs the caught error; that is expected and would drown the output.
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('when a child throws', () => {
  it('shows a recovery screen instead of a blank page', () => {
    render(
      <ErrorBoundary>
        <Exploding />
      </ErrorBoundary>
    );

    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('PhiceCraft hit an error');
    expect(dialog).toHaveTextContent('deliberate test explosion');
  });

  it('renders children normally when nothing throws', () => {
    render(
      <ErrorBoundary>
        <p>All fine</p>
      </ErrorBoundary>
    );
    expect(screen.getByText('All fine')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('offers emergency export before anything else', () => {
    render(
      <ErrorBoundary>
        <Exploding />
      </ErrorBoundary>
    );

    const buttons = screen.getAllByRole('button').map(button => button.textContent);
    expect(buttons[0]).toMatch(/Export the drill I was working on/);
  });

  it('exports the in-memory drill', async () => {
    const user = userEvent.setup();
    const coordinator = getSaveCoordinator();
    coordinator.markDirty(buildDrill({ name: 'Only Copy' }));

    render(
      <ErrorBoundary>
        <Exploding />
      </ErrorBoundary>
    );

    await user.click(screen.getByRole('button', { name: /Export the drill/ }));

    expect(downloads).toHaveLength(1);
    expect(downloads[0].filename).toContain('Only Copy');
    const payload = JSON.parse(downloads[0].contents);
    expect(payload.containsUnsavedRevision).toBe(true);
    expect(payload.drills[0].name).toBe('Only Copy');
    expect(screen.getByRole('status')).toHaveTextContent('Exported');
  });

  it('says so when there is nothing in memory to export', async () => {
    const user = userEvent.setup();
    getSaveCoordinator().reset();

    render(
      <ErrorBoundary>
        <Exploding />
      </ErrorBoundary>
    );

    await user.click(screen.getByRole('button', { name: /Export the drill/ }));
    expect(downloads).toHaveLength(0);
    expect(screen.getByRole('alert')).toHaveTextContent('Nothing could be exported');
  });

  it('resets interface state without touching the stored drills', async () => {
    const user = userEvent.setup();
    const storage = installFakeLocalStorage({
      phicecraft_settings: '{"theme":"dark"}',
      phicecraft_drills_keep: '{"id":"keep"}',
    });
    const reload = vi.fn();
    vi.stubGlobal('location', { reload });

    render(
      <ErrorBoundary>
        <Exploding />
      </ErrorBoundary>
    );

    await user.click(screen.getByRole('button', { name: /Reset interface state/ }));

    expect(storage.getItem('phicecraft_settings')).toBe(null);
    // Durable drill data is deliberately untouched by a crash recovery.
    expect(storage.getItem('phicecraft_drills_keep')).toBe('{"id":"keep"}');
    expect(reload).toHaveBeenCalled();
  });
});
