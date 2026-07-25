// ============================================================================
// MENU SHEET
//
// The saved-plays library and view controls. It is conditionally mounted, so
// when it is closed there is nothing focusable off-screen for Tab to walk into.
// ============================================================================

import { useRef, type ChangeEvent } from 'react';
import { Sheet } from '../a11y/Sheet';
import { SheetItem, SheetSection } from './QuickSheets';
import { useAppState, useCommands } from '@/hooks/useAppState';
import { useEditorRuntime } from '@/hooks/useEditorRuntime';
import { JERSEY_COLORS, jerseyColor, type Team } from '@/core/types';

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
        <SheetItem icon="💾" label="Save play" onClick={() => void commands.saveDrill()} />
        <SheetItem
          icon="📋"
          label="Save as a new play…"
          detail="Keeps the original untouched"
          onClick={() => void commands.saveAsNewPlay()}
        />
        <SheetItem icon="✏️" label="Rename play" onClick={() => void commands.requestRename()} />
        <SheetItem icon="🏒" label="New drill" onClick={() => void commands.newDrill()} />
      </SheetSection>

      <SheetSection title="Jerseys">
        <JerseyRow team="home" />
        <JerseyRow team="away" />
        <SheetItem icon="🔁" label="Swap team colours" onClick={commands.swapJerseys} />
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
                  icon="🏒"
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

      <SheetSection title="Examples">
        <SheetItem icon="🧪" label="Give and go" onClick={() => void commands.loadFixture('give-and-go')} />
        <SheetItem
          icon="🏒"
          label="5-man corner retrieval"
          onClick={() => void commands.loadFixture('corner-retrieval')}
        />
        <SheetItem
          icon="↔️"
          label="5-man cross-corner attack"
          onClick={() => void commands.loadFixture('cross-corner')}
        />
        <SheetItem
          icon="🔺"
          label="Full-ice criss-cross point shot"
          onClick={() => void commands.loadFixture('low-high')}
        />
      </SheetSection>

      <SheetSection title="Library">
        <SheetItem icon="⬇" label="Export all plays (JSON)" onClick={() => void commands.exportDrills()} />
        <SheetItem
          icon="⬆"
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
          icon="🛟"
          label="Download recovery data"
          detail="Anything that could not be read is kept here"
          onClick={() => void commands.downloadRecoveryBundle()}
        />
      </SheetSection>

      <SheetSection title="View">
        <SheetItem
          icon="⛸"
          label="Fit the whole rink"
          onClick={() => {
            camera.fit();
            close();
          }}
        />
        <SheetItem
          icon="▶"
          label="Offensive zone"
          onClick={() => {
            camera.zoomToZone('offensive');
            close();
          }}
        />
        <SheetItem
          icon="◀"
          label="Defensive zone"
          onClick={() => {
            camera.zoomToZone('defensive');
            close();
          }}
        />
      </SheetSection>

      <SheetSection title="Help">
        <SheetItem
          icon="❓"
          label="How to use PhiceCraft"
          onClick={() => dispatch({ type: 'OPEN_SHEET', sheet: 'help' })}
        />
      </SheetSection>
    </Sheet>
  );
}
