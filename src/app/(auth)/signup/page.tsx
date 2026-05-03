/**
 * Signup page (server component). Reads `TURNSTILE_SITE_KEY` server-side
 * (NOT prefixed with `NEXT_PUBLIC_` — keeps env-var name aligned with the
 * spec) and threads it down as a prop to the client form.
 *
 * `renderedAt` = the SSR timestamp of this render. The 2s time-trap in
 * `signupAction` rejects submissions where `(now - renderedAt) < 2000 ms`.
 */
import type { Metadata } from 'next';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

import { SignupForm } from './signup-form';

export const metadata: Metadata = {
  title: 'Sign up · apiq',
  description: 'Create your apiq account',
};

export default function SignupPage() {
  // eslint-disable-next-line react-hooks/purity -- intentional impurity: we want the SSR-render timestamp (server-trusted) for the time-trap; client-captured values can be spoofed by sophisticated bots.
  const renderedAt = Date.now();
  const siteKey = process.env.TURNSTILE_SITE_KEY ?? '';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your apiq account</CardTitle>
        <CardDescription>
          Sign up to analyze and improve your OpenAPI specs.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SignupForm siteKey={siteKey} renderedAt={renderedAt} />
      </CardContent>
    </Card>
  );
}
