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

export function getSkaterPalette(team: Team): SkaterPalette {
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
