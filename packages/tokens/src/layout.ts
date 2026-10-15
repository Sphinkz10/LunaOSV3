// LUNA.OS — TOKENS DE LAYOUT (fidelidade ao protótipo HTML — Guia §2/§3)
export type ShellKind = 'sidebar' | 'collapsed';
export type AsideKind = 'right' | 'hidden' | 'sheet';
export type Density = 'comfortable' | 'compact';

export interface LayoutStrategy { shell: ShellKind; aside: AsideKind; density: Density; }

// Espelha o HTML original (PROTOHTML): sidebar+board ≥960; <960 esconde sidebar e board,
// mostra .mobile-actions fixa em baixo (ações da página, NÃO navegação principal).
// Navegação mobile = sidebar oculta + command palette (⌘K) como no protótipo.
export const defaultStrategyFor = (width: number): LayoutStrategy =>
  width >= 960
    ? { shell: 'sidebar', aside: 'right', density: 'comfortable' }
    : { shell: 'collapsed', aside: 'hidden', density: width >= 560 ? 'comfortable' : 'compact' };

export const breakpoints = [320, 375, 430, 560, 640, 720, 760, 768, 860, 900, 960, 1020, 1080, 1100, 1180, 1220, 1360, 1380, 1440, 1500] as const;
