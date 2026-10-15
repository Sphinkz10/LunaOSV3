// LUNA.OS — PRIMITIVOS (valores crus do legado real — Guia §3.1)
// ⚠️ NUNCA usar primitivos diretamente em componentes. Usar semantic.ts.
export const palette = {
  sky: '#8ECAE6', teal: '#209EBB', navy: '#023047',
  gold: '#FFB701', orange: '#FC8500', violet: '#9B7CFF',
  pink: '#FF5DA2', lime: '#B5F44A', comp: '#18C2D6',
  danger: '#E05555', success: '#4CAF50',
  mutedLegacy: '#6A9DB8', mutedHi: '#B6D7E7', ink: '#07182f',
  bg: '#06142a', bg2: '#0a2442', steel: '#6A9DB8',
} as const;

export const fontFamily = {
  display: '"Space Grotesk", system-ui, sans-serif',
  body: '"Plus Jakarta Sans", system-ui, sans-serif',
} as const;

export const chrome = {
  headerH: '66px', sideW: '222px', sideWNarrow: '190px',
  boardW: '330px', boardWNarrow: '300px',
} as const;
