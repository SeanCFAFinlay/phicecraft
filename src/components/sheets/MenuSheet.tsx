// ============================================================================
// MENU SHEET
//
// The saved-plays library and view controls. It is conditionally mounted, so
// when it is closed there is nothing focusable off-screen for Tab to walk into.
// ============================================================================

import { useRef, type ChangeEvent } from 'react';
import {
  ChartIcon,
  CopyIcon,
  DrillIcon,
  ExportIcon,
  FitIcon,
  HelpIcon,
  ImportIcon,
  NewDrillIcon,
  RecoveryIcon,
  RenameIcon,
  SaveIcon,
  SwapIcon,
  ZoneLeftIcon,
  ZoneRightIcon,
} from '@/ui/icons';
import { Sheet } from '../a11y/Sheet';
import { SheetItem, SheetSection } from './QuickSheets';
import { useAppState, useCommands } from '@/hooks/useAppState';
import { useEditorRuntime } from '@/hooks/useEditorRuntime';
import { JERSEY_COLORS, jerseyColor, type Team } from '@/core/types';

// Moved from RinkChips.tsx along with the workflow chip it used to label.
const STEP_NAMES = { setup: 'Setup', movement: 'Movement', puck: 'Puck actions', review: 'Review' } as const;
const STEP_ORDER = ['setup', 'movement', 'puck', 'review'] as const;

function JerseyRow({ team }: { team: Team }) {
  const { state } = useAppState();
  const commands = useCommands();
  const current = jerseyColor(team, state.drill.settings);

  return (
    <div className="px-3 py-2">
      <div className="mb-1.5 text-[12px] font-bold uppercase tracking-wide text-white/50">{team}</div>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={`${team} jersey colour`}>
        {JERSEY_COLORS.map(colour => {
          const active = current.toLowerCase() === colour.hex.toLowerCase();
          return (
            <button
              key={colour.hex}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={colour.name}
              onClick={() => commands.setJersey(team, colour.hex)}
              className={`h-8 w-8 rounded-full border-2 transition ${
                active ? 'border-white ring-2 ring-app-cyan' : 'border-white/25 hover:border-white/60'
              }`}
              style={{ backgroundColor: colour.hex }}
            />
          );
        })}
      </div>
    </div>
  );
}

export function MenuSheet() {
  const { state, dispatch } = useAppState();
  const commands = useCommands();
  const { camera } = useEditorRuntime();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const close = () => dispatch({ type: 'CLOSE_MENU' });
  const stepIndex = STEP_ORDER.indexOf(state.ui.editorStep);

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset immediately so picking the same file twice still fires a change.
    event.target.value = '';
    if (!file) return;
    await commands.prepareImport(await file.text());
  };

  return (
    <Sheet open={state.ui.showMenu} title="PhiceCraft" side="left" onClose={close}>
      <SheetSection title="This play">
        <SheetItem icon={<SaveIcon />} label="Save play" onClick={() => void commands.saveDrill()} />
        <SheetItem
          icon={<CopyIcon />}
          label="Save as a new play…"
          detail="Keeps the original untouched"
          onClick={() => void commands.saveAsNewPlay()}
        />
        <SheetItem icon={<RenameIcon />} label="Rename play" onClick={() => void commands.requestRename()} />
        <SheetItem icon={<NewDrillIcon />} label="New drill" onClick={() => void commands.newDrill()} />
      </SheetSection>

      <SheetSection title="Guide">
        <SheetItem
          icon={<ChartIcon />}
          label={`Guide · Step ${stepIndex + 1} of ${STEP_ORDER.length}`}
          detail={STEP_NAMES[state.ui.editorStep]}
          onClick={() => {
            close();
            dispatch({ type: 'OPEN_SHEET', sheet: 'workflow' });
          }}
        />
      </SheetSection>

      <SheetSection title="Jerseys">
        <JerseyRow team="home" />
        <JerseyRow team="away" />
        <SheetItem icon={<SwapIcon />} label="Swap team colours" onClick={commands.swapJerseys} />
      </SheetSection>

      <SheetSection title={`Saved plays (${state.drillList.length})`}>
        {state.drillList.length === 0 ? (
          <p className="px-4 py-2 text-[13px] italic text-white/45">
            Nothing saved yet — use “Save play” above.
          </p>
        ) : (
          state.drillList.map(drill => (
            <div key={drill.id} className="flex items-center gap-1 px-1">
              <div className="min-w-0 flex-1">
                <SheetItem
                  icon={<DrillIcon />}
                  label={drill.name}
                  selected={drill.id === state.drill.id}
                  onClick={() => void commands.loadDrill(drill.id)}
                />
              </div>
              <button
                type="button"
                onClick={() => void commands.deleteDrill(drill.id)}
                aria-label={`Delete ${drill.name}`}
                className="touch-target shrink-0 rounded-xl px-3 text-[13px] text-white/40 hover:bg-red-500/15 hover:text-red-300"
              >
                ✕
              </button>
            </div>
          ))
        )}
      </SheetSection>

      {/* The four bundled examples used to be the entire library. They are
          still here as a quick way to load a known drill, but the catalogue
          proper is its own surface. */}
      <SheetSection title="Library">
        <SheetItem
          icon={<DrillIcon />}
          label="Browse the drill library"
          detail="Search by age group, rink area and how long you have"
          onClick={() => {
            dispatch({ type: 'CLOSE_MENU' });
            dispatch({ type: 'OPEN_SHEET', sheet: 'library' });
          }}
        />
      </SheetSection>

      <SheetSection title="Backup and files">
        <SheetItem icon={<ExportIcon />} label="Export all plays (JSON)" onClick={() => void commands.exportDrills()} />
        <SheetItem
          icon={<ImportIcon />}
          label="Import from a file"
          detail="Imported as copies unless you confirm a replacement"
          onClick={() => fileInputRef.current?.click()}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          onChange={handleImportFile}
          className="hidden"
        />
        <SheetItem
          icon={<RecoveryIcon />}
          label="Download recovery data"
          detail="Anything that could not be read is kept here"
          onClick={() => void commands.downloadRecoveryBundle()}
        />
      </SheetSection>

      <SheetSection title="View">
        <SheetItem
          icon={<FitIcon />}
          label="Fit the whole rink"
          onClick={() => {
            camera.fit();
            close();
          }}
        />
        <SheetItem
          icon={<ZoneRightIcon />}
          label="Offensive zone"
          onClick={() => {
            camera.zoomToZone('offensive');
            close();
          }}
        />
        <SheetItem
          icon={<ZoneLeftIcon />}
          label="Defensive zone"
          onClick={() => {
            camera.zoomToZone('defensive');
            close();
          }}
        />
      </SheetSection>

      <SheetSection title="Help">
        <SheetItem
          icon={<HelpIcon />}
          label="How to use PhiceCraft"
          onClick={() => dispatch({ type: 'OPEN_SHEET', sheet: 'help' })}
        />
      </SheetSection>
    </Sheet>
  );
}
