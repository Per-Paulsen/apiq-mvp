'use client';

/**
 * Findings list (right pane) for the Spec Detail screen (Epic 05).
 *
 * Filter state lives in the URL query string per AC #8/#9 (reload-safe,
 * share-link-friendly): `?severity=`, `?category=`, `?status=`, `?search=`.
 * URL writes go through `router.replace(..., { scroll: false })` to avoid
 * polluting browser history.
 *
 * Default sort (AC #3): severity desc → category asc → endpoint-path asc.
 *
 * Default status filter is `open` (AC #8). When the URL has no `status`
 * param, only `open` findings are shown. The user can flip to "show all"
 * which sets `status` to the full set of values.
 *
 * The search input is debounced ~250 ms before pushing to the URL so the
 * user doesn't get a re-render storm while typing.
 */
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { Finding } from '@/generated/prisma/client';
import { cn } from '@/lib/utils';

import { FindingCard, asAffectedEndpoints } from './finding-card';

const SEVERITIES = ['critical', 'high', 'medium', 'low'] as const;
const CATEGORIES = ['clarity', 'design', 'risk'] as const;
const ALL_STATUSES = ['open', 'applied', 'rejected', 'stale', 'outdated'] as const;

type Severity = (typeof SEVERITIES)[number];
type Category = (typeof CATEGORIES)[number];

const SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const CATEGORY_RANK: Record<string, number> = {
  clarity: 0,
  design: 1,
  risk: 2,
};

function parseList(s: string | null): string[] {
  return s ? s.split(',').map((x) => x.trim()).filter(Boolean) : [];
}

function severityPillClasses(sev: Severity, active: boolean): string {
  if (!active) {
    return 'border-border bg-transparent text-muted-foreground hover:bg-muted';
  }
  switch (sev) {
    case 'critical':
      return 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/40';
    case 'high':
      return 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/40';
    case 'medium':
      return 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40';
    case 'low':
      return 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/40';
  }
}

function genericPillClasses(active: boolean): string {
  return active
    ? 'bg-primary/15 text-foreground border-primary/40'
    : 'border-border bg-transparent text-muted-foreground hover:bg-muted';
}

function capitalise(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

export function FindingsList({
  findings,
  specCurrentJson,
  registerCardRef,
}: {
  findings: Finding[];
  specCurrentJson: unknown;
  registerCardRef?: (key: string, el: HTMLElement | null) => void;
}): React.JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();

  const severityFilter = useMemo(
    () => parseList(searchParams.get('severity')),
    [searchParams],
  );
  const categoryFilter = useMemo(
    () => parseList(searchParams.get('category')),
    [searchParams],
  );
  // Status param: when absent (null), default to ['open']. When present, parse
  // it (even if empty list — explicit "show nothing" is still allowed).
  const statusParamRaw = searchParams.get('status');
  const statusFilter = useMemo<string[]>(
    () => (statusParamRaw === null ? ['open'] : parseList(statusParamRaw)),
    [statusParamRaw],
  );
  const showingAllStatuses = statusParamRaw !== null;

  const urlSearch = searchParams.get('search') ?? '';

  // Local state for the search input — debounced into the URL. We sync the
  // draft to the URL value whenever the URL changes from an external source
  // (back/forward, share-link). React's recommended pattern for "reset state
  // when a prop/derived value changes" is to compare against a previous value
  // during render and call setState inline (which triggers a re-render before
  // commit). See https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const [searchDraft, setSearchDraft] = useState<string>(urlSearch);
  const [lastSyncedUrlSearch, setLastSyncedUrlSearch] =
    useState<string>(urlSearch);
  if (urlSearch !== lastSyncedUrlSearch) {
    setLastSyncedUrlSearch(urlSearch);
    setSearchDraft(urlSearch);
  }
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const writeParams = useCallback(
    (updater: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      updater(params);
      const qs = params.toString();
      router.replace(qs.length > 0 ? `?${qs}` : '?', { scroll: false });
    },
    [router, searchParams],
  );

  const setListParam = useCallback(
    (key: string, list: string[]) => {
      writeParams((p) => {
        if (list.length === 0) p.delete(key);
        else p.set(key, list.join(','));
      });
    },
    [writeParams],
  );

  const toggleSeverity = useCallback(
    (sev: Severity) => {
      const next = severityFilter.includes(sev)
        ? severityFilter.filter((x) => x !== sev)
        : [...severityFilter, sev];
      setListParam('severity', next);
    },
    [severityFilter, setListParam],
  );

  const toggleCategory = useCallback(
    (cat: Category) => {
      const next = categoryFilter.includes(cat)
        ? categoryFilter.filter((x) => x !== cat)
        : [...categoryFilter, cat];
      setListParam('category', next);
    },
    [categoryFilter, setListParam],
  );

  const toggleShowAllStatuses = useCallback(() => {
    if (showingAllStatuses) {
      // Revert to default (no status param → defaults to 'open').
      writeParams((p) => p.delete('status'));
    } else {
      writeParams((p) => p.set('status', ALL_STATUSES.join(',')));
    }
  }, [showingAllStatuses, writeParams]);

  const onSearchChange = useCallback(
    (value: string) => {
      setSearchDraft(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        writeParams((p) => {
          if (value.length === 0) p.delete('search');
          else p.set('search', value);
        });
      }, 250);
    },
    [writeParams],
  );

  // Cleanup pending debounce on unmount.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Apply filters + sort.
  const visible = useMemo(() => {
    const searchLower = urlSearch.trim().toLowerCase();

    const filtered = findings.filter((f) => {
      if (severityFilter.length > 0 && !severityFilter.includes(f.severity)) {
        return false;
      }
      if (categoryFilter.length > 0 && !categoryFilter.includes(f.category)) {
        return false;
      }
      if (statusFilter.length > 0 && !statusFilter.includes(f.status)) {
        return false;
      }
      if (searchLower.length > 0) {
        const eps = asAffectedEndpoints(f.affectedEndpoints);
        if (eps.length === 0) return false;
        const match = eps.some((ep) =>
          ep.path.toLowerCase().includes(searchLower),
        );
        if (!match) return false;
      }
      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      const sa = SEVERITY_RANK[a.severity] ?? 99;
      const sb = SEVERITY_RANK[b.severity] ?? 99;
      if (sa !== sb) return sa - sb;
      const ca = CATEGORY_RANK[a.category] ?? 99;
      const cb = CATEGORY_RANK[b.category] ?? 99;
      if (ca !== cb) return ca - cb;
      const aPath = asAffectedEndpoints(a.affectedEndpoints)[0]?.path ?? '';
      const bPath = asAffectedEndpoints(b.affectedEndpoints)[0]?.path ?? '';
      return aPath.localeCompare(bPath);
    });

    return sorted;
  }, [findings, severityFilter, categoryFilter, statusFilter, urlSearch]);

  const totalCount = findings.length;

  return (
    <div className="flex flex-col gap-4">
      {/* Filter bar */}
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card/50 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Severity
          </span>
          {SEVERITIES.map((sev) => {
            const active = severityFilter.includes(sev);
            return (
              <button
                key={sev}
                type="button"
                onClick={() => toggleSeverity(sev)}
                aria-pressed={active}
                className={cn(
                  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
                  severityPillClasses(sev, active),
                )}
              >
                {capitalise(sev)}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Category
          </span>
          {CATEGORIES.map((cat) => {
            const active = categoryFilter.includes(cat);
            return (
              <button
                key={cat}
                type="button"
                onClick={() => toggleCategory(cat)}
                aria-pressed={active}
                className={cn(
                  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
                  genericPillClasses(active),
                )}
              >
                {capitalise(cat)}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Status
          </span>
          <span className="inline-flex items-center rounded-full border border-primary/40 bg-primary/15 px-2.5 py-0.5 text-xs font-medium text-foreground">
            Open
          </span>
          <button
            type="button"
            onClick={toggleShowAllStatuses}
            aria-pressed={showingAllStatuses}
            className={cn(
              'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
              genericPillClasses(showingAllStatuses),
            )}
          >
            {showingAllStatuses
              ? 'Showing all'
              : 'Show applied / rejected / stale / outdated'}
          </button>
        </div>

        <div className="flex flex-col gap-1">
          <Input
            type="search"
            value={searchDraft}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Filter by endpoint path…"
            aria-label="Filter by endpoint path"
          />
        </div>
      </div>

      {/* List */}
      {totalCount === 0 ? (
        <Card size="sm">
          <CardContent>
            <p className="text-sm text-muted-foreground">
              No findings — your spec looks clean. Re-analyze to refresh.
            </p>
          </CardContent>
        </Card>
      ) : visible.length === 0 ? (
        <Card size="sm">
          <CardContent>
            <p className="text-sm text-muted-foreground">
              No findings match your filters.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((f) => (
            <li key={f.id}>
              <FindingCard
                finding={f}
                specCurrentJson={specCurrentJson}
                registerRef={registerCardRef}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
