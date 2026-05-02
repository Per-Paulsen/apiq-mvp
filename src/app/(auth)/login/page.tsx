/**
 * Login page (server component). Reads `?callbackUrl=` from query params —
 * the spec wording uses `?redirectTo=` but Auth.js v5's middleware writes
 * `callbackUrl` (and our `auth.config.ts` doesn't override that), so we
 * conform to Auth.js. Defaults to `/specs` when missing.
 *
 * Next.js 15+: `searchParams` is a Promise — `await` before destructuring.
 */
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

import { LoginForm } from './login-form';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const params = await searchParams;
  // Sanitize: only accept relative paths (defense against open-redirect via
  // crafted `?callbackUrl=https://evil.com` links). Auth.js does its own
  // host-based check too, but a belt-and-suspenders guard at the UI is cheap.
  const raw = params.callbackUrl ?? '/specs';
  const callbackUrl = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/specs';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in to apiq</CardTitle>
        <CardDescription>
          Enter your credentials to access your specs.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm callbackUrl={callbackUrl} />
      </CardContent>
    </Card>
  );
}
