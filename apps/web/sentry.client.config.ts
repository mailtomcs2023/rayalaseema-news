// Spec #4 H6 (#239) — Sentry client SDK init for apps/web.
//
// DSN sourced from SiteConfig.sentry_dsn_web (A4 #195) but Sentry's SDK
// needs the DSN at module-evaluation time, before any DB call can run.
// So at deploy time the DSN is also written to NEXT_PUBLIC_SENTRY_DSN_WEB
// in apps/web/.env (deploy.yml step). If the env is empty Sentry quietly
// no-ops; nothing is initialised, no requests fly out.
//
// Sample rate is intentionally low for V1 — we expect ~zero traffic at
// launch and don't want a runaway page render to drown the Sentry quota.
// Bump up post-launch when CWV is settled.

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN_WEB;
if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.05,        // 5% of transactions sampled
    replaysSessionSampleRate: 0,   // session replay off (Clarity covers it)
    replaysOnErrorSampleRate: 0.1, // 10% of error sessions captured
    environment: process.env.NODE_ENV,
    // Don't ship Sentry's default browser denoise — we want to see all
    // errors initially. Tighten when noise becomes a problem.
    integrations: [],
  });
}
