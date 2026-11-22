import { importLogo } from './importLogo';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CoachingDetails, Player, PlayerRole } from '@/core/types';
import { jerseyColor } from '@/core/types';
import { Sheet } from '@/components/a11y/Sheet';
import { useAppState, useCommands } from '@/hooks/useAppState';
import { useEditorRuntime } from '@/hooks/useEditorRuntime';
import { downloadText } from '@/ui/download';
import { explainPlay } from './explainPlay';
import { buildDrillStory, storyText, type DrillStory } from './drillStory';
import { printPlayerCards } from './printPlayerCards';
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
  const [tab, setTab] = useState<'explain' | 'players' | 'teams' | 'import'>('explain');
  const [coaching, setCoaching] = useState(state.drill.settings?.coaching ?? emptyCoaching);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [rosters, setRosters] = useState<Partial<Record<'home' | 'away', RosterPlayer[]>>>({});
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const report = useMemo(() => explainPlay(state.drill), [state.drill]);
  const story = useMemo(() => buildDrillStory(state.drill), [state.drill]);
  const showOnRink = (seconds: number) => {
    controller.stop(); dispatch({ type: 'STOP_PLAYBACK' });
    playback.seek(story.durationSeconds > 0 ? Math.min(1, seconds / story.durationSeconds) : 0); close();
  };
  const editable = state.ui.mode === 'build';
  const close = () => dispatch({ type: 'CLOSE_SHEET' });
  const save = () => { commands.setCoaching(coaching); setMessage('Coaching details applied. Use Save play to keep them.'); };

  return <Sheet open title="Coach workspace" description="Draw it. Rehearse it. Explain it." onClose={close} size="full">
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-3 pb-16 safe-bottom">
      <div className="grid grid-cols-4 gap-2" role="group" aria-label="Coaching sections">
        {(['explain', 'players', 'teams', 'import'] as const).map(item => <button type="button" key={item} aria-pressed={tab === item} onClick={() => { setTab(item); setMessage(''); }} className={`${button} ${tab === item ? 'bg-cyan-400/25' : 'border-white/10 bg-white/5 text-white'}`}>{item === 'explain' ? 'Explain' : item === 'players' ? 'Players' : item === 'teams' ? 'Teams' : 'Import'}</button>)}
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
            setMessage(downloadText('drill-handout.txt', storyText(buildDrillStory(draft))) ? 'Drill handout downloaded.' : 'Download unavailable. Try again in your browser.');
          }}>Download handout</button>
          <button className={button} disabled={story.players.length === 0} onClick={() => setMessage(printPlayerCards(state.drill, story) ? 'Player cards opened in a new tab - print or save as PDF.' : 'Allow pop-ups to print the player cards.')}>Print player cards</button>
        </div>
        {story.steps.length === 0
          ? <p className="text-sm text-slate-300">Select a player and drag to draw a skating route. Use Pass and tap a teammate to add the puck sequence.</p>
          : <StoryView story={story} blocked={report.steps.filter(step => step.outcome === 'Blocked').map(step => step.id)} onShow={showOnRink} />}
        {report.issues.length > 0 && <section className="space-y-2 rounded-xl border border-amber-400/25 p-3"><h3 className="font-bold text-amber-200">Review before teaching</h3>{report.issues.map((issue, index) => <p key={index} className="text-sm text-slate-200">{issue.message}</p>)}</section>}
      </>}

      {tab === 'players' && <section className="space-y-3" aria-label="Player jobs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-slate-300">Each player's job in this drill, read from the routes and puck actions you drew.</p>
          <button className={button} disabled={story.players.length === 0} onClick={() => setMessage(printPlayerCards(state.drill, story) ? 'Player cards opened in a new tab - print or save as PDF.' : 'Allow pop-ups to print the player cards.')}>Print all cards</button>
        </div>
        {story.players.length === 0 && <p className="text-sm text-slate-300">Add players to the rink to see their jobs.</p>}
        <div className="grid gap-3 md:grid-cols-2">
          {story.players.map(card => <article key={card.playerId} aria-label={`Job card ${card.label}`} className="space-y-2 rounded-xl border border-white/15 p-3" style={{ borderLeft: `6px solid ${jerseyColor(card.team, state.drill.settings)}` }}>
            <div className="flex items-baseline justify-between gap-2">
              <h4 className="text-base font-black">{card.label}</h4>
              <span className="text-xs text-slate-400">{card.teamName}</span>
            </div>
            <p className="text-sm"><span className="font-bold text-cyan-200">Start:</span> {card.start}</p>
            <ol className="space-y-1">
              {card.duties.map((duty, index) => <li key={index} className="flex gap-2 text-sm">
                <button type="button" className="shrink-0 rounded bg-white/10 px-1.5 font-mono text-xs text-cyan-200 hover:bg-white/20" aria-label={`Show ${duty.atSeconds.toFixed(1)} seconds on the rink`} onClick={() => showOnRink(duty.atSeconds)}>{duty.atSeconds.toFixed(1)}s</button>
                <span>{duty.text}</span>
              </li>)}
            </ol>
            <p className="rounded-lg bg-cyan-400/10 p-2 text-xs text-cyan-100">{card.cues.join(' ')}</p>
            <button className={button} onClick={() => setMessage(printPlayerCards(state.drill, story, [card.playerId]) ? `Card for #${card.number} opened in a new tab.` : 'Allow pop-ups to print the player cards.')}>Print this card</button>
          </article>)}
        </div>
      </section>}

      {tab === 'teams' && <>
        <p className="text-sm text-slate-300">Use your actual team names and on-ice lineup. Names, numbers, roles and colours travel with the saved play.</p>
        <fieldset disabled={!editable} className="space-y-3">
          {(['home', 'away'] as const).map(team => <div key={team} className="flex flex-wrap items-end gap-3">
            <label className="min-w-0 flex-1 text-sm capitalize">{team} team<input aria-label={`${team === 'home' ? 'Home' : 'Away'} team`} className={control} maxLength={80} value={coaching.teams[team]} onChange={event => setCoaching({ ...coaching, teams: { ...coaching.teams, [team]: event.target.value } })} /></label>
            <label className="text-xs">Jersey<input aria-label={`${team} jersey colour`} className="block h-11 w-12 rounded" type="color" value={jerseyColor(team, state.drill.settings)} onChange={event => commands.setJersey(team, event.target.value)} /></label>
            <TeamLogoControl
              team={team}
              logo={coaching.logos?.[team]}
              onChange={logo => {
                const logos = { ...coaching.logos, [team]: logo };
                if (!logo) delete logos[team];
                const next = { ...coaching, logos };
                setCoaching(next);
                commands.setCoaching(next);
                setMessage(logo ? `${team === 'home' ? 'Home' : 'Away'} logo added${team === 'home' ? ' - it is painted at centre ice' : ''}. Save the play to keep it.` : 'Logo removed.');
              }}
              onError={setMessage}
            />
          </div>)}
          <button className={button} onClick={save}>Apply team names</button>
        </fieldset>
        {(['home', 'away'] as const).map(team => <section key={team} className="space-y-2">
          <TeamLibrary team={team} name={coaching.teams[team]} colour={jerseyColor(team, state.drill.settings)} logo={coaching.logos?.[team]} players={state.drill.players.filter(player => player.team === team)} disabled={!editable} onChoose={profile => {
            setRosters(current => ({ ...current, [team]: profile.roster }));
            const next = { ...coaching, teams: { ...coaching.teams, [team]: profile.name }, ...(profile.logo ? { logos: { ...coaching.logos, [team]: profile.logo } } : {}) };
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
          <p className="text-sm text-slate-300">PHormation JSON files include editable routes and puck actions. You can review the import before adding copies to your library.</p>
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

/** Upload, preview and remove one team's logo. */
function TeamLogoControl({ team, logo, onChange, onError }: {
  team: 'home' | 'away';
  logo?: string;
  onChange: (logo: string | undefined) => void;
  onError: (message: string) => void;
}) {
  const label = team === 'home' ? 'Home' : 'Away';
  return <div className="flex items-end gap-1.5 text-xs">
    <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-lg border border-white/15 bg-white/5">
      {logo ? <img src={logo} alt={`${label} team logo`} className="h-full w-full object-contain" /> : <span aria-hidden="true" className="text-white/30">Logo</span>}
    </div>
    <label className="touch-target flex h-11 cursor-pointer items-center rounded-lg border border-white/20 bg-white/5 px-2 font-bold">
      {logo ? 'Change' : 'Add logo'}
      <input aria-label={`${label} team logo`} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={async event => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        try { onChange(await importLogo(file)); }
        catch (error) { onError(error instanceof Error ? error.message : 'Could not read that logo.'); }
      }} />
    </label>
    {logo && <button type="button" aria-label={`Remove ${label.toLowerCase()} team logo`} className="touch-target h-11 rounded-lg border border-white/20 bg-white/5 px-2 font-bold" onClick={() => onChange(undefined)}>✕</button>}
  </div>;
}

/** The generated explanation: overview, setup, numbered steps, cues, mistakes. */
function StoryView({ story, blocked, onShow }: { story: DrillStory; blocked: string[]; onShow: (seconds: number) => void }) {
  return <div className="space-y-3">
    <section className="rounded-xl border border-white/15 p-3">
      <h3 className="text-sm font-bold text-cyan-200">How this drill works</h3>
      <p className="mt-1 text-sm text-slate-200">{story.overview}</p>
      {story.setup.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">{story.setup.map((line, index) => <li key={index}>{line}</li>)}</ul>}
    </section>
    <h3 className="text-sm font-bold">Step by step</h3>
    {story.steps.map(step => <article key={step.number} className="space-y-1.5 rounded-xl border border-white/15 p-3">
      <p className="text-xs font-bold text-cyan-200">STEP {step.number} · {step.startSeconds.toFixed(1)}s</p>
      <h4 className="font-bold">{step.title}</h4>
      <p className="text-sm text-slate-300">{step.detail}</p>
      {step.eventId && blocked.includes(step.eventId) && <p className="text-sm font-bold text-amber-200">This action is blocked in the simulation - review it in Build.</p>}
      <button className={button} onClick={() => onShow(step.startSeconds)}>Show step {step.number} on rink</button>
    </article>)}
    <div className="grid gap-3 md:grid-cols-2">
      <section className="rounded-xl border border-emerald-400/25 p-3">
        <h3 className="text-sm font-bold text-emerald-200">Coaching points</h3>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{story.coachingPoints.map((point, index) => <li key={index}>{point}</li>)}</ul>
      </section>
      <section className="rounded-xl border border-amber-400/25 p-3">
        <h3 className="text-sm font-bold text-amber-200">Watch for</h3>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{story.mistakes.map((point, index) => <li key={index}>{point}</li>)}</ul>
      </section>
    </div>
  </div>;
}
