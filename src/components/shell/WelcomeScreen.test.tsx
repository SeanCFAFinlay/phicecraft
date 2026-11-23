import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AppProvider } from '@/hooks/useAppState';
import { EditorRuntimeProvider } from '@/hooks/useEditorRuntime';
import { WelcomeScreen } from './WelcomeScreen';

function mount() {
  return render(
    <AppProvider autoInitialize={false}>
      <EditorRuntimeProvider>
        <WelcomeScreen />
      </EditorRuntimeProvider>
    </AppProvider>
  );
}

describe('WelcomeScreen', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
    localStorage.clear();
  });

  it('stays out of the way of tests unless asked for', () => {
    mount();
    expect(screen.queryByRole('dialog', { name: /welcome/i })).toBeNull();
  });

  it('shows three steps and three ways in, and closes for good', () => {
    window.history.replaceState(null, '', '/?welcome');
    const { unmount } = mount();
    const dialog = screen.getByRole('dialog', { name: /welcome to/i });
    expect(dialog).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByRole('button', { name: /watch an example/i })).toHaveFocus();
    expect(screen.getByRole('button', { name: /browse the drill library/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /start drawing/i }));
    expect(screen.queryByRole('dialog', { name: /welcome to/i })).toBeNull();
    expect(localStorage.getItem('phicecraft.welcomeDone')).toBe('1');
    unmount();
  });

  it('closes on Escape', () => {
    window.history.replaceState(null, '', '/?welcome');
    mount();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: /welcome to/i })).toBeNull();
  });
});
