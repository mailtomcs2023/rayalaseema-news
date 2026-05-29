import NextAuth from "next-auth";
import type { NextAuthResult } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@rayalaseema/db";
import { compare } from "bcryptjs";
import { normalizeEmail } from "./email";

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
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        // Lookup by the canonical form so signing in with "Foo@Gmail.com"
        // finds the row stored as "foo@gmail.com". Without this, casing-
        // mismatch on login would 401 the user even though the account exists.
        const user = await prisma.user.findUnique({
          where: { email: normalizeEmail(credentials.email) },
          include: { reporterProfile: { select: { kycStatus: true } } },
        });

        if (!user || !user.active) return null;

        const isValid = await compare(
          credentials.password as string,
          user.passwordHash
        );

        if (!isValid) return null;

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
