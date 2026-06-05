// Spec #4 H6 (#239) - Sentry edge runtime SDK init for apps/web.

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN_WEB;
if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.05,
    environment: process.env.NODE_ENV,
  });
}
