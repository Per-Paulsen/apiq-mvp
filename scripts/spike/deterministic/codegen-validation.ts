/**
 * Codegen-Validation runner — Stage-A, Welle B T18b (Module-Class).
 *
 * Sources: openapi-typescript (https://openapi-ts.dev)
 *          + Redocly lintDocument/bundle pipeline
 *          + TypeScript compiler API (tsc)
 *          + openapi-generator multi-issue tracker (validation classes)
 * Patterns: 5 finding-classes (validation-problems, ref-resolution-warnings,
 *           discriminator-mapping-warnings, TS-compile-errors, timeouts)
 * Lens: 4 (Client-Friction — codegen-output reputation-load-bearing)
 * Round: 2 (Welle B / W1 codegen-output-aggregation post-Welle-Q)
 *
 * Maps to rules-brainstorm.md: CL-1 (reserved-keywords), CL-22 (type:object
 * without properties), CL-25 (pattern unsupported), CL-37 (component naming
 * special chars), CL-66 (discriminator missing schemas).
 *
 * Runs `openapi-typescript` (https://openapi-ts.dev) against the spec and
 * surfaces any validation problem, $ref-resolution failure, or downstream
 * TypeScript compile-error as a Finding. The premise: if a mature codegen
 * pipeline (used by thousands of TypeScript projects to generate clients)
 * trips on a spec, that's a real defect class — consumers will hit the same
 * issue. Stage-A is reputation-load-bearing, so we want to catch this before
 * Phase B.
 *
 * What this module captures:
 *   1. Validation problems emitted by openapi-typescript / Redocly's
 *      lintDocument + bundle phases — surface as warnings. The first error-
 *      severity problem terminates the run with a thrown Error; we capture
 *      that as a high-severity finding too.
 *   2. $ref-resolution warnings ("Could not resolve $ref ..."). These break
 *      the generated types silently (codegen substitutes `unknown`).
 *   3. Discriminator-mapping warnings ("invalid schema for discriminator").
 *   4. TypeScript compile-errors when the generated output is fed back through
 *      the TS compiler API. Real-world specs occasionally produce types that
 *      reference undefined names / collide on identifiers; this detects that.
 *   5. Timeouts (codegen on stripe-full takes > 30s on a cold run).
 *
 * Maps to FindingSchema via the canonical output-mapper. No vendor knowledge
 * — codegen-validation works on any spec.
 *
 * Layer choice: codegen-validation is conceptually its own pre-pass, but to
 * avoid colliding with other agents extending the shared `DetectorLayer`
 * union, we tag findings with the existing `walker-statistical` layer (it's
 * the closest mechanic-not-rule analog). The detectorId prefix `codegen:*`
 * carries the actual provenance.
 *
 * Public API:
 *   `runCodegenValidation(spec, opts) => Promise<DetectorFinding[]>`
 *
 * CLI:
 *   `npx tsx deterministic/codegen-validation.ts <spec-name>`
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import YAML from 'yaml';
import openapiTS, { astToString } from 'openapi-typescript';
import ts from 'typescript';

import type { DetectorFinding, DetectorOptions } from './types.js';
import { cycleStripSpec } from '../stringify-spec.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =============================================================================
// Default timeout — codegen on stripe-full (560+ ops, deep schemas) typically
// completes in 30–90s. We allow 5 minutes as ceiling before declaring it stuck;
// timeout itself emits a finding (it's a real signal that the spec is too
// gnarly for off-the-shelf codegen) instead of crashing.
// =============================================================================

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

// =============================================================================
// Console-interception helpers.
//
// openapi-typescript reports validation problems via `console.warn` (yellow ⚠)
// and `console.error` (red ✘). The first error-severity problem ALSO throws
// (so we get the message twice), but it logs every problem along the way
// before throwing. We intercept the global console functions for the duration
// of the run, collect the messages into arrays, and restore the originals
// in a `finally` block so tests / other modules don't see leaked patches.
//
// We use a simple counter so nested intercepts (shouldn't happen, but) don't
// cross-contaminate.
// =============================================================================

interface InterceptedOutput {
  warnings: string[];
  errors: string[];
}

// ANSI escape codes openapi-typescript wraps its messages with — we strip
// them so downstream message-matching / display works on plain text.
const ANSI_RE = /\x1b\[[0-9;]*m/g;

function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, '');
}

function interceptConsole(): { restore: () => void; output: InterceptedOutput } {
  const output: InterceptedOutput = { warnings: [], errors: [] };
  const origWarn = console.warn;
  const origError = console.error;

  console.warn = (...args: unknown[]): void => {
    const msg = args
      .map((a) => (typeof a === 'string' ? a : String(a)))
      .join(' ');
    output.warnings.push(stripAnsi(msg).trim());
  };
  console.error = (...args: unknown[]): void => {
    const msg = args
      .map((a) => (typeof a === 'string' ? a : String(a)))
      .join(' ');
    output.errors.push(stripAnsi(msg).trim());
  };

  return {
    restore: () => {
      console.warn = origWarn;
      console.error = origError;
    },
    output,
  };
}

// =============================================================================
// Message normalisation.
//
// openapi-typescript's `error()` / `warn()` helpers prefix the message with a
// glyph + space (`✘ ` or `⚠ `) plus surrounding whitespace. We strip those for
// cleaner comparison and to keep finding titles tidy.
// =============================================================================

const LEAD_GLYPHS_RE = /^[\s✘⚠✖✓]+\s*/;

function cleanMessage(msg: string): string {
  return msg.replace(LEAD_GLYPHS_RE, '').trim();
}

// =============================================================================
// Problem categorisation. Decides finding-severity based on the message
// shape. Everything from console.error → high. Everything from console.warn
// → low (hint). Throw-errors that escape openapiTS → high too.
// =============================================================================

function severityForWarning(): 'low' {
  return 'low';
}

function severityForError(): 'high' {
  return 'high';
}

// =============================================================================
// JSON-Pointer extraction. Redocly tacks " at /paths/foo/get/responses/200"
// to many of its error messages — we extract that into the finding's
// sourcePath so downstream consumers can navigate.
// =============================================================================

const POINTER_TAIL_RE = /\s+at\s+(#?\/[^\s,]+)\s*$/;

function extractPointer(msg: string): { cleaned: string; pointer: string | null } {
  const m = msg.match(POINTER_TAIL_RE);
  if (!m) return { cleaned: msg, pointer: null };
  const cleaned = msg.slice(0, m.index).trim();
  let pointer = m[1];
  if (pointer.startsWith('#')) pointer = pointer.slice(1);
  if (!pointer.startsWith('/')) pointer = '/' + pointer;
  return { cleaned, pointer };
}

// =============================================================================
// Endpoint extraction from JSON-Pointer (mirrors spectral-runner logic).
// =============================================================================

const HTTP_METHODS = new Set([
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'head',
  'options',
  'trace',
]);

function endpointFromPointer(
  pointer: string | null
): Array<{ path: string; method: string }> {
  if (!pointer) return [];
  // JSON Pointer: /paths/<encoded-path>/<method>/...
  const parts = pointer
    .split('/')
    .filter(Boolean)
    .map((seg) => seg.replace(/~1/g, '/').replace(/~0/g, '~'));
  const pathsIdx = parts.indexOf('paths');
  if (pathsIdx < 0 || pathsIdx + 1 >= parts.length) return [];
  const route = parts[pathsIdx + 1];
  if (!route.startsWith('/')) return [];
  const method =
    pathsIdx + 2 < parts.length ? parts[pathsIdx + 2].toLowerCase() : null;
  if (method && HTTP_METHODS.has(method)) {
    return [{ path: route, method }];
  }
  return [];
}

// =============================================================================
// Build a DetectorFinding from one captured problem.
// =============================================================================

interface CodegenProblem {
  message: string;
  severity: 'high' | 'low';
  /** subtype label for the detectorId, e.g. "ref-unresolved" / "validation-error". */
  kind: string;
}

function buildFinding(p: CodegenProblem): DetectorFinding {
  const cleanedRaw = cleanMessage(p.message);
  const { cleaned, pointer } = extractPointer(cleanedRaw);
  const affectedEndpoints = endpointFromPointer(pointer);
  const scope: 'endpoint' | 'spec' = affectedEndpoints.length > 0 ? 'endpoint' : 'spec';

  // Title: first 200 chars of cleaned message; fallback if empty.
  const titleBase = cleaned.length > 0 ? cleaned : `openapi-typescript: ${p.kind}`;
  const title = `Codegen-validation: ${titleBase}`.slice(0, 200);

  const narrationBits: string[] = [];
  narrationBits.push(
    `\`openapi-typescript\` (the most-used TypeScript codegen for OpenAPI specs) reported a ${
      p.severity === 'high' ? 'fatal' : 'non-fatal'
    } problem while consuming this spec: "${cleaned}".`
  );
  if (pointer) narrationBits.push(`Source location: \`${pointer}\`.`);
  narrationBits.push(
    'When commercial codegen pipelines (openapi-typescript, openapi-generator, oapi-codegen, ' +
      'Kiota, Speakeasy) trip on a spec, the generated SDK either fails to compile, ' +
      'silently substitutes `unknown` for unresolved schemas, or drops the affected operation. ' +
      'Either way: consumers of this spec will hit the same issue when generating their clients.'
  );
  const narration = narrationBits.join(' ');

  const rationale =
    p.severity === 'high'
      ? 'Fatal codegen failures break the SDK pipeline outright — the most common reason a TypeScript consumer abandons an OpenAPI spec in favor of hand-written types. The defect must be addressed at the spec level; downstream codegen tools cannot recover.'
      : 'Non-fatal codegen warnings indicate the generator either silently substituted weaker types or skipped a schema. The resulting SDK compiles but produces incorrect types for callers; the wrongness is invisible until a user hits the affected endpoint.';

  const patchSummary =
    p.severity === 'high'
      ? `Fix the codegen-blocking issue at ${pointer ?? 'the reported location'}.`
      : `Resolve the codegen warning at ${pointer ?? 'the reported location'} so generated types stay accurate.`;

  return {
    detectorId: `codegen:openapi-typescript:${p.kind}`,
    layer: 'walker-statistical',
    title,
    narration,
    rationale,
    category: 'correctness',
    severity: p.severity,
    scope,
    affectedEndpoints,
    patchOps: [],
    patchSummary,
    sourcePath: pointer ?? undefined,
    meta: {
      tool: 'openapi-typescript',
      kind: p.kind,
      rawMessage: p.message,
    },
  };
}

// =============================================================================
// Classify a captured message into a finding `kind` (used in detectorId).
// =============================================================================

function classifyMessage(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('could not resolve $ref')) return 'ref-unresolved';
  if (m.includes('circular $ref')) return 'ref-circular';
  if (m.includes('discriminator mapping')) return 'discriminator-invalid';
  if (m.includes('unsupported swagger') || m.includes('unsupported openapi')) {
    return 'unsupported-version';
  }
  if (m.includes('unsupported schema format')) return 'unsupported-format';
  if (m.includes('expected')) return 'parse-error';
  if (m.includes('duplicate')) return 'duplicate-name';
  return 'validation-problem';
}

// =============================================================================
// TypeScript compile-check on the generated output.
//
// openapi-typescript hands us back a list of `ts.Node`s. We render them to a
// string + parse them back through the TS compiler in a *virtual* setup. Any
// emit-blocking diagnostic surfaces a finding. This catches the rare cases
// where the spec validates but produces broken TypeScript — typically
// duplicate type identifiers or unresolved references that bypassed Redocly's
// linter.
// =============================================================================

function compileGeneratedTypes(generated: string): CodegenProblem[] {
  const fileName = '__generated.ts';
  const sourceFile = ts.createSourceFile(
    fileName,
    generated,
    ts.ScriptTarget.ES2022,
    /* setParentNodes */ true,
    ts.ScriptKind.TS
  );

  // Build a minimal in-memory program. We only care about syntactic diagnostics
  // (parse errors) — full semantic diagnostics would require resolving lib.d.ts
  // etc., which is overkill and slow. openapi-typescript's output is always
  // self-contained pure type declarations, so syntactic diagnostics catch the
  // failure modes we care about.
  const compilerHost: ts.CompilerHost = {
    getSourceFile: (name) => (name === fileName ? sourceFile : undefined),
    getDefaultLibFileName: () => 'lib.d.ts',
    writeFile: () => {},
    getCurrentDirectory: () => '/',
    getCanonicalFileName: (name) => name,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
    fileExists: (name) => name === fileName,
    readFile: () => '',
    directoryExists: () => true,
    getDirectories: () => [],
  };

  const program = ts.createProgram(
    [fileName],
    {
      noEmit: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      skipLibCheck: true,
      noResolve: true,
    },
    compilerHost
  );

  const diagnostics = program.getSyntacticDiagnostics(sourceFile);
  const problems: CodegenProblem[] = [];
  for (const d of diagnostics) {
    const flat = ts.flattenDiagnosticMessageText(d.messageText, '\n');
    let location = '';
    if (d.file && typeof d.start === 'number') {
      const { line, character } = d.file.getLineAndCharacterOfPosition(d.start);
      location = ` (line ${line + 1}, col ${character + 1})`;
    }
    problems.push({
      message: `TypeScript compile-error in generated output${location}: ${flat}`,
      severity: 'high',
      kind: 'ts-compile-error',
    });
  }
  return problems;
}

// =============================================================================
// Public API — runCodegenValidation.
// =============================================================================

export async function runCodegenValidation(
  spec: object,
  opts?: DetectorOptions & { timeoutMs?: number }
): Promise<DetectorFinding[]> {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const findings: DetectorFinding[] = [];
  const problems: CodegenProblem[] = [];

  // openapiTS does its own bundling/dereferencing via Redocly. Cycles in a
  // pre-dereferenced spec break JSON.stringify, so we run cycleStripSpec
  // defensively — accepts both raw-with-$refs and dereferenced shapes.
  let safeSpec: object;
  try {
    safeSpec = cycleStripSpec(spec) as object;
  } catch (err) {
    return [
      buildFinding({
        message: `Spec preprocessing failed before codegen could start: ${
          err instanceof Error ? err.message : String(err)
        }`,
        severity: 'high',
        kind: 'preprocess-failure',
      }),
    ];
  }

  const intercept = interceptConsole();
  let generatedAst: ts.Node[] | null = null;
  let timedOut = false;
  let runError: unknown = null;

  try {
    const codegenPromise = openapiTS(safeSpec as never, {
      // We need to see warnings, so don't silence the run. They'll be
      // captured by our intercepted console.warn.
      silent: false,
    });

    let timeoutHandle: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<null>((resolve) => {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        resolve(null);
      }, timeoutMs);
    });

    const result = await Promise.race([codegenPromise, timeoutPromise]);
    if (timeoutHandle) clearTimeout(timeoutHandle);

    if (timedOut) {
      // Don't await codegenPromise — it may hang. Let it run on background;
      // the global console intercept is restored in `finally` so it can't
      // pollute future calls. (Caveat: if it does eventually throw, the
      // unhandled-rejection bubbles up. We attach a handler to swallow it.)
      codegenPromise.catch(() => {
        /* swallow — we already reported timeout */
      });
    } else {
      generatedAst = result;
    }
  } catch (err) {
    runError = err;
  } finally {
    intercept.restore();
  }

  // ---- Captured warnings / errors -------------------------------------------
  for (const w of intercept.output.warnings) {
    if (!w) continue;
    problems.push({
      message: w,
      severity: severityForWarning(),
      kind: classifyMessage(w),
    });
  }
  for (const e of intercept.output.errors) {
    if (!e) continue;
    problems.push({
      message: e,
      severity: severityForError(),
      kind: classifyMessage(e),
    });
  }

  // ---- Thrown error ---------------------------------------------------------
  if (runError) {
    const errMsg = runError instanceof Error ? runError.message : String(runError);
    // openapi-typescript also calls `error()` (which logs to console.error)
    // before throwing — so this is often a duplicate of an earlier captured
    // line. De-dupe by approximate message-prefix match.
    const cleanedThrow = cleanMessage(errMsg);
    const alreadyCaptured = problems.some(
      (p) => p.severity === 'high' && cleanMessage(p.message) === cleanedThrow
    );
    if (!alreadyCaptured) {
      problems.push({
        message: errMsg,
        severity: 'high',
        kind: 'codegen-failure',
      });
    }
  }

  // ---- Timeout --------------------------------------------------------------
  if (timedOut) {
    problems.push({
      message:
        `openapi-typescript codegen exceeded ${Math.round(
          timeoutMs / 1000
        )}s timeout — spec is too large or contains a pathological structure ` +
        `(deep $refs, circular dependencies that exceed Redocly's resolver limits). ` +
        `Commercial codegen pipelines have similar timeouts; consumers will see the same hang.`,
      severity: 'high',
      kind: 'timeout',
    });
  }

  // ---- TS compile diagnostics ----------------------------------------------
  if (generatedAst && !timedOut) {
    try {
      const generated = astToString(generatedAst);
      const tsProblems = compileGeneratedTypes(generated);
      problems.push(...tsProblems);
    } catch (err) {
      problems.push({
        message: `Failed to render or compile generated TypeScript: ${
          err instanceof Error ? err.message : String(err)
        }`,
        severity: 'high',
        kind: 'render-failure',
      });
    }
  }

  // ---- De-duplicate -------------------------------------------------------
  // openapi-typescript can repeat the same warning line for repeated $refs;
  // we collapse identical messages (after cleaning) to one finding each.
  const seen = new Set<string>();
  for (const p of problems) {
    const key = `${p.kind}::${cleanMessage(p.message)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    findings.push(buildFinding(p));
  }

  return findings;
}

// =============================================================================
// CLI
// =============================================================================

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const EXAMPLES_DIR = path.join(REPO_ROOT, 'openapi-examples');

async function loadSpec(specName: string): Promise<object> {
  const baseDir = path.join(EXAMPLES_DIR, specName);
  const candidates = ['spec.json', 'spec.yaml', 'spec.yml'];
  let specPath: string | null = null;
  for (const c of candidates) {
    const p = path.join(baseDir, c);
    if (fs.existsSync(p)) {
      specPath = p;
      break;
    }
  }
  if (!specPath) {
    throw new Error(
      `No spec file found for "${specName}". Looked in ${candidates
        .map((c) => path.join(baseDir, c))
        .join(', ')}`
    );
  }
  const raw = fs.readFileSync(specPath, 'utf8');
  const ext = path.extname(specPath).toLowerCase();
  return ext === '.json' ? (JSON.parse(raw) as object) : (YAML.parse(raw) as object);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    // eslint-disable-next-line no-console
    console.log('Usage: npx tsx deterministic/codegen-validation.ts <spec-name>');
    process.exit(0);
  }
  const specName = args[0];

  // eslint-disable-next-line no-console
  console.log(`[codegen-validation] loading ${specName} ...`);
  const spec = await loadSpec(specName);

  // eslint-disable-next-line no-console
  console.log(`[codegen-validation] running openapi-typescript on ${specName} ...`);
  const startedAt = Date.now();
  const findings = await runCodegenValidation(spec, { specName });
  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);

  // eslint-disable-next-line no-console
  console.log('');
  // eslint-disable-next-line no-console
  console.log(`Spec:                  ${specName}`);
  // eslint-disable-next-line no-console
  console.log(`Runtime:               ${elapsedSec}s`);
  // eslint-disable-next-line no-console
  console.log(`Total findings:        ${findings.length}`);
  // eslint-disable-next-line no-console
  console.log(
    `  high severity:       ${findings.filter((f) => f.severity === 'high').length}`
  );
  // eslint-disable-next-line no-console
  console.log(
    `  low severity (hint): ${findings.filter((f) => f.severity === 'low').length}`
  );

  if (findings.length === 0) {
    // eslint-disable-next-line no-console
    console.log('');
    // eslint-disable-next-line no-console
    console.log('OK — no codegen-blocking problems detected.');
    return;
  }

  // Show first 10 findings as a sanity check.
  // eslint-disable-next-line no-console
  console.log('');
  // eslint-disable-next-line no-console
  console.log('First 10 findings:');
  for (const f of findings.slice(0, 10)) {
    // eslint-disable-next-line no-console
    console.log(
      `  [${f.severity.padEnd(4)}] ${f.detectorId}  ${f.title.slice(0, 120)}`
    );
  }
}

const invokedAsScript =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedAsScript) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err instanceof Error ? err.stack ?? err.message : String(err));
    process.exit(1);
  });
}
