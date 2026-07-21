// ============================================================================
// SIDE MENU - Slide-out navigation menu
// ============================================================================

import { useRef, type ChangeEvent } from 'react';
import { useAppState } from '@/hooks/useAppState';

interface MenuItemProps {
  icon: string;
  label: string;
  onClick: () => void;
  dim?: boolean;
}

function MenuItem({ icon, label, onClick, dim }: MenuItemProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2.5 py-3 px-3.5 text-[13px] cursor-pointer border-l-2 border-transparent transition-colors text-left w-full bg-transparent text-app-text ${
        dim ? 'opacity-30' : ''
      } hover:bg-app-cyan/5 hover:border-l-app-cyan hover:text-app-cyan active:bg-app-cyan/10`}
    >
      <span className="text-[15px] w-5 text-center">{icon}</span>
      {label}
    </button>
  );
}

/**
 * A saved drill: click the name to open it, the × to delete it.
 */
function DrillRow({
  name,
  isCurrent,
  onOpen,
  onDelete,
}: {
  name: string;
  isCurrent: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`flex items-center border-l-2 transition-colors ${
        isCurrent ? 'border-l-app-cyan bg-app-cyan/5' : 'border-transparent hover:bg-app-cyan/5'
      }`}
    >
      <button
        onClick={onOpen}
        className={`flex-1 flex items-center gap-2.5 py-2.5 px-3.5 text-[13px] text-left bg-transparent cursor-pointer overflow-hidden ${
          isCurrent ? 'text-app-cyan' : 'text-app-text hover:text-app-cyan'
        }`}
      >
        <span className="text-[15px] w-5 text-center flex-shrink-0">🏒</span>
        <span className="truncate">{name}</span>
      </button>
      <button
        onClick={onDelete}
        aria-label={`Delete ${name}`}
        title={`Delete ${name}`}
        className="w-9 h-9 mr-1 flex-shrink-0 bg-transparent text-app-dim text-sm cursor-pointer rounded hover:bg-red-500/15 hover:text-red-400"
      >
        ✕
      </button>
    </div>
  );
}

function MenuDivider() {
  return <div className="h-px bg-app-border mx-3.5 my-1" />;
}

function MenuSection({ title }: { title: string }) {
  return (
    <div className="px-3.5 pt-2.5 pb-0.5 text-[9px] tracking-wider text-app-cyan uppercase font-bold">
      {title}
    </div>
  );
}

export function SideMenu() {
  const { state, actions } = useAppState();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleNewDrill = () => {
    if (!confirm('Start new drill?')) return;
    actions.stopPlayback();
    actions.newDrill();
    actions.closeMenu();
    actions.showToast('New drill', 'success');
  };

  const handleDeleteDrill = (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    actions.stopPlayback();
    actions.deleteDrill(id);
  };

  const handleOpenDrill = (id: string) => {
    if (id === state.drill.id) {
      actions.closeMenu();
      return;
    }
    actions.stopPlayback();
    actions.loadDrill(id);
    actions.closeMenu();
  };

  const handleImportFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset immediately so picking the same file twice still fires a change.
    e.target.value = '';
    if (!file) return;

    try {
      actions.importDrills(await file.text());
      actions.closeMenu();
    } catch {
      actions.showToast('Could not read that file', 'error');
    }
  };

  return (
    <>
      {/* Overlay */}
      <div
        onClick={actions.closeMenu}
        className={`fixed inset-0 bg-black/50 z-[70] transition-opacity ${
          state.ui.showMenu
            ? 'opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Menu */}
      <div
        className={`fixed top-0 left-0 bottom-0 w-[min(280px,85vw)] bg-[rgba(5,12,20,0.99)] border-r border-app-border z-[80] flex flex-col overflow-y-auto transition-transform duration-300 ${
          state.ui.showMenu ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center gap-2.5 p-4 border-b border-app-border">
          <div className="w-[42px] h-[42px] rounded-lg bg-app-surface flex items-center justify-center text-app-cyan text-xl">
            🏒
          </div>
          <div>
            <div className="text-base font-black tracking-wider text-white">
              PHICE<span className="text-app-cyan">CRAFT</span>
            </div>
            <div className="text-[9px] tracking-wider text-app-dim uppercase mt-0.5">
              Hockey Drill Designer
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <MenuSection title="Quick Actions" />
        <MenuItem
          icon="▶"
          label="Play Drill"
          onClick={() => {
            actions.closeMenu();
            setTimeout(() => actions.startPlayback(), 300);
          }}
        />
        <MenuItem
          icon="💾"
          label="Save Play"
          onClick={() => {
            actions.saveDrill();
            actions.closeMenu();
          }}
        />
        <MenuItem
          icon="📋"
          label="Save As New Play…"
          onClick={() => {
            const name = prompt('Name this play', `${state.drill.name} (copy)`);
            if (name && name.trim()) actions.saveAsNewPlay(name);
            actions.closeMenu();
          }}
        />

        <MenuDivider />

        {/* Drill */}
        <MenuSection title="Drill" />
        <MenuItem
          icon="✏️"
          label="Rename Drill"
          onClick={() => {
            actions.closeMenu();
            setTimeout(() => actions.showRenameModal(), 300);
          }}
        />
        <MenuItem
          icon="🏒"
          label="New Drill"
          onClick={handleNewDrill}
        />
        <MenuItem
          icon="🧪"
          label="Open Mechanics Demo"
          onClick={() => {
            actions.stopPlayback();
            actions.loadMechanicsDemo();
            actions.closeMenu();
            actions.showToast('Loaded the #11 to #13 pass-and-shoot demo', 'success', 3200);
          }}
        />
        <MenuItem
          icon="🏒"
          label="Open 5-Man Corner Retrieval"
          onClick={() => {
            actions.stopPlayback();
            actions.loadFiveManCornerRetrieval();
            actions.closeMenu();
            actions.showToast('Loaded coach dump, retrieval, two passes, and shot', 'success', 3600);
          }}
        />
        <MenuItem
          icon="↔️"
          label="Open 5-Man Cross-Corner Attack"
          onClick={() => {
            actions.stopPlayback();
            actions.loadFiveManCrossCorner();
            actions.closeMenu();
            actions.showToast('Loaded cross-corner attack and slot shot', 'success', 3400);
          }}
        />
        <MenuItem
          icon="🔺"
          label="Open Full-Ice Criss-Cross Point Shot"
          onClick={() => {
            actions.stopPlayback();
            actions.loadFiveManLowHigh();
            actions.closeMenu();
            actions.showToast('Loaded full-ice criss-cross, point pass, and slot shot', 'success', 3600);
          }}
        />
        <MenuItem
          icon="⬇"
          label="Export All (JSON)"
          onClick={() => actions.exportDrills()}
        />
        <MenuItem
          icon="⬆"
          label="Import from File"
          onClick={() => fileInputRef.current?.click()}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          onChange={handleImportFile}
          className="hidden"
        />

        <MenuDivider />

        {/* Saved plays library */}
        <MenuSection title={`Saved Plays (${state.drillList.length})`} />
        {state.drillList.length === 0 ? (
          <div className="px-3.5 py-3 text-[12px] text-app-dim italic">
            No saved plays yet — use “Save Play” above
          </div>
        ) : (
          state.drillList.map(drill => (
            <DrillRow
              key={drill.id}
              name={drill.name}
              isCurrent={drill.id === state.drill.id}
              onOpen={() => handleOpenDrill(drill.id)}
              onDelete={() => handleDeleteDrill(drill.id, drill.name)}
            />
          ))
        )}

        <MenuDivider />

        {/* View */}
        <MenuSection title="View" />
        <MenuItem
          icon="⛸"
          label="Full Rink"
          onClick={() => {
            actions.fitCamera();
            actions.closeMenu();
          }}
        />
        <MenuItem
          icon="▶"
          label="Offensive Zone"
          onClick={() => {
            actions.zoomToZone('offensive');
            actions.closeMenu();
          }}
        />
        <MenuItem
          icon="◀"
          label="Defensive Zone"
          onClick={() => {
            actions.zoomToZone('defensive');
            actions.closeMenu();
          }}
        />

        <MenuDivider />

        {/* How To Use */}
        <MenuSection title="How To Use" />
        <MenuItem icon="🏒" label="Drag from puck carrier → pass or dump" onClick={() => {}} dim />
        <MenuItem icon="⟶" label="Drag from any route point → release puck there" onClick={() => {}} dim />
        <MenuItem icon="🥅" label="Shot starts from carrier's final route point" onClick={() => {}} dim />
        <MenuItem icon="〰" label="Drag any player → draws skate route" onClick={() => {}} dim />
        <MenuItem icon="✋" label="Hold player (0.7s) → reposition" onClick={() => {}} dim />
        <MenuItem icon="🤏" label="Pinch or scroll → zoom in/out" onClick={() => {}} dim />
        <MenuItem icon="🖐" label="Drag empty ice → pan the rink" onClick={() => {}} dim />

        <MenuDivider />

        {/* Version */}
        <MenuSection title="Version" />
        <MenuItem icon="✅" label="v2.0 — Deterministic hockey mechanics" onClick={() => {}} dim />
      </div>
    </>
  );
}
