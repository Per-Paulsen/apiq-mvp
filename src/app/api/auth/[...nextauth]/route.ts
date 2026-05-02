/**
 * Auth.js v5 catch-all route handler. Wires the Node-runtime config
 * (Credentials provider + Prisma adapter + bcrypt) onto Next.js's API route
 * so `signIn('credentials', ...)` server-action calls have an endpoint to hit.
 */
import { handlers } from '@/lib/auth';

export const { GET, POST } = handlers;
