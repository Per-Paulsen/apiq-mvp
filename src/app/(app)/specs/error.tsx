'use client';

/**
 * Per-segment error boundary for `/specs/*`. Catches render errors thrown by
 * server components in this segment and gives the user a "Try again" button
 * (which calls `reset()` to re-attempt the failed render).
 *
 * Epic 08 may polish this with telemetry / a richer empty state. v0.1 is
 * deliberately minimal per the Production Reliability Baseline.
 */
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export default function SpecsError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <main className="mx-auto max-w-xl p-6">
      <Card>
        <CardHeader>
          <CardTitle>Something went wrong</CardTitle>
          <CardDescription>
            An unexpected error occurred while loading this page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="font-mono text-xs text-muted-foreground">
            {error.message}
          </p>
          <Button onClick={() => reset()}>Try again</Button>
        </CardContent>
      </Card>
    </main>
  );
}
