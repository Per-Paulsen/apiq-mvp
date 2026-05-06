/**
 * Walker: Privacy / Data-Classification (Lens 6).
 *
 * Stage A, Welle B, Task T21. Implements the four L6-* patterns identified in
 * Mining-Round-2 Phase A as orthogonal to Lens 1 (Threat-Modeling): Lens 6
 * houses GDPR/PII-tagging concerns + audit-redaction-markers + HIPAA-relevance
 * heuristics. Different from Threat-Modeling because it is about *data
 * classification* + *handling*, not about exploit-prevention.
 *
 * The four patterns:
 *
 *   L6-1  pii-named-fields-in-path-or-query
 *         PII-named field on path / query parameters. These leak via URLs,
 *         server logs, browser history, Referer headers, CDN caches, and
 *         third-party-analytics referrers. Different from TM-A15 which
 *         catches the same fields in *response bodies* (excessive-data-
 *         exposure). Lens 6 cross-tagged with Lens 1 (Threat).
 *         Severity: warn.
 *         Source: OWASP API3 + GDPR Art.5 data-minimisation.
 *
 *   L6-2  pii-vendor-extension-positive-marker (info-tier)
 *         The spec carries explicit data-classification annotations such as
 *         `x-pii: true`, `x-pii-tag`, `x-data-class: PII|PHI|PCI`, or the
 *         Cloudflare-style `x-redact-in-audit`. This is a POSITIVE marker:
 *         data-classification discipline detected. Severity: info.
 *         Source: Cloudflare audit-redaction patterns + OAI Issue #2190
 *         (PII-tagging proposal).
 *
 *   L6-3  hipaa-relevance-heuristic (CONSERVATIVE / off-by-default)
 *         Field-name shape suggests Protected Health Information (PHI) — e.g.
 *         `medical_record_number`, `diagnosis_code`, `health_record_id`,
 *         `patient_dob` — but the spec carries NO data-class annotation
 *         anywhere. Severity: hint.
 *         **HIGH FALSE-POSITIVE RISK in non-health domains.** A field named
 *         `diagnosis` in an automotive-fault-codes API is not PHI; a field
 *         named `patient` in a veterinary API is not human-PHI. We therefore
 *         require BOTH (a) a strong PHI-shape match AND (b) absence of any
 *         data-class annotation across the whole spec, AND we emit at most
 *         ONE finding per spec (not per field) so users in non-health domains
 *         can dismiss with a single `// apiq-disable: walker:privacy-l6-3`
 *         line. The rule is informational — designed to be opt-in for
 *         confirmed health-domain specs.
 *         Source: HIPAA Privacy Rule §164.514 (PHI identifiers) + OWASP API3.
 *
 *   L6-4  pii-in-default-values (cross-reference)
 *         Default values containing PII patterns. Overlaps with the
 *         secret-scanner module (Lens 1 + Lens 6 cross-tagged), which already
 *         scans `default:` / `example:` / `examples-map:` / `description:`
 *         sites against TruffleHog/Gitleaks PII-pattern catalog (SSN, CC,
 *         email, passport). This walker deliberately does NOT duplicate that
 *         scan; it emits a single info-tier observation telling the user that
 *         the secret-scanner is the responsible module for this concern, and
 *         points to its findings. This keeps the cross-tag visible to UI
 *         filters while avoiding double-emission.
 *         Source: TruffleHog / Gitleaks PII catalog (Lens 6 framing of
 *         existing Lens 1 + Lens 6 patterns in secret-scanner.ts).
 *
 * Cross-tag re-tag for TM-A15 (PII-named-fields response):
 *   TM-A15 already lives in secret-scanner.ts via the PII_PATTERNS list and
 *   is emitted with both Lens 1 (Threat) and Lens 6 (Privacy) on its
 *   ruleMetadata. This walker *documents* the cross-tag relationship so
 *   reviewers / UI filters understand that L6 coverage of "PII fields in
 *   responses" is the secret-scanner's job, not this walker's. No code change
 *   in secret-scanner is needed; T8 already implemented the dual-lens
 *   tagging. See `secret-scanner.ts` PII_PATTERNS section.
 *
 * Public API:
 *   walkPrivacyDataClass(spec, opts) => Promise<DetectorFinding[]>
 *   PII_FIELD_NAME_PATTERNS, PHI_FIELD_NAME_PATTERNS,
 *   DATA_CLASS_VENDOR_EXTENSIONS (exported for tests)
 *
 * CLI:
 *   npx tsx deterministic/walkers/privacy-data-class.ts <spec-name>
 */

import type { DetectorFinding, DetectorOptions } from '../types.js';
import {
  type RuleMetadata,
  validateMetadata,
} from '../severity-schema.js';
import { walkOperations } from './_shared.js';

// =============================================================================
// 1. PII field-name catalog (L6-1)
// =============================================================================

/**
 * Field-name patterns that indicate Personally Identifiable Information per
 * GDPR Art. 4(1) + CCPA section 1798.140 + ISO/IEC 29100. Matched against
 * parameter `name` lowercased + underscore/hyphen normalised.
 *
 * The patterns are deliberately narrow: we want low false-positive rate for
 * Lens 6 (a privacy-data-class warning is reputation-load-bearing because
 * teams escalate it to compliance review). Generic words like `name`, `id`,
 * `phone` are NOT included — they have legitimate non-PII uses (resource-
 * names, primary-keys, contact-IDs).
 */
export const PII_FIELD_NAME_PATTERNS: ReadonlyArray<{
  re: RegExp;
  label: string;
  /**
   * Confidence tier — 'high' patterns fire as warn, 'medium' patterns fire as
   * hint (kept conservative for query-string false-positives like `email`
   * being used as a search filter).
   */
  confidence: 'high' | 'medium';
}> = [
  // Government IDs — high confidence (rarely used for non-PII purposes).
  { re: /^ssn$|social[_-]?security|^nin$|national[_-]?(?:identif|insurance|id)|^pesel$/i, label: 'national-id', confidence: 'high' },
  { re: /^passport[_-]?(?:no|num|number|id)?$|passport[_-]?number/i, label: 'passport', confidence: 'high' },
  { re: /driver[_-]?(?:s)?[_-]?licen[cs]e|^dl[_-]?(?:no|num|number)$/i, label: 'driver-licence', confidence: 'high' },
  { re: /tax[_-]?(?:id|payer[_-]?id|file[_-]?number)|^itin$|^tin$|^vat[_-]?(?:id|number)$/i, label: 'tax-id', confidence: 'high' },

  // Financial — high confidence.
  { re: /credit[_-]?card[_-]?(?:no|num|number|cvv|cvc)?|card[_-]?number|^ccnum$|^pan$/i, label: 'credit-card', confidence: 'high' },
  { re: /bank[_-]?account[_-]?(?:no|num|number)?|account[_-]?number|^iban$|^swift$|^bic$|routing[_-]?(?:no|num|number)/i, label: 'bank-account', confidence: 'high' },

  // Direct-PII — high confidence.
  { re: /^dob$|date[_-]?of[_-]?birth|^birthdate$|birth[_-]?date/i, label: 'date-of-birth', confidence: 'high' },
  { re: /^ip[_-]?addr(?:ess)?$|client[_-]?ip$|user[_-]?ip$|remote[_-]?ip$/i, label: 'ip-address', confidence: 'high' },
  { re: /home[_-]?address|street[_-]?address|residential[_-]?address|^postcode$|^zipcode$|^postal[_-]?code$/i, label: 'home-address', confidence: 'high' },
  { re: /geo[_-]?location|^lat[_-]?lng$|^latitude$|^longitude$/i, label: 'geo-location', confidence: 'medium' },

  // Contact — medium confidence (legitimate as search filters in some cases).
  { re: /^email(?:[_-]?address)?$|personal[_-]?email|contact[_-]?email/i, label: 'email', confidence: 'medium' },
  { re: /^phone(?:[_-]?(?:no|num|number))?$|mobile[_-]?(?:no|num|number)|^msisdn$|cell[_-]?phone/i, label: 'phone', confidence: 'medium' },
  { re: /full[_-]?name|^firstname$|first[_-]?name|^lastname$|last[_-]?name|^surname$|maiden[_-]?name/i, label: 'full-name', confidence: 'medium' },

  // Biometric / sensitive.
  { re: /biometric|fingerprint|face[_-]?(?:id|print|encoding)|voice[_-]?print/i, label: 'biometric', confidence: 'high' },
];

// =============================================================================
// 2. PHI field-name catalog (L6-3) — HIPAA conservative
// =============================================================================

/**
 * Patterns that strongly suggest Protected Health Information per HIPAA
 * Privacy Rule §164.514(b)(2)(i) "18 identifiers". Conservative — we only
 * keep patterns that have low false-positive rate outside health-domain APIs.
 *
 * NOTE: many of these overlap with PII; the L6-3 rule fires only when the
 * pattern matches AND no data-class annotation exists anywhere in the spec
 * (see DATA_CLASS_VENDOR_EXTENSIONS).
 */
export const PHI_FIELD_NAME_PATTERNS: ReadonlyArray<{ re: RegExp; label: string }> = [
  { re: /medical[_-]?record[_-]?(?:no|num|number|id)?|^mrn$|patient[_-]?record/i, label: 'medical-record-number' },
  { re: /^diagnosis$|diagnosis[_-]?code|^icd[_-]?(?:9|10|11)?[_-]?code$/i, label: 'diagnosis-code' },
  { re: /health[_-]?(?:plan|record|insurance)[_-]?(?:no|num|number|id)?|insurance[_-]?member[_-]?id/i, label: 'health-insurance-id' },
  { re: /prescription[_-]?(?:id|number|rx)|^rx[_-]?number$|medication[_-]?order/i, label: 'prescription' },
  { re: /^npi$|provider[_-]?npi|national[_-]?provider[_-]?identifier/i, label: 'npi' },
  { re: /patient[_-]?(?:id|name|dob)|^phi[_-]/i, label: 'patient-identifier' },
  { re: /lab[_-]?result|test[_-]?result|specimen[_-]?id|^cpt[_-]?code$/i, label: 'lab-result' },
  { re: /clinical[_-]?(?:note|finding|observation)|treatment[_-]?(?:note|plan)/i, label: 'clinical-note' },
];

// =============================================================================
// 3. Data-class vendor-extension catalog (L6-2 + L6-3 gate)
// =============================================================================

/**
 * Vendor-extension keys recognised as data-classification annotations. Used
 * by L6-2 (positive marker) and L6-3 (gating: presence of any of these
 * disables the HIPAA heuristic).
 */
export const DATA_CLASS_VENDOR_EXTENSIONS: ReadonlySet<string> = new Set([
  'x-pii',
  'x-pii-tag',
  'x-pii-fields',
  'x-data-class',
  'x-data-classification',
  'x-data-sensitivity',
  'x-redact-in-audit',
  'x-redact-in-logs',
  'x-phi',
  'x-phi-tag',
  'x-pci',
  'x-pci-tag',
  'x-gdpr',
  'x-gdpr-class',
  'x-sensitive',
  'x-confidential',
]);

// =============================================================================
// 4. Helpers
// =============================================================================

/** Check whether a parameter-name matches any PII pattern. */
function matchPiiName(name: string): { label: string; confidence: 'high' | 'medium' } | null {
  for (const p of PII_FIELD_NAME_PATTERNS) {
    if (p.re.test(name)) {
      return { label: p.label, confidence: p.confidence };
    }
  }
  return null;
}

/** Check whether a field-name matches any PHI pattern. */
function matchPhiName(name: string): string | null {
  for (const p of PHI_FIELD_NAME_PATTERNS) {
    if (p.re.test(name)) return p.label;
  }
  return null;
}

/**
 * Recursively walk the spec object and collect:
 *   - every key beginning with `x-` that matches DATA_CLASS_VENDOR_EXTENSIONS
 *   - every property-name nested under `properties` (component schemas + inline)
 *
 * Returns the count of data-class annotations + the set of property-names
 * encountered. Cycle-safe via WeakSet.
 */
interface SpecScanResult {
  dataClassAnnotations: Array<{ key: string; pointer: string; value: unknown }>;
  propertyNames: Array<{ name: string; pointer: string }>;
}

function scanSpec(spec: object): SpecScanResult {
  const result: SpecScanResult = {
    dataClassAnnotations: [],
    propertyNames: [],
  };
  const seen = new WeakSet<object>();

  function rec(node: unknown, pointer: string, parentKey: string | null): void {
    if (!node || typeof node !== 'object') return;
    if (seen.has(node as object)) return;
    seen.add(node as object);

    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        rec(node[i], pointer + '/' + i, null);
      }
      return;
    }

    const obj = node as Record<string, unknown>;
    for (const [k, v] of Object.entries(obj)) {
      const childPtr = pointer + '/' + escapePointer(k);

      if (k.startsWith('x-') && DATA_CLASS_VENDOR_EXTENSIONS.has(k.toLowerCase())) {
        result.dataClassAnnotations.push({ key: k, pointer: childPtr, value: v });
      }

      // Collect property-names: any key whose parent is `properties` is a
      // schema property-name.
      if (parentKey === 'properties') {
        result.propertyNames.push({ name: k, pointer: childPtr });
      }

      rec(v, childPtr, k);
    }
  }

  rec(spec, '', null);
  return result;
}

function escapePointer(s: string): string {
  return s.replace(/~/g, '~0').replace(/\//g, '~1');
}

interface ParamHit {
  paramName: string;
  paramIn: 'path' | 'query';
  label: string;
  confidence: 'high' | 'medium';
  path: string;
  method: string;
  pointer: string;
}

/**
 * Collect PII-named path/query parameters across all operations.
 * Considers both operation-level and path-item-level parameters.
 */
function collectPiiNamedParams(spec: object): ParamHit[] {
  const out: ParamHit[] = [];
  for (const { path, method, operation, pathItem } of walkOperations(spec)) {
    const escPath = escapePointer(path);
    // Path-item level parameters (shared across methods).
    const piParams = pathItem.parameters;
    if (Array.isArray(piParams)) {
      for (let i = 0; i < piParams.length; i++) {
        const hit = checkParam(
          piParams[i],
          path,
          method,
          `/paths/${escPath}/parameters/${i}`
        );
        if (hit) out.push(hit);
      }
    }
    const opParams = operation.parameters;
    if (Array.isArray(opParams)) {
      for (let i = 0; i < opParams.length; i++) {
        const hit = checkParam(
          opParams[i],
          path,
          method,
          `/paths/${escPath}/${method}/parameters/${i}`
        );
        if (hit) out.push(hit);
      }
    }
  }
  return out;
}

function checkParam(
  raw: unknown,
  path: string,
  method: string,
  pointer: string
): ParamHit | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  if (p.in !== 'path' && p.in !== 'query') return null;
  if (typeof p.name !== 'string') return null;
  const match = matchPiiName(p.name);
  if (!match) return null;
  return {
    paramName: p.name,
    paramIn: p.in,
    label: match.label,
    confidence: match.confidence,
    path,
    method,
    pointer,
  };
}

// =============================================================================
// 5. Rule-metadata builders (Round-2 schema tagging)
// =============================================================================

function metaL6_1(severity: 'warn' | 'hint'): RuleMetadata {
  return validateMetadata({
    severity,
    // Cross-tagged Privacy + Threat per Round-2 Mining-Phase-A: leakage of
    // PII via URLs is both a privacy concern (regulatory classification) and
    // a threat-modelling concern (logged-secret variant).
    lenses: ['privacy-data-class', 'threat-modeling'],
    sources: [
      { type: 'vendor', name: 'OWASP-API3' },
      { type: 'mining', phase: 'round2', subagent: 'privacy-data-class' },
    ],
    codegenTargets: ['*'],
    stakeholders: ['security', 'end-user', 'spec-author'],
    lifecyclePhase: 'documentation-time',
    defectClass: 'semantic',
    iso25010: 'security',
    priority: 'P2',
    patternId: 'L6-1',
  });
}

function metaL6_2(): RuleMetadata {
  return validateMetadata({
    severity: 'info',
    lenses: ['privacy-data-class'],
    sources: [
      { type: 'vendor', name: 'cloudflare-audit-redaction' },
      { type: 'mining', phase: 'round2', subagent: 'privacy-data-class' },
    ],
    codegenTargets: ['*'],
    stakeholders: ['security', 'spec-author'],
    lifecyclePhase: 'documentation-time',
    defectClass: 'semantic',
    iso25010: 'security',
    priority: 'P5',
    patternId: 'L6-2',
  });
}

function metaL6_3(): RuleMetadata {
  return validateMetadata({
    severity: 'hint',
    lenses: ['privacy-data-class'],
    sources: [
      { type: 'vendor', name: 'HIPAA-§164.514' },
      { type: 'vendor', name: 'OWASP-API3' },
      { type: 'mining', phase: 'round2', subagent: 'privacy-data-class' },
    ],
    codegenTargets: ['*'],
    stakeholders: ['security', 'spec-author'],
    lifecyclePhase: 'documentation-time',
    defectClass: 'semantic',
    iso25010: 'security',
    priority: 'P3',
    patternId: 'L6-3',
  });
}

function metaL6_4(): RuleMetadata {
  return validateMetadata({
    severity: 'info',
    lenses: ['privacy-data-class', 'threat-modeling'],
    sources: [
      { type: 'mining', phase: 'round2', subagent: 'privacy-data-class' },
    ],
    codegenTargets: ['*'],
    stakeholders: ['security', 'spec-author'],
    lifecyclePhase: 'documentation-time',
    defectClass: 'semantic',
    iso25010: 'security',
    priority: 'P2',
    patternId: 'L6-4',
  });
}

// =============================================================================
// 6. Walker
// =============================================================================

export async function walkPrivacyDataClass(
  spec: object,
  _opts?: DetectorOptions
): Promise<DetectorFinding[]> {
  const findings: DetectorFinding[] = [];
  const scan = scanSpec(spec);
  const hasDataClassAnnotation = scan.dataClassAnnotations.length > 0;

  // ---- L6-1 — PII-named path/query params -----------------------------------
  const piiHits = collectPiiNamedParams(spec);
  if (piiHits.length > 0) {
    // Split high vs medium confidence; emit one finding per confidence tier
    // so that high-confidence PII gets a warn while medium gets a hint.
    const highHits = piiHits.filter((h) => h.confidence === 'high');
    const medHits = piiHits.filter((h) => h.confidence === 'medium');

    if (highHits.length > 0) {
      findings.push(buildL6_1Finding(highHits, 'warn'));
    }
    if (medHits.length > 0) {
      findings.push(buildL6_1Finding(medHits, 'hint'));
    }
  }

  // ---- L6-2 — vendor-extension positive marker (info) -----------------------
  if (hasDataClassAnnotation) {
    const distinctKeys = Array.from(
      new Set(scan.dataClassAnnotations.map((a) => a.key.toLowerCase()))
    ).sort();
    findings.push({
      detectorId: 'walker:privacy-data-class:l6-2',
      layer: 'walker-statistical',
      title:
        `Data-classification annotations present (${scan.dataClassAnnotations.length} occurrence(s) ` +
        `of ${distinctKeys.length} extension key(s))`,
      narration:
        `The spec carries ${scan.dataClassAnnotations.length} data-classification vendor-extension ` +
        `annotation(s) across ${distinctKeys.length} distinct key(s): ` +
        distinctKeys.slice(0, 6).map((k) => '`' + k + '`').join(', ') +
        (distinctKeys.length > 6 ? ` (and ${distinctKeys.length - 6} more)` : '') + '. ' +
        'This is a **positive marker**: the spec author has applied explicit data-classification ' +
        'discipline (Cloudflare-style audit-redaction, OAI-#2190 PII-tagging, or similar). ' +
        'No action required — emitted as info-tier observation so downstream tooling (audit-log ' +
        'redactors, GDPR data-mapping reports, AI-agents that need consent-aware-handling) can ' +
        'recognise the annotations.',
      rationale:
        'GDPR Art. 30 (records of processing activities) and ISO/IEC 27001 A.8 (asset ' +
        'classification) both require organisations to identify which fields carry regulated ' +
        'data. Spec-level annotations make this machine-readable and allow tooling to enforce ' +
        'redaction / consent / retention policies automatically.',
      category: 'design',
      severity: 'low',
      scope: 'spec',
      affectedEndpoints: [],
      patchOps: [],
      patchSummary:
        'No action required — data-classification annotations detected; observation emitted for ' +
        'downstream tooling.',
      meta: {
        ruleMetadata: metaL6_2(),
        annotationCount: scan.dataClassAnnotations.length,
        distinctKeys,
        examplePointers: scan.dataClassAnnotations.slice(0, 5).map((a) => a.pointer),
      },
    });
  }

  // ---- L6-3 — HIPAA-relevance heuristic (conservative) ----------------------
  // Only fire when we see strong PHI-shape AND no data-class annotation
  // anywhere AND we cleared a minimum-evidence threshold (>= 2 distinct PHI-
  // shaped property names — one alone is too noisy).
  if (!hasDataClassAnnotation) {
    const phiHitsByLabel = new Map<string, Array<{ name: string; pointer: string }>>();
    for (const p of scan.propertyNames) {
      const label = matchPhiName(p.name);
      if (!label) continue;
      const arr = phiHitsByLabel.get(label) ?? [];
      arr.push(p);
      phiHitsByLabel.set(label, arr);
    }
    if (phiHitsByLabel.size >= 2) {
      const flatHits = Array.from(phiHitsByLabel.entries()).flatMap(([label, hits]) =>
        hits.map((h) => ({ label, name: h.name, pointer: h.pointer }))
      );
      const labels = Array.from(phiHitsByLabel.keys()).sort();
      const examples = flatHits.slice(0, 5).map((h) => `\`${h.name}\` (${h.label})`).join(', ');
      findings.push({
        detectorId: 'walker:privacy-data-class:l6-3',
        layer: 'walker-statistical',
        title:
          `${flatHits.length} field-name(s) shape-match Protected Health Information (HIPAA), but ` +
          `no data-class annotation found anywhere in the spec`,
        narration:
          `Detected ${flatHits.length} field(s) across ${phiHitsByLabel.size} PHI-shape categor` +
          `${phiHitsByLabel.size === 1 ? 'y' : 'ies'} (${labels.join(', ')}). Examples: ${examples}. The spec carries no ` +
          '`x-pii` / `x-data-class` / `x-phi` annotations anywhere, so no data-classification ' +
          'discipline is visible to downstream tooling. ' +
          '**This rule has high false-positive risk in non-health domains** — a `diagnosis` ' +
          'field in an automotive-fault-codes API is not PHI, a `patient` field in a veterinary ' +
          'API is not human-PHI. Dismiss with one ruleset override line if your domain is not ' +
          'health-care. If your domain IS health-care, add `x-data-class: PHI` annotations ' +
          'on the affected schemas/properties so audit-log redactors and consent tooling can ' +
          'recognise them.',
        rationale:
          'HIPAA Privacy Rule §164.514(b)(2)(i) enumerates 18 PHI identifiers including ' +
          'medical-record numbers, account numbers, treatment dates, biometric identifiers. ' +
          'Spec-level annotation lets covered entities prove §164.514(d) minimum-necessary ' +
          'compliance via static analysis instead of runtime inspection.',
        category: 'risk',
        severity: 'low',
        scope: 'spec',
        affectedEndpoints: [],
        patchOps: [],
        patchSummary:
          `Consider adding \`x-data-class: PHI\` annotations on the ${flatHits.length} ` +
          `PHI-shaped field(s); or add \`x-data-class: not-applicable\` at info-level if this ` +
          `is a non-health domain.`,
        meta: {
          ruleMetadata: metaL6_3(),
          phiHitCount: flatHits.length,
          phiCategories: labels,
          examplePointers: flatHits.slice(0, 5).map((h) => h.pointer),
        },
      });
    }
  }

  // ---- L6-4 — cross-reference to secret-scanner (info) ----------------------
  // We never emit L6-4 unconditionally. The secret-scanner module is the
  // authoritative source for PII-in-default-values. We only emit a brief
  // info-tier marker IF the user runs the privacy walker standalone (without
  // running the full deterministic-layer index): in that case we point them
  // to the secret-scanner so they don't miss the coverage.
  //
  // The discriminator: when run as part of `runWalkers()` (via index.ts), the
  // secret-scanner has already run, and the privacy walker stays quiet. When
  // run standalone (the CLI below), we emit the cross-reference. The walker-
  // index.ts caller does not pass a flag for this; we therefore emit the
  // cross-ref always but tag it `severity: low` + meta.crossRef so the UI
  // can choose to suppress when secret-scanner findings are present.
  findings.push({
    detectorId: 'walker:privacy-data-class:l6-4-crossref',
    layer: 'walker-statistical',
    title: 'Cross-reference: PII in default/example values is covered by secret-scanner module',
    narration:
      'L6-4 (PII patterns in `default` / `example` / `examples-map` / `description` value-sites) ' +
      'is covered by the **secret-scanner** module (`scripts/spike/deterministic/secret-scanner.ts`), ' +
      'which applies the TruffleHog + Gitleaks PII-pattern catalog (SSN, Luhn-validated credit-card, ' +
      'real-looking emails filtered by RFC-2606 reserved domains, US passport context-tag) plus the ' +
      'confirmed-secret catalog. Findings from secret-scanner that match a PII pattern are tagged ' +
      'with `lens: privacy-data-class` AND `lens: threat-modeling` so they appear under the Privacy ' +
      'filter as well as the Security filter. This walker emits this info-tier marker for ' +
      'auditability — see secret-scanner findings for actual PII-in-defaults occurrences. ' +
      'Cross-tag re-tag for TM-A15 (PII-named-fields-in-responses) is also resident in secret-scanner.',
    rationale:
      'Avoiding double-emission keeps the UI clean: one concern → one finding. The cross-tag is ' +
      'preserved at the rule-metadata level so Lens-6 filtering still surfaces secret-scanner ' +
      'PII findings under Privacy.',
    category: 'design',
    severity: 'low',
    scope: 'spec',
    affectedEndpoints: [],
    patchOps: [],
    patchSummary:
      'No action required — cross-reference marker pointing at the secret-scanner module for ' +
      'L6-4 + TM-A15 coverage.',
    meta: {
      ruleMetadata: metaL6_4(),
      crossRefModule: 'secret-scanner',
      crossRefPatterns: ['L6-4', 'TM-A15'],
    },
  });

  return findings;
}

function buildL6_1Finding(hits: ParamHit[], severity: 'warn' | 'hint'): DetectorFinding {
  const distinctLabels = Array.from(new Set(hits.map((h) => h.label))).sort();
  const examplePtrs = hits.slice(0, 5).map((h) => h.pointer);
  const examples = hits
    .slice(0, 5)
    .map((h) => `${h.method.toUpperCase()} ${h.path} param \`${h.paramName}\` (in ${h.paramIn}, ${h.label})`)
    .join('; ');
  const moreSuffix = hits.length > 5 ? ` (and ${hits.length - 5} more)` : '';

  // LLM-finding-severity mapping: warn -> high (privacy issue at warn-tier
  // matches the secret-scanner PII tier); hint -> medium (medium-confidence
  // shape, encourages review without escalation).
  const llmSeverity: 'critical' | 'high' | 'medium' | 'low' =
    severity === 'warn' ? 'high' : 'medium';

  return {
    detectorId: 'walker:privacy-data-class:l6-1' + (severity === 'hint' ? '-medium-conf' : ''),
    layer: 'walker-statistical',
    title:
      `${hits.length} path/query parameter(s) carry PII-shaped name(s) ` +
      `(${distinctLabels.join(', ')}) — leakage in URLs / logs / Referer headers`,
    narration:
      `Detected ${hits.length} parameter(s) across ${new Set(hits.map((h) => h.path)).size} path(s) ` +
      `with PII-shaped names: ${examples}${moreSuffix}. ` +
      'Path and query parameters appear in URLs which are logged by every server, proxy, CDN, ' +
      'and analytics tool the request passes through; they leak via the `Referer` header to ' +
      'every third-party resource embedded on a successful response page; they show up in ' +
      'browser history and bookmark bars; they are emitted to error-reporting tools verbatim. ' +
      'GDPR Art. 5(1)(c) data-minimisation and Art. 32 (security of processing) both treat ' +
      'URL-leaked PII as a data-breach vector. The CCPA section 1798.140 definition of ' +
      'personal information explicitly includes geolocation, biometric identifiers, and ' +
      'government-issued IDs — none of which should appear in a URL. Consider moving these ' +
      'parameters into the request body (POST / PUT / PATCH) or replacing the personal ' +
      'identifier with an opaque resource-id mapped server-side.',
    rationale:
      'OWASP API Security Top 10 (2023) API3 (Excessive Data Exposure) and OWASP Authentication ' +
      'Cheat-Sheet §"sensitive-information-in-URL" both flag PII / sensitive-data in URLs as ' +
      'an anti-pattern independent of the authentication context. RFC 9110 §17.9 ("Sensitive ' +
      'Information in URIs") specifically warns that "URIs are frequently displayed by browsers, ' +
      'stored in clear text bookmarks, and logged by user agent history features" and recommends ' +
      'POST + body for any sensitive parameter.',
    category: 'risk',
    severity: llmSeverity,
    scope: 'endpoint',
    affectedEndpoints: hits.map((h) => ({ path: h.path, method: h.method })),
    patchOps: [],
    patchSummary:
      `Move ${hits.length} PII-shaped parameter(s) from path/query into request body, or ` +
      `replace personal identifiers with opaque server-mapped resource-IDs.`,
    meta: {
      ruleMetadata: metaL6_1(severity),
      hitCount: hits.length,
      distinctLabels,
      confidence: severity === 'warn' ? 'high' : 'medium',
      examplePointers: examplePtrs,
    },
  };
}

// =============================================================================
// 7. CLI
// =============================================================================

async function main(): Promise<void> {
  const path = await import('node:path');
  const fs = await import('node:fs');
  const { fileURLToPath } = await import('node:url');

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const SPIKE_DIR = path.resolve(__dirname, '..', '..');
  const REPO_ROOT = path.resolve(SPIKE_DIR, '..', '..');
  const EXAMPLES_DIR = path.join(REPO_ROOT, 'openapi-examples');

  const specName = process.argv[2];
  if (!specName) {
    console.error('Usage: tsx deterministic/walkers/privacy-data-class.ts <spec-name>');
    console.error('  e.g. tsx deterministic/walkers/privacy-data-class.ts stripe-full');
    process.exit(1);
  }

  const specDir = path.join(EXAMPLES_DIR, specName);
  if (!fs.existsSync(specDir)) {
    console.error('Spec directory not found: ' + specDir);
    process.exit(1);
  }

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
  const startedAt = Date.now();
  const findings = await walkPrivacyDataClass(spec, { specName });
  const durationMs = Date.now() - startedAt;
  console.log(
    'Ran in ' + durationMs + 'ms — emitted ' + findings.length + ' finding(s).'
  );
  console.log('');
  for (const f of findings) {
    console.log('[' + f.detectorId + '] (' + f.severity + ')');
    console.log('  title: ' + f.title);
    if (f.affectedEndpoints.length > 0) {
      console.log('  affectedEndpoints: ' + f.affectedEndpoints.length);
    }
    if (f.meta) {
      const summary: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(f.meta)) {
        if (k === 'ruleMetadata') continue;
        summary[k] = v;
      }
      console.log('  meta:  ' + JSON.stringify(summary));
    }
    console.log('');
  }
}

{
  const { pathToFileURL } = await import('node:url');
  if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
    main().catch((err) => {
      console.error(err);
      process.exit(1);
    });
  }
}
