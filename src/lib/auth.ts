/**
 * Full Auth.js v5 config. Node runtime only — imports `bcrypt` and Prisma.
 *
 * Spreads the Edge-safe `authConfig` and adds the Credentials provider
 * (with bcrypt password verification) + the Prisma adapter.
 *
 * Consumed by:
 *   - `app/api/auth/[...nextauth]/route.ts` — wires `handlers.GET/POST`
 *   - `src/lib/session.ts` — calls `auth()` and `signOut()`
 */
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import bcrypt from 'bcrypt';
import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { authConfig } from './auth.config';

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { auth, handlers, signIn, signOut } = NextAuth({
  ...authConfig,
  // PrismaAdapter is typed against `@auth/core`'s PrismaClient shape; our
  // generated client is structurally compatible but TS doesn't always agree.
  // The cast is the documented Auth.js v5 escape hatch.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adapter: PrismaAdapter(prisma as any),
  session: { strategy: 'jwt' },
  secret: process.env.AUTH_SECRET,
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      // On sign-in, `user` is the object returned by `authorize()`.
      // Persist its id onto the JWT so subsequent requests can identify the user.
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      // Mirror `token.id` onto `session.user.id` (typed via `src/types/next-auth.d.ts`).
      if (token.id && session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
});
