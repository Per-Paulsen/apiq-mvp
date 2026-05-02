'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

import type { Finding } from '@/generated/prisma/client';

// Severity ordering — index 0 is the worst. Used to compute the "max severity"
// hit per endpoint row, which drives the badge colour.
const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low'] as const;
type Severity = (typeof SEVERITY_ORDER)[number];

const SEVERITY_BADGE_CLASS: Record<Severity, string> = {
  // Match `prd-decisions.md` §"Color Palette" — semantic mapping for severity.
  // Use *-500 in light, *-400 in dark, with a translucent tint background so
  // the badge stays legible against `bg-accent/50` row hover.
  critical: 'bg-red-500/15 text-red-600 dark:text-red-400',
  high: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
  medium: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  low: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
};

const HTTP_METHODS = [
  'get',
  'post',
  'put',
  'delete',
  'patch',
  'options',
  'head',
  'trace',
] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];

function isHttpMethod(value: string): value is HttpMethod {
  return (HTTP_METHODS as readonly string[]).includes(value);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSeverity(value: unknown): value is Severity {
  return (
    typeof value === 'string' &&
    (SEVERITY_ORDER as readonly string[]).includes(value)
  );
}

function worstSeverity(a: Severity, b: Severity): Severity {
  return SEVERITY_ORDER.indexOf(a) <= SEVERITY_ORDER.indexOf(b) ? a : b;
}

interface EndpointRowData {
  path: string;
  method: HttpMethod;
  openCount: number;
  worst: Severity | null;
}

interface TagGroup {
  tag: string;
  endpoints: EndpointRowData[];
  openCount: number;
}

const UNTAGGED_KEY = 'untagged';

/**
 * Pull the (path, method) pairs from `Spec.currentJson.paths`, group by
 * `tags[0]` (or "untagged"), and decorate each row with open-finding counts +
 * worst severity. All inputs are type-narrowed defensively because
 * `currentJson` is typed `unknown` (Prisma `Json`).
 */
function buildGroups(
  specJson: unknown,
  findings: Finding[],
): TagGroup[] {
  if (!isObject(specJson)) return [];
  const paths = specJson.paths;
  if (!isObject(paths)) return [];

  // (path, method) -> { count, worst } from open findings.
  const findingIndex = new Map<string, { count: number; worst: Severity | null }>();
  for (const finding of findings) {
    if (finding.status !== 'open') continue;
    const affected = finding.affectedEndpoints;
    if (!Array.isArray(affected)) continue;
    const severity: Severity | null = isSeverity(finding.severity)
      ? finding.severity
      : null;
    for (const entry of affected) {
      if (!isObject(entry)) continue;
      const p = entry.path;
      const m = entry.method;
      if (typeof p !== 'string' || typeof m !== 'string') continue;
      const key = `${m.toLowerCase()} ${p}`;
      const cur = findingIndex.get(key) ?? { count: 0, worst: null };
      cur.count += 1;
      if (severity) {
        cur.worst = cur.worst ? worstSeverity(cur.worst, severity) : severity;
      }
      findingIndex.set(key, cur);
    }
  }

  const groups = new Map<string, EndpointRowData[]>();

  for (const [pathKey, pathItem] of Object.entries(paths)) {
    if (!isObject(pathItem)) continue;
    for (const [methodKey, opValue] of Object.entries(pathItem)) {
      const method = methodKey.toLowerCase();
      if (!isHttpMethod(method)) continue;

      let tag: string = UNTAGGED_KEY;
      if (isObject(opValue) && Array.isArray(opValue.tags)) {
        const first = opValue.tags[0];
        if (typeof first === 'string' && first.trim().length > 0) {
          tag = first;
        }
      }

      const idxKey = `${method} ${pathKey}`;
      const hit = findingIndex.get(idxKey);
      const row: EndpointRowData = {
        path: pathKey,
        method,
        openCount: hit?.count ?? 0,
        worst: hit?.worst ?? null,
      };

      const existing = groups.get(tag);
      if (existing) {
        existing.push(row);
      } else {
        groups.set(tag, [row]);
      }
    }
  }

  // Sort: tag groups alphabetically, "untagged" pinned last. Endpoints inside
  // each group sorted by path ascending (stable in modern engines).
  const ordered = Array.from(groups.entries()).sort(([a], [b]) => {
    if (a === UNTAGGED_KEY) return 1;
    if (b === UNTAGGED_KEY) return -1;
    return a.localeCompare(b);
  });

  return ordered.map(([tag, endpoints]) => {
    endpoints.sort((a, b) => a.path.localeCompare(b.path));
    const openCount = endpoints.reduce((sum, e) => sum + e.openCount, 0);
    return { tag, endpoints, openCount };
  });
}

export function EndpointList({
  spec,
  findings,
  onEndpointClick,
}: {
  spec: { currentJson: unknown };
  findings: Finding[];
  onEndpointClick: (path: string, method: string) => void;
}) {
  const groups = useMemo(
    () => buildGroups(spec.currentJson, findings),
    [spec.currentJson, findings],
  );

  // Track collapsed tags. Default = empty Set => all groups expanded.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggle = (tag: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) {
        next.delete(tag);
      } else {
        next.add(tag);
      }
      return next;
    });
  };

  if (groups.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center p-6 text-xs text-muted-foreground">
        No endpoints
      </div>
    );
  }

  return (
    <nav
      aria-label="Endpoints"
      className="flex w-full flex-col gap-1 overflow-y-auto"
    >
      {groups.map((group) => {
        const isCollapsed = collapsed.has(group.tag);
        const headerLabel =
          group.tag === UNTAGGED_KEY ? 'Untagged' : group.tag;
        return (
          <div key={group.tag} className="flex flex-col">
            <button
              type="button"
              onClick={() => toggle(group.tag)}
              aria-expanded={!isCollapsed}
              className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            >
              {isCollapsed ? (
                <ChevronRight className="size-3.5 shrink-0" />
              ) : (
                <ChevronDown className="size-3.5 shrink-0" />
              )}
              <span className="truncate">{headerLabel}</span>
              <span className="ml-auto flex items-center gap-2 text-[10px] font-normal normal-case tracking-normal">
                <span className="text-muted-foreground/70">
                  {group.endpoints.length}
                </span>
                {group.openCount > 0 && (
                  <span className="text-muted-foreground">
                    {group.openCount} open
                  </span>
                )}
              </span>
            </button>
            {!isCollapsed && (
              <ul className="flex flex-col">
                {group.endpoints.map((ep) => (
                  <li key={`${ep.method} ${ep.path}`}>
                    <button
                      type="button"
                      onClick={() => onEndpointClick(ep.path, ep.method)}
                      className="flex w-full items-center gap-2 rounded px-2 py-1 text-left font-mono text-xs hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                    >
                      <span className="shrink-0 font-semibold uppercase text-muted-foreground">
                        {ep.method}
                      </span>
                      <span className="truncate text-foreground">
                        {ep.path}
                      </span>
                      <span className="ml-auto shrink-0">
                        {ep.openCount > 0 && ep.worst ? (
                          <span
                            className={`inline-block rounded-full px-1.5 py-px text-[10px] font-medium ${SEVERITY_BADGE_CLASS[ep.worst]}`}
                          >
                            {ep.openCount}
                          </span>
                        ) : (
                          // Invisible spacer so rows with/without badges align.
                          <span
                            aria-hidden
                            className="inline-block px-1.5 py-px text-[10px] font-medium opacity-0"
                          >
                            0
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );
}
