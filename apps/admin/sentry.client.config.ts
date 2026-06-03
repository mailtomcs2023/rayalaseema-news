// Spec #4 H6 (#239) — Sentry client SDK init for apps/admin.
// CMS errors hurt editorial speed; sample higher than web (50% transactions).

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN_ADMIN;
if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.5,
    environment: process.env.NODE_ENV,
    integrations: [],
  });
}
