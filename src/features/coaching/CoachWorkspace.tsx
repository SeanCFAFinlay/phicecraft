import { useEffect, useMemo, useRef, useState } from 'react';
import type { CoachingDetails, Player, PlayerRole } from '@/core/types';
import { jerseyColor } from '@/core/types';
import { Sheet } from '@/components/a11y/Sheet';
import { useAppState, useCommands } from '@/hooks/useAppState';
import { useEditorRuntime } from '@/hooks/useEditorRuntime';
import { downloadText } from '@/ui/download';
import { explainPlay, coachingBrief } from './explainPlay';
import { importSketch } from './importSketch';
import { TeamLibrary } from './TeamLibrary';
import type { RosterPlayer } from './roster';
import { loadBoard3D } from '@/render3d/loadBoard3D';
import { TABLETOP_DEFAULT_TILT } from '@/core/constants';

const control = 'touch-target w-full rounded-xl border border-white/20 bg-slate-900 px-3 py-2 text-sm text-white';
const button = 'touch-target rounded-xl border border-cyan-400/40 bg-cyan-400/10 px-3 py-2 text-sm font-bold text-cyan-200 disabled:opacity-40';
const emptyCoaching: CoachingDetails = { teams: { home: 'Home', away: 'Away' }, objective: '', cues: '' };

function PlayerRow({ player, disabled, roster }: { player: Player; disabled: boolean; roster?: RosterPlayer[] }) {
  const commands = useCommands();
  const [identity, setIdentity] = useState({ name: player.name ?? '', number: player.number, role: player.role });
  return <form className="space-y-2 rounded-xl border border-white/10 p-3" onSubmit={event => {
    event.preventDefault(); commands.updatePlayerIdentity(player.id, identity);
  }}>
    <fieldset disabled={disabled} className="space-y-2">
      {roster && <label className="block text-xs text-slate-300">Choose roster player<select aria-label={`Roster player for #${player.number}`} className={control} value="" onChange={event => {
        const chosen = roster[Number(event.target.value)];
        if (chosen) setIdentity(chosen);
      }}><option value="">Assign to this rink position…</option>{roster.map((person, index) => <option key={index} value={index}>#{person.number} {person.name} ({person.role})</option>)}</select></label>}
      <label className="block text-xs text-slate-300">Player name
        <input className={control} value={identity.name} maxLength={80} placeholder={`Player #${player.number}`} onChange={event => setIdentity({ ...identity, name: event.target.value })} />
      </label>
      <div className="grid grid-cols-[70px_1fr_auto] items-end gap-2">
        <label className="text-xs text-slate-300">Number<input required className={control} maxLength={8} value={identity.number} onChange={event => setIdentity({ ...identity, number: event.target.value })} /></label>
        <label className="text-xs text-slate-300">Position<select className={control} value={identity.role} onChange={event => setIdentity({ ...identity, role: event.target.value as PlayerRole })}>
          {['C', 'LW', 'RW', 'D', 'F', 'G'].map(role => <option key={role}>{role}</option>)}
        </select></label>
        <button className={button} type="submit">Apply</button>
      </div>
    </fieldset>
  </form>;
}

export function CoachWorkspace() {
  const { state, dispatch } = useAppState();
  const commands = useCommands();
  const { playback, camera, controller } = useEditorRuntime();
  const [tab, setTab] = useState<'explain' | 'teams' | 'import'>('explain');
  const [coaching, setCoaching] = useState(state.drill.settings?.coaching ?? emptyCoaching);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [rosters, setRosters] = useState<Partial<Record<'home' | 'away', RosterPlayer[]>>>({});
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const report = useMemo(() => explainPlay(state.drill), [state.drill]);
  const editable = state.ui.mode === 'build';
  const close = () => dispatch({ type: 'CLOSE_SHEET' });
  const save = () => { commands.setCoaching(coaching); setMessage('Coaching details applied. Use Save play to keep them.'); };

  return <Sheet open title="Coach workspace" description="Draw it. Rehearse it. Explain it." onClose={close}>
    <div className="space-y-4 px-3 pb-5">
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Coaching sections">
        {(['explain', 'teams', 'import'] as const).map(item => <button type="button" key={item} aria-pressed={tab === item} onClick={() => { setTab(item); setMessage(''); }} className={`${button} ${tab === item ? 'bg-cyan-400/25' : 'border-white/10 bg-white/5 text-white'}`}>{item === 'explain' ? 'Explain' : item === 'teams' ? 'Teams' : 'Import'}</button>)}
      </div>
      {!editable && <p className="text-sm text-amber-200">Switch to Build to edit teams, notes or imports.</p>}
      {message && <p role="status" className="rounded-xl bg-white/10 p-3 text-sm">{message}</p>}

      {tab === 'explain' && <>
        <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-3">
          <p className="font-bold">{state.drill.name}</p>
          <p className="mt-1 text-sm text-slate-300">{state.drill.players.length} players · {state.drill.skatePaths.length} routes · {report.duration.toFixed(1)} seconds</p>
          <p className="mt-2 text-xs leading-relaxed text-slate-300">This is a rehearsal of your routes and timing, not a prediction of match results. Selected pass and shot outcomes describe the scenario you want to teach.</p>
        </div>
        <fieldset disabled={!editable} className="space-y-3">
          <label className="block text-sm font-bold">What are we learning?<textarea className={`${control} mt-1`} maxLength={1000} rows={2} placeholder="Create space, receive in stride, support the rebound…" value={coaching.objective} onChange={event => setCoaching({ ...coaching, objective: event.target.value })} /></label>
          <label className="block text-sm font-bold">What should everyone watch for?<textarea className={`${control} mt-1`} maxLength={2000} rows={3} placeholder="Player responsibilities, coaching cues, and what success looks like" value={coaching.cues} onChange={event => setCoaching({ ...coaching, cues: event.target.value })} /></label>
          <button className={button} onClick={save}>Apply coaching notes</button>
        </fieldset>
        <div className="flex flex-wrap gap-2">
          <button className={button} onClick={() => { close(); commands.requestPlaybackStart(); }}>Rehearse play</button>
          <button className={button} disabled={busy} onClick={async () => {
            setBusy(true);
            try {
              await loadBoard3D();
              if (!mounted.current) return;
              camera.setCamera({ ...camera.camera, tilt: TABLETOP_DEFAULT_TILT, rotation: -0.4 });
              camera.fit(); commands.setMode('preview'); close();
              commands.requestPlaybackStart();
            } catch { setMessage('3D could not load. You can still rehearse on the flat rink.'); }
            finally { setBusy(false); }
          }}>3D replay</button>
          <button className={button} onClick={() => {
            const draft = { ...state.drill, settings: { ...state.drill.settings!, coaching } };
            setMessage(downloadText('coaching-brief.txt', coachingBrief(draft, explainPlay(draft))) ? 'Coaching brief downloaded.' : 'Download unavailable. Try again in your browser.');
          }}>Download brief</button>
        </div>
        <h3 className="text-sm font-bold">Sequence & outcomes</h3>
        {report.steps.length === 0 && <p className="text-sm text-slate-300">Select a player and drag to draw a skating route. Use Pass and tap a teammate to add the puck sequence.</p>}
        {report.steps.map((step, index) => <article key={step.id} className="space-y-2 rounded-xl border border-white/15 p-3">
          <p className="text-xs font-bold text-cyan-200">STEP {index + 1} · {step.seconds.toFixed(1)}s</p>
          <h4 className="font-bold">{step.action}</h4>
          <p className="text-sm"><span className="font-bold capitalize">{step.outcome}</span>{step.planned ? ` · selected scenario: ${step.planned}` : ''}</p>
          <p className="text-sm text-slate-300">{step.reason}</p>
          <p className="text-sm text-cyan-100">{step.cue}</p>
          <button className={button} onClick={() => { controller.stop(); dispatch({ type: 'STOP_PLAYBACK' }); playback.seek(step.progress); close(); }}>Show step {index + 1} on rink</button>
        </article>)}
        {report.issues.length > 0 && <section className="space-y-2 rounded-xl border border-amber-400/25 p-3"><h3 className="font-bold text-amber-200">Review before teaching</h3>{report.issues.map((issue, index) => <p key={index} className="text-sm text-slate-200">{issue.message}</p>)}</section>}
      </>}

      {tab === 'teams' && <>
        <p className="text-sm text-slate-300">Use your actual team names and on-ice lineup. Names, numbers, roles and colours travel with the saved play.</p>
        <fieldset disabled={!editable} className="space-y-3">
          {(['home', 'away'] as const).map(team => <div key={team} className="flex items-end gap-3">
            <label className="min-w-0 flex-1 text-sm capitalize">{team} team<input aria-label={`${team === 'home' ? 'Home' : 'Away'} team`} className={control} maxLength={80} value={coaching.teams[team]} onChange={event => setCoaching({ ...coaching, teams: { ...coaching.teams, [team]: event.target.value } })} /></label>
            <label className="text-xs">Jersey<input aria-label={`${team} jersey colour`} className="block h-11 w-12 rounded" type="color" value={jerseyColor(team, state.drill.settings)} onChange={event => commands.setJersey(team, event.target.value)} /></label>
          </div>)}
          <button className={button} onClick={save}>Apply team names</button>
        </fieldset>
        {(['home', 'away'] as const).map(team => <section key={team} className="space-y-2">
          <TeamLibrary team={team} name={coaching.teams[team]} colour={jerseyColor(team, state.drill.settings)} players={state.drill.players.filter(player => player.team === team)} disabled={!editable} onChoose={profile => {
            setRosters(current => ({ ...current, [team]: profile.roster }));
            const next = { ...coaching, teams: { ...coaching.teams, [team]: profile.name } };
            setCoaching(next); commands.setCoaching(next); commands.setJersey(team, profile.colour);
          }} />
          <h3 className="font-bold">{coaching.teams[team] || team} lineup</h3>
          {state.drill.players.filter(player => player.team === team).map(player => <PlayerRow key={`${player.id}:${player.name}:${player.number}:${player.role}`} player={player} disabled={!editable} roster={rosters[team]} />)}
        </section>)}
        <button disabled={!editable} className={button} onClick={() => { close(); dispatch({ type: 'OPEN_SHEET', sheet: 'add' }); }}>Add a player to the rink</button>
      </>}

      {tab === 'import' && <div className="space-y-4">
        <section className="space-y-3 rounded-xl border border-white/15 p-3">
          <h3 className="font-bold">Bring in a drawn play</h3>
          <p className="text-sm text-slate-300">Choose a photo or scan. Keep it beside the rink while you recreate the players, routes and passes. The image is a reference; it is not automatically converted into a simulation.</p>
          <label className="block text-sm">Sketch image (PNG, JPG, WebP)
            <input className="mt-2 w-full text-sm" type="file" accept="image/png,image/jpeg,image/webp" disabled={!editable || busy} onChange={async event => {
              const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
              setBusy(true); setMessage('Preparing sketch…');
              try { const referenceImage = await importSketch(file); if (!mounted.current) return; const next = { ...coaching, referenceImage }; setCoaching(next); commands.setCoaching(next); setMessage('Sketch attached. Close this panel to draw beside it. Save the play to keep the sketch.'); }
              catch (error) { setMessage(error instanceof Error ? error.message : 'Could not read this image.'); }
              finally { setBusy(false); }
            }} />
          </label>
          {coaching.referenceImage && <><img alt="Attached play sketch" src={coaching.referenceImage} className="max-h-48 w-full rounded object-contain" /><button disabled={!editable} className={button} onClick={() => { const next = { ...coaching, referenceImage: undefined }; setCoaching(next); commands.setCoaching(next); }}>Remove sketch</button></>}
          <button disabled={!editable || busy} className={button} onClick={() => { camera.setCamera({ ...camera.camera, tilt: 0, rotation: 0 }); close(); }}>Draw on the rink</button>
        </section>
        <section className="space-y-3 rounded-xl border border-white/15 p-3">
          <h3 className="font-bold">Import saved plays</h3>
          <p className="text-sm text-slate-300">PhiceCraft JSON files include editable routes and puck actions. You can review the import before adding copies to your library.</p>
          <label className="block text-sm">Play file (JSON)<input className="mt-2 w-full text-sm" type="file" accept="application/json,.json" disabled={!editable || busy} onChange={async event => {
            const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
            if (file.size > 10 * 1024 * 1024) { setMessage('Choose a play file smaller than 10 MB.'); return; }
            setBusy(true);
            try { await commands.prepareImport(await file.text()); } catch { setMessage('Could not read the play file.'); } finally { setBusy(false); }
          }} /></label>
        </section>
      </div>}
    </div>
  </Sheet>;
}
