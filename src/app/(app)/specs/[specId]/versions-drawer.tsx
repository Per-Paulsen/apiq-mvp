'use client';

/**
 * Versions drawer (Epic 06). Read-only side drawer listing every SpecVersion
 * for a Spec — newest first, current marked. Open/closed state is controlled
 * via `useState` so it survives the 3 s polling re-renders Spec Detail does
 * while a spec analyzes (cross-epic Q1, 2026-05-02).
 */

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import type { SpecVersion } from '@/generated/prisma/client';
import { cn } from '@/lib/utils';

export function VersionsDrawer({
  versions,
  currentVersionId,
}: {
  versions: SpecVersion[];
  currentVersionId: string | null;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          Versions ({versions.length})
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-96">
        <SheetHeader>
          <SheetTitle>Versions</SheetTitle>
        </SheetHeader>
        <ul className="mt-4 flex flex-col gap-2 overflow-y-auto px-4 pb-4">
          {versions.map((v) => (
            <li
              key={v.id}
              className={cn(
                'rounded-md border p-3 text-sm',
                v.id === currentVersionId
                  ? 'border-violet-500/40 bg-violet-500/10'
                  : 'border-border bg-card/50',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs font-semibold">
                  v{v.versionNumber}
                </span>
                {v.id === currentVersionId ? (
                  <span className="rounded-full border border-violet-500/40 bg-violet-500/15 px-2 py-0.5 text-[10px] font-medium text-violet-700 dark:text-violet-300">
                    current
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-foreground">{v.label}</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {v.createdAt.toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
}
