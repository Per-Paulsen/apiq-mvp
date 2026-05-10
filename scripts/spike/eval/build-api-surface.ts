#!/usr/bin/env tsx
/**
 * Welle I — I5 API-Surface builder.
 *
 * Parses every `index.ts` in `scripts/spike/deterministic/` (root + subfolders)
 * and emits `API-SURFACE.md` classifying each export as:
 *   - public:      imported from outside the deterministic/ subtree (src/, scripts/ outside deterministic/)
 *   - internal:    only imported from within the deterministic/ subtree
 *   - unused:      not imported anywhere we can detect
 *
 * CLI: `npm run api-surface`
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const DET_ROOT = path.resolve(__dirname, '..', 'deterministic');
const OUT_PATH = path.resolve(__dirname, 'API-SURFACE.md');

// =============================================================================
// Index-file scanning + export extraction
// =============================================================================

export interface IndexExport {
  index_file: string; // path relative to deterministic/ root
  export_name: string;
  raw_form: 'named' | 'star' | 'type';
}

/**
 * Recursively walk a directory tree and yield each `index.ts`.
 */
export function findIndexFiles(root: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(root)) return out;
  const stack: string[] = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules') continue;
        stack.push(full);
      } else if (e.isFile() && e.name === 'index.ts') {
        out.push(full);
      }
    }
  }
  return out;
}

/**
 * Extract named exports from an index.ts source. Handles:
 *   export { foo, bar as baz } from './file.js';
 *   export * from './file.js';
 *   export type { T } from './file.js';
 *   export const foo = …;
 *   export function foo …;
 *   export class Foo …;
 *   export async function foo …;
 *   export default …  → captured as 'default'
 */
export function extractExports(source: string): IndexExport[] {
  const exports: IndexExport[] = [];
  // export { foo, bar as baz } from '…';   or without `from`
  const reBlock = /export\s+(type\s+)?\{([^}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = reBlock.exec(source)) !== null) {
    const isType = !!m[1];
    const inside = m[2];
    for (const part of inside.split(',')) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const aliasMatch = trimmed.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/);
      const name = aliasMatch ? aliasMatch[2] : trimmed.split(/\s+/)[0];
      if (name && /^[A-Za-z_$]/.test(name)) {
        exports.push({
          index_file: '', // filled in by caller
          export_name: name,
          raw_form: isType ? 'type' : 'named',
        });
      }
    }
  }

  // export * from '…';
  const reStar = /export\s+\*\s+from/g;
  while ((m = reStar.exec(source)) !== null) {
    exports.push({ index_file: '', export_name: '*', raw_form: 'star' });
  }

  // export const|let|var|function|class|async function|enum|interface|type X
  const reDecl =
    /export\s+(?:async\s+)?(?:const|let|var|function|class|enum|interface|type)\s+([A-Za-z_$][\w$]*)/g;
  while ((m = reDecl.exec(source)) !== null) {
    exports.push({ index_file: '', export_name: m[1], raw_form: 'named' });
  }

  // export default …
  if (/export\s+default\b/.test(source)) {
    exports.push({ index_file: '', export_name: 'default', raw_form: 'named' });
  }

  // De-duplicate (export {foo} + export {foo as foo} can repeat).
  const seen = new Set<string>();
  return exports.filter((e) => {
    const key = `${e.export_name}::${e.raw_form}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// =============================================================================
// Importer-discovery (grep for `import { … } from '…/deterministic[/sub]'`)
// =============================================================================

export interface ImporterMatch {
  file: string; // repo-relative
  // True iff the importer-file is itself inside the deterministic/ subtree.
  is_internal: boolean;
}

export function findImporters(
  exportName: string,
  searchRoots: string[],
  detRoot: string = DET_ROOT,
  reportRoot: string = REPO_ROOT
): ImporterMatch[] {
  const matches: ImporterMatch[] = [];
  if (exportName === '*' || exportName === 'default') return matches;
  const exportToken = new RegExp(`\\b${escapeRe(exportName)}\\b`);
  const importBlock = /import\s+(?:type\s+)?(?:\*\s+as\s+\w+|[\w$]+\s*,\s*)?\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g;

  // Normalise detRoot for prefix-matching (used to identify is_internal AND to
  // resolve relative `from` paths back into absolute filesystem paths).
  const detRootNorm = path.resolve(detRoot).toLowerCase().replace(/\\/g, '/') + '/';
  const detRootBase = path.basename(path.resolve(detRoot));

  for (const root of searchRoots) {
    walkSourceFiles(root, (file, content) => {
      const fileNorm = path.resolve(file).toLowerCase().replace(/\\/g, '/');
      // Skip index.ts files inside the detRoot — re-exports are not "use".
      if (path.basename(file) === 'index.ts' && fileNorm.startsWith(detRootNorm)) {
        return;
      }
      let m: RegExpExecArray | null;
      while ((m = importBlock.exec(content)) !== null) {
        const namedList = m[1];
        if (!exportToken.test(namedList)) continue;
        const fromPath = m[2];
        // Resolve the import target back to an absolute path so we can check
        // whether it lands inside detRoot — this works for relative imports
        // (`./sub/index.js`) AND for paths that happen to contain the
        // detRoot-basename verbatim (the production case where the path
        // actually includes "deterministic").
        let targetAbs: string | null = null;
        if (fromPath.startsWith('.')) {
          targetAbs = path.resolve(path.dirname(file), fromPath);
        } else if (fromPath.includes(detRootBase + '/') || fromPath.includes(detRootBase + path.sep)) {
          targetAbs = fromPath; // bare reference — keep as-is for fragment-match
        }
        const targetNorm = targetAbs ? targetAbs.toLowerCase().replace(/\\/g, '/') : '';
        const targetsDetRoot =
          targetNorm.startsWith(detRootNorm) ||
          targetNorm.includes('/' + detRootBase + '/') ||
          fromPath.includes(detRootBase + '/');
        if (!targetsDetRoot) continue;

        const rel = path.relative(reportRoot, file).replace(/\\/g, '/');
        const isInternal = fileNorm.startsWith(detRootNorm);
        matches.push({ file: rel, is_internal: isInternal });
      }
    });
  }
  return matches;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function walkSourceFiles(root: string, visit: (file: string, content: string) => void): void {
  if (!fs.existsSync(root)) return;
  const stack: string[] = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (
          e.name === 'node_modules' ||
          e.name === '.next' ||
          e.name === 'generated' ||
          e.name === 'snapshots' ||
          e.name === 'cache' ||
          e.name === 'data'
        ) {
          continue;
        }
        stack.push(full);
        continue;
      }
      if (!e.isFile()) continue;
      if (!/\.(ts|tsx|js|mjs)$/i.test(e.name)) continue;
      try {
        const content = fs.readFileSync(full, 'utf-8');
        visit(full, content);
      } catch {
        // skip unreadable files
      }
    }
  }
}

// =============================================================================
// Classification
// =============================================================================

export interface SurfaceEntry {
  index_file: string;
  export_name: string;
  importer_count_total: number;
  importer_count_external: number;
  importer_count_internal: number;
  importer_files: string[];
  classification: 'public' | 'internal' | 'unused' | 'wildcard';
}

export function classify(
  exportRow: IndexExport,
  importers: ImporterMatch[]
): SurfaceEntry['classification'] {
  if (exportRow.raw_form === 'star') return 'wildcard';
  if (importers.length === 0) return 'unused';
  if (importers.some((i) => !i.is_internal)) return 'public';
  return 'internal';
}

// =============================================================================
// Markdown rendering
// =============================================================================

export function renderMarkdown(entries: SurfaceEntry[]): string {
  const out: string[] = [];
  out.push('# API-SURFACE.md');
  out.push('');
  out.push(
    '> Auto-generated by `npm run api-surface`. Do not edit manually. ' +
      `Last-regenerated: ${new Date().toISOString()}.`
  );
  out.push('');
  out.push(
    'Classifies every export from each `index.ts` under `scripts/spike/deterministic/` as **public** (imported outside the deterministic/ subtree), **internal** (only imported within deterministic/), **unused** (no detectable importer), or **wildcard** (`export * from`, opaque to this scan).'
  );
  out.push('');

  const counts = {
    public: entries.filter((e) => e.classification === 'public').length,
    internal: entries.filter((e) => e.classification === 'internal').length,
    unused: entries.filter((e) => e.classification === 'unused').length,
    wildcard: entries.filter((e) => e.classification === 'wildcard').length,
  };
  out.push('## Summary');
  out.push('');
  out.push(`- public: **${counts.public}**`);
  out.push(`- internal: **${counts.internal}**`);
  out.push(`- unused: **${counts.unused}**`);
  out.push(`- wildcard re-exports: **${counts.wildcard}**`);
  out.push(`- total: **${entries.length}**`);
  out.push('');

  out.push('## Per-export table');
  out.push('');
  out.push('| index_file | export | classification | external | internal | total |');
  out.push('|---|---|---|---:|---:|---:|');
  for (const e of entries) {
    out.push(
      `| \`${e.index_file}\` | \`${e.export_name}\` | ${e.classification} | ${e.importer_count_external} | ${e.importer_count_internal} | ${e.importer_count_total} |`
    );
  }
  out.push('');

  // Detail sections
  const unused = entries.filter((e) => e.classification === 'unused');
  out.push(`## Unused exports (${unused.length})`);
  out.push('');
  if (unused.length === 0) {
    out.push('_None._');
  } else {
    out.push('| index_file | export |');
    out.push('|---|---|');
    for (const e of unused) {
      out.push(`| \`${e.index_file}\` | \`${e.export_name}\` |`);
    }
  }
  out.push('');

  const publics = entries.filter((e) => e.classification === 'public');
  out.push(`## Public exports — external consumers (${publics.length})`);
  out.push('');
  if (publics.length === 0) {
    out.push('_None._');
  } else {
    out.push('| export | importer_files |');
    out.push('|---|---|');
    for (const e of publics) {
      out.push(`| \`${e.export_name}\` | ${e.importer_files.join(', ')} |`);
    }
  }
  out.push('');

  return out.join('\n');
}

// =============================================================================
// CLI entry-point
// =============================================================================

export async function buildSurface(
  detRoot: string = DET_ROOT,
  searchRoots: string[] = [
    path.resolve(REPO_ROOT, 'src'),
    path.resolve(REPO_ROOT, 'scripts'),
  ],
  reportRoot: string = REPO_ROOT
): Promise<SurfaceEntry[]> {
  const indexFiles = findIndexFiles(detRoot);
  const allExports: IndexExport[] = [];
  for (const file of indexFiles) {
    const rel = path.relative(reportRoot, file).replace(/\\/g, '/');
    const src = fs.readFileSync(file, 'utf-8');
    const exports = extractExports(src);
    for (const e of exports) {
      allExports.push({ ...e, index_file: rel });
    }
  }

  const entries: SurfaceEntry[] = [];
  for (const ex of allExports) {
    const importers = findImporters(ex.export_name, searchRoots, detRoot, reportRoot);
    const externalCount = importers.filter((i) => !i.is_internal).length;
    const internalCount = importers.filter((i) => i.is_internal).length;
    entries.push({
      index_file: ex.index_file,
      export_name: ex.export_name,
      importer_count_total: importers.length,
      importer_count_external: externalCount,
      importer_count_internal: internalCount,
      importer_files: dedupe(importers.map((i) => i.file)),
      classification: classify(ex, importers),
    });
  }
  return entries.sort((a, b) =>
    a.index_file.localeCompare(b.index_file) || a.export_name.localeCompare(b.export_name)
  );
}

function dedupe(list: string[]): string[] {
  return [...new Set(list)];
}

export async function main(): Promise<void> {
  const entries = await buildSurface();
  const md = renderMarkdown(entries);
  fs.writeFileSync(OUT_PATH, md, 'utf-8');
  const counts = {
    public: entries.filter((e) => e.classification === 'public').length,
    internal: entries.filter((e) => e.classification === 'internal').length,
    unused: entries.filter((e) => e.classification === 'unused').length,
  };
  console.log(
    `[api-surface] wrote ${path.relative(REPO_ROOT, OUT_PATH)} ` +
      `(public=${counts.public}, internal=${counts.internal}, unused=${counts.unused}, total=${entries.length})`
  );
}

if (import.meta.url === pathToFileUrlSafe(process.argv[1])) {
  void main();
}

function pathToFileUrlSafe(p: string | undefined): string {
  if (!p) return '';
  try {
    return new URL(`file://${path.resolve(p).replace(/\\/g, '/')}`).href;
  } catch {
    return '';
  }
}
