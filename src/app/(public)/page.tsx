import Link from 'next/link';

import { Button } from '@/components/ui/button';

import { demoLoginAction } from './demo-login-action';

export default function Home() {
  const isDemo = process.env.DEMO_MODE === 'true';

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <h1 className="font-sans text-3xl font-semibold tracking-tight">apiq</h1>
        <p className="text-sm text-zinc-500">
          API Intelligence — a knowledgeable second opinion for your OpenAPI
          specs.
        </p>
      </div>

      {isDemo ? (
        <div className="flex w-full max-w-md flex-col gap-4 rounded-lg border border-zinc-800 bg-zinc-950 p-6">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium uppercase tracking-wider text-violet-400">
              Live demo
            </p>
            <p className="text-sm text-zinc-300">
              One click to explore the app — pre-seeded with analyzed specs:
            </p>
          </div>
          <div className="flex flex-col gap-1.5 rounded border border-zinc-800 bg-zinc-900 p-3 font-mono text-xs">
            <div className="flex justify-between gap-4">
              <span className="text-zinc-500">email</span>
              <span className="text-zinc-200">demo@example.com</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-zinc-500">password</span>
              <span className="text-zinc-200">demo</span>
            </div>
          </div>
          <p className="text-xs text-zinc-500">
            State resets daily at 03:00 UTC, so feel free to apply patches and
            explore.
          </p>
          <div className="flex gap-2">
            <form action={demoLoginAction}>
              <Button type="submit">Open demo →</Button>
            </form>
            <Button asChild variant="ghost">
              <Link href="/signup">Or sign up</Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button asChild>
            <Link href="/signup">Sign up</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/login">Log in</Link>
          </Button>
        </div>
      )}
    </main>
  );
}
