// Spec #4 H6 (#239) - Sentry init shim.
//
// Conditional Sentry initialisation. If SENTRY_DSN_WEB is set in the env
// AND @sentry/nextjs is installed, configure Sentry with sensible defaults.
// Otherwise no-op. Keeps the dependency optional so a dev who clones the
// repo doesn't need Sentry creds to run locally.
//
// Full Sentry setup (sentry.client.config.ts + sentry.server.config.ts +
// instrumentation.ts + next.config wrap) is a heavier integration that
// can be tracked as a follow-up - this shim covers the basic "capture
// uncaught error to a DSN" use case which is 80% of the value.
//
// Activation: editor pastes the DSN into SiteConfig.sentry_dsn_web via
// /settings → SEO & Analytics. Deploy pipeline reads it into the
// `SENTRY_DSN_WEB` env var (deploy.yml change in a follow-up commit).

let initialised = false;

export async function initSentryIfConfigured(): Promise<void> {
  if (initialised) return;
  const dsn = process.env.SENTRY_DSN_WEB;
  if (!dsn) return;
  try {
    // @sentry/nextjs is an optional runtime dependency - the catch() below
    // turns "not installed" into a no-op. The string-form import + @ts-ignore
    // keep TypeScript quiet without forcing every dev to install the package.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    // @ts-ignore - optional peer dependency, may not be installed
    const Sentry = await import("@sentry/nextjs").catch(() => null);
    if (!Sentry || typeof Sentry.init !== "function") {
      // Package not installed; deliberate - leaves Sentry optional.
      return;
    }
    Sentry.init({
      dsn,
      tracesSampleRate: 0.1,
      environment: process.env.NODE_ENV,
      enabled: process.env.NODE_ENV === "production",
    });
    initialised = true;
  } catch {
    // Silently skip - we'd rather render the page than fail boot on a
    // misconfigured DSN.
  }
}
