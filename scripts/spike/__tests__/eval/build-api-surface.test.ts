import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  extractExports,
  classify,
  findIndexFiles,
  buildSurface,
  renderMarkdown,
} from '../../eval/build-api-surface.js';

describe('extractExports', () => {
  it('captures named-block exports including aliases', () => {
    const src = `export { foo, bar as baz } from './a.js';`;
    const exports = extractExports(src).map((e) => e.export_name);
    expect(exports).toContain('foo');
    expect(exports).toContain('baz');
    expect(exports).not.toContain('bar');
  });

  it('captures `export type {…}` as type-form', () => {
    const src = `export type { MyType } from './t.js';`;
    const exports = extractExports(src);
    const t = exports.find((e) => e.export_name === 'MyType');
    expect(t?.raw_form).toBe('type');
  });

  it('captures `export *` as wildcard', () => {
    const src = `export * from './a.js';`;
    const exports = extractExports(src);
    expect(exports.find((e) => e.raw_form === 'star')).toBeTruthy();
  });

  it('captures direct const/function/class declarations', () => {
    const src = `
      export const CONST_A = 1;
      export function fnB() {}
      export async function asyncFnC() {}
      export class ClassD {}
      export interface IfaceE {}
    `;
    const names = extractExports(src).map((e) => e.export_name);
    expect(names).toEqual(expect.arrayContaining(['CONST_A', 'fnB', 'asyncFnC', 'ClassD', 'IfaceE']));
  });

  it('captures `export default …`', () => {
    expect(extractExports(`export default function () {}`).find((e) => e.export_name === 'default')).toBeTruthy();
  });
});

describe('classify', () => {
  const namedRow = { index_file: '', export_name: 'foo', raw_form: 'named' as const };
  it('returns wildcard for `export *`', () => {
    expect(
      classify({ index_file: '', export_name: '*', raw_form: 'star' }, [])
    ).toBe('wildcard');
  });
  it('returns unused when no importers', () => {
    expect(classify(namedRow, [])).toBe('unused');
  });
  it('returns internal when only deterministic-internal importers', () => {
    expect(
      classify(namedRow, [{ file: 'scripts/spike/deterministic/x.ts', is_internal: true }])
    ).toBe('internal');
  });
  it('returns public when any importer is external', () => {
    expect(
      classify(namedRow, [
        { file: 'scripts/spike/deterministic/x.ts', is_internal: true },
        { file: 'src/lib/foo.ts', is_internal: false },
      ])
    ).toBe('public');
  });
});

describe('findIndexFiles + buildSurface — temp-dir end-to-end', () => {
  let tmp: string;
  let detRoot: string;
  let extRoot: string;

  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'apiq-api-surface-'));
    detRoot = path.join(tmp, 'deterministic');
    extRoot = path.join(tmp, 'src');
    fs.mkdirSync(detRoot, { recursive: true });
    fs.mkdirSync(path.join(detRoot, 'sub'), { recursive: true });
    fs.mkdirSync(extRoot, { recursive: true });
    // root index re-exports two functions
    fs.writeFileSync(
      path.join(detRoot, 'index.ts'),
      `export { runRoot, helperRoot } from './impl.js';\nexport const Untouched = 1;\n`
    );
    // sub index exports one function
    fs.writeFileSync(
      path.join(detRoot, 'sub', 'index.ts'),
      `export { runSub } from './sub-impl.js';\n`
    );
    // external consumer imports runRoot only — runRoot is public, helperRoot is unused
    fs.writeFileSync(
      path.join(extRoot, 'consumer.ts'),
      `import { runRoot } from '../deterministic/index.js';\nrunRoot();\n`
    );
    // internal consumer (inside deterministic/) imports runSub
    fs.writeFileSync(
      path.join(detRoot, 'internal.ts'),
      `import { runSub } from './sub/index.js';\nrunSub();\n`
    );
  });

  afterAll(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('discovers both index.ts files', () => {
    const files = findIndexFiles(detRoot);
    expect(files.length).toBe(2);
  });

  it('classifies runRoot as public, runSub as internal, helperRoot/Untouched as unused', async () => {
    // For the temp-dir test we need to bypass the REPO_ROOT-relative path
    // detection, so we set `is_internal` heuristic to look for "deterministic/"
    // in the importer file-path. The fixture above keeps importers within
    // tmp/{deterministic,src}/ so the heuristic still works.
    const entries = await buildSurface(detRoot, [extRoot, detRoot]);
    const named = (n: string) => entries.find((e) => e.export_name === n);
    expect(named('runRoot')?.classification).toBe('public');
    expect(named('runSub')?.classification).toBe('internal');
    expect(named('helperRoot')?.classification).toBe('unused');
    expect(named('Untouched')?.classification).toBe('unused');
  });
});

describe('renderMarkdown', () => {
  it('emits summary + per-export + unused + public sections', () => {
    const md = renderMarkdown([
      {
        index_file: 'a/index.ts',
        export_name: 'foo',
        importer_count_total: 1,
        importer_count_external: 1,
        importer_count_internal: 0,
        importer_files: ['src/x.ts'],
        classification: 'public',
      },
      {
        index_file: 'a/index.ts',
        export_name: 'bar',
        importer_count_total: 0,
        importer_count_external: 0,
        importer_count_internal: 0,
        importer_files: [],
        classification: 'unused',
      },
    ]);
    expect(md).toContain('# API-SURFACE.md');
    expect(md).toContain('## Summary');
    expect(md).toContain('## Per-export table');
    expect(md).toContain('## Unused exports');
    expect(md).toContain('## Public exports — external consumers');
  });
});
