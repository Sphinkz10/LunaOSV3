// LUNA.OS — TOKENS SEMÂNTICOS (Guia §3.2–§3.6). Os componentes leem SÓ isto (via CSS vars).
import { palette } from './primitives';

export const themeLunaDark = {
  'color-bg-app': palette.bg,
  'color-bg-deep': palette.bg2,
  'surface': 'linear-gradient(170deg, rgba(31,74,110,.985), rgba(8,23,46,.99))',
  'surface-2': 'linear-gradient(170deg, rgba(38,88,130,.985), rgba(11,31,60,.99))',
  'glass': 'rgba(255,255,255,.055)',
  'text-primary': '#F4F7F9',
  'text-secondary': palette.mutedHi,
  'text-muted': '#8FB3C6', // corrigido vs legado #6A9DB8 (L8: AA)
  'border': 'rgba(255,255,255,.085)',
  'border-strong': 'rgba(255,255,255,.145)',
  'status-success': palette.success,
  'status-danger': palette.danger,
  'status-warning': palette.orange,
  'status-info': palette.sky,
  'shadow-card': 'inset 0 1px 0 rgba(255,255,255,.09), inset 0 -2px 5px rgba(0,0,0,.34), 0 10px 26px rgba(0,0,0,.42), 0 18px 52px rgba(0,0,0,.36)',
  'shadow-inset': 'inset 0 1px 0 rgba(255,255,255,.07), 0 4px 14px rgba(0,0,0,.24)',
} as const;

// Acento por módulo (Guia §3.6)
export const moduleAccent = {
  dashboard: palette.gold, calendar: palette.sky, live: palette.orange,
  dataos: palette.lime, studio: palette.gold, forms: palette.teal,
  analytics: palette.violet, athletes: palette.teal, groups: palette.teal,
  settings: palette.steel,
} as const;

// 9 estados de dia (Guia §3.5 / C9)
export const calState = {
  available: '#4CAF50', booked: '#3E8FE0', pending: '#FC8500',
  blocked: '#E05555', holiday: '#9B7CFF', dayoff: '#6A9DB8',
  vacation: '#FF5DA2', competition: '#18C2D6', travel: '#209EBB',
} as const;

export const entity = {
  exercise: palette.teal, workout: palette.gold, plan: palette.orange, class: palette.sky,
} as const;
