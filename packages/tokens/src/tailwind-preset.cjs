/** Preset Tailwind LUNA.OS — só CSS vars, zero hex (Guia §3 / P1.2). */
module.exports = {
  theme: {
    extend: {
      colors: {
        'bg-app': 'var(--color-bg-app)', 'bg-deep': 'var(--color-bg-deep)',
        accent: 'var(--accent)',
        'text-primary': 'var(--text-primary)', 'text-secondary': 'var(--text-secondary)', 'text-muted': 'var(--text-muted)',
        success: 'var(--status-success)', danger: 'var(--status-danger)',
        warning: 'var(--status-warning)', info: 'var(--status-info)',
      },
      backgroundImage: { surface: 'var(--surface)', 'surface-2': 'var(--surface-2)' },
      borderColor: { DEFAULT: 'var(--border)', strong: 'var(--border-strong)' },
      borderRadius: { sm: 'var(--r-sm)', md: 'var(--r-md)', lg: 'var(--r-lg)', xl: 'var(--r-xl)', pill: 'var(--r-pill)' },
      boxShadow: { card: 'var(--shadow-card)', inset: 'var(--shadow-inset)' },
      fontFamily: { display: 'var(--font-display)', body: 'var(--font-body)' },
      fontSize: {
        xs: 'var(--fs-xs)', sm: 'var(--fs-sm)', base: 'var(--fs-base)', lg: 'var(--fs-lg)',
        xl: 'var(--fs-xl)', '2xl': 'var(--fs-2xl)', '3xl': 'var(--fs-3xl)',
      },
      spacing: {
        1: 'var(--sp-1)', 2: 'var(--sp-2)', 3: 'var(--sp-3)', 4: 'var(--sp-4)', 5: 'var(--sp-5)',
        6: 'var(--sp-6)', 8: 'var(--sp-8)', 10: 'var(--sp-10)', 12: 'var(--sp-12)',
        'ctl-sm': 'var(--ctl-sm)', 'ctl-md': 'var(--ctl-md)', 'ctl-lg': 'var(--ctl-lg)', touch: 'var(--touch-min)',
        header: 'var(--header-h)', side: 'var(--side-w)', board: 'var(--board-w)',
      },
      transitionTimingFunction: { luna: 'cubic-bezier(.2,.9,.35,1)' },
      transitionDuration: { fast: '150ms', base: '220ms', slow: '300ms' },
      zIndex: { dropdown: 'var(--z-dropdown)', modal: 'var(--z-modal)', toast: 'var(--z-toast)' },
    },
  },
};
