// Ambient shim for @sentry/nextjs.
//
// The sentry.*.config.ts files are committed but @sentry/nextjs is NOT a
// dependency and next.config does not wrap with withSentryConfig, so those
// configs are inert (never bundled/loaded at runtime). This declaration keeps
// `tsc` happy without pulling in the full Sentry SDK. To actually enable
// Sentry, install @sentry/nextjs and wrap next.config with withSentryConfig -
// then delete this shim.
declare module "@sentry/nextjs";
