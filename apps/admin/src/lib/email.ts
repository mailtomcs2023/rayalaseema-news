// Canonical email normalisation used everywhere the User table is written
// or queried by email. Postgres treats `Foo@Bar.com` and `foo@bar.com` as
// two different unique values, so we have to lowercase + trim at the API
// layer to prevent two accounts being created for the same human just
// because they typed different casing.
//
// Whitespace is also trimmed - copy-pasting an email from a chat often
// drags in a trailing space.
//
// We deliberately don't strip `+tag` suffixes or `.` from gmail local-parts
// (Gmail aliases) - those are legitimately distinct addresses for many
// people, and treating them as duplicates would lock real users out.
export function normalizeEmail(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().toLowerCase();
}
