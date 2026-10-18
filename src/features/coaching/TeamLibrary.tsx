import { useEffect, useState } from 'react';
import type { Player, Team } from '@/core/types';
import { useAppServices } from '@/hooks/useAppState';
import { downloadText } from '@/ui/download';
import { parseRosterCsv, rosterCsv, savedTeamSchema, savedTeamsSchema, TEAMS_KEY, type RosterPlayer, type SavedTeam } from './roster';

const button = 'touch-target rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm font-bold disabled:opacity-40';

export function TeamLibrary({ team, name, colour, players, disabled, onChoose }: {
  team: Team; name: string; colour: string; players: Player[]; disabled: boolean;
  onChoose: (profile: SavedTeam) => void;
}) {
  const { repository } = useAppServices();
  const [teams, setTeams] = useState<SavedTeam[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [roster, setRoster] = useState<RosterPlayer[] | null>(null);
  useEffect(() => {
    let active = true;
    void repository.getMeta<unknown>(TEAMS_KEY).then(result => {
      if (!active) return;
      if (!result.ok) { setMessage('Team library could not be loaded. Try reopening this panel.'); return; }
      const parsed = savedTeamsSchema.safeParse(result.value ?? []);
      if (parsed.success) { setTeams(parsed.data); setLoading(false); }
      else setMessage('Saved team data could not be read. It has been kept unchanged.');
    });
    return () => { active = false; };
  }, [repository]);

  const lineup = roster ?? players.map(player => ({ name: player.name || `Player ${player.number}`, number: player.number, role: player.role }));
  return <fieldset disabled={disabled || busy || loading} className="space-y-3 rounded-xl border border-white/15 p-3">
    <legend className="px-1 text-sm font-bold">{team === 'home' ? 'Home' : 'Away'} team library</legend>
    <p className="text-xs text-slate-300">Import your full roster, save it on this device, then choose a player for each rink position below.</p>
    <label className="block text-sm">Saved team<select aria-label={`${team} saved team`} className="mt-1 min-h-11 w-full rounded-lg bg-slate-900 p-2" defaultValue="" onChange={event => {
      const chosen = teams.find(item => item.id === event.target.value);
      if (chosen) { setRoster(chosen.roster); onChoose(chosen); setMessage(`${chosen.roster.length} roster players ready to assign.`); }
    }}><option value="">Choose a saved team…</option>{teams.map(item => <option key={item.id} value={item.id}>{item.name} ({item.roster.length})</option>)}</select></label>
    <label className="block text-sm">Import roster CSV<input className="mt-2 w-full text-xs" type="file" accept=".csv,text/csv" onChange={async event => {
      const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
      if (file.size > 100000) { setMessage('Roster file must be smaller than 100 KB.'); return; }
      setBusy(true);
      try { const imported = parseRosterCsv(await file.text()); setRoster(imported); onChoose({ id: '', name, colour, roster: imported }); setMessage(`${imported.length} players imported. Save team to reuse this roster.`); }
      catch (error) { setMessage(error instanceof Error ? error.message : 'Could not read roster.'); }
      finally { setBusy(false); }
    }} /></label>
    <p className="text-xs text-slate-400">Columns: name,number,role. Example: Alex,27,C</p>
    <div className="flex flex-wrap gap-2">
      <button type="button" className={button} onClick={async () => {
        const parsed = savedTeamSchema.safeParse({ id: crypto.randomUUID(), name, colour, roster: lineup });
        if (!parsed.success) { setMessage('Give the team a name and add 1–100 roster players.'); return; }
        setBusy(true);
        // Read again so saving another side cannot overwrite its new profile.
        const latest = await repository.getMeta<unknown>(TEAMS_KEY);
        const existing = latest.ok ? savedTeamsSchema.safeParse(latest.value ?? []) : null;
        if (!existing?.success) { setMessage('Could not read team library; nothing was overwritten.'); setBusy(false); return; }
        if (existing.data.length >= 100) { setMessage('Team library is full (100 teams).'); setBusy(false); return; }
        const next = [...existing.data, parsed.data];
        const result = await repository.setMeta(TEAMS_KEY, next);
        if (result.ok) { setTeams(next); setMessage('Team saved on this device. Download CSV for a roster backup.'); }
        else setMessage('Team could not be saved. Download CSV to keep a copy.');
        setBusy(false);
      }}>Save team</button>
      <button type="button" className={button} onClick={() => setMessage(downloadText('team-roster.csv', rosterCsv(lineup), 'text/csv') ? 'Roster CSV downloaded.' : 'Download unavailable.')}>Download CSV</button>
    </div>
    {message && <p role="status" className="text-xs text-cyan-100">{message}</p>}
  </fieldset>;
}
