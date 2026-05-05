/**
 * Stage-A AJV validator — deeper-than-Spectral schema-validity checks.
 *
 * Stage-A pre-pass detector. Compiles JSON-Schema sub-schemas via AJV (the
 * canonical JSON-Schema validator) and emits findings for four classes of
 * issue that Spectral's `oas3-valid-media-example` / `oas3-valid-schema-example`
 * either miss entirely or only check at the top level:
 *
 *   1. **Schema-compilation failures** — schemas AJV refuses to compile.
 *      These are usually OAS-only keywords leaking into a JSON-Schema-strict
 *      tree (e.g. discriminator object with malformed `mapping`, malformed
 *      `pattern` regex, type-array misuse) or genuine spec-corruption.
 *      Note: we use AJV's strict mode = false + addKeyword for OAS-only
 *      keywords so common OAS shapes pass; only real authoring errors flag.
 *
 *   2. **Example validation failures** — examples that don't validate against
 *      their own schema. Spectral's oas3-valid-media-example only checks
 *      mediaType-level examples; we additionally check examples on parameters,
 *      headers, request bodies, and component-level `examples` blocks
 *      cross-referenced by `$ref`. We also walk into `examples` map (multi-
 *      example pattern) and `example` keyword on inline schema nodes.
 *
 *   3. **Default validation failures** — `default` values that don't
 *      validate against their containing schema. We recurse through every
 *      schema-shaped node (including nested object properties, array items,
 *      allOf/oneOf/anyOf members) so a default deep inside a nested
 *      property still gets checked. Goes beyond apiq's existing 4 primitive-
 *      typed default rules in `apiq-ruleset.yaml`.
 *
 *   4. **Required-properties conflict (brainstorm A11)** — `required: [...]`
 *      items that don't appear in `properties` (combinatorial check). This
 *      makes the schema unsatisfiable when `additionalProperties: false`,
 *      and confusing/dead-rule even when `additionalProperties: true`.
 *
 * Stage-A discipline: SPEC-AGNOSTIC. No vendor-specific knowledge of
 * Stripe / GitHub / PagerDuty / dnd5eapi. Pure JSON-Schema mechanics.
 *
 * Public API:
 *   `runAjvValidator(spec, opts) => Promise<DetectorFinding[]>`
 *
 * CLI:
 *   `npx tsx deterministic/ajv-validator.ts <spec-name>`
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import YAML from 'yaml';

// Use AJV's 2020-12 build — it natively supports `type: [..., "null"]` which
// is the modern shape that OpenAPI 3.1 emits. We additionally pre-process
// OAS-3.0 schemas to translate `nullable: true` into the 2020-12 shape so the
// same validator handles both spec generations without needing two AJV
// instances or OAS-3.0-specific rules.
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import type { ErrorObject, AnySchema } from 'ajv';

import type { DetectorFinding, DetectorOptions } from './types.js';
import { cycleStripSpec } from '../stringify-spec.js';

// =============================================================================
// AJV instance — strict-mode tuned for OpenAPI 3.0 schemas (which are NOT
// strict JSON-Schema-2020-12; they sit between draft-04 and draft-07 with
// OAS-3 extensions).
//
// We accept OAS-3 keywords as "known unknowns" so they don't generate
// compilation errors. The validator's job here is to catch genuinely-broken
// schemas / defaults / examples, not to enforce JSON-Schema-2020-12 purity.
// =============================================================================

interface AjvCtor {
  new (opts?: Record<string, unknown>): Ajv;
}

const AjvCtor: AjvCtor = ((Ajv as unknown as { default?: AjvCtor }).default ?? Ajv) as AjvCtor;
const addFormatsFn = (
  (addFormats as unknown as { default?: typeof addFormats }).default ?? addFormats
) as typeof addFormats;

/**
 * Build a fresh AJV instance per validation pass. We avoid sharing a single
 * instance because adding compiled schemas as named refs leaks across specs
 * when running tests / multi-spec batch.
 */
function buildAjv(): Ajv {
  const ajv = new AjvCtor({
    strict: false,
    allErrors: true,
    validateFormats: false, // OAS specs use `format: int64`, `format: decimal`, etc.
    allowUnionTypes: true,
    coerceTypes: false,
    // Skip JSON-Schema metaschema validation. Real-world OAS 3.x specs use
    // shapes that draft-07 metaschema rejects (e.g. `type: ["string","null"]`
    // is OAS 3.1 / draft-2020-12 only; `nullable: true` in 3.0 confuses
    // strict-draft-07; `examples` adjacent to `example`, etc.). The job of
    // this validator is to catch genuine authoring errors (bad regex,
    // unsatisfiable required, default-value type mismatch), NOT to enforce
    // metaschema purity. Disabling metaschema-validation here lets AJV focus
    // on instance-validation (default + example pass) without rejecting the
    // schema itself for stylistic OAS-3 keywords.
    validateSchema: false,
  });
  // Allow ajv-formats to register all known formats. We keep validateFormats
  // off (so unknown formats like `int64` don't error), but registering keeps
  // the standard formats available if a future toggle wants to enforce them.
  addFormatsFn(ajv);

  // OAS-3 keywords AJV doesn't natively understand. Most are stripped by
  // normaliseOasSchema before compile, but registering them as known
  // keywords makes the validator robust to schemas that bypass the
  // normaliser (e.g. tests that hand a raw OAS-3 fragment directly).
  for (const kw of [
    'discriminator',
    'xml',
    'externalDocs',
    'example',
    'examples',
    'deprecated',
    'readOnly',
    'writeOnly',
    'nullable',
  ]) {
    if (!ajv.RULES.keywords[kw]) {
      ajv.addKeyword({ keyword: kw, errors: false });
    }
  }
  return ajv;
}

// =============================================================================
// Schema-shape detection. Knowing whether a node is a JSON-Schema-shaped
// object lets us decide which AJV pass to apply.
//
// We use a permissive heuristic: any object with at least one canonical
// JSON-Schema keyword is considered schema-shaped. This catches inline
// schemas (`type: object` blocks inside operation parameters / requestBodies)
// and component schemas alike.
// =============================================================================

const SCHEMA_KEYWORDS = new Set([
  'type',
  'properties',
  'items',
  'allOf',
  'oneOf',
  'anyOf',
  'not',
  'enum',
  'const',
  'required',
  'pattern',
  'format',
  'minLength',
  'maxLength',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'minItems',
  'maxItems',
  'uniqueItems',
  'multipleOf',
  'additionalProperties',
  'patternProperties',
  'dependentRequired',
  'discriminator',
  '$ref',
]);

function isSchemaShaped(node: unknown): node is Record<string, unknown> {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return false;
  const obj = node as Record<string, unknown>;
  for (const k of Object.keys(obj)) {
    if (SCHEMA_KEYWORDS.has(k)) return true;
  }
  return false;
}

// =============================================================================
// Spec preparation. AJV doesn't know about $ref in OAS pointing to
// `#/components/schemas/X`. We dereference inline by:
//   1. Stripping cycles (cycleStripSpec returns a spec with `{$ref: "#cyclic"}`
//      placeholders for back-edges; AJV treats those as known-unknown).
//   2. Building a $ref-resolver that AJV can use.
//
// Strategy: rather than trying to make AJV resolve OAS-style $refs (which
// requires schema-id juggling), we use AJV's `addSchema` to register the
// entire `components.schemas` block under the `#/components/schemas/X`
// pointer convention, then validate sub-schemas against it.
// =============================================================================

interface PreparedSpec {
  spec: Record<string, unknown>;
  /** A single shared AJV with every component-schema pre-registered under
   *  its canonical `#/components/schemas/X` pointer. Sub-schemas can $ref
   *  into the registry without inlining. */
  ajv: Ajv;
  /** The normalised components.schemas dictionary (OAS-3 keywords stripped,
   *  nullable translated). Sub-schemas in the spec still need normalisation
   *  before compile. */
  normalisedComponents: Record<string, unknown>;
}

/**
 * Recursively normalise OAS-3 idioms into 2020-12-compatible JSON-Schema.
 * Walks every nested schema-shaped node. Returns a fresh tree.
 */
function deepNormalise(node: unknown, depth = 0): unknown {
  if (depth > 64) return node;
  if (!node || typeof node !== 'object') return node;
  if (Array.isArray(node)) {
    return node.map((v) => deepNormalise(v, depth + 1));
  }
  const obj = node as Record<string, unknown>;
  // Pass-through cycle markers
  if (obj['$ref'] === '#cyclic') return {};
  // Apply per-node OAS-3 fixups
  const local = normaliseOasSchema(obj);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(local)) {
    out[k] = deepNormalise(v, depth + 1);
  }
  return out;
}

/**
 * Base id for the in-memory spec. AJV stores the registered envelope under
 * this id; sub-schemas resolve their `#/components/schemas/X` refs against
 * the same envelope so all internal cross-references work without per-call
 * inlining.
 */
const SPEC_BASE_ID = 'inmemory://oas-spec.json';

function prepareSpec(spec: object): PreparedSpec {
  const decycled = cycleStripSpec(spec) as Record<string, unknown>;
  const ajv = buildAjv();

  // Build a normalised components.schemas dictionary. We then register the
  // ENTIRE normalised spec with AJV under one shared $id, so any sub-schema
  // we ask AJV to compile resolves its refs against the registered envelope.
  // This handles non-standard refs like `#/components/schemas/Tag/allOf/0`
  // (PagerDuty pattern) as well as the canonical pattern.
  const components = decycled.components as Record<string, unknown> | undefined;
  const schemasRaw = components?.schemas as Record<string, unknown> | undefined;
  const normalisedComponents: Record<string, unknown> = {};

  if (schemasRaw) {
    for (const [name, schemaRaw] of Object.entries(schemasRaw)) {
      if (!schemaRaw || typeof schemaRaw !== 'object') continue;
      normalisedComponents[name] = deepNormalise(schemaRaw);
    }
  }

  // Build a synthetic envelope spec mirroring the spec's `components` block
  // wholesale (schemas + parameters + responses + requestBodies + headers).
  // Some specs (PagerDuty) reference component-parameters' embedded schemas
  // from other component-schemas via `#/components/parameters/.../schema`,
  // and we want those refs to resolve cleanly.
  const envelopeComponents: Record<string, unknown> = { schemas: normalisedComponents };
  if (components) {
    for (const subKey of ['parameters', 'responses', 'requestBodies', 'headers']) {
      const sub = components[subKey];
      if (sub && typeof sub === 'object') {
        envelopeComponents[subKey] = deepNormalise(sub);
      }
    }
  }
  const envelope: Record<string, unknown> = {
    $id: SPEC_BASE_ID,
    components: envelopeComponents,
  };
  try {
    ajv.addSchema(envelope as AnySchema, SPEC_BASE_ID);
  } catch {
    // best-effort — duplicate registration on re-run is possible if we ever
    // share an AJV instance across calls; not a blocker.
  }

  return { spec: decycled, ajv, normalisedComponents };
}

// =============================================================================
// JSON Pointer escape helper.
// =============================================================================

function escapeJsonPointer(s: string): string {
  return String(s).replace(/~/g, '~0').replace(/\//g, '~1');
}

function joinPointer(base: string, ...segments: Array<string | number>): string {
  let p = base;
  for (const s of segments) {
    p += '/' + escapeJsonPointer(String(s));
  }
  return p;
}

// =============================================================================
// AJV-error → narration helper. AJV errors are detailed; we condense to
// short user-facing strings.
// =============================================================================

function formatAjvErrors(errors: ErrorObject[] | null | undefined, max = 3): string {
  if (!errors || errors.length === 0) return '(no error details)';
  const parts: string[] = [];
  for (const e of errors.slice(0, max)) {
    const ip = e.instancePath || '(root)';
    const msg = e.message ?? 'invalid';
    parts.push(`${ip}: ${msg}`);
  }
  if (errors.length > max) parts.push(`(+ ${errors.length - max} more)`);
  return parts.join('; ');
}

// =============================================================================
// Recursive walker — yields every schema-shaped node + its JSON-Pointer
// origin. Avoids cycles via WeakSet identity tracking.
//
// Differs from walkers/_shared.ts:walkAllSchemas in that we yield even when
// the node has only `default`/`example`/`examples` (without other JSON-schema
// keywords) — necessary so we can flag a default without `type` etc.
// =============================================================================

interface SchemaWithPointer {
  schema: Record<string, unknown>;
  pointer: string;
}

function* walkSchemas(node: unknown, pointer: string, seen: WeakSet<object>): Generator<SchemaWithPointer> {
  if (!node || typeof node !== 'object') return;
  if (seen.has(node as object)) return;
  seen.add(node as object);

  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      yield* walkSchemas(node[i], joinPointer(pointer, i), seen);
    }
    return;
  }

  const obj = node as Record<string, unknown>;
  if (isSchemaShaped(obj)) {
    yield { schema: obj, pointer };
  }

  // Recurse — schema-shaped or not, we still need to descend into operation
  // parameters / requestBody / responses / components.
  for (const [k, v] of Object.entries(obj)) {
    yield* walkSchemas(v, joinPointer(pointer, k), seen);
  }
}

// =============================================================================
// $ref-stripping — for default/example validation we strip top-level $refs
// in sub-schemas so AJV validates the visible part. AJV with proper schema
// registration could follow $refs, but inline-stripping is more reliable
// for cycle-stripped specs.
//
// We turn `{$ref: "#cyclic"}` (cycleStripSpec marker) into `{}` so any value
// passes — there's no way to validate against a cyclic schema.
// =============================================================================

/**
 * Recursively replace `{$ref: "#cyclic"}` markers with `{}` and inline
 * `#/components/schemas/X` $refs (best-effort, depth-limited). We do not
 * attempt full OpenAPI $ref resolution — only the common patterns.
 *
 * We also normalise OAS-only shapes that AJV's 2020-12 mode rejects:
 *   - `nullable: true` (OAS 3.0) → adds `"null"` to the `type` (or expands
 *     a string `type` into a [type, "null"] tuple).
 *   - `exclusiveMinimum: true` / `false` (OAS 3.0 boolean form alongside a
 *     numeric `minimum`) → drops the boolean (we don't want to misvalidate
 *     defaults; the boolean form is a known OAS-3.0 quirk).
 *   - drops `discriminator`, `xml`, `externalDocs` since they're metadata
 *     that AJV-strict-2020 doesn't know.
 *
 * The job here is to give the AJV instance a schema it can compile so we can
 * get downstream signal (default + example validity) — it is NOT to enforce
 * the OAS metaschema. Detection-1 (compile-fail) emits findings only when
 * AJV throws AFTER this normalisation, i.e. on genuine authoring bugs.
 */
function normaliseOasSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema)) {
    // Drop OAS-only metadata keywords AJV doesn't understand.
    if (
      k === 'discriminator' ||
      k === 'xml' ||
      k === 'externalDocs' ||
      k === 'example' ||
      k === 'examples' ||
      k === 'deprecated' ||
      k === 'readOnly' ||
      k === 'writeOnly'
    ) {
      continue;
    }
    out[k] = v;
  }
  // Translate `nullable: true` → type-tuple form.
  if (out['nullable'] === true) {
    const t = out['type'];
    if (typeof t === 'string') {
      out['type'] = [t, 'null'];
    } else if (Array.isArray(t)) {
      if (!t.includes('null')) out['type'] = [...t, 'null'];
    }
    // If no type was declared, drop nullable — it's nonsensical without type.
    delete out['nullable'];
  } else if ('nullable' in out) {
    delete out['nullable'];
  }
  // Coerce boolean exclusiveMinimum/Maximum (OAS 3.0) → drop. Modern
  // 2020-12 wants numeric form; boolean was a draft-04 holdover that OAS
  // 3.0 inherited. We can't faithfully translate without semantic loss, but
  // dropping yields a permissive validator that still flags real type/enum
  // mismatches.
  if (typeof out['exclusiveMinimum'] === 'boolean') delete out['exclusiveMinimum'];
  if (typeof out['exclusiveMaximum'] === 'boolean') delete out['exclusiveMaximum'];
  return out;
}

function inlineLocalRefs(
  node: unknown,
  components: Record<string, unknown> | undefined,
  depth = 0,
  /** Set of $ref strings encountered along the *current* descent path. Used
   *  to detect cycles WITHOUT punishing legitimate sibling re-references to
   *  the same component. (A component schema may legitimately appear in
   *  many places in the dereffed tree; we only short-circuit when the chain
   *  loops back to a ref we're currently expanding.) */
  refStack: Set<string> = new Set()
): unknown {
  // Generous depth budget. Real specs (Stripe, GitHub, dnd5eapi) easily go
  // 10-15 levels deep when nested objects compose with allOf + $ref chains.
  // The refStack catches genuine cycles, so depth is just a safety net.
  if (depth > 32) return {};
  if (!node || typeof node !== 'object') return node;

  if (Array.isArray(node)) {
    return node.map((v) => inlineLocalRefs(v, components, depth + 1, refStack));
  }

  const obj = node as Record<string, unknown>;
  const ref = obj['$ref'];
  if (typeof ref === 'string') {
    if (ref === '#cyclic') return {};
    if (refStack.has(ref)) return {}; // chain-cycle
    if (ref.startsWith('#/components/schemas/') && components) {
      const name = ref.slice('#/components/schemas/'.length);
      const target = components[name];
      if (target && typeof target === 'object') {
        const nextStack = new Set(refStack);
        nextStack.add(ref);
        return inlineLocalRefs(target, components, depth + 1, nextStack);
      }
    }
    return {};
  }

  // Normalise OAS-only keywords on this node, then recurse into children.
  const normalised = normaliseOasSchema(obj);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(normalised)) {
    out[k] = inlineLocalRefs(v, components, depth + 1, refStack);
  }
  return out;
}

// =============================================================================
// Detection 1: Schema-compilation failures.
//
// For every component schema we attempt AJV.compile. AJV throws on:
//   - malformed regex in `pattern`
//   - invalid types (e.g. `type: "strnig"`)
//   - exclusiveMinimum boolean in 3.1-style mixed spec
//   - structural corruption AJV can detect even with strict mode off
//
// Findings emitted under `correctness` category, severity `high`.
// =============================================================================

interface CompilationFailure {
  pointer: string;
  schemaName: string | null;
  errorMessage: string;
}

/**
 * Compile a sub-schema using the shared envelope as the resolution base.
 * AJV's `getSchema(uri)` resolves a JSON-Pointer fragment against an
 * already-registered schema id, so we can compile any sub-tree by referencing
 * it through the envelope. For inline (non-component) sub-schemas, we wrap
 * them in a thin envelope that imports from the spec base.
 */
function compileAgainstEnvelope(
  prepared: PreparedSpec,
  schema: Record<string, unknown>,
  refUri: string | null
): ReturnType<Ajv['compile']> | null {
  // Component-schema fast path: getSchema by id (AJV caches compiled validators).
  if (refUri) {
    const existing = prepared.ajv.getSchema(`${SPEC_BASE_ID}${refUri}`);
    if (existing) return existing;
  }
  // Inline path: wrap with a synthetic id that lives under the envelope so
  // any embedded `#/components/schemas/X` $ref resolves via the envelope.
  // AJV de-duplicates registrations by id; using a counter-suffixed id
  // avoids collision when the same compile site is hit twice.
  const wrappedId = `${SPEC_BASE_ID}#inline-${++inlineCounter}`;
  // Drop any pre-existing $id on the inline schema to prevent it from
  // overriding our envelope-rooted one.
  const cleanSchema = { ...schema };
  delete cleanSchema['$id'];
  try {
    return prepared.ajv.compile({ $id: wrappedId, ...cleanSchema } as AnySchema);
  } catch {
    return null;
  }
}

let inlineCounter = 0;

function detectCompilationFailures(prepared: PreparedSpec): CompilationFailure[] {
  const failures: CompilationFailure[] = [];

  // Compile each component schema by asking AJV to resolve it via the shared
  // envelope. Cross-component $refs (including non-standard nested refs like
  // `#/components/schemas/Tag/allOf/0`) resolve natively.
  for (const name of Object.keys(prepared.normalisedComponents)) {
    const refUri = `#/components/schemas/${name}`;
    try {
      const validator = prepared.ajv.getSchema(`${SPEC_BASE_ID}${refUri}`);
      if (!validator) {
        // Compilation didn't succeed during envelope registration — try a
        // direct compile to force AJV to surface the error.
        prepared.ajv.compile(prepared.normalisedComponents[name] as AnySchema);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failures.push({
        pointer: `/components/schemas/${escapeJsonPointer(name)}`,
        schemaName: name,
        errorMessage: msg,
      });
    }
  }
  return failures;
}

// =============================================================================
// Detection 2: Example-validation failures.
//
// Walk the spec tree, find every node that has BOTH a `schema` (or is itself
// schema-shaped) AND an `example` / `examples` map. Validate the example(s)
// against the schema.
//
// Locations to check:
//   - mediaType objects: `paths.../requestBody.content.<mt>.{schema,example,examples}`
//   - mediaType objects: `paths.../responses/<code>.content.<mt>.{schema,example,examples}`
//   - parameters: `paths.../parameters/<i>.{schema,example,examples}`
//   - parameter content: `parameters/<i>.content.<mt>.{schema,example,examples}`
//   - components.parameters / examples / requestBodies / responses: same shape
//   - schemas with inline `example` keyword
// =============================================================================

interface ExampleFailure {
  pointer: string;
  errorMessage: string;
  /** name of the example (key in `examples` map) or null for `example` */
  exampleName: string | null;
}

interface ExampleHostNode {
  pointer: string;
  schema: Record<string, unknown>;
  /** Top-level `example` value, if present */
  example?: unknown;
  hasExample: boolean;
  /** examples map (object keyed by example-name) */
  examples?: Record<string, unknown>;
}

/**
 * Find every (schema, example) pairing in the spec. Returns a list of host
 * nodes — each one defines a schema + at least one example to validate.
 */
function* findExampleHosts(node: unknown, pointer: string, seen: WeakSet<object>): Generator<ExampleHostNode> {
  if (!node || typeof node !== 'object') return;
  if (seen.has(node as object)) return;
  seen.add(node as object);

  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      yield* findExampleHosts(node[i], joinPointer(pointer, i), seen);
    }
    return;
  }

  const obj = node as Record<string, unknown>;

  // Case (a): host with `schema` sibling + `example` / `examples`.
  // Common in mediaType objects, parameters, headers, examples in components.
  const schemaSibling = obj['schema'];
  if (schemaSibling && typeof schemaSibling === 'object' && !Array.isArray(schemaSibling)) {
    const hasExample = 'example' in obj;
    const examples = obj['examples'];
    const examplesIsObj = examples && typeof examples === 'object' && !Array.isArray(examples);
    if (hasExample || examplesIsObj) {
      yield {
        pointer,
        schema: schemaSibling as Record<string, unknown>,
        example: obj['example'],
        hasExample,
        examples: examplesIsObj ? (examples as Record<string, unknown>) : undefined,
      };
    }
  }

  // Case (b): a schema itself with inline `example` keyword.
  if (isSchemaShaped(obj) && 'example' in obj) {
    yield {
      pointer,
      schema: obj,
      example: obj['example'],
      hasExample: true,
    };
  }

  // Recurse into all children
  for (const [k, v] of Object.entries(obj)) {
    yield* findExampleHosts(v, joinPointer(pointer, k), seen);
  }
}

function detectExampleFailures(prepared: PreparedSpec): ExampleFailure[] {
  const failures: ExampleFailure[] = [];

  for (const host of findExampleHosts(prepared.spec, '', new WeakSet())) {
    // Normalise the host schema (drops OAS-only keywords, translates
    // nullable). Then compile via envelope so cross-spec $refs resolve.
    const normalised = deepNormalise(host.schema) as Record<string, unknown>;
    const validate = compileAgainstEnvelope(prepared, normalised, null);
    if (!validate) continue; // Schema doesn't compile (Detection 1 reports it).

    // Validate `example` (singular) if present.
    if (host.hasExample) {
      try {
        const ok = validate(host.example);
        if (!ok) {
          failures.push({
            pointer: joinPointer(host.pointer, 'example'),
            errorMessage: formatAjvErrors(validate.errors),
            exampleName: null,
          });
        }
      } catch (err) {
        failures.push({
          pointer: joinPointer(host.pointer, 'example'),
          errorMessage: err instanceof Error ? err.message : String(err),
          exampleName: null,
        });
      }
    }

    // Validate each entry in `examples` map.
    if (host.examples) {
      for (const [exName, exObj] of Object.entries(host.examples)) {
        if (!exObj || typeof exObj !== 'object') continue;
        // Each examples-map entry is `{ value | externalValue, summary?, description? }`.
        // We only validate if `value` is present (externalValue we can't fetch).
        const exContainer = exObj as Record<string, unknown>;
        if (!('value' in exContainer)) continue;
        try {
          const ok = validate(exContainer['value']);
          if (!ok) {
            failures.push({
              pointer: joinPointer(host.pointer, 'examples', exName, 'value'),
              errorMessage: formatAjvErrors(validate.errors),
              exampleName: exName,
            });
          }
        } catch (err) {
          failures.push({
            pointer: joinPointer(host.pointer, 'examples', exName, 'value'),
            errorMessage: err instanceof Error ? err.message : String(err),
            exampleName: exName,
          });
        }
      }
    }
  }
  return failures;
}

// =============================================================================
// Detection 3: Default-validation failures.
//
// Walk every schema-shaped node. If it has a `default`, validate the default
// against the schema (with $refs inlined). This catches:
//   - Defaults of wrong type (apiq has 4 primitive rules; we cover all types)
//   - Defaults of nested objects whose properties violate child constraints
//   - Defaults that violate enum / pattern / format / minimum / maximum
//   - Defaults at deep paths (apiq-ruleset only checks top-level scalars)
// =============================================================================

interface DefaultFailure {
  pointer: string;
  errorMessage: string;
}

function detectDefaultFailures(prepared: PreparedSpec): DefaultFailure[] {
  const failures: DefaultFailure[] = [];

  for (const { schema, pointer } of walkSchemas(prepared.spec, '', new WeakSet())) {
    if (!('default' in schema)) continue;

    // Skip parameter / property-of-parameter-object hosts that aren't proper
    // schemas. We only validate when the node has a recognisable JSON-Schema
    // type-defining keyword.
    let hasTypeAnchor = false;
    for (const k of Object.keys(schema)) {
      if (
        k === 'type' ||
        k === 'enum' ||
        k === 'const' ||
        k === 'pattern' ||
        k === 'oneOf' ||
        k === 'anyOf' ||
        k === 'allOf' ||
        k === '$ref'
      ) {
        hasTypeAnchor = true;
        break;
      }
    }
    if (!hasTypeAnchor) continue;

    const normalised = deepNormalise(schema) as Record<string, unknown>;
    const validate = compileAgainstEnvelope(prepared, normalised, null);
    if (!validate) {
      // Compilation issue — skip; reported by Detection 1 (if it's a top-
      // level component schema) or silently dropped (if inline).
      continue;
    }

    try {
      const ok = validate(schema['default']);
      if (!ok) {
        failures.push({
          pointer: joinPointer(pointer, 'default'),
          errorMessage: formatAjvErrors(validate.errors),
        });
      }
    } catch (err) {
      failures.push({
        pointer: joinPointer(pointer, 'default'),
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return failures;
}

// =============================================================================
// Detection 4: Required-properties combinatorial conflict (brainstorm A11).
//
// For every object-typed schema with a `required` array, every entry in
// `required` must appear in `properties` (or be reachable via allOf
// composition). Otherwise the schema is unsatisfiable when
// `additionalProperties: false`, and confusing-but-dead even when
// `additionalProperties: true`.
//
// We build the effective property set by walking allOf members. oneOf/anyOf
// are NOT merged (their members are alternatives, not contributions).
// =============================================================================

interface RequiredConflict {
  pointer: string;
  missingFields: string[];
  additionalPropsFalse: boolean;
}

function collectAllOfProperties(
  schema: Record<string, unknown>,
  components: Record<string, unknown> | undefined,
  depth = 0,
  seen: Set<string> = new Set()
): Set<string> {
  const props = new Set<string>();
  if (depth > 16) return props;

  // $ref: dereference
  const ref = schema['$ref'];
  if (typeof ref === 'string') {
    if (ref === '#cyclic') return props;
    if (seen.has(ref)) return props;
    seen.add(ref);
    if (ref.startsWith('#/components/schemas/') && components) {
      const name = ref.slice('#/components/schemas/'.length);
      const target = components[name];
      if (target && typeof target === 'object') {
        for (const p of collectAllOfProperties(
          target as Record<string, unknown>,
          components,
          depth + 1,
          seen
        )) {
          props.add(p);
        }
      }
    }
    return props;
  }

  // own properties
  const ownProps = schema['properties'];
  if (ownProps && typeof ownProps === 'object' && !Array.isArray(ownProps)) {
    for (const k of Object.keys(ownProps)) {
      props.add(k);
    }
  }

  // allOf members contribute too
  const allOf = schema['allOf'];
  if (Array.isArray(allOf)) {
    for (const member of allOf) {
      if (!member || typeof member !== 'object') continue;
      for (const p of collectAllOfProperties(
        member as Record<string, unknown>,
        components,
        depth + 1,
        seen
      )) {
        props.add(p);
      }
    }
  }

  return props;
}

function detectRequiredConflicts(prepared: PreparedSpec): RequiredConflict[] {
  const conflicts: RequiredConflict[] = [];
  const components = prepared.spec.components as Record<string, unknown> | undefined;
  const componentSchemas = components?.schemas as Record<string, unknown> | undefined;

  for (const { schema, pointer } of walkSchemas(prepared.spec, '', new WeakSet())) {
    const required = schema['required'];
    if (!Array.isArray(required) || required.length === 0) continue;

    // Only object-typed schemas — required on non-objects is a no-op.
    const type = schema['type'];
    if (type !== undefined && type !== 'object' && !Array.isArray(type)) continue;
    if (Array.isArray(type) && !type.includes('object')) continue;

    const effectiveProps = collectAllOfProperties(schema, componentSchemas);

    const missing: string[] = [];
    for (const req of required) {
      if (typeof req !== 'string') continue;
      if (!effectiveProps.has(req)) {
        missing.push(req);
      }
    }
    if (missing.length === 0) continue;

    const addProps = schema['additionalProperties'];
    const additionalPropsFalse = addProps === false;

    conflicts.push({ pointer, missingFields: missing, additionalPropsFalse });
  }
  return conflicts;
}

// =============================================================================
// Finding-construction helpers.
// =============================================================================

function pad(s: string, min: number): string {
  if (s.length >= min) return s;
  return s + ' '.repeat(min - s.length);
}

function compilationFailureToFinding(f: CompilationFailure): DetectorFinding {
  const title = `Schema "${f.schemaName ?? '(inline)'}" fails AJV compilation`;
  return {
    detectorId: 'ajv:schema-compilation-fail',
    layer: 'walker-statistical',
    title: title.slice(0, 200),
    narration:
      `AJV (the canonical JSON-Schema validator) refused to compile the schema at ` +
      `\`${f.pointer}\`. AJV reported: \`${f.errorMessage}\`. ` +
      `A schema that AJV cannot compile cannot be used by the validator family that JSON-Schema ` +
      `tooling, codegen pipelines, contract-test runners, and AI agents downstream rely on. ` +
      `This is a structural authoring defect — most likely a malformed regex in \`pattern\`, an ` +
      `invalid \`type\` value, an \`exclusiveMinimum\`/\`exclusiveMaximum\` shape mismatch between ` +
      `OAS 3.0 (boolean) and 3.1 (number), or a malformed discriminator/oneOf composition.`,
    rationale:
      'OpenAPI 3.0 §4.7.21 ("Schema Object") inherits JSON Schema (draft-04 + OAS3 extensions). ' +
      'Schemas that fail to compile under a strict-by-default validator like AJV are unusable for ' +
      'request/response validation, codegen, and AI-driven analysis — every consuming pipeline must ' +
      'either skip them or fail loudly.',
    category: 'correctness',
    severity: 'high',
    scope: 'spec',
    affectedEndpoints: [],
    patchOps: [],
    patchSummary: pad(`Fix the AJV-rejected schema at ${f.pointer}: ${f.errorMessage.slice(0, 100)}`, 1).slice(0, 200),
    sourcePath: f.pointer,
    meta: { schemaName: f.schemaName, errorMessage: f.errorMessage },
  };
}

function exampleFailureToFinding(f: ExampleFailure): DetectorFinding {
  const namePart = f.exampleName ? ` (named example \`${f.exampleName}\`)` : '';
  return {
    detectorId: 'ajv:example-validation-fail',
    layer: 'walker-statistical',
    title: `Example does not validate against its schema${namePart}`.slice(0, 200),
    narration:
      `The example value at \`${f.pointer}\`${namePart} fails AJV validation against its declared ` +
      `schema. AJV reported: \`${f.errorMessage}\`. ` +
      `Spectral's \`oas3-valid-media-example\` rule covers media-type-level examples but skips ` +
      `parameter-level examples, header-level examples, and named entries in \`examples\` maps; ` +
      `this finding closes those gaps. An example that doesn't satisfy its schema misleads SDK users, ` +
      `breaks codegen test fixtures, and confuses AI agents that ingest the spec for documentation.`,
    rationale:
      'OpenAPI 3.0 §4.7 mandates examples illustrate valid instances of the surrounding schema. ' +
      'A failing example signals one of two real bugs: the example was authored against a stale ' +
      'schema version, or the schema constraint is wrong. Either way, downstream tooling acts on ' +
      'the example as ground-truth, so the inconsistency propagates.',
    category: 'correctness',
    severity: 'medium',
    scope: 'spec',
    affectedEndpoints: [],
    patchOps: [],
    patchSummary: pad(
      `Update the example at ${f.pointer} to match its schema (${f.errorMessage.slice(0, 80)})`,
      1
    ).slice(0, 200),
    sourcePath: f.pointer,
    meta: { exampleName: f.exampleName, errorMessage: f.errorMessage },
  };
}

function defaultFailureToFinding(f: DefaultFailure): DetectorFinding {
  return {
    detectorId: 'ajv:default-validation-fail',
    layer: 'walker-statistical',
    title: 'Default value does not validate against its schema'.slice(0, 200),
    narration:
      `The \`default\` at \`${f.pointer}\` fails AJV validation against the surrounding schema. ` +
      `AJV reported: \`${f.errorMessage}\`. ` +
      `apiq's existing custom Spectral ruleset (\`apiq-default-type-matches-{integer,number,boolean,string}\`) ` +
      `covers the four primitive scalar cases at the top level only; this AJV pass goes deeper, ` +
      `validating defaults nested inside object properties, array items, and \`allOf\`/\`oneOf\`/\`anyOf\` ` +
      `branches against the full constraint set (enum, pattern, format, minimum/maximum, etc.). ` +
      `A default that violates the schema is silently filled in by request-validation libraries, ` +
      `producing values the server then rejects.`,
    rationale:
      'JSON Schema §10.4 ("default") specifies the default value should validate against the ' +
      'schema; OAS 3.0 inherits this. Tools like Spring REST Docs, OpenAPI Generator, and FastAPI ' +
      'use defaults to fill in absent request fields — a default that doesn\'t satisfy the constraint ' +
      'creates an invalid request the moment the user omits the field.',
    category: 'correctness',
    severity: 'medium',
    scope: 'spec',
    affectedEndpoints: [],
    patchOps: [],
    patchSummary: pad(
      `Fix the default at ${f.pointer} so it satisfies the schema constraint (${f.errorMessage.slice(0, 80)})`,
      1
    ).slice(0, 200),
    sourcePath: f.pointer,
    meta: { errorMessage: f.errorMessage },
  };
}

function requiredConflictToFinding(c: RequiredConflict): DetectorFinding {
  const sev: 'high' | 'medium' = c.additionalPropsFalse ? 'high' : 'medium';
  const apFalseClause = c.additionalPropsFalse
    ? ' Combined with `additionalProperties: false`, the schema is unsatisfiable: every instance is rejected because the required field cannot legally appear.'
    : ' Even with `additionalProperties: true` the constraint is dead — the field cannot be checked at all and all consumers ignore it.';
  return {
    detectorId: 'ajv:required-properties-conflict',
    layer: 'walker-statistical',
    title: `\`required\` lists ${c.missingFields.length} field(s) not declared in \`properties\``.slice(0, 200),
    narration:
      `The schema at \`${c.pointer}\` declares required field(s) that have no matching entry in ` +
      `\`properties\` (or in any reachable \`allOf\` member): ${c.missingFields
        .map((f) => `\`${f}\``)
        .join(', ')}.` +
      apFalseClause +
      ` This is a combinatorial-validation defect — the JSON-Schema mechanic requires the named ` +
      `fields to be present, but the property table forbids defining them. Most validators silently ` +
      `pass instances that omit the field, codegen tools emit broken types, and AI agents reading the ` +
      `spec produce contradictory documentation.`,
    rationale:
      'JSON Schema §6.5.3 ("required") names properties that MUST be present in instances; OAS 3.0 ' +
      '§4.7.21 inherits the keyword. Listing a field as required without declaring it in `properties` ' +
      'is a structural authoring error — the schema reader cannot answer "is this instance valid?" ' +
      'because the constraint is undecidable in isolation.',
    category: 'correctness',
    severity: sev,
    scope: 'spec',
    affectedEndpoints: [],
    patchOps: [],
    patchSummary: pad(
      `Add ${c.missingFields.join(', ')} to \`properties\` or remove from \`required\` at ${c.pointer}`,
      1
    ).slice(0, 200),
    sourcePath: c.pointer,
    meta: {
      missingFields: c.missingFields,
      additionalPropertiesFalse: c.additionalPropsFalse,
    },
  };
}

// =============================================================================
// Public API
// =============================================================================

export async function runAjvValidator(
  spec: object,
  _opts?: DetectorOptions
): Promise<DetectorFinding[]> {
  const prepared = prepareSpec(spec);
  const findings: DetectorFinding[] = [];

  // Detection 1: schema compilation
  for (const f of detectCompilationFailures(prepared)) {
    findings.push(compilationFailureToFinding(f));
  }

  // Detection 2: example validation
  for (const f of detectExampleFailures(prepared)) {
    findings.push(exampleFailureToFinding(f));
  }

  // Detection 3: default validation
  for (const f of detectDefaultFailures(prepared)) {
    findings.push(defaultFailureToFinding(f));
  }

  // Detection 4: required-properties conflicts
  for (const c of detectRequiredConflicts(prepared)) {
    findings.push(requiredConflictToFinding(c));
  }

  return findings;
}

// =============================================================================
// Internal helpers — exported for tests only
// =============================================================================

export const __test = {
  detectCompilationFailures,
  detectExampleFailures,
  detectDefaultFailures,
  detectRequiredConflicts,
  prepareSpec,
  collectAllOfProperties,
  inlineLocalRefs,
  walkSchemas,
  isSchemaShaped,
  buildAjv,
};

// =============================================================================
// CLI
// =============================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const EXAMPLES_DIR = path.join(REPO_ROOT, 'openapi-examples');

async function loadSpec(specName: string): Promise<object> {
  const baseDir = path.join(EXAMPLES_DIR, specName);
  const candidates = ['spec.json', 'spec.yaml', 'spec.yml'];
  for (const c of candidates) {
    const p = path.join(baseDir, c);
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, 'utf8');
      const ext = path.extname(p).toLowerCase();
      return ext === '.json' ? JSON.parse(raw) : (YAML.parse(raw) as object);
    }
  }
  throw new Error(`No spec.{json,yaml,yml} found in ${baseDir}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    // eslint-disable-next-line no-console
    console.log('Usage: npx tsx deterministic/ajv-validator.ts <spec-name>');
    process.exit(0);
  }
  const specName = args[0];
  // eslint-disable-next-line no-console
  console.log(`[ajv-validator] loading ${specName} ...`);
  const spec = await loadSpec(specName);
  // eslint-disable-next-line no-console
  console.log(`[ajv-validator] running on ${specName} ...`);
  const startedAt = Date.now();
  const findings = await runAjvValidator(spec, { specName });
  const durationMs = Date.now() - startedAt;

  const byDetector = new Map<string, number>();
  for (const f of findings) {
    byDetector.set(f.detectorId, (byDetector.get(f.detectorId) ?? 0) + 1);
  }

  // eslint-disable-next-line no-console
  console.log('');
  // eslint-disable-next-line no-console
  console.log(`Spec:                 ${specName}`);
  // eslint-disable-next-line no-console
  console.log(`Total findings:       ${findings.length} (${durationMs}ms)`);
  for (const [id, count] of byDetector.entries()) {
    // eslint-disable-next-line no-console
    console.log(`  ${count.toString().padStart(5)}  ${id}`);
  }
  // eslint-disable-next-line no-console
  console.log('');
  // eslint-disable-next-line no-console
  console.log('First 5 findings:');
  for (const f of findings.slice(0, 5)) {
    // eslint-disable-next-line no-console
    console.log(`  [${f.detectorId}] ${f.title}`);
    // eslint-disable-next-line no-console
    console.log(`    at: ${f.sourcePath ?? '(none)'}`);
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
