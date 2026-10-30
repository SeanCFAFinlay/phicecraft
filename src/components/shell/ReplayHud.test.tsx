import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppProvider } from '@/hooks/useAppState';
import { EditorRuntimeProvider } from '@/hooks/useEditorRuntime';
import { ReplayHud } from './ReplayHud';

describe('Drill Information ReplayHud', () => {
  it('renders compact pill and expands to show objective, cues, and narration', () => {
    render(
      <AppProvider autoInitialize={false}>
        <EditorRuntimeProvider>
          <ReplayHud />
        </EditorRuntimeProvider>
      </AppProvider>
    );

    // Initial compact pill on mobile/default jsdom
    const expandBtn = screen.getByRole('button', { name: /expand drill details/i });
    expect(expandBtn).toBeInTheDocument();

    // Click expand
    fireEvent.click(expandBtn);

    // Now in expanded mode:
    expect(screen.getByText(/TACTICAL HUD|DRILL REPLAY/i)).toBeInTheDocument();
    expect(screen.getByText(/Objective/i)).toBeInTheDocument();
    expect(screen.getByText(/Live Play-by-Play/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /teach guide/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /practice plan/i })).toBeInTheDocument();

    // Now collapse it back
    const collapseBtn = screen.getByRole('button', { name: /collapse drill details/i });
    fireEvent.click(collapseBtn);

    // Should return to compact pill
    expect(screen.getByRole('button', { name: /expand drill details/i })).toBeInTheDocument();
  });
});
