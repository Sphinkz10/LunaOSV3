/** P2.9 — observabilidade base (activa só com env). */

export function initObservability(): void {
  const sentry = import.meta.env.VITE_SENTRY_DSN?.trim();
  const posthog = import.meta.env.VITE_POSTHOG_KEY?.trim();
  if (sentry) initSentry(sentry);
  if (posthog) initPostHog(posthog);
}

function initSentry(dsn: string): void {
  void import('@sentry/react').then((Sentry) => {
    Sentry.init({
      dsn,
      environment: import.meta.env.MODE,
      integrations: [Sentry.browserTracingIntegration()],
      tracesSampleRate: import.meta.env.PROD ? 0.2 : 1,
    });
  }).catch(() => console.warn('[obs] Sentry não instalado — adiciona @sentry/react'));
}

function initPostHog(key: string): void {
  void import('posthog-js').then(({ default: posthog }) => {
    posthog.init(key, {
      api_host: import.meta.env.VITE_POSTHOG_HOST ?? 'https://eu.i.posthog.com',
      capture_pageview: true,
    });
  }).catch(() => console.warn('[obs] PostHog não instalado — adiciona posthog-js'));
}

export function captureEvent(name: string, props?: Record<string, unknown>): void {
  void import('posthog-js').then(({ default: posthog }) => {
    if (posthog.__loaded) posthog.capture(name, props);
  }).catch(() => undefined);
}
