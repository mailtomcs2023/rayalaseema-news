// Spec #4 H6 (#239) — Sentry server SDK init for apps/admin.

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN_ADMIN;
if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.5,
    environment: process.env.NODE_ENV,
  });
}
