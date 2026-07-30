// ============================================================================
// APP INTEGRATION
//
// Renders the real shell against a fake repository. This is the test that
// catches wiring mistakes - a missing provider, a store the command layer
// cannot reach, a sheet that never mounts - which unit tests cannot see.
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
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
import { flush, pointer, setViewport, VIEWPORTS } from '@/test/utils';
import { createNewDrill } from '@/engine/drill';
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

  it('switching to Preview shows the Preview region', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('radio', { name: 'Preview' }));
    expect(screen.getByRole('region', { name: 'Preview' })).toBeInTheDocument();
  });
});

describe('preview mode', () => {
  it('shows the preview bar with transport and speed controls', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('radio', { name: 'Preview' }));
    const bar = screen.getByRole('region', { name: 'Preview' });
    expect(
      within(bar).getByRole('button', { name: /^(Start|Pause) playback$/ })
    ).toBeInTheDocument();
    expect(within(bar).getByRole('radiogroup', { name: /speed/i })).toBeInTheDocument();
  });

  it('tapping a player in preview does not arm anything or open chips', async () => {
    const user = userEvent.setup();
    renderApp();

    // Seed a player in Build, via the Add sheet, the same way the dock does it.
    await user.click(screen.getByRole('button', { name: /Add/ }));
    const addSheet = await screen.findByRole('dialog', { name: 'Add to the rink' });
    await user.click(within(addSheet).getByRole('button', { name: /Home player/ }));

    const rink = screen.getByRole('application', { name: /hockey rink/i });
    const playerTap = { pointerId: 1, x: 300, y: 200 };
    // Raw pointer events bypass Testing Library's act() wrapping, so the
    // resulting dispatch must be flushed explicitly before anything after it
    // can rely on the committed state.
    await act(async () => {
      pointer.down(rink, playerTap);
      pointer.up(rink, playerTap);
    });

    // Back to Move, so a tap on the token would normally select it.
    await user.click(screen.getByRole('button', { name: 'Move' }));

    await user.click(screen.getByRole('radio', { name: 'Preview' }));

    // Same spot the player was placed at - would select it in Build.
    await act(async () => {
      pointer.down(rink, playerTap);
      pointer.up(rink, playerTap);
    });

    expect(screen.queryByRole('button', { name: /Details/ })).not.toBeInTheDocument();
  });
});

describe('present mode', () => {
  it('hides all editing chrome', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('radio', { name: 'Present' }));
    expect(screen.queryByRole('navigation', { name: 'Editing tools' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exit presentation' })).toBeInTheDocument();
  });

  it('its Play button routes through playback validation', async () => {
    const user = userEvent.setup();
    renderApp(); // empty drill: no routes, no events
    await user.click(screen.getByRole('radio', { name: 'Present' }));
    await user.click(screen.getByRole('button', { name: /play/i }));
    // requestPlaybackStart rejects an empty drill with this exact warning toast.
    // It also announces the same copy through the live region, so both are
    // matched rather than asserting on a single unique node.
    const warnings = await screen.findAllByText(
      'Add a skating route or a puck action before playing.'
    );
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('Escape exits to build', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('radio', { name: 'Present' }));
    await user.keyboard('{Escape}');
    expect(screen.getByRole('radiogroup', { name: 'Mode' })).toBeInTheDocument();
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

  it('a phone frames a zone for a reopened drill that happens to have zero players', async () => {
    setViewport(VIEWPORTS.phonePortrait);
    __resetResponsiveCache();

    // The boot fixture (`createInitialState`) seeds the default 12-player
    // lineup, so it is not itself an empty drill. A genuinely empty one here
    // is a drill with no players saved as the repository's current one, which
    // `initialize()` reopens on mount - the zero-player fallback trigger,
    // distinct from (and in addition to) the new-drill-creation trigger
    // covered below.
    const emptyDrill = { ...createNewDrill(), players: [] };
    await repository.save(emptyDrill);
    await repository.setCurrentDrillId(emptyDrill.id);

    renderApp();
    await flush();
    expect(services.camera.zone).toBe('offensive');
  });

  it('a phone frames a freshly created drill on a zone, default lineup and all', async () => {
    const user = userEvent.setup();
    setViewport(VIEWPORTS.phonePortrait);
    __resetResponsiveCache();
    renderApp();
    await waitFor(() => expect(repository.drills.size).toBe(1));

    // The real `commands.newDrill()` flow, via the menu - the default lineup
    // is 12 players, so this only passes if the zone default fires on
    // creation rather than waiting for an empty board.
    await user.click(screen.getByRole('button', { name: 'Open main menu' }));
    await user.click(await screen.findByRole('button', { name: 'New drill' }));
    const confirm = await screen.findByRole('dialog', { name: 'Start a new drill?' });
    await user.click(within(confirm).getByRole('button', { name: 'New drill' }));

    await flush();
    expect(services.camera.zone).toBe('offensive');
  });

  it('a desktop keeps the full sheet', async () => {
    renderApp();
    await flush();
    expect(services.camera.zone).toBe('full');
  });
});
