// ============================================================================
// QUICK SHEETS
//
// The small disclosure sheets the phone dock and rink chips open. Each is a
// list of large targets rather than a dense row of 9px labels.
//
// The Action sheet is gone: Route, Pass and Shoot lived in it, and all three
// are now either a dock button or derived, so the sheet had nothing left to
// disclose.
// ============================================================================

import { useEffect, useState, type ReactNode } from 'react';
import { fitRegionCamera } from '@/camera/cameraMath';
import { Sheet } from '../a11y/Sheet';
import { useAppState, useCommands, useAppServices } from '@/hooks/useAppState';
import { useEditorRuntime } from '@/hooks/useEditorRuntime';
import { loadBoard3D } from '@/render3d/loadBoard3D';
import { getPuckChain } from '@/engine/puck';
import { isReviewComplete } from '@/commands';
import type { Tool } from '@/core/types';
import { useViewActions, VIEW_AREAS } from '../shell/useViewActions';
import {
  BarrierIcon,
  CoachIcon,
  ConeIcon,
  FitIcon,
  FormationIcon,
  GoalieIcon,
  MiniNetIcon,
  OrientationIcon,
  PuckIcon,
  RotateLeftIcon,
  RotateRightIcon,
  ShootIcon,
  SkaterIcon,
  TireIcon,
  ZoneLeftIcon,
  ZoneRightIcon,
} from '@/ui/icons';
import { FORMATION_PRESETS, type PlayFormationPreset } from '@/engine/formations';
import type { QuickSpot } from '@/engine/quickSetups';
import { ModeSwitch } from '../shell/ModeSwitch';

export function SheetItem({
  icon,
  label,
  detail,
  onClick,
  selected,
  tone = 'default',
  disabled,
}: {
  icon: ReactNode;
  label: string;
  detail?: string;
  onClick: () => void;
  selected?: boolean;
  tone?: 'default' | 'danger';
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors disabled:opacity-40 ${
        selected
          ? 'bg-app-cyan/15 text-app-cyan'
          : tone === 'danger'
            ? 'text-red-200 hover:bg-red-500/10'
            : 'text-app-text hover:bg-app-cyan/8'
      }`}
      style={{ minHeight: 'var(--touch-target)' }}
    >
      <span className="flex w-6 shrink-0 items-center justify-center">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold">{label}</span>
        {detail && <span className="block text-[12px] leading-snug text-white/50">{detail}</span>}
      </span>
      {selected && <span aria-hidden="true">✓</span>}
    </button>
  );
}

export function SheetSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="px-1 py-1">
      <h3 className="px-3 pb-1 pt-2 text-[11px] font-black uppercase tracking-wider text-app-cyan/80">
        {title}
      </h3>
      {children}
    </section>
  );
}

// ----------------------------------------------------------------------------

export function AddSheet() {
  const { state, dispatch } = useAppState();
  const commands = useCommands();
  const { camera } = useEditorRuntime();
  const { announcer } = useAppServices();
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [demoStartPending, setDemoStartPending] = useState(false);
  const open = state.ui.openSheet === 'add';
  const [end, setEnd] = useState<'left' | 'right'>('right');
  const [side, setSide] = useState<'top' | 'bottom'>('bottom');
  const spot: QuickSpot = `${end}-${side}`;
  const close = () => dispatch({ type: 'CLOSE_SHEET' });

  useEffect(() => {
    if (!demoStartPending || state.ui.mode !== 'preview') return;
    setDemoStartPending(false);
    camera.setCamera(fitRegionCamera(
      { x: 675, y: 180, width: 300, height: 180 }, camera.viewport,
      { ...camera.camera, rotation: 0, tilt: 0.65 }
    ));
    commands.requestPlaybackStart();
  }, [demoStartPending, state.ui.mode, camera, commands]);

  const choose = (tool: Tool) => {
    commands.setTool(tool);
    close();
  };

  const applyPreset = async (preset: PlayFormationPreset) => {
    close();
    await commands.loadFormation(preset);
  };

  const watchDemo = async () => {
    if (loadingDemo) return;
    setLoadingDemo(true);
    try {
      // Fetch the graphics and models before replacing the board or starting
      // the clock, so a cold load cannot skip the faceoff introduction.
      await loadBoard3D();
      const { loadModel } = await import('@/render3d/modelCache');
      await Promise.all([loadModel('skater'), loadModel('goalie')]);
      close();
      const result = await commands.loadFormation('showcase-faceoff');
      if (result.status !== 'done') return;
      // Start from the next committed render, after the new document reaches
      // the command host and playback store (not in this async-event batch).
      commands.setMode('preview');
      setDemoStartPending(true);
    } catch (error) {
      console.error('Could not launch 3D demo', error);
      announcer.announce('The 3D demo could not load. Choose Edit demo to open it on the flat rink.');
    } finally { setLoadingDemo(false); }
  };

  return (
    <Sheet
      open={open}
      title="Add to the rink"
      description="Start a drill instantly, or add individual players and equipment."
      onClose={close}
    >
      <section className="mx-4 my-3 rounded-xl border border-cyan-300/40 bg-cyan-400/10 p-3" aria-label="Complete demonstration drill">
        <h3 className="text-sm font-bold text-cyan-100">Faceoff to finish</h3>
        <p className="my-2 text-xs text-slate-300">3 attackers, a faceoff partner and goalie. Watch the win, two passes and a shot with a planned save.</p>
        <div className="flex gap-2">
          <button type="button" disabled={loadingDemo || state.ui.mode !== 'build'} onClick={() => void watchDemo()} className="touch-target flex-1 rounded-lg bg-cyan-400 px-3 text-sm font-bold text-slate-950 disabled:opacity-50">{loadingDemo ? 'Loading demo…' : 'Watch 3D demo'}</button>
          <button type="button" disabled={loadingDemo || state.ui.mode !== 'build'} onClick={() => void applyPreset('showcase-faceoff')} className="touch-target rounded-lg border border-white/25 px-3 text-sm text-white disabled:opacity-50">Edit demo</button>
        </div>
      </section>
      <SheetSection title="Quick drill commands">
        <p className="px-3 pb-2 text-xs text-slate-300">Loads an editable lineup. Battles and dump-ins include routes. Undo restores your previous setup.</p>
        <div className="grid grid-cols-2 gap-2 px-3 pb-3">
          <label className="text-xs text-slate-300">Rink end<select className="touch-target mt-1 block w-full rounded-lg border border-white/20 bg-slate-900 px-2 text-sm text-white" value={end} onChange={event => setEnd(event.target.value as typeof end)}><option value="left">Left end</option><option value="right">Right end</option></select></label>
          <label className="text-xs text-slate-300">Board side<select className="touch-target mt-1 block w-full rounded-lg border border-white/20 bg-slate-900 px-2 text-sm text-white" value={side} onChange={event => setSide(event.target.value as typeof side)}><option value="top">Upper boards</option><option value="bottom">Lower boards</option></select></label>
        </div>
        <div className="grid grid-cols-2 gap-2 px-3 pb-2">
          {([
            ['faceoff-center', 'Centre faceoff', '5v5 · both goalies'],
            [`faceoff-${spot}`, 'Zone faceoff', 'At the selected dot'],
            ['pp-131', '5v4 power play', 'Your team attacks · 1-3-1'],
            ['pk-box', '4v5 penalty kill', 'Your team defends · box'],
            [`corner-${spot}`, 'Corner setup', 'Carrier, support & defender'],
            [`dump-in-${spot}`, 'Dump-in', 'Puck flight, chase & retrieval'],
            [`battle-1v1-${spot}`, '1v1 battle', 'Race to a loose corner puck'],
            [`battle-2v2-${spot}`, '2v2 battle', 'Corner battle with support'],
          ] satisfies [PlayFormationPreset, string, string][]).map(([id, label, detail]) => <button key={label} type="button" disabled={state.ui.mode !== 'build'} onClick={() => void applyPreset(id)} className="touch-target min-w-0 rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-3 py-3 text-left text-cyan-100 hover:bg-cyan-400/20 disabled:opacity-40">
            <span className="block text-sm font-bold">{label}</span><span className="mt-1 block text-xs text-slate-300">{detail}</span>
          </button>)}
        </div>
        <p className="px-3 pb-2 text-xs text-slate-400">Location applies to zone faceoffs, corners, battles and dump-ins. Player counts exclude goalies. Your team is Home.</p>
      </SheetSection>
      <SheetSection title="Add individual players">
      <SheetItem
        icon={<SkaterIcon className="text-red-400" />}
        label="Home player"
        detail="Defends the left net"
        selected={state.ui.currentTool === 'home'}
        onClick={() => choose('home')}
      />
      <SheetItem
        icon={<SkaterIcon className="text-blue-400" />}
        label="Away player"
        detail="Defends the right net"
        selected={state.ui.currentTool === 'away'}
        onClick={() => choose('away')}
      />
      <SheetItem
        icon={<GoalieIcon />}
        label="Goalie"
        detail="Joins whichever team defends the end you tap"
        selected={state.ui.currentTool === 'goalie'}
        onClick={() => choose('goalie')}
      />
      <SheetItem
        icon={<CoachIcon />}
        label="Coach"
        detail="A marker on the ice; never handles the puck"
        selected={state.ui.currentTool === 'coach'}
        onClick={() => choose('coach')}
      />
      </SheetSection>
      <SheetSection title="Equipment">
        <SheetItem
          icon={<ConeIcon className="text-orange-400" />}
          label="Cone"
          detail="Agility, boundary or turn pylon"
          selected={state.ui.currentTool === 'cone'}
          onClick={() => choose('cone')}
        />
        <SheetItem
          icon={<TireIcon className="text-slate-400" />}
          label="Tire"
          detail="On-ice obstacle or stickhandling target"
          selected={state.ui.currentTool === 'tire'}
          onClick={() => choose('tire')}
        />
        <SheetItem
          icon={<MiniNetIcon className="text-red-400" />}
          label="Mini net"
          detail="Target net for small-area games & accuracy"
          selected={state.ui.currentTool === 'mini-net'}
          onClick={() => choose('mini-net')}
        />
        <SheetItem
          icon={<BarrierIcon className="text-sky-400" />}
          label="Divider pad"
          detail="Cross-ice bumper or station separator"
          selected={state.ui.currentTool === 'barrier'}
          onClick={() => choose('barrier')}
        />
      </SheetSection>
      <SheetSection title="More systems">
        {FORMATION_PRESETS.filter(preset => preset.id === 'breakout-5v5' || preset.id === 'rush-3v2').map(preset => (
          <SheetItem
            key={preset.id}
            icon={<FormationIcon className="text-app-cyan" />}
            label={preset.title}
            detail={preset.subtitle}
            onClick={() => void applyPreset(preset.id)}
          />
        ))}
      </SheetSection>
    </Sheet>
  );
}

// ----------------------------------------------------------------------------

export function PossessionSheet() {
  const { state, dispatch } = useAppState();
  const commands = useCommands();
  const open = state.ui.openSheet === 'possession';
  const close = () => dispatch({ type: 'CLOSE_SHEET' });

  const chain = getPuckChain(state.drill.players, state.drill.events);

  return (
    <Sheet
      open={open}
      title="Puck possession"
      description="The full chain, in order. Tap an action to inspect it."
      onClose={close}
    >
      {chain.length === 0 ? (
        <p className="px-4 py-3 text-[13px] text-white/50">
          No one has the puck yet. Open a player's Details to give it to them.
        </p>
      ) : (
        <ol className="px-1">
          {chain.map((node, index) => {
            const event = node.eventIndex == null ? null : state.drill.events[node.eventIndex];
            const label = node.player
              ? `#${node.player.number} (${node.player.team})`
              : node.action === 'shot'
                ? `Shot — ${event?.type === 'shot' ? event.result ?? 'engine result' : ''}`
                : 'Loose puck';

            return (
              <li key={`${node.eventIndex ?? 'start'}-${index}`}>
                <SheetItem
                  icon={
                    node.player ? <PuckIcon /> : node.action === 'shot' ? <ShootIcon /> : <PuckIcon className="opacity-40" />
                  }
                  label={label}
                  detail={
                    node.action ? `Step ${index + 1} · ${node.action}` : `Step ${index + 1} · starts with the puck`
                  }
                  onClick={() => {
                    if (event) commands.openEventInspector(event.id);
                    else if (node.player) commands.openPlayerInspector(node.player.id);
                    close();
                  }}
                />
              </li>
            );
          })}
        </ol>
      )}
    </Sheet>
  );
}

// ----------------------------------------------------------------------------

const STEPS = [
  { id: 'setup', label: 'Setup', hint: 'Place players and choose who starts with the puck.' },
  { id: 'movement', label: 'Movement', hint: 'Select a player and tap Skate, or just drag them.' },
  { id: 'puck', label: 'Puck actions', hint: 'Tap Pass, then tap the receiver or the line they are skating.' },
  { id: 'review', label: 'Review', hint: 'Play it through and correct anything the check flags.' },
] as const;

export function WorkflowSheet() {
  const { state, dispatch } = useAppState();
  const commands = useCommands();
  const open = state.ui.openSheet === 'workflow';
  const close = () => dispatch({ type: 'CLOSE_SHEET' });

  const hasCarrier = state.drill.players.filter(player => player.hasPuck).length === 1;
  const complete: Record<string, boolean> = {
    setup: state.drill.players.length > 0 && hasCarrier,
    movement: state.drill.skatePaths.length > 0,
    puck: state.drill.events.length > 0,
    // Real completion: no blocking errors for THIS revision, and the drill has
    // been played to the end or explicitly marked reviewed.
    review: isReviewComplete(state),
  };

  return (
    <Sheet open={open} title="Workflow" description="A guide, not a gate — every step is available at any time." onClose={close}>
      {STEPS.map(step => (
        <SheetItem
          key={step.id}
          icon={complete[step.id] ? '✓' : '•'}
          label={step.label}
          detail={step.hint}
          selected={state.ui.editorStep === step.id}
          onClick={() => {
            commands.setEditorStep(step.id);
            close();
          }}
        />
      ))}

      {state.ui.editorStep === 'review' && !complete.review && (
        <div className="px-4 pb-2 pt-3">
          <button
            type="button"
            onClick={() => {
              commands.completeReview();
              close();
            }}
            className="touch-target w-full rounded-xl border border-emerald-400/40 bg-emerald-400/10 px-3 py-3 text-[13px] font-bold text-emerald-200"
          >
            Mark this version reviewed
          </button>
          <p className="mt-2 text-[12px] leading-snug text-white/50">
            Playing the drill all the way through does this automatically. Any later edit reopens it.
          </p>
        </div>
      )}
    </Sheet>
  );
}

// ----------------------------------------------------------------------------

/** The phone stand-in for the header's `ModeSwitch` - see its own doc comment. */
export function ModeSheet() {
  const { state, dispatch } = useAppState();
  const open = state.ui.openSheet === 'mode';
  const close = () => dispatch({ type: 'CLOSE_SHEET' });

  return (
    <Sheet
      open={open}
      title="Mode"
      description="Build, Preview or Present - the same drill, viewed for a different purpose."
      onClose={close}
    >
      <div className="flex justify-center px-3 py-2">
        <ModeSwitch onSelect={close} />
      </div>
    </Sheet>
  );
}

// ----------------------------------------------------------------------------

export function ViewSheet() {
  const { state, dispatch } = useAppState();
  const commands = useCommands();
  const open = state.ui.openSheet === 'view';
  const close = () => dispatch({ type: 'CLOSE_SHEET' });
  const view = useViewActions();

  const run = (action: () => void, closeAfter = true) => () => {
    action();
    if (closeAfter) close();
  };

  return (
    <Sheet
      open={open}
      title="View"
      description="Change how the rink is framed without covering the ice with extra controls."
      onClose={close}
    >
      <SheetSection title="Perspective">
        <SheetItem
          icon={<OrientationIcon />}
          label={view.is3D ? 'Flat top-down view' : 'Tabletop 3D view'}
          detail={view.is3D ? 'Return to the coaching board layout' : 'Show depth, boards and player models'}
          selected={view.is3D}
          disabled={view.loadingBoard3D}
          onClick={run(view.toggle3D)}
        />
      </SheetSection>

      {!view.is3D && (
        <SheetSection title="Ice area">
          {VIEW_AREAS.map(area => (
            <SheetItem
              key={area.zone}
              icon={area.zone === 'defensive' ? <ZoneLeftIcon /> : area.zone === 'offensive' ? <ZoneRightIcon /> : <FitIcon />}
              label={area.label === 'FULL' ? 'Full ice' : area.label}
              detail={`Frame ${area.description}`}
              selected={view.currentArea.label === area.label}
              onClick={run(() => view.zoomToZone(area.zone))}
            />
          ))}
        </SheetSection>
      )}

      <SheetSection title="Practice Stations / ADM Split">
        <SheetItem
          icon={<FitIcon />}
          label="Full ice (clear bumpers)"
          detail="Remove station divider foam bumpers"
          onClick={run(() => commands.setupStationSplit('full'))}
        />
        <SheetItem
          icon={<BarrierIcon />}
          label="3-Station cross-ice (ADM)"
          detail="Foam divider bumpers at both blue lines"
          onClick={run(() => commands.setupStationSplit('cross-ice-3', 'defensive'))}
        />
        <SheetItem
          icon={<BarrierIcon />}
          label="2-Station half-ice split"
          detail="Foam divider bumpers along the red line"
          onClick={run(() => commands.setupStationSplit('split-2', 'defensive'))}
        />
      </SheetSection>

      {view.is3D && (
        <SheetSection title="3D Camera Angles">
          <SheetItem
            icon={<OrientationIcon />}
            label="Broadcast camera"
            detail="Side-angle broadcast camera perspective"
            onClick={run(view.setPresetBroadcast)}
          />
          <SheetItem
            icon={<OrientationIcon />}
            label="Behind-the-net camera"
            detail="End-zone view looking down the ice"
            onClick={run(view.setPresetEndZone)}
          />
          <SheetItem
            icon={<OrientationIcon />}
            label="Tactical overhead 3D"
            detail="High-angle tactical 3D view"
            onClick={run(view.setPresetTactical)}
          />
          <SheetItem
            icon={<OrientationIcon />}
            label="Player POV chase camera"
            detail="First-person perspective tracking active puck carrier"
            onClick={run(view.setPresetPOV)}
          />
        </SheetSection>
      )}

      {view.is3D && (
        <SheetSection title="Rotate 3D rink">
          <SheetItem icon={<RotateLeftIcon />} label="Spin left" detail="Turn the tabletop view" onClick={run(view.spinLeft, false)} />
          <SheetItem icon={<RotateRightIcon />} label="Spin right" detail="Turn the tabletop view" onClick={run(view.spinRight, false)} />
        </SheetSection>
      )}

      <SheetSection title="Board framing">
        {!view.is3D && (
          <SheetItem
            icon={<OrientationIcon />}
            label={view.isVerticalBoard ? 'Lay rink across screen' : 'Turn rink up screen'}
            detail={view.isVerticalBoard ? 'Use the landscape-style board' : 'Use more height on portrait phones'}
            selected={view.isVerticalBoard}
            onClick={run(view.toggleOrientation)}
          />
        )}
        <SheetItem icon={<FitIcon />} label="Fit full rink" detail="Reset pan and zoom to the whole sheet" onClick={run(view.fit)} />
      </SheetSection>
    </Sheet>
  );
}
