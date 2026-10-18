import { z } from 'zod';

export const rosterPlayerSchema = z.object({
  name: z.string().trim().min(1).max(80),
  number: z.string().trim().min(1).max(8),
  role: z.enum(['C', 'LW', 'RW', 'D', 'F', 'G']),
});
export const savedTeamSchema = z.object({
  id: z.string(), name: z.string().trim().min(1).max(80),
  colour: z.string().regex(/^#[0-9a-f]{6}$/i),
  roster: z.array(rosterPlayerSchema).min(1).max(100),
});
export const savedTeamsSchema = z.array(savedTeamSchema).max(100);
export type RosterPlayer = z.infer<typeof rosterPlayerSchema>;
export type SavedTeam = z.infer<typeof savedTeamSchema>;
export const TEAMS_KEY = 'coaching.teams.v1';

/** RFC-style quoted CSV cells, including commas and escaped quotes in names. */
export function parseRosterCsv(text: string): RosterPlayer[] {
  if (text.length > 100000) throw new Error('Roster file must be smaller than 100 KB.');
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  const input = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  for (let index = 0; index <= input.length; index++) {
    const char = input[index] ?? '\n';
    if (char === '"') {
      if (quoted && input[index + 1] === '"') { cell += '"'; index++; }
      else quoted = !quoted;
    } else if (!quoted && (char === ',' || char === '\n')) {
      row.push(cell.trim()); cell = '';
      if (char === '\n') { if (row.some(Boolean)) rows.push(row); row = []; }
    } else cell += char;
  }
  if (quoted) throw new Error('A quoted name is missing its closing quote.');
  const headers = rows.shift()?.map(value => value.toLowerCase()) ?? [];
  const columns = ['name', 'number', 'role'].map(key => headers.indexOf(key));
  if (columns.some(index => index < 0)) throw new Error('Use CSV columns: name,number,role. Positions: C, LW, RW, D, F or G.');
  if (rows.length === 0 || rows.length > 100) throw new Error('A roster must contain 1–100 players.');
  const numbers = new Set<string>();
  return rows.map((values, index) => {
    const parsed = rosterPlayerSchema.safeParse({ name: values[columns[0]], number: values[columns[1]], role: values[columns[2]]?.toUpperCase() });
    if (!parsed.success) throw new Error(`Check roster row ${index + 2}: each player needs a name, number and valid position.`);
    if (numbers.has(parsed.data.number)) throw new Error(`Jersey #${parsed.data.number} appears twice. Use unique numbers within a team.`);
    numbers.add(parsed.data.number);
    return parsed.data;
  });
}

export function rosterCsv(roster: RosterPlayer[]): string {
  const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
  return ['name,number,role', ...roster.map(player => [player.name, player.number, player.role].map(quote).join(','))].join('\n');
}
