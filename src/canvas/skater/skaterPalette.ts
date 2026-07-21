import type { Team } from '@/core/types';

export interface SkaterPalette {
  jersey: string;
  jerseyDark: string;
  jerseyLight: string;
  trim: string;
  pants: string;
  sock: string;
  helmet: string;
  helmetLight: string;
  glove: string;
}

function shade(hex: string, amount: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const r = c(parseInt(m[1], 16) + amount);
  const g = c(parseInt(m[2], 16) + amount);
  const b = c(parseInt(m[3], 16) + amount);
  return `rgb(${r}, ${g}, ${b})`;
}

export function getSkaterPalette(team: Team, jerseyOverride?: string): SkaterPalette {
  const base = getBasePalette(team);
  if (!jerseyOverride) return base;
  return {
    ...base,
    jersey: jerseyOverride,
    jerseyDark: shade(jerseyOverride, -52),
    jerseyLight: shade(jerseyOverride, 52),
    glove: shade(jerseyOverride, -40),
  };
}

function getBasePalette(team: Team): SkaterPalette {
  return team === 'home'
    ? {
        jersey: '#e63946',
        jerseyDark: '#9d1f2a',
        jerseyLight: '#ff6673',
        trim: '#ffffff',
        pants: '#142536',
        sock: '#f8fafc',
        helmet: '#f7fbff',
        helmetLight: '#ffffff',
        glove: '#9d1f2a',
      }
    : {
        jersey: '#2f80ed',
        jerseyDark: '#174b9a',
        jerseyLight: '#62a7ff',
        trim: '#ffffff',
        pants: '#0d2037',
        sock: '#f8fafc',
        helmet: '#16467f',
        helmetLight: '#3f7fc2',
        glove: '#12345d',
      };
}
