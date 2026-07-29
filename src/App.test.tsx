// ============================================================================
// APP INTEGRATION
//
// Renders the real shell against a fake repository. This is the test that
// catches wiring mistakes - a missing provider, a store the command layer
// cannot reach, a sheet that never mounts - which unit tests cannot see.
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppProvider, type AppServices } from '@/hooks/useAppState';
import { EditorRuntimeProvider } from '@/hooks/useEditorRuntime';
import { FakeRepository } from '@/test/fakeRepository';
import { SaveCoordinator } from '@/persistence';
import { DialogController } from '@/ui/DialogController';
import { Announcer } from '@/ui/announcer';
import { ImportPreviewStore } from '@/ui/ImportPreviewStore';
import { CameraStore } from '@/camera/CameraStore';
import { PlaybackStore } from '@/playback/PlaybackStore';
import { HoldProgressStore } from '@/ui/HoldProgressStore';
import { setViewport, VIEWPORTS } from '@/test/utils';
import { __resetValidationCaches } from '@/editor/useDrillValidation';
import { __resetResponsiveCache } from '@/ui/useResponsive';

import { AppShell } from './AppShell';

let repository: FakeRepository;
let services: AppServices;

function buildServices(): AppServices {
  repository = new FakeRepository();
  return {
    repository,
    coordinator: new SaveCoordinator(repository),
    dialogs: new DialogController(),
    announcer: new Announcer(),
    importPreviews: new ImportPreviewStore(),
    camera: new CameraStore(),
    playback: new PlaybackStore(),
    holdProgress: new HoldProgressStore(),
  };
}

/**
 * Render the shell with injected services. `App` itself wires the singleton
 * repository, so the pieces are composed here instead.
 */
function renderApp() {
  return render(
    <AppProvider services={services}>
      <EditorRuntimeProvider>
        <AppShell />
      </EditorRuntimeProvider>
    </AppProvider>
  );
}

beforeEach(() => {
  vi.stubGlobal('scrollTo', () => undefined);
  __resetValidationCaches();
  __resetResponsiveCache();
  setViewport(VIEWPORTS.desktop);
  services = buildServices();
});

describe('first render', () => {
  it('shows the shell: top strip, rink, transport and tool dock', async () => {
    renderApp();

    expect(await screen.findByRole('button', { name: 'Open main menu' })).toBeInTheDocument();
    expect(screen.getByRole('application', { name: /hockey rink/i })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Editing tools' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Playback position' })).toBeInTheDocument();
  });

  it('offers exactly the three verbs, plus Add and Play', () => {
    renderApp();
    const dock = screen.getByRole('navigation', { name: 'Editing tools' });
    const labels = within(dock)
      .getAllByRole('button')
      .map(button => button.textContent?.replace(/[^A-Za-z]/g, ''));

    // Move, Pass, Skate is the whole vocabulary. Shoot is derived and Erase
    // is done from the selection chip, so neither is a tool any more.
    expect(labels).toEqual(['Move', 'Pass', 'Skate', 'Add', 'Play']);
  });

  it('reports the save status in words', async () => {
    renderApp();
    await waitFor(() =>
      expect(screen.getByRole('status', { name: /^Save status:/ })).toHaveAccessibleName(
        'Save status: Saved'
      )
    );
  });

  it('persists the initial drill on start-up', async () => {
    renderApp();
    await waitFor(() => expect(repository.drills.size).toBe(1));
  });
});

describe('selection does not open a large panel', () => {
  it('has no inspector open on first render', () => {
    renderApp();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('sheets', () => {
  it('opens and closes the Add sheet from the dock', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: /Add/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Add to the rink' });
    expect(within(sheet).getByRole('button', { name: /Home player/ })).toBeInTheDocument();

    await user.click(within(sheet).getByRole('button', { name: 'Close' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Add to the rink' })).not.toBeInTheDocument()
    );
  });

  it('closes the sheet on Escape and restores focus to the opener', async () => {
    const user = userEvent.setup();
    renderApp();

    const opener = screen.getByRole('button', { name: /Add/ });
    await user.click(opener);
    await screen.findByRole('dialog', { name: 'Add to the rink' });

    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Add to the rink' })).not.toBeInTheDocument()
    );
    expect(document.activeElement).toBe(opener);
  });

  it('opens the More sheet with the three separate clear commands', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: 'More actions' }));
    const sheet = await screen.findByRole('dialog', { name: 'More' });

    expect(within(sheet).getByRole('button', { name: /Clear puck actions/ })).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: /Clear skating routes/ })).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: /Reset the board/ })).toBeInTheDocument();
  });

  it('has nothing focusable from the menu while it is closed', () => {
    renderApp();
    expect(screen.queryByRole('dialog', { name: 'PhiceCraft' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Save play/ })).not.toBeInTheDocument();
  });
});

describe('destructive confirmations', () => {
  it('asks before resetting the board, and cancelling changes nothing', async () => {
    const user = userEvent.setup();
    renderApp();
    await waitFor(() => expect(repository.drills.size).toBe(1));

    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(await screen.findByRole('button', { name: /Reset the board/ }));

    const dialog = await screen.findByRole('alertdialog', { name: 'Reset the board?' });
    // The copy states what is removed AND what survives.
    expect(dialog).toHaveTextContent(/Restores the default lineup/);
    expect(dialog).toHaveTextContent(/keeps its name, jersey colours and settings/i);

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });
});

describe('save failure', () => {
  it('shows a persistent failure with Retry and Export, not a fleeting toast', async () => {
    const user = userEvent.setup();
    renderApp();
    await waitFor(() => expect(repository.drills.size).toBe(1));

    repository.failOperation('save', { code: 'quota-exceeded', message: 'full' });
    await services.coordinator.save({ ...services.coordinator.pendingDocument!, name: 'Edited' });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Save failed');
    expect(within(alert).getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(within(alert).getByRole('button', { name: 'Export' })).toBeInTheDocument();

    // It is still there after any toast would have timed out.
    await new Promise(resolve => setTimeout(resolve, 60));
    expect(screen.getByRole('alert')).toHaveTextContent('Save failed');

    repository.clearFailures();
    await user.click(within(alert).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(services.coordinator.getSnapshot().state).toBe('saved'));
  });
});

describe('mode switcher', () => {
  it('offers Build, Preview and Present, with Build active by default', () => {
    renderApp();
    const group = screen.getByRole('radiogroup', { name: 'Mode' });
    const radios = within(group).getAllByRole('radio');
    expect(radios.map(r => r.getAttribute('aria-label') ?? r.textContent)).toEqual(
      expect.arrayContaining(['Build', 'Preview', 'Present'])
    );
    expect(within(group).getByRole('radio', { name: 'Build' })).toHaveAttribute('aria-checked', 'true');
  });

  it('preview hides the editing dock', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('radio', { name: 'Preview' }));
    expect(screen.queryByRole('navigation', { name: 'Editing tools' })).not.toBeInTheDocument();
  });

  it('returning to build restores the dock', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('radio', { name: 'Preview' }));
    await user.click(screen.getByRole('radio', { name: 'Build' }));
    expect(screen.getByRole('navigation', { name: 'Editing tools' })).toBeInTheDocument();
  });
});

describe('responsive shell', () => {
  it('hides Redo from the phone top strip, keeping it in More', async () => {
    const user = userEvent.setup();
    setViewport(VIEWPORTS.phonePortrait);
    __resetResponsiveCache();
    renderApp();

    expect(screen.queryByRole('button', { name: 'Redo' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'More actions' }));
    const sheet = await screen.findByRole('dialog', { name: 'More' });
    expect(within(sheet).getByRole('button', { name: /Redo/ })).toBeInTheDocument();
  });

  it('keeps Redo in the top strip on desktop', () => {
    setViewport(VIEWPORTS.desktop);
    __resetResponsiveCache();
    renderApp();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeInTheDocument();
  });
});
