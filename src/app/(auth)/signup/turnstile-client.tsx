'use client';

/**
 * Thin client wrapper around `<Turnstile>`. The widget is interactive (loads
 * Cloudflare's challenge script, posts a response token into a hidden input
 * named `cf-turnstile-response` that the form picks up automatically) and so
 * cannot be rendered from a server component.
 *
 * The site key is passed in as a prop because the spec uses
 * `TURNSTILE_SITE_KEY` (NOT `NEXT_PUBLIC_TURNSTILE_SITE_KEY`), and only env
 * vars prefixed with `NEXT_PUBLIC_` are exposed to the browser. Reading it
 * server-side and threading it through as a prop keeps the env-var name
 * spec-compliant.
 */
import { Turnstile } from '@marsidev/react-turnstile';

export function SignupTurnstile({ siteKey }: { siteKey: string }) {
  return <Turnstile siteKey={siteKey} options={{ theme: 'dark' }} />;
}
