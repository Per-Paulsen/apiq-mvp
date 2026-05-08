/**
 * Webhook-Signature Module — Stage A, Welle A T9 (Module-Class).
 *
 * Sources: GitHub webhook docs (X-Hub-Signature-256)
 *          + Stripe webhook signing docs (Stripe-Signature, t/v1 scheme)
 *          + RFC 9421 (HTTP Message Signatures)
 *          + Twilio + WhatsApp webhook-receiver docs (postmortem R3-PM-IC-03)
 *          + OWASP API10:2023 (Unsafe Consumption of APIs)
 * Patterns: 3 finding-classes (webhook-no-signature-header / signature-format-
 *           undocumented / payload-schema-undocumented) detected via path-prefix
 *           heuristic (+ summary/description) + header-name allowlist
 * Lens: 1 (Threat-Modeling), 2 (Standards-Compliance), 8 (Internal-Consistency)
 * Round: 2 (Welle A — Mining-Round-2 sleeper-killer M-6)
 *
 * Maps to rules-brainstorm.md: TM-A50 (Webhook endpoint MUST declare
 * signature-header — P1, "highest-value Round-2 catch"), TM-A51 (Webhook
 * accepts wildcard star-slash-star content-type), CL-74 (callbacks without
 * webhooks-3.1 OR webhooks no signature), U1 (webhooks-Definitionen haben
 * request-Schemas).
 *
 * Detector for the "webhook endpoint MUST declare a signature-verification
 * header parameter" pattern (TM-A50) plus two related rules
 * (TM-A51 = signature-format documented; CL-74 = payload schema documented).
 *
 * Sleeper-killer rule per Mining-Round-2 Phase A meta-observation M-6:
 * webhooks are explicitly cited in OWASP API10's prevention-text; both
 * GitHub (X-Hub-Signature-256) and Stripe (Stripe-Signature) document
 * the convention publicly; implementing it is mechanical (path-prefix-
 * heuristic + header-name-allowlist); the miss-rate in real specs is high.
 *
 * Detection strategy:
 *   (1) Identify webhook-receiving endpoints via three signals:
 *       (a) Path-prefix heuristic for /webhooks, /hooks, /callbacks.
 *       (b) OAS 3.1 top-level webhooks block.
 *       (c) OAS 3.0/3.1 operation-level callbacks block.
 *   (2) For each webhook operation, walk parameters (operation +
 *       path-item, both inline and via component-ref) and check whether
 *       any header parameter matches the signature-header allowlist.
 *   (3) If no signature header -> emit TM-A50 (error, Lens 1+2).
 *   (4) If signature header but description lacks an HMAC/SHA256/hex/
 *       base64 format mention -> emit TM-A51 (warn, Lens 1+2).
 *   (5) If body-bearing webhook lacks a payload schema -> emit CL-74
 *       (hint, Lens 4+1).
 *
 * Spec-agnostic: no vendor-specific branching. Vendor-specific
 * recognition is the LLM's job per Iteration-6 architectural correction.
 *
 * Public API:
 *   - runWebhookSignature(spec, opts) returns Promise of DetectorFinding[]
 *   - WEBHOOK_SIGNATURE_RULES — RuleMetadata for each detector-id
 *
 * CLI:
 *   npx tsx deterministic/webhook-signature.ts <spec-name>
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type { DetectorFinding, DetectorOptions } from './types.js';
import type { RuleMetadata } from './severity-schema.js';
import { validateMetadata } from './severity-schema.js';

// =============================================================================
// Constants — webhook-detection heuristics + signature-header allowlist.
// =============================================================================

const WEBHOOK_PATH_PATTERNS: ReadonlyArray<RegExp> = [
  /(^|\/)_?webhooks?(\/|$)/i,
  /(^|\/)hooks?(\/|$)/i,
  /(^|\/)callbacks?(\/|$)/i,
  /(^|\/)events?[-_]?ingest(\/|$)/i,
];

const SIGNATURE_HEADER_LIST = [
  'stripe-signature',
  'x-hub-signature-256',
  'x-hub-signature',
  'x-slack-signature',
  'x-twilio-signature',
  'x-pagerduty-signature',
  'x-shopify-hmac-sha256',
  'x-square-hmacsha256-signature',
  'x-webhook-signature',
  'webhook-signature',
  'signature',
  'x-signature',
  'x-hmac-signature',
  'x-hmac',
  'hmac-signature',
];

const SIGNATURE_HEADER_LITERALS: ReadonlySet<string> = new Set(
  SIGNATURE_HEADER_LIST.map((s) => s.toLowerCase())
);

function isSignatureHeaderName(name: string): boolean {
  const lc = name.trim().toLowerCase();
  if (SIGNATURE_HEADER_LITERALS.has(lc)) {
    return true;
  }
  if (lc.indexOf('signature') >= 0) {
    return true;
  }
  if (lc.indexOf('hmac') >= 0) {
    return true;
  }
  return false;
}

const SIGNATURE_FORMAT_MARKERS = [
  'hmac', 'sha256', 'sha-256', 'sha512', 'sha-512',
  'sha1', 'sha-1', 'hex', 'base64', 'base-64',
  'rfc 2104', 'rfc2104', 'ed25519', 'rsa',
];

function descriptionDeclaresSignatureFormat(description: string): boolean {
  const lc = description.toLowerCase();
  return SIGNATURE_FORMAT_MARKERS.some((m) => lc.indexOf(m) >= 0);
}

// =============================================================================
// Helpers — spec walking.
// =============================================================================

const HTTP_METHODS = new Set([
  'get', 'put', 'post', 'delete',
  'options', 'head', 'patch', 'trace',
]);

function isHttpMethod(key: string): boolean {
  return HTTP_METHODS.has(key.toLowerCase());
}

function stripVersionPrefix(p: string): string {
  return p.replace(/^\/(?:v\d+|\d{4}-\d{2}-\d{2})(?=\/|$)/i, '');
}

function pathLooksLikeWebhook(pathKey: string): boolean {
  const cleaned = stripVersionPrefix(pathKey);
  return WEBHOOK_PATH_PATTERNS.some((re) => re.test(cleaned));
}

const PARAM_REF_RE = new RegExp('^#/components/parameters/(.+)');

function resolveParamRef(
  ref: string,
  components: Record<string, unknown> | undefined
): Record<string, unknown> | null {
  if (!components) {
    return null;
  }
  const m = PARAM_REF_RE.exec(ref.trim());
  if (!m) {
    return null;
  }
  const params = components.parameters as Record<string, unknown> | undefined;
  if (!params) {
    return null;
  }
  const name = m[1].replace(/~1/g, '/').replace(/~0/g, '~');
  const target = params[name];
  if (!target || typeof target !== 'object') {
    return null;
  }
  return target as Record<string, unknown>;
}

interface ResolvedParam {
  name: string;
  in: string;
  description: string;
}

function collectParameters(
  operation: Record<string, unknown>,
  pathItem: Record<string, unknown>,
  components: Record<string, unknown> | undefined
): ResolvedParam[] {
  const out: ResolvedParam[] = [];
  const both: unknown[] = [];
  if (Array.isArray(operation.parameters)) {
    both.push(...operation.parameters);
  }
  if (Array.isArray(pathItem.parameters)) {
    both.push(...pathItem.parameters);
  }

  for (const p of both) {
    if (!p || typeof p !== 'object') {
      continue;
    }
    let pp = p as Record<string, unknown>;
    const refValue = (pp as Record<string, unknown>)['$ref'];
    if (typeof refValue === 'string') {
      const resolved = resolveParamRef(refValue, components);
      if (!resolved) {
        continue;
      }
      pp = resolved;
    }
    const name = typeof pp.name === 'string' ? pp.name : '';
    const inField = typeof pp.in === 'string' ? pp.in : '';
    const description =
      typeof pp.description === 'string' ? pp.description : '';
    if (!name || !inField) {
      continue;
    }
    out.push({ name, in: inField, description });
  }
  return out;
}

interface WebhookOperationCtx {
  source: 'paths' | 'webhooks-block' | 'callback';
  pathKey: string;
  method: string;
  operation: Record<string, unknown>;
  pathItem: Record<string, unknown>;
}

function* walkWebhookOperations(spec: object): Generator<WebhookOperationCtx> {
  const root = spec as Record<string, unknown>;

  // (1) paths -- heuristic match.
  const paths = root.paths;
  if (paths && typeof paths === 'object') {
    for (const [pathKey, pathItemRaw] of Object.entries(paths as Record<string, unknown>)) {
      if (!pathItemRaw || typeof pathItemRaw !== 'object') continue;
      if (!pathKey.startsWith('/')) continue;
      if (!pathLooksLikeWebhook(pathKey)) continue;
      const pathItem = pathItemRaw as Record<string, unknown>;
      for (const [key, opRaw] of Object.entries(pathItem)) {
        if (!isHttpMethod(key)) continue;
        if (!opRaw || typeof opRaw !== 'object') continue;
        yield { source: 'paths', pathKey, method: key.toLowerCase(), operation: opRaw as Record<string, unknown>, pathItem };
      }
    }
  }

  // (2) webhooks (OAS 3.1) -- every entry is an inbound webhook.
  const webhooks = root.webhooks;
  if (webhooks && typeof webhooks === 'object') {
    for (const [name, pathItemRaw] of Object.entries(webhooks as Record<string, unknown>)) {
      if (!pathItemRaw || typeof pathItemRaw !== 'object') continue;
      const pathItem = pathItemRaw as Record<string, unknown>;
      for (const [key, opRaw] of Object.entries(pathItem)) {
        if (!isHttpMethod(key)) continue;
        if (!opRaw || typeof opRaw !== 'object') continue;
        yield { source: 'webhooks-block', pathKey: name, method: key.toLowerCase(), operation: opRaw as Record<string, unknown>, pathItem };
      }
    }
  }

  // (3) callbacks (OAS 3.0 + 3.1).
  if (paths && typeof paths === 'object') {
    for (const [pathKey, pathItemRaw] of Object.entries(paths as Record<string, unknown>)) {
      if (!pathItemRaw || typeof pathItemRaw !== 'object') continue;
      const pathItem = pathItemRaw as Record<string, unknown>;
      for (const [key, opRaw] of Object.entries(pathItem)) {
        if (!isHttpMethod(key)) continue;
        if (!opRaw || typeof opRaw !== 'object') continue;
        const op = opRaw as Record<string, unknown>;
        const callbacks = op.callbacks as Record<string, unknown> | undefined;
        if (!callbacks || typeof callbacks !== 'object') continue;
        for (const [eventName, cbRaw] of Object.entries(callbacks)) {
          if (!cbRaw || typeof cbRaw !== 'object') continue;
          const cb = cbRaw as Record<string, unknown>;
          for (const [urlExpr, cbPathItemRaw] of Object.entries(cb)) {
            if (!cbPathItemRaw || typeof cbPathItemRaw !== 'object') continue;
            const cbPathItem = cbPathItemRaw as Record<string, unknown>;
            for (const [cbMethod, cbOpRaw] of Object.entries(cbPathItem)) {
              if (!isHttpMethod(cbMethod)) continue;
              if (!cbOpRaw || typeof cbOpRaw !== 'object') continue;
              yield {
                source: 'callback',
                pathKey: pathKey + '#callbacks/' + eventName + '/' + urlExpr,
                method: cbMethod.toLowerCase(),
                operation: cbOpRaw as Record<string, unknown>,
                pathItem: cbPathItem,
              };
            }
          }
        }
      }
    }
  }
}

function hasPayloadSchema(operation: Record<string, unknown>): boolean {
  const rb = operation.requestBody;
  if (!rb || typeof rb !== 'object') return false;
  const content = (rb as Record<string, unknown>).content;
  if (!content || typeof content !== 'object') return false;
  for (const v of Object.values(content as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue;
    const entry = v as Record<string, unknown>;
    if (entry.schema && typeof entry.schema === 'object') return true;
    if (entry.example !== undefined) return true;
    if (entry.examples && typeof entry.examples === 'object') return true;
  }
  return false;
}

// =============================================================================
// RuleMetadata -- Severity-Schema-Final tagging for each detector-id.
// =============================================================================

export const WEBHOOK_SIGNATURE_RULES: Record<string, RuleMetadata> = {
  'module:webhook-signature:missing-signature-header': validateMetadata({
    severity: 'error',
    lenses: ['threat-modeling', 'standards-compliance'],
    sources: [
      { type: 'vendor', name: 'GitHub-webhook-docs' },
      { type: 'vendor', name: 'Stripe-webhook-docs' },
      { type: 'vendor', name: 'OWASP-API10-2023' },
      { type: 'mining', phase: 'round2', subagent: 'phase-a-threat' },
    ],
    stakeholders: ['security', 'spec-author', 'client-dev'],
    lifecyclePhase: 'build-time',
    defectClass: 'norm',
    iso25010: ['security'],
    priority: 'P1',
    patternId: 'TM-A50',
  }),
  'module:webhook-signature:format-not-documented': validateMetadata({
    severity: 'warn',
    lenses: ['threat-modeling', 'standards-compliance'],
    sources: [
      { type: 'vendor', name: 'GitHub-webhook-docs' },
      { type: 'vendor', name: 'Stripe-webhook-docs' },
      { type: 'mining', phase: 'round2', subagent: 'phase-a-threat' },
    ],
    stakeholders: ['client-dev', 'spec-author'],
    lifecyclePhase: 'build-time',
    defectClass: 'incomplete',
    iso25010: ['usability'],
    priority: 'P3',
    patternId: 'TM-A51',
  }),
  'module:webhook-signature:payload-schema-undocumented': validateMetadata({
    severity: 'hint',
    lenses: ['client-friction', 'threat-modeling'],
    sources: [
      { type: 'mining', phase: 'round2', subagent: 'phase-d-client' },
      { type: 'vendor', name: 'Twilio-webhook-conventions' },
    ],
    stakeholders: ['client-dev', 'codegen-tool'],
    lifecyclePhase: 'build-time',
    defectClass: 'incomplete',
    iso25010: ['usability'],
    priority: 'P3',
    patternId: 'CL-74',
  }),
};

// =============================================================================
// Main detector.
// =============================================================================

interface MissingSig {
  source: WebhookOperationCtx['source'];
  path: string;
  method: string;
}

interface UndocumentedFormat {
  source: WebhookOperationCtx['source'];
  path: string;
  method: string;
  headerName: string;
}

interface UndocumentedPayload {
  source: WebhookOperationCtx['source'];
  path: string;
  method: string;
}

export async function runWebhookSignature(
  spec: object,
  _opts?: DetectorOptions
): Promise<DetectorFinding[]> {
  const root = spec as Record<string, unknown>;
  const components = root.components as Record<string, unknown> | undefined;

  const missingSig: MissingSig[] = [];
  const undocumentedFormat: UndocumentedFormat[] = [];
  const undocumentedPayload: UndocumentedPayload[] = [];

  let webhookOpCount = 0;

  for (const ctx of walkWebhookOperations(spec)) {
    webhookOpCount++;
    const params = collectParameters(ctx.operation, ctx.pathItem, components);

    const sigHeaders = params.filter(
      (p) => p.in.toLowerCase() === 'header' && isSignatureHeaderName(p.name)
    );

    if (sigHeaders.length === 0) {
      missingSig.push({
        source: ctx.source,
        path: ctx.pathKey,
        method: ctx.method,
      });
    } else {
      const anyFormatDocumented = sigHeaders.some((h) =>
        descriptionDeclaresSignatureFormat(h.description)
      );
      if (!anyFormatDocumented) {
        undocumentedFormat.push({
          source: ctx.source,
          path: ctx.pathKey,
          method: ctx.method,
          headerName: sigHeaders[0].name,
        });
      }
    }

    const wantsBody = ['post', 'put', 'patch'].indexOf(ctx.method) >= 0;
    if (wantsBody && !hasPayloadSchema(ctx.operation)) {
      undocumentedPayload.push({
        source: ctx.source,
        path: ctx.pathKey,
        method: ctx.method,
      });
    }
  }

  if (webhookOpCount === 0) {
    return [];
  }

  const findings: DetectorFinding[] = [];

  if (missingSig.length > 0) {
    const exampleStrs = missingSig
      .slice(0, 5)
      .map((m) => m.method.toUpperCase() + ' ' + m.path)
      .join(', ');
    const moreSuffix =
      missingSig.length > 5 ? ' (and ' + (missingSig.length - 5) + ' more)' : '';
    findings.push({
      detectorId: 'module:webhook-signature:missing-signature-header',
      layer: 'walker-statistical',
      title: missingSig.length + ' webhook endpoint(s) declare no signature-verification header',
      narration:
        missingSig.length + ' webhook-receiving endpoint(s) are documented in the spec but ' +
        'none declare a header parameter for signature verification (e.g. Stripe-Signature, ' +
        'X-Hub-Signature-256, X-Slack-Signature, X-Twilio-Signature, X-PagerDuty-Signature, ' +
        'or any header whose name contains "signature"/"hmac"). ' +
        'Endpoints affected: ' + exampleStrs + moreSuffix + '. Without a signature header in the ' +
        'contract, consuming SDKs cannot generate verification scaffolding, code-reviewers ' +
        'cannot tell whether request authenticity is being checked, and downstream operators ' +
        'must rely on out-of-band documentation to know which header carries the HMAC. The ' +
        'OWASP API10:2023 prevention guidance and both GitHub and Stripe webhook documentation ' +
        'treat the signature header as a MUST for every inbound-webhook contract.',
      rationale:
        'OWASP API10:2023 ("Unsafe Consumption of APIs") explicitly cites webhook-signature ' +
        'verification as the load-bearing trust boundary for inbound async events. Both GitHub ' +
        '(X-Hub-Signature-256, HMAC-SHA256 over the raw body) and Stripe (Stripe-Signature, ' +
        't=...,v1=... HMAC-SHA256 hex) document the convention as mandatory. A webhook endpoint ' +
        'without a signature-header parameter in its OpenAPI definition leaves consumers blind ' +
        'to the verification expectation and effectively invites spoofed-payload attacks.',
      category: 'risk',
      severity: 'high',
      scope: 'endpoint',
      affectedEndpoints: dedupeAffected(
        missingSig.map((m) => ({ path: m.path, method: m.method }))
      ),
      patchOps: [],
      patchSummary:
        'Add a signature-verification header parameter (e.g. X-Hub-Signature-256 or Stripe-Signature) to every webhook operation.',
      meta: {
        count: missingSig.length,
        webhookOpsTotal: webhookOpCount,
        bySource: countBy(missingSig, (m) => m.source),
        examples: missingSig.slice(0, 5),
        patternId: 'TM-A50',
        priority: 'P1',
      },
    });
  }

  if (undocumentedFormat.length > 0) {
    const exampleStrs = undocumentedFormat
      .slice(0, 5)
      .map((m) => m.method.toUpperCase() + ' ' + m.path + ' (header ' + m.headerName + ')')
      .join(', ');
    const moreSuffix =
      undocumentedFormat.length > 5
        ? ' (and ' + (undocumentedFormat.length - 5) + ' more)'
        : '';
    findings.push({
      detectorId: 'module:webhook-signature:format-not-documented',
      layer: 'walker-statistical',
      title: undocumentedFormat.length + ' webhook signature header(s) lack HMAC/encoding documentation',
      narration:
        undocumentedFormat.length + ' webhook signature header(s) declared in the spec do not ' +
        'mention HMAC-SHA256 / hex / base64 / Ed25519 or any other algorithm/encoding marker ' +
        'in their description. Endpoints affected: ' + exampleStrs + moreSuffix + '. Consumers ' +
        'building verification logic from the spec must guess (or read external docs) to know ' +
        'whether to compute HMAC-SHA256 over the raw body, whether the signature is hex- or ' +
        'base64-encoded, and whether the value is a single token or a structured ' +
        't=...,v1=... envelope. Document the expected format in the parameter description.',
      rationale:
        "GitHub's webhook docs declare X-Hub-Signature-256 carries an HMAC-SHA256 hex digest; " +
        "Stripe's Stripe-Signature header documents the t=<timestamp>,v1=<hmac-sha256-hex> " +
        'scheme. Both vendors call out that without a documented format, consumers cannot ' +
        'verify signatures correctly. The OAS parameter description is the standard place to ' +
        'declare these specifics so SDKs and reviewers can implement verification deterministically.',
      category: 'clarity',
      severity: 'medium',
      scope: 'endpoint',
      affectedEndpoints: dedupeAffected(
        undocumentedFormat.map((m) => ({ path: m.path, method: m.method }))
      ),
      patchOps: [],
      patchSummary:
        'Document the signature-header algorithm and encoding (e.g. "HMAC-SHA256 hex of the raw body") in the parameter description.',
      meta: {
        count: undocumentedFormat.length,
        examples: undocumentedFormat.slice(0, 5),
        patternId: 'TM-A51',
        priority: 'P3',
      },
    });
  }

  if (undocumentedPayload.length > 0) {
    const exampleStrs = undocumentedPayload
      .slice(0, 5)
      .map((m) => m.method.toUpperCase() + ' ' + m.path)
      .join(', ');
    const moreSuffix =
      undocumentedPayload.length > 5
        ? ' (and ' + (undocumentedPayload.length - 5) + ' more)'
        : '';
    findings.push({
      detectorId: 'module:webhook-signature:payload-schema-undocumented',
      layer: 'walker-statistical',
      title: undocumentedPayload.length + ' webhook endpoint(s) declare no payload schema',
      narration:
        undocumentedPayload.length + ' webhook-receiving operation(s) accept a body but the ' +
        'requestBody is missing or has no content.<media-type>.schema. Endpoints ' +
        'affected: ' + exampleStrs + moreSuffix + '. SDK codegen tools cannot produce a typed ' +
        'handler signature; documentation portals render an empty payload section; consumers ' +
        'must rely on out-of-band docs to know what fields the webhook delivers. Declare a ' +
        'JSON Schema for the payload (or at minimum a worked example) so the contract is ' +
        'self-describing.',
      rationale:
        'Every consumed webhook has a contract -- the payload shape -- that consumers must build ' +
        'against. OAS 3.0 section 4.7.13 ("Request Body Object") and the Twilio / Stripe / GitHub ' +
        'webhook documentation all treat payload-schema as a primary deliverable of the spec. ' +
        'Without it, codegen produces handler stubs typed as any/object and reviewers ' +
        'cannot verify field-coverage.',
      category: 'design',
      severity: 'medium',
      scope: 'endpoint',
      affectedEndpoints: dedupeAffected(
        undocumentedPayload.map((m) => ({ path: m.path, method: m.method }))
      ),
      patchOps: [],
      patchSummary:
        'Add requestBody.content.<media-type>.schema describing the webhook payload (or a worked example for early-stage docs).',
      meta: {
        count: undocumentedPayload.length,
        examples: undocumentedPayload.slice(0, 5),
        patternId: 'CL-74',
        priority: 'P3',
      },
    });
  }

  return findings;
}

// =============================================================================
// Helpers.
// =============================================================================

function dedupeAffected(
  list: Array<{ path: string; method: string }>
): Array<{ path: string; method: string }> {
  const seen = new Set<string>();
  const out: Array<{ path: string; method: string }> = [];
  for (const e of list) {
    const k = e.method.toLowerCase() + ' ' + e.path;
    if (seen.has(k)) {
      continue;
    }
    seen.add(k);
    out.push({ path: e.path, method: e.method.toLowerCase() });
  }
  return out;
}

function countBy<T>(list: T[], keyFn: (x: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of list) {
    const k = keyFn(item);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

// =============================================================================
// CLI.
// =============================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const EXAMPLES_DIR = path.join(REPO_ROOT, 'openapi-examples');

async function main(): Promise<void> {
  const specName = process.argv[2];
  if (!specName) {
    console.error('Usage: npx tsx deterministic/webhook-signature.ts <spec-name>');
    process.exit(1);
  }

  const specDir = path.join(EXAMPLES_DIR, specName);
  let specPath: string | null = null;
  for (const ext of ['json', 'yaml', 'yml']) {
    const candidate = path.join(specDir, 'spec.' + ext);
    if (fs.existsSync(candidate)) {
      specPath = candidate;
      break;
    }
  }
  if (!specPath) {
    console.error('No spec.{json,yaml,yml} found in ' + specDir);
    process.exit(1);
  }

  const raw = fs.readFileSync(specPath, 'utf8');
  let spec: object;
  if (specPath.endsWith('.json')) {
    spec = JSON.parse(raw);
  } else {
    const YAML = (await import('yaml')).default;
    spec = YAML.parse(raw) as object;
  }

  console.log('Loaded spec: ' + specPath);
  console.log('');

  const startedAt = Date.now();
  const findings = await runWebhookSignature(spec, { specName });
  const durationMs = Date.now() - startedAt;

  console.log('webhook-signature ran, ' + findings.length + ' findings emitted (' + durationMs + 'ms)');
  console.log('');
  if (findings.length === 0) {
    console.log('(No webhook-signature findings.)');
    return;
  }
  for (const f of findings) {
    console.log('[' + f.detectorId + ']');
    console.log('  title: ' + f.title);
    if (f.meta) console.log('  meta:  ' + JSON.stringify(f.meta));
    if (f.affectedEndpoints.length > 0) {
      console.log('  affectedEndpoints: ' + f.affectedEndpoints.length);
    }
    console.log('');
  }
}

const invokedAsScript =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedAsScript) {
  main().catch((err) => {
    console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
    process.exit(1);
  });
}
