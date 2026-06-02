import NextAuth, { CredentialsSignin } from "next-auth";
import type { NextAuthResult } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@rayalaseema/db";
import { compare } from "bcryptjs";
import { normalizeEmail } from "./email";
import { normalizeCode } from "./user-code";

// Distinct sign-in failure for "account exists but is deactivated". Lets
// the client toast a help message ("contact admin") instead of the generic
// "Invalid credentials" - otherwise a deactivated user wastes time
// re-entering passwords they remember correctly. The `code` property is
// what NextAuth v5 surfaces back to the client (signIn result + URL).
class AccountDeactivatedError extends CredentialsSignin {
  code = "account_deactivated";
}

interface ExtendedUser {
  id: string;
  role: string;
  mustChangePassword: boolean;
  // Editor + Sub-Editor are gated from editorial actions until VERIFIED.
  // Cached on the JWT so the proxy doesn't hit the DB on every request.
  // `null` means "no profile row yet" - treated as PENDING by the gate.
  kycStatus: string | null;
}

const nextAuth = NextAuth({
  providers: [
    Credentials({
      name: "credentials",
      // `email` retained as the field name for backwards compatibility with
      // anything that still posts {email, password}; the value can be EITHER
      // an email address OR a 6-digit user code. We auto-detect by shape.
      credentials: {
        email: { label: "Email or 6-digit code", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const identifier = String(credentials.email).trim();
        // `normalizeCode` strips the optional dash and uppercases the
        // alphabetic prefix, returning the stored form ("RNA12345") if the
        // input matches the code shape, else null.
        const code = normalizeCode(identifier);

        // Single Prisma call per branch. We do NOT chain "try email, then
        // try code" - the input either matches the code shape or it
        // doesn't, and email lookups never produce ambiguity with the
        // RN-prefix code.
        const user = await prisma.user.findUnique({
          where: code ? { userCode: code } : { email: normalizeEmail(identifier) },
          include: { reporterProfile: { select: { kycStatus: true } } },
        });

        // Unknown user → fall through to the generic "invalid credentials"
        // path (returning null). We don't leak whether the email/code exists.
        if (!user) return null;

        // Password verified BEFORE the deactivated-account check so we
        // don't tell a random attacker whether a deactivated account
        // exists. Only after they prove they're the legitimate owner
        // (correct password) do we surface the helpful "account is
        // deactivated, contact admin" message.
        const isValid = await compare(credentials.password as string, user.passwordHash);
        if (!isValid) return null;

        if (!user.active) {
          throw new AccountDeactivatedError();
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          mustChangePassword: user.mustChangePassword,
          kycStatus: user.reporterProfile?.kycStatus ?? null,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.role = (user as ExtendedUser).role;
        token.id = user.id;
        token.mustChangePassword = (user as ExtendedUser).mustChangePassword;
        token.kycStatus = (user as ExtendedUser).kycStatus;
      }
      // Client calls `session.update()` after a successful password change
      // OR after the admin verifies the user's KYC, so the gate clears
      // without a full sign-out. Re-read from DB on update triggers to
      // pick up the fresh flag (and any role / kycStatus change).
      if (trigger === "update" && token.id) {
        const fresh = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: {
            role: true,
            mustChangePassword: true,
            reporterProfile: { select: { kycStatus: true } },
          },
        });
        if (fresh) {
          token.role = fresh.role;
          token.mustChangePassword = fresh.mustChangePassword;
          token.kycStatus = fresh.reporterProfile?.kycStatus ?? null;
        }
      } else if (token.id && token.role !== "ADMIN" && token.kycStatus !== "VERIFIED") {
        // Self-heal: while the user isn't VERIFIED yet, re-read kycStatus from
        // the DB on every token use (server auth() AND the client session
        // fetch). This makes an admin's KYC approval reflect on the user's
        // next request - a plain page refresh or nav - without a re-login or
        // an explicit session.update(). It's cheap and self-limiting: the
        // query only runs while the user is pending, and stops for good once
        // kycStatus reads VERIFIED (cached on the token). ADMINs are exempt
        // from the KYC gate, so we skip the lookup for them entirely.
        const fresh = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { reporterProfile: { select: { kycStatus: true } } },
        });
        token.kycStatus = fresh?.reporterProfile?.kycStatus ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).role = token.role;
        (session.user as any).id = token.id;
        (session.user as any).mustChangePassword = token.mustChangePassword;
        (session.user as any).kycStatus = token.kycStatus;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
  trustHost: true,
  cookies: {
    sessionToken: {
      name: "authjs.session-token",
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production" },
    },
  },
});

// Explicit annotations: next-auth's inferred export types reference non-portable
// internal paths (TS2742) when consumed across the monorepo.
export const handlers: NextAuthResult["handlers"] = nextAuth.handlers;
export const auth: NextAuthResult["auth"] = nextAuth.auth;
export const signIn: NextAuthResult["signIn"] = nextAuth.signIn;
export const signOut: NextAuthResult["signOut"] = nextAuth.signOut;
