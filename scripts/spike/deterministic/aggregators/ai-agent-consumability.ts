/**
 * Walker(s): AI-Agent-Consumability — Lens 9 (Wave 2 Task T19 / #48).
 *
 * Strategic-fit lens. Per Postman 2025: 89% of devs use AI tools, only 24% design
 * APIs for agents. This walker module measures spec-quality issues that hurt
 * consumption by agentic LLMs / MCP-tool-callers / CLI-codegen-pipelines.
 *
 * Eight L9-* patterns are detected here. They are statistical aggregators
 * (single finding per pattern with count + percentage) — the 8-class taxonomy
 * matches "Architectural Element B" (Statistical Aggregators) of the
 * Round-2 Phase F decomposition.
 *
 *   L9-1 examples-coverage on operations           — strengthens W4 (request-body-no-examples)
 *                                                    by also measuring response examples
 *                                                    and parameter examples.
 *   L9-2 operationId-as-tool-name                  — too long/cryptic for OpenAI
 *                                                    function-calling tool-name limits
 *                                                    (length ≤ 64, regex ^[A-Za-z0-9_-]+$).
 *   L9-3 description-completeness                  — operations missing summary AND
 *                                                    description (or stub-text). Agents
 *                                                    rely on these for tool-selection.
 *   L9-4 parameter-description quality             — % of parameters with empty/missing/
 *                                                    stub descriptions.
 *   L9-5 response-shape predictability             — operations whose 2xx responses are
 *                                                    polymorphic-undifferentiated
 *                                                    (oneOf/anyOf without discriminator,
 *                                                    or empty schema/no schema).
 *   L9-6 LLM-friendly-API patterns                 — verbose-action-naming + semantic-
 *                                                    grouping (tags-coverage as proxy).
 *                                                    Operations missing tags AND with
 *                                                    cryptic operationIds = unfindable
 *                                                    by an agent.
 *   L9-7 capability-discovery endpoint present     — POSITIVE info-tier marker.
 *                                                    OpenAPI/MCP-style discovery
 *                                                    (/.well-known/openapi, /.well-known/
 *                                                    api-catalog, /capabilities, /v1).
 *   L9-8 OpenAI function-calling MCP compat        — schema combinations that break
 *                                                    function-calling: anyOf/oneOf at
 *                                                    parameter top-level, $ref siblings,
 *                                                    schemas with no `type`/`$ref`,
 *                                                    additionalProperties on object
 *                                                    schemas of parameters (ChatGPT/MCP
 *                                                    converters drop them).
 *
 * Severity rationale
 *   - L9-1, L9-3, L9-4, L9-6      : warn (cross-source consensus + agent-blocker)
 *   - L9-2, L9-5, L9-8            : warn (mechanical breakage at function-call boundary)
 *   - L9-7                         : info (positive marker — observation, not violation)
 *
 * All 8 detectors carry Lens [9, 4] (AI-Agent-Consumability primary +
 * Client-Friction secondary; cf. priority-stack which lists each as 9, 4).
 *
 * Public API:
 *   - walkAiAgentConsumability(spec, opts) — registered in aggregators/index.ts.
 *   - AI_AGENT_CONSUMABILITY_RULES — RuleMetadata per detector-id, validated
 *                                     against the Severity-Schema-Final.
 */

import type { DetectorFinding, DetectorOptions } from '../infra/types.js';
import type { RuleMetadata } from '../infra/severity-schema.js';
import { validateMetadata } from '../infra/severity-schema.js';
import { walkOperations, isRequestBodyMethod, pct, formatExamples } from './_shared.js';

// =============================================================================
// Constants — thresholds + heuristics.
// =============================================================================

/** OpenAI function-calling tool-name limit (per current OpenAI tool-call docs). */
const OPERATIONID_TOOL_NAME_MAX = 64;

/** Regex for valid OpenAI/MCP tool-call function-name. */
const TOOL_NAME_RE = /^[A-Za-z0-9_-]+$/;

/** Threshold (0..1) above which a statistical pattern fires. */
const FRACTION_THRESHOLD = 0.5;

/** operationId is "cryptic" if shorter than this (no semantic content for agent). */
const OPERATIONID_CRYPTIC_MIN_LEN = 4;

/**
 * Common capability-discovery / introspection endpoint patterns. Detected as
 * positive info-tier markers. Path-prefix match against the operation path,
 * version-prefix-stripped.
 */
const CAPABILITY_DISCOVERY_PATTERNS: ReadonlyArray<RegExp> = [
  /^\/?\.well-known\/openapi/i,
  /^\/?\.well-known\/api-catalog/i,
  /^\/?\.well-known\/oauth-authorization-server/i,
  /^\/?\.well-known\/openid-configuration/i,
  /^\/?(v\d+\/)?openapi(\.json|\.yaml|\.yml)?$/i,
  /^\/?(v\d+\/)?capabilities\b/i,
  /^\/?(v\d+\/)?schema\b/i,
  /^\/?(v\d+\/)?metadata\b/i,
  /^\/?(v\d+\/)?\$metadata$/i, // OData metadata-document
  /^\/?(v\d+\/)?api-docs\b/i,
  /^\/?(v\d+\/)?docs\b/i,
];

function isCapabilityDiscoveryPath(p: string): boolean {
  return CAPABILITY_DISCOVERY_PATTERNS.some((re) => re.test(p));
}

/** Stub-text heuristic for descriptions: short or echoes a key. */
function isStubOrMissingDescription(value: unknown, alsoCompareTo?: string): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value !== 'string') return true;
  const trimmed = value.trim();
  if (trimmed.length === 0) return true;
  if (trimmed.length < 4) return true;
  if (alsoCompareTo) {
    const stripped = trimmed.replace(/[`\s]/g, '').toLowerCase();
    if (stripped === alsoCompareTo.toLowerCase()) return true;
  }
  return false;
}

// =============================================================================
// L9-1 examples-coverage on operations
// =============================================================================

interface ExamplesCoverageStats {
  total: number;
  withRequestExample: number;
  withResponseExample: number;
  withAnyExample: number;
}

function hasMediaTypeExample(content: unknown): boolean {
  if (!content || typeof content !== 'object') return false;
  for (const v of Object.values(content as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue;
    const mt = v as Record<string, unknown>;
    if (mt.example !== undefined) return true;
    const examples = mt.examples;
    if (examples && typeof examples === 'object' && Object.keys(examples).length > 0) {
      return true;
    }
    // Schema-level example
    const schema = mt.schema;
    if (schema && typeof schema === 'object') {
      const s = schema as Record<string, unknown>;
      if (s.example !== undefined) return true;
      if (s.examples && typeof s.examples === 'object' &&
          Object.keys(s.examples).length > 0) return true;
    }
  }
  return false;
}

function operationHasResponseExample(operation: Record<string, unknown>): boolean {
  const responses = operation.responses;
  if (!responses || typeof responses !== 'object') return false;
  for (const [code, respRaw] of Object.entries(responses as Record<string, unknown>)) {
    if (!respRaw || typeof respRaw !== 'object') continue;
    if (!/^[12]/.test(code) && code !== 'default') continue;
    const resp = respRaw as Record<string, unknown>;
    if (hasMediaTypeExample(resp.content)) return true;
  }
  return false;
}

function operationHasRequestExample(operation: Record<string, unknown>): boolean {
  const rb = operation.requestBody;
  if (!rb || typeof rb !== 'object') return false;
  return hasMediaTypeExample((rb as Record<string, unknown>).content);
}

function detectL9_1(spec: object): {
  finding: DetectorFinding | null;
  stats: ExamplesCoverageStats;
} {
  const stats: ExamplesCoverageStats = {
    total: 0,
    withRequestExample: 0,
    withResponseExample: 0,
    withAnyExample: 0,
  };

  for (const { method, operation } of walkOperations(spec)) {
    stats.total++;
    let any = false;
    if (isRequestBodyMethod(method) && operation.requestBody !== undefined) {
      if (operationHasRequestExample(operation)) {
        stats.withRequestExample++;
        any = true;
      }
    }
    if (operationHasResponseExample(operation)) {
      stats.withResponseExample++;
      any = true;
    }
    if (any) stats.withAnyExample++;
  }

  if (stats.total === 0) return { finding: null, stats };
  const without = stats.total - stats.withAnyExample;
  if (without / stats.total <= FRACTION_THRESHOLD) {
    return { finding: null, stats };
  }
  const percentage = pct(without, stats.total);
  return {
    stats,
    finding: {
      detectorId: 'walker:ai-agent-consumability:l9-1-examples-coverage',
      layer: 'walker-statistical',
      title: 'Operations lack request- or response-examples for AI-agent consumption',
      narration:
        `${without}/${stats.total} operations (${percentage}%) carry NO example payload — ` +
        `not on request body, not on any 2xx/default response. ` +
        `Agentic LLMs (OpenAI function-calling, Anthropic tool-use, MCP servers) ` +
        `rely on examples to ground tool-call argument generation; without them, ` +
        `the model must invent shapes from schemas alone, and hallucination-rates rise. ` +
        `Postman 2025 State-of-the-API: 89% of devs use AI tools but only 24% design APIs ` +
        `for agents — examples-coverage is the single largest closeable gap.`,
      rationale:
        'OpenAPI 3.0 §4.7.13/§4.7.14 (Request Body / Response) name `example` and `examples` ' +
        'as the documentation surface for sample payloads. Speakeasy SDK best-practices, ' +
        'Fern API guides, and OpenAI function-calling docs all converge: examples on both ' +
        'request and response sides are required for consumable specs in 2026.',
      category: 'clarity',
      severity: 'medium',
      scope: 'spec',
      affectedEndpoints: [],
      patchOps: [],
      patchSummary:
        'Add representative `example` (or `examples`) blocks to each operation\'s requestBody.content and 2xx responses.content.',
      meta: {
        total: stats.total,
        withAnyExample: stats.withAnyExample,
        without,
        percentage,
        withRequestExample: stats.withRequestExample,
        withResponseExample: stats.withResponseExample,
        patternId: 'L9-1',
      },
    },
  };
}

// =============================================================================
// L9-2 operationId-as-tool-name
// =============================================================================

interface ToolNameStats {
  total: number;
  flagged: number;
  tooLong: number;
  invalidChars: number;
  cryptic: number;
  examples: string[];
}

function detectL9_2(spec: object): DetectorFinding | null {
  const stats: ToolNameStats = {
    total: 0,
    flagged: 0,
    tooLong: 0,
    invalidChars: 0,
    cryptic: 0,
    examples: [],
  };
  for (const { operation } of walkOperations(spec)) {
    const opId = operation.operationId;
    if (typeof opId !== 'string' || opId.length === 0) continue;
    stats.total++;
    let bad = false;
    if (opId.length > OPERATIONID_TOOL_NAME_MAX) {
      stats.tooLong++;
      bad = true;
    }
    if (!TOOL_NAME_RE.test(opId)) {
      stats.invalidChars++;
      bad = true;
    }
    if (opId.length < OPERATIONID_CRYPTIC_MIN_LEN) {
      stats.cryptic++;
      bad = true;
    }
    if (bad) {
      stats.flagged++;
      if (stats.examples.length < 5) stats.examples.push(opId);
    }
  }
  if (stats.total === 0 || stats.flagged === 0) return null;
  const percentage = pct(stats.flagged, stats.total);
  return {
    detectorId: 'walker:ai-agent-consumability:l9-2-tool-name-compat',
    layer: 'walker-statistical',
    title: 'operationId values incompatible with OpenAI/MCP function-calling tool-names',
    narration:
      `${stats.flagged}/${stats.total} operationIds (${percentage}%) cannot be used directly as ` +
      `OpenAI/MCP tool-names. Breakdown: ${stats.tooLong} exceed the 64-char tool-name limit; ` +
      `${stats.invalidChars} contain characters outside \`[A-Za-z0-9_-]\`; ` +
      `${stats.cryptic} are cryptic stubs (< ${OPERATIONID_CRYPTIC_MIN_LEN} chars). ` +
      `Examples: ${formatExamples(stats.examples)}. ` +
      `Function-calling converters (OpenAI tools-API, MCP server-builders, LangChain agent-` +
      `bindings) either truncate, drop, or auto-rename these — collisions and missing tools result.`,
    rationale:
      'OpenAI tools-API spec restricts `function.name` to `^[A-Za-z0-9_-]+$` and length ≤ 64. ' +
      'MCP tool-names follow the same constraint. Operations whose `operationId` violates these ' +
      'rules cannot be exposed as agent tools without renaming, breaking referenceability.',
    category: 'clarity',
    severity: 'medium',
    scope: 'spec',
    affectedEndpoints: [],
    patchOps: [],
    patchSummary:
      'Rename operationIds to fit `^[A-Za-z0-9_-]{4,64}$` so they are valid OpenAI/MCP tool-names without conversion.',
    meta: {
      total: stats.total,
      flagged: stats.flagged,
      tooLong: stats.tooLong,
      invalidChars: stats.invalidChars,
      cryptic: stats.cryptic,
      percentage,
      examples: stats.examples,
      patternId: 'L9-2',
    },
  };
}

// =============================================================================
// L9-3 description-completeness on operations
// =============================================================================

interface DescStats {
  total: number;
  noSummaryNoDescription: number;
  stubOnly: number;
  examples: Array<{ path: string; method: string }>;
}

function detectL9_3(spec: object): DetectorFinding | null {
  const stats: DescStats = {
    total: 0,
    noSummaryNoDescription: 0,
    stubOnly: 0,
    examples: [],
  };
  for (const { path, method, operation } of walkOperations(spec)) {
    stats.total++;
    const summary = operation.summary;
    const description = operation.description;
    const opIdStr = typeof operation.operationId === 'string' ? operation.operationId : '';
    const summaryMissing = isStubOrMissingDescription(summary, opIdStr);
    const descriptionMissing = isStubOrMissingDescription(description, opIdStr);
    if (summaryMissing && descriptionMissing) {
      stats.noSummaryNoDescription++;
      if (stats.examples.length < 5) stats.examples.push({ path, method });
    } else if (
      // Has one of the two but it's a stub/short
      (summaryMissing && !descriptionMissing &&
       typeof description === 'string' && description.trim().length < 16) ||
      (!summaryMissing && descriptionMissing &&
       typeof summary === 'string' && summary.trim().length < 16)
    ) {
      stats.stubOnly++;
    }
  }
  if (stats.total === 0) return null;
  const flagged = stats.noSummaryNoDescription + stats.stubOnly;
  if (flagged / stats.total <= FRACTION_THRESHOLD) return null;
  const percentage = pct(flagged, stats.total);
  return {
    detectorId: 'walker:ai-agent-consumability:l9-3-description-completeness',
    layer: 'walker-statistical',
    title: 'Operations lack summary/description text needed for agent tool-selection',
    narration:
      `${flagged}/${stats.total} operations (${percentage}%) have no usable summary or ` +
      `description (or both are stubs). Of these, ${stats.noSummaryNoDescription} have NEITHER ` +
      `summary NOR description and ${stats.stubOnly} have only a short stub. ` +
      `Agentic LLMs select tools by reading these — when they\'re absent, the model has only the ` +
      `path and operationId to disambiguate similar operations, which produces wrong-tool errors.`,
    rationale:
      'OpenAI function-calling and MCP both pass operation `description` and `summary` straight to ' +
      'the model as the tool description. Speakeasy + Postman 2025 surveys cite "missing operation ' +
      'descriptions" as the #1 doc-quality gap reported by SDK consumers. spectral default ' +
      '`operation-description` warns when both are missing; Lens-9 applies this from the ' +
      'agent-consumability angle.',
    category: 'clarity',
    severity: 'medium',
    scope: 'spec',
    affectedEndpoints: stats.examples,
    patchOps: [],
    patchSummary:
      'Add an explanatory `description` (and ideally also `summary`) on every operation — agents read these as their tool-doc.',
    meta: {
      total: stats.total,
      noSummaryNoDescription: stats.noSummaryNoDescription,
      stubOnly: stats.stubOnly,
      flagged,
      percentage,
      patternId: 'L9-3',
    },
  };
}

// =============================================================================
// L9-4 parameter-description quality
// =============================================================================

interface ParamDescStats {
  total: number;
  missing: number;
  stub: number;
  examples: Array<{ name: string; pathOp: string }>;
}

function detectL9_4(spec: object): DetectorFinding | null {
  const stats: ParamDescStats = {
    total: 0,
    missing: 0,
    stub: 0,
    examples: [],
  };
  for (const { path, method, operation, pathItem } of walkOperations(spec)) {
    const params: unknown[] = [];
    if (Array.isArray(operation.parameters)) params.push(...operation.parameters);
    if (Array.isArray(pathItem.parameters)) params.push(...pathItem.parameters);
    for (const p of params) {
      if (!p || typeof p !== 'object') continue;
      const pp = p as Record<string, unknown>;
      // Skip $ref-only params; their description lives on the referenced object.
      if (typeof pp.$ref === 'string') continue;
      stats.total++;
      const name = typeof pp.name === 'string' ? pp.name : '';
      const desc = pp.description;
      if (desc === undefined || desc === null) {
        stats.missing++;
      } else if (typeof desc !== 'string' || desc.trim().length === 0) {
        stats.missing++;
      } else if (isStubOrMissingDescription(desc, name)) {
        stats.stub++;
      } else {
        continue;
      }
      if (stats.examples.length < 5 && name) {
        stats.examples.push({ name, pathOp: `${method.toUpperCase()} ${path}` });
      }
    }
  }
  if (stats.total === 0) return null;
  const flagged = stats.missing + stats.stub;
  if (flagged / stats.total <= FRACTION_THRESHOLD) return null;
  const percentage = pct(flagged, stats.total);
  return {
    detectorId: 'walker:ai-agent-consumability:l9-4-parameter-description-quality',
    layer: 'walker-statistical',
    title: 'Parameters lack descriptions needed as agent parameter-hints',
    narration:
      `${flagged}/${stats.total} parameters (${percentage}%) have no usable description. ` +
      `Breakdown: ${stats.missing} missing entirely, ${stats.stub} stub-only (echo parameter name). ` +
      `Agents read parameter descriptions as parameter-hints when generating tool-call arguments. ` +
      `Without them, the model relies on the parameter name and inferred type — fragile, ` +
      `error-prone, and produces wrong-arg-formatting issues on enum-like or formatted strings.`,
    rationale:
      'OpenAPI 3.0 §4.7.12 ("Parameter Object") names `description` for each parameter. ' +
      'OpenAI function-calling tools-API maps each JSON-schema property\'s `description` ' +
      'directly into the tool-call arg-prompt. Postman 2025: parameter-description ' +
      'is the most-cited gap by AI-agent integrators.',
    category: 'clarity',
    severity: 'medium',
    scope: 'spec',
    affectedEndpoints: [],
    patchOps: [],
    patchSummary:
      'Populate `description` on each parameter — what it is for, units/format, valid range. Agents read these.',
    meta: {
      total: stats.total,
      missing: stats.missing,
      stub: stats.stub,
      flagged,
      percentage,
      examples: stats.examples,
      patternId: 'L9-4',
    },
  };
}

// =============================================================================
// L9-5 response-shape predictability
// =============================================================================

interface RespShapeStats {
  total: number;
  unpredictable: number;
  reasons: { polymorphicNoDiscriminator: number; emptyOrTypeless: number };
  examples: Array<{ path: string; method: string }>;
}

function isResponsePolymorphicNoDiscriminator(schema: Record<string, unknown>): boolean {
  const oneOf = Array.isArray(schema.oneOf) ? schema.oneOf : null;
  const anyOf = Array.isArray(schema.anyOf) ? schema.anyOf : null;
  if (!oneOf && !anyOf) return false;
  const branches = (oneOf ?? anyOf)!;
  if (branches.length < 2) return false;
  const discriminator = schema.discriminator;
  if (
    discriminator &&
    typeof discriminator === 'object' &&
    typeof (discriminator as Record<string, unknown>).propertyName === 'string'
  ) {
    return false;
  }
  return true;
}

function isResponseEmptyOrTypeless(schema: Record<string, unknown>): boolean {
  // No type, no $ref, no oneOf/anyOf/allOf, no properties, no items, no enum
  const hasShape =
    'type' in schema ||
    '$ref' in schema ||
    'oneOf' in schema ||
    'anyOf' in schema ||
    'allOf' in schema ||
    'properties' in schema ||
    'items' in schema ||
    'enum' in schema;
  return !hasShape;
}

function isUnpredictableResponseSchema(
  schema: Record<string, unknown>
): { unpredictable: boolean; reason: 'poly' | 'empty' | null } {
  if (isResponsePolymorphicNoDiscriminator(schema)) {
    return { unpredictable: true, reason: 'poly' };
  }
  if (isResponseEmptyOrTypeless(schema)) {
    return { unpredictable: true, reason: 'empty' };
  }
  return { unpredictable: false, reason: null };
}

function detectL9_5(spec: object): DetectorFinding | null {
  const stats: RespShapeStats = {
    total: 0,
    unpredictable: 0,
    reasons: { polymorphicNoDiscriminator: 0, emptyOrTypeless: 0 },
    examples: [],
  };
  for (const { path, method, operation } of walkOperations(spec)) {
    const responses = operation.responses;
    if (!responses || typeof responses !== 'object') continue;
    let opTotal = 0;
    let opBad: 'poly' | 'empty' | null = null;
    for (const [code, respRaw] of Object.entries(responses as Record<string, unknown>)) {
      if (!respRaw || typeof respRaw !== 'object') continue;
      if (!/^2/.test(code)) continue;
      const resp = respRaw as Record<string, unknown>;
      const content = resp.content;
      if (!content || typeof content !== 'object') {
        // No body -> not "unpredictable", just empty body. Skip.
        continue;
      }
      for (const v of Object.values(content as Record<string, unknown>)) {
        if (!v || typeof v !== 'object') continue;
        const mt = v as Record<string, unknown>;
        const schema = mt.schema;
        if (!schema || typeof schema !== 'object') {
          opTotal++;
          if (!opBad) opBad = 'empty';
          continue;
        }
        opTotal++;
        const r = isUnpredictableResponseSchema(schema as Record<string, unknown>);
        if (r.unpredictable && !opBad) opBad = r.reason;
      }
    }
    if (opTotal === 0) continue;
    stats.total++;
    if (opBad) {
      stats.unpredictable++;
      if (opBad === 'poly') stats.reasons.polymorphicNoDiscriminator++;
      else if (opBad === 'empty') stats.reasons.emptyOrTypeless++;
      if (stats.examples.length < 5) stats.examples.push({ path, method });
    }
  }
  if (stats.total === 0) return null;
  if (stats.unpredictable === 0) return null;
  // L9-5 fires whenever ≥ 1 op is unpredictable (no fraction-threshold)
  // because even a single polymorphic-undiscriminated response trips up agents.
  const percentage = pct(stats.unpredictable, stats.total);
  return {
    detectorId: 'walker:ai-agent-consumability:l9-5-response-shape-predictability',
    layer: 'walker-statistical',
    title: 'Operations have unpredictable / undifferentiated response shapes',
    narration:
      `${stats.unpredictable}/${stats.total} operations (${percentage}%) have a 2xx response ` +
      `that is unpredictable for agents. ` +
      `Breakdown: ${stats.reasons.polymorphicNoDiscriminator} use \`oneOf\`/\`anyOf\` without ` +
      `a \`discriminator\`; ${stats.reasons.emptyOrTypeless} have an empty or type-less schema ` +
      `(no \`type\`, no \`$ref\`, no \`properties\`/\`items\`). ` +
      `Agents struggle to map the response to a typed structure when the runtime shape is not ` +
      `discriminable — multi-step plans break (the agent cannot extract a follow-up call\'s ` +
      `argument from a polymorphic blob).`,
    rationale:
      'OpenAPI 3.0 §4.7.21 + Redocly + Speakeasy guides converge: oneOf/anyOf MUST declare a ' +
      'discriminator for tooling to work; type-less schemas produce `Object` / `any` in every ' +
      'codegen and require the agent to fall back to runtime-reflection.',
    category: 'design',
    severity: 'medium',
    scope: 'endpoint',
    affectedEndpoints: stats.examples,
    patchOps: [],
    patchSummary:
      'Declare a `discriminator` on polymorphic responses, and give every response schema a `type`/`$ref`/`properties`/`items` shape.',
    meta: {
      total: stats.total,
      unpredictable: stats.unpredictable,
      percentage,
      reasons: stats.reasons,
      patternId: 'L9-5',
    },
  };
}

// =============================================================================
// L9-6 LLM-friendly-API patterns (verb-noun + tagged + grouped)
// =============================================================================

interface FriendlyStats {
  total: number;
  taglessOps: number;
  crypticOpId: number;
  flagged: number;
  examples: Array<{ path: string; method: string; opId: string }>;
}

function operationIdLooksCryptic(opId: string): boolean {
  if (opId.length === 0) return true;
  if (opId.length < OPERATIONID_CRYPTIC_MIN_LEN) return true;
  // No vowels at all = likely abbreviated / cryptic
  if (!/[AEIOUaeiou]/.test(opId)) return true;
  return false;
}

function detectL9_6(spec: object): DetectorFinding | null {
  const stats: FriendlyStats = {
    total: 0,
    taglessOps: 0,
    crypticOpId: 0,
    flagged: 0,
    examples: [],
  };
  for (const { path, method, operation } of walkOperations(spec)) {
    stats.total++;
    const tags = operation.tags;
    const noTag = !Array.isArray(tags) || tags.length === 0;
    const opId = typeof operation.operationId === 'string' ? operation.operationId : '';
    const cryptic = opId === '' || operationIdLooksCryptic(opId);
    if (noTag) stats.taglessOps++;
    if (cryptic) stats.crypticOpId++;
    // "Unfindable" = both untagged AND cryptic operationId
    if (noTag && cryptic) {
      stats.flagged++;
      if (stats.examples.length < 5) {
        stats.examples.push({ path, method, opId: opId || '(missing)' });
      }
    }
  }
  if (stats.total === 0 || stats.flagged === 0) return null;
  // Fire if ≥ 25% of ops are "unfindable"
  if (stats.flagged / stats.total < 0.25) return null;
  const percentage = pct(stats.flagged, stats.total);
  return {
    detectorId: 'walker:ai-agent-consumability:l9-6-llm-friendly-discoverability',
    layer: 'walker-statistical',
    title: 'Operations are simultaneously untagged AND cryptic — agent-discovery hostile',
    narration:
      `${stats.flagged}/${stats.total} operations (${percentage}%) have NO tags AND a cryptic ` +
      `or missing operationId — agents cannot semantically group or unambiguously name them. ` +
      `Spec-wide: ${stats.taglessOps} ops are untagged, ${stats.crypticOpId} ops have cryptic/` +
      `missing operationIds. ` +
      `When an agent inspects an OpenAPI document to choose a sequence of calls, tags act as ` +
      `semantic-grouping (`+
      `e.g. "all customer-related ops") and operationId acts as the addressable handle. ` +
      `Without either, the model must fall back to path-pattern-matching, which is brittle.`,
    rationale:
      'Speakeasy SDK best-practices + Fern API guides + LLM-friendly-API patterns converge: ' +
      'tags + verb-noun operationIds form the agent-discoverability surface. spectral default ' +
      '`operation-tags` warns on tagless; Lens-9 strengthens to require BOTH a tag AND a ' +
      'human-readable operationId for agent use-cases.',
    category: 'clarity',
    severity: 'medium',
    scope: 'spec',
    affectedEndpoints: stats.examples.map((e) => ({ path: e.path, method: e.method })),
    patchOps: [],
    patchSummary:
      'Tag every operation (semantic grouping) and give it a verb-noun operationId so agents can address and group calls.',
    meta: {
      total: stats.total,
      taglessOps: stats.taglessOps,
      crypticOpId: stats.crypticOpId,
      flagged: stats.flagged,
      percentage,
      examples: stats.examples,
      patternId: 'L9-6',
    },
  };
}

// =============================================================================
// L9-7 capability-discovery endpoint present (POSITIVE / info-tier)
// =============================================================================

function detectL9_7(spec: object): DetectorFinding | null {
  const root = spec as Record<string, unknown>;
  const paths = root.paths;
  if (!paths || typeof paths !== 'object') return null;
  const matches: string[] = [];
  for (const p of Object.keys(paths as Record<string, unknown>)) {
    if (isCapabilityDiscoveryPath(p)) matches.push(p);
  }
  if (matches.length === 0) return null;
  return {
    detectorId: 'walker:ai-agent-consumability:l9-7-capability-discovery-present',
    layer: 'walker-statistical',
    title: 'Capability-discovery endpoint present (positive marker)',
    narration:
      `Spec exposes ${matches.length} capability-discovery endpoint(s): ${formatExamples(matches, 5)}. ` +
      `Agents and dynamic clients can fetch these at runtime to introspect API capabilities — ` +
      `tag-listing, OpenAPI/JSON-Schema document, OData $metadata, OAuth2 / OpenID-Connect ` +
      `discovery. This is a POSITIVE marker: spec is agent-consumable in a self-describing way.`,
    rationale:
      'FHIR CapabilityStatement, OData $metadata, OpenAPI well-known endpoints, and the MCP ' +
      'capabilities-protocol all formalise runtime discovery. Presence = early-mover-advantage ' +
      'on agent-consumability; not a violation.',
    category: 'design',
    severity: 'low', // info-tier maps to lowest DetectorFinding severity
    scope: 'spec',
    affectedEndpoints: [],
    patchOps: [],
    patchSummary:
      '(positive observation) Capability-discovery endpoint(s) present — keep them in sync with the spec.',
    meta: {
      paths: matches,
      patternId: 'L9-7',
      tier: 'info', // Severity-Schema-Final info-tier
    },
  };
}

// =============================================================================
// L9-8 OpenAI function-calling MCP compat
// =============================================================================

interface FnCallCompatStats {
  total: number;
  flagged: number;
  reasons: {
    paramTopLevelPolymorphism: number;
    paramRefSibling: number;
    paramSchemaTypeless: number;
    paramAdditionalPropertiesAny: number;
  };
  examples: Array<{ path: string; method: string; param: string; reason: string }>;
}

function paramHasRefSibling(schema: Record<string, unknown>): boolean {
  if (typeof schema.$ref !== 'string') return false;
  // Any other key besides $ref + summary/description is a sibling. OAS 3.0 forbids;
  // function-calling converters drop them.
  for (const k of Object.keys(schema)) {
    if (k === '$ref' || k === 'summary' || k === 'description') continue;
    return true;
  }
  return false;
}

function paramSchemaIsTypeless(schema: Record<string, unknown>): boolean {
  if ('$ref' in schema) return false;
  return isResponseEmptyOrTypeless(schema);
}

function paramHasTopLevelPolymorphism(schema: Record<string, unknown>): boolean {
  // oneOf/anyOf at the top of a parameter schema -> function-calling ChatGPT adapter
  // drops the parameter or auto-coerces.
  if (Array.isArray(schema.oneOf) && schema.oneOf.length > 1) return true;
  if (Array.isArray(schema.anyOf) && schema.anyOf.length > 1) return true;
  return false;
}

function paramHasAdditionalPropertiesAny(schema: Record<string, unknown>): boolean {
  // Object schema with `additionalProperties: true` (no shape) — MCP/OpenAI converters
  // can't represent this in tool-call schemas; many will drop the parameter.
  if (schema.type !== 'object') return false;
  if (schema.additionalProperties === true) return true;
  return false;
}

function detectL9_8(spec: object): DetectorFinding | null {
  const stats: FnCallCompatStats = {
    total: 0,
    flagged: 0,
    reasons: {
      paramTopLevelPolymorphism: 0,
      paramRefSibling: 0,
      paramSchemaTypeless: 0,
      paramAdditionalPropertiesAny: 0,
    },
    examples: [],
  };
  for (const { path, method, operation, pathItem } of walkOperations(spec)) {
    const params: unknown[] = [];
    if (Array.isArray(operation.parameters)) params.push(...operation.parameters);
    if (Array.isArray(pathItem.parameters)) params.push(...pathItem.parameters);
    for (const p of params) {
      if (!p || typeof p !== 'object') continue;
      const pp = p as Record<string, unknown>;
      // Skip $ref-only params at the parameter level
      if (typeof pp.$ref === 'string' && Object.keys(pp).length === 1) continue;
      const schema = pp.schema;
      if (!schema || typeof schema !== 'object') continue;
      stats.total++;
      const s = schema as Record<string, unknown>;
      const name = typeof pp.name === 'string' ? pp.name : '(unnamed)';
      let bad: string | null = null;
      if (paramHasRefSibling(s)) {
        stats.reasons.paramRefSibling++;
        bad = 'ref-sibling';
      } else if (paramHasTopLevelPolymorphism(s)) {
        stats.reasons.paramTopLevelPolymorphism++;
        bad = 'top-level-oneOf-or-anyOf';
      } else if (paramSchemaIsTypeless(s)) {
        stats.reasons.paramSchemaTypeless++;
        bad = 'schema-typeless';
      } else if (paramHasAdditionalPropertiesAny(s)) {
        stats.reasons.paramAdditionalPropertiesAny++;
        bad = 'additionalProperties-true';
      }
      if (bad) {
        stats.flagged++;
        if (stats.examples.length < 5) {
          stats.examples.push({ path, method, param: name, reason: bad });
        }
      }
    }
  }
  if (stats.total === 0 || stats.flagged === 0) return null;
  // Fire if ≥ 1 parameter is incompatible — even a single broken param breaks the
  // agent-tool conversion for that operation.
  const percentage = pct(stats.flagged, stats.total);
  return {
    detectorId: 'walker:ai-agent-consumability:l9-8-function-calling-compat',
    layer: 'walker-statistical',
    title: 'Parameter schemas break OpenAI/MCP function-calling tool generation',
    narration:
      `${stats.flagged}/${stats.total} parameter schemas (${percentage}%) cannot round-trip ` +
      `through OpenAI function-calling or MCP tool-schema converters. Breakdown: ` +
      `${stats.reasons.paramRefSibling} have $ref siblings; ` +
      `${stats.reasons.paramTopLevelPolymorphism} use oneOf/anyOf at the parameter top-level; ` +
      `${stats.reasons.paramSchemaTypeless} have a typeless / shapeless schema; ` +
      `${stats.reasons.paramAdditionalPropertiesAny} are objects with \`additionalProperties: true\`. ` +
      `These combinations cause function-calling adapters to drop the parameter, auto-coerce to ` +
      `string, or produce invalid tool-schemas — the agent cannot reliably call the operation.`,
    rationale:
      'OpenAI function-calling tool-schemas + MCP tool-schemas are JSON-Schema-Draft-7 subset; ' +
      '$ref-siblings, top-level oneOf/anyOf, typeless schemas, and `additionalProperties: true` ' +
      'on objects all violate that subset. Adapters must drop or coerce, breaking the call.',
    category: 'correctness',
    severity: 'medium',
    scope: 'spec',
    affectedEndpoints: stats.examples.map((e) => ({ path: e.path, method: e.method })),
    patchOps: [],
    patchSummary:
      'Replace oneOf/anyOf at parameter root with a discriminated single shape; remove $ref siblings; declare `type`/`properties`; replace `additionalProperties: true` with a typed schema.',
    meta: {
      total: stats.total,
      flagged: stats.flagged,
      percentage,
      reasons: stats.reasons,
      examples: stats.examples,
      patternId: 'L9-8',
    },
  };
}

// =============================================================================
// Public entry-point
// =============================================================================

export async function walkAiAgentConsumability(
  spec: object,
  _opts?: DetectorOptions
): Promise<DetectorFinding[]> {
  const findings: DetectorFinding[] = [];
  const l9_1 = detectL9_1(spec);
  if (l9_1.finding) findings.push(l9_1.finding);
  const l9_2 = detectL9_2(spec);
  if (l9_2) findings.push(l9_2);
  const l9_3 = detectL9_3(spec);
  if (l9_3) findings.push(l9_3);
  const l9_4 = detectL9_4(spec);
  if (l9_4) findings.push(l9_4);
  const l9_5 = detectL9_5(spec);
  if (l9_5) findings.push(l9_5);
  const l9_6 = detectL9_6(spec);
  if (l9_6) findings.push(l9_6);
  const l9_7 = detectL9_7(spec);
  if (l9_7) findings.push(l9_7);
  const l9_8 = detectL9_8(spec);
  if (l9_8) findings.push(l9_8);
  return findings;
}

// =============================================================================
// Severity-Schema-Final tagging
// =============================================================================

const COMMON_LENSES = ['ai-agent-consumability', 'client-friction'] as const;

export const AI_AGENT_CONSUMABILITY_RULES: Record<string, RuleMetadata> = {
  'walker:ai-agent-consumability:l9-1-examples-coverage': validateMetadata({
    severity: 'warn',
    lenses: [...COMMON_LENSES],
    sources: [
      { type: 'vendor', name: 'Postman-2025-State-of-API' },
      { type: 'vendor', name: 'Speakeasy-best-practices' },
      { type: 'vendor', name: 'Fern-api-guides' },
      { type: 'mining', phase: 'round2', subagent: 'phase-d-client' },
    ],
    stakeholders: ['client-dev', 'spec-author'],
    lifecyclePhase: 'documentation-time',
    defectClass: 'incomplete',
    iso25010: ['usability'],
    priority: 'P2',
    patternId: 'L9-1',
  }),
  'walker:ai-agent-consumability:l9-2-tool-name-compat': validateMetadata({
    severity: 'warn',
    lenses: [...COMMON_LENSES],
    sources: [
      { type: 'vendor', name: 'OpenAI-tools-API-spec' },
      { type: 'vendor', name: 'MCP-tool-schema' },
      { type: 'mining', phase: 'round2', subagent: 'phase-d-client' },
    ],
    stakeholders: ['client-dev', 'codegen-tool'],
    lifecyclePhase: 'build-time',
    defectClass: 'ergonomic',
    iso25010: ['compatibility'],
    priority: 'P3',
    patternId: 'L9-2',
  }),
  'walker:ai-agent-consumability:l9-3-description-completeness': validateMetadata({
    severity: 'warn',
    lenses: [...COMMON_LENSES],
    sources: [
      { type: 'vendor', name: 'Postman-2025-State-of-API' },
      { type: 'vendor', name: 'Speakeasy-best-practices' },
      { type: 'mining', phase: 'round2', subagent: 'phase-d-client' },
    ],
    stakeholders: ['client-dev', 'spec-author'],
    lifecyclePhase: 'documentation-time',
    defectClass: 'incomplete',
    iso25010: ['usability'],
    priority: 'P3',
    patternId: 'L9-3',
  }),
  'walker:ai-agent-consumability:l9-4-parameter-description-quality': validateMetadata({
    severity: 'hint',
    lenses: [...COMMON_LENSES],
    sources: [
      { type: 'vendor', name: 'Postman-2025-State-of-API' },
      { type: 'mining', phase: 'round2', subagent: 'phase-d-client' },
    ],
    stakeholders: ['client-dev', 'spec-author'],
    lifecyclePhase: 'documentation-time',
    defectClass: 'incomplete',
    iso25010: ['usability'],
    priority: 'P3',
    patternId: 'L9-4',
  }),
  'walker:ai-agent-consumability:l9-5-response-shape-predictability': validateMetadata({
    severity: 'hint',
    lenses: [...COMMON_LENSES],
    sources: [
      { type: 'vendor', name: 'Speakeasy-LLM-friendly-API' },
      { type: 'vendor', name: 'Redocly-discriminator-guide' },
      { type: 'mining', phase: 'round2', subagent: 'phase-d-client' },
    ],
    stakeholders: ['client-dev', 'codegen-tool'],
    lifecyclePhase: 'runtime-happy',
    defectClass: 'ergonomic',
    iso25010: ['usability'],
    priority: 'P3',
    patternId: 'L9-5',
  }),
  'walker:ai-agent-consumability:l9-6-llm-friendly-discoverability': validateMetadata({
    severity: 'hint',
    lenses: [...COMMON_LENSES],
    sources: [
      { type: 'vendor', name: 'Speakeasy-best-practices' },
      { type: 'vendor', name: 'Fern-LLM-friendly-API' },
      { type: 'mining', phase: 'round2', subagent: 'phase-d-client' },
    ],
    stakeholders: ['client-dev'],
    lifecyclePhase: 'documentation-time',
    defectClass: 'ergonomic',
    iso25010: ['usability'],
    priority: 'P3',
    patternId: 'L9-6',
  }),
  'walker:ai-agent-consumability:l9-7-capability-discovery-present': validateMetadata({
    severity: 'info',
    lenses: [...COMMON_LENSES, 'operational-metadata'],
    sources: [
      { type: 'vendor', name: 'FHIR-CapabilityStatement' },
      { type: 'vendor', name: 'MCP-capabilities-protocol' },
      { type: 'vendor', name: 'OData-metadata-document' },
      { type: 'mining', phase: 'round2', subagent: 'phase-f-meta' },
    ],
    stakeholders: ['client-dev', 'operations'],
    lifecyclePhase: 'runtime-happy',
    defectClass: 'incomplete',
    iso25010: ['compatibility'],
    priority: 'P5',
    patternId: 'L9-7',
  }),
  'walker:ai-agent-consumability:l9-8-function-calling-compat': validateMetadata({
    severity: 'warn',
    lenses: [...COMMON_LENSES],
    sources: [
      { type: 'vendor', name: 'OpenAI-tools-API-spec' },
      { type: 'vendor', name: 'MCP-tool-schema' },
      { type: 'mining', phase: 'round2', subagent: 'phase-d-client' },
    ],
    stakeholders: ['client-dev', 'codegen-tool'],
    lifecyclePhase: 'build-time',
    defectClass: 'norm',
    iso25010: ['compatibility'],
    priority: 'P3',
    patternId: 'L9-8',
  }),
};
