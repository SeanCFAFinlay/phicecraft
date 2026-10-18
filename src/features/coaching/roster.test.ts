import { describe, expect, it } from 'vitest';
import { parseRosterCsv, rosterCsv } from './roster';

describe('roster CSV', () => {
  it('reads reordered headers, quoted names, leading zero numbers and CRLF', () => {
    const players = parseRosterCsv('\uFEFFnumber,role,name\r\n07,lw,"Smith, Alex"\r\n31,G,"Sam ""Ace"" Lee"');
    expect(players).toEqual([{ number: '07', role: 'LW', name: 'Smith, Alex' }, { number: '31', role: 'G', name: 'Sam "Ace" Lee' }]);
    expect(parseRosterCsv(rosterCsv(players))).toEqual(players);
  });
  it('rejects malformed, duplicate and unsupported roster entries', () => {
    for (const csv of ['name,number\nAlex,7', 'name,number,role\nAlex,7,D\nSam,7,C', 'name,number,role\nAlex,7,Q', 'name,number,role\n"Alex,7,D']) {
      expect(() => parseRosterCsv(csv)).toThrow();
    }
  });
});
