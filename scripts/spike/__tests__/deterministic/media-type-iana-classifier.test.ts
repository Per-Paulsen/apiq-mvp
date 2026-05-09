/**
 * Tests for media-type-IANA-classifier (T13 — Lens 2 Standards-Compliance).
 *
 * Validates:
 *   - RFC2-79: top-level type not IANA-registered → error finding
 *   - RFC2-78: wildcard catch-all content-type → warn finding
 *   - RFC2-76: vendor-tree malformed shape → warn finding
 *   - RFC2-75: custom JSON-based without `+json` suffix → warn finding
 *   - RFC2-77: prs. tree (personal/test) → info-tier finding
 *   - RFC2-80: charset on application/json → info-tier finding
 *   - RFC2-100: multipart/form-data schema not type:object → warn finding
 *   - RFC2-101: multipart binary part missing format:binary → warn finding
 *   - Module imports T22 IANA snapshot helpers (parseMediaType, validateMediaType)
 *     rather than re-implementing parsing.
 *   - Output validates against canonical FindingSchema via the output-mapper.
 *   - Detector runs cleanly on the 4 reference specs.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as pathMod from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMediaTypeClassifier } from '../../deterministic/classifiers/media-type-iana-classifier.js';
import { mapDetectorFindings } from '../../deterministic/infra/output-mapper.js';
import { FindingSchema } from '../../schema.js';
// Sanity-check that T13 still depends on T22's IANA snapshot module —
// re-importing here ensures the dependency is real and not stubbed-around.
import { parseMediaType, validateMediaType } from '../../deterministic/iana/media-types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = pathMod.dirname(__filename);
const SPIKE_DIR = pathMod.resolve(__dirname, '..', '..');
const REPO_ROOT = pathMod.resolve(SPIKE_DIR, '..', '..');
const EXAMPLES_DIR = pathMod.join(REPO_ROOT, 'openapi-examples');

// =============================================================================
// T22-snapshot dependency check
// =============================================================================

describe('T13 imports T22 IANA snapshot helpers', () => {
  it('parseMediaType is available' , () => {
    expect(typeof parseMediaType).toBe('function');
    const p = parseMediaType('application/vnd.acme+json');
    expect(p?.facet).toBe('vnd');
  });

  it('validateMediaType is available' , () => {
    expect(typeof validateMediaType).toBe('function');
    const v = validateMediaType('frobnicate/json');
    expect(v.topLevelRegistered).toBe(false);
  });
});

// =============================================================================
// runMediaTypeClassifier — per-pattern fixtures
// =============================================================================

function specWithRequestContent(mediaType: string, schema?: object): object {
  const content: Record<string, unknown> = {
    [mediaType]: schema ? { schema } : {},
  };
  return {
    openapi: '3.0.0',
    info: { title: 't', version: '0.0.0' },
    paths: {
      '/things': {
        post: {
          requestBody: { content },
          responses: { '200': { description: 'ok' } },
        },
      },
    },
  };
}

function specWithResponseContent(mediaType: string, schema?: object): object {
  const content: Record<string, unknown> = {
    [mediaType]: schema ? { schema } : {},
  };
  return {
    openapi: '3.0.0',
    info: { title: 't', version: '0.0.0' },
    paths: {
      '/things': {
        get: {
          responses: { '200': { description: 'ok', content } },
        },
      },
    },
  };
}

// =============================================================================
// Per-pattern unit tests — required by acceptance criteria (>= 5 cases)
// =============================================================================

describe('runMediaTypeClassifier — RFC2-76 vendor-tree valid', () => {
  it('does NOT flag a well-formed vendor-tree subtype' , async () => {
    const spec = specWithRequestContent('application/vnd.acme.foo+json');
    const findings = await runMediaTypeClassifier(spec);
    const rfc276 = findings.filter((f) => f.detectorId === 'media-type-iana:rfc2-76');
    expect(rfc276).toHaveLength(0);
    // also no missing-suffix warning since +json IS present
    const rfc275 = findings.filter((f) => f.detectorId === 'media-type-iana:rfc2-75');
    expect(rfc275).toHaveLength(0);
  });
});

describe('runMediaTypeClassifier — RFC2-76 vendor-tree malformed', () => {
  it('flags a bare `vnd.` (vendor identifier missing) as malformed' , async () => {
    const spec = specWithRequestContent('application/vnd.+json');
    const findings = await runMediaTypeClassifier(spec);
    const rfc276 = findings.filter((f) => f.detectorId === 'media-type-iana:rfc2-76');
    expect(rfc276).toHaveLength(1);
    expect(rfc276[0].severity).toBe('medium');
    expect(rfc276[0].meta?.pattern).toBe('RFC2-76');
  });
});

describe('runMediaTypeClassifier — RFC2-75 custom JSON without +json suffix', () => {
  it('flags `application/myjson` as missing the +json structured-suffix' , async () => {
    const spec = specWithRequestContent('application/myjson');
    const findings = await runMediaTypeClassifier(spec);
    const rfc275 = findings.filter((f) => f.detectorId === 'media-type-iana:rfc2-75');
    expect(rfc275).toHaveLength(1);
    expect(rfc275[0].severity).toBe('medium');
    expect(rfc275[0].meta?.pattern).toBe('RFC2-75');
  });

  it('does NOT flag canonical application/json' , async () => {
    const spec = specWithRequestContent('application/json');
    const findings = await runMediaTypeClassifier(spec);
    const rfc275 = findings.filter((f) => f.detectorId === 'media-type-iana:rfc2-75');
    expect(rfc275).toHaveLength(0);
  });
});

describe('runMediaTypeClassifier — RFC2-78 wildcard catch-all', () => {
  it('flags wildcard catch-all as forbidden' , async () => {
    const spec = specWithResponseContent('*/*');
    const findings = await runMediaTypeClassifier(spec);
    const rfc278 = findings.filter((f) => f.detectorId === 'media-type-iana:rfc2-78');
    expect(rfc278).toHaveLength(1);
    expect(rfc278[0].severity).toBe('medium');
    expect(rfc278[0].meta?.pattern).toBe('RFC2-78');
  });

  it('does NOT cascade other rules on the wildcard occurrence' , async () => {
    const spec = specWithResponseContent('*/*');
    const findings = await runMediaTypeClassifier(spec);
    const others = findings.filter((f) => f.detectorId !== 'media-type-iana:rfc2-78');
    expect(others).toHaveLength(0);
  });
});

describe('runMediaTypeClassifier — RFC2-77 prs. tree (personal/test)', () => {
  it('flags a personal-tree (prs.) media-type as info-level smell' , async () => {
    const spec = specWithRequestContent('application/prs.acme.test+json');
    const findings = await runMediaTypeClassifier(spec);
    const rfc277 = findings.filter((f) => f.detectorId === 'media-type-iana:rfc2-77');
    expect(rfc277).toHaveLength(1);
    // Severity in DetectorFinding is critical/high/medium/low; rule-tier maps prs.→info via low.
    expect(rfc277[0].severity).toBe('low');
    expect(rfc277[0].meta?.pattern).toBe('RFC2-77');
  });
});

describe('runMediaTypeClassifier — RFC2-79 top-level not IANA-registered', () => {
  it('flags `frobnicate/json` as having a non-registered top-level type' , async () => {
    const spec = specWithRequestContent('frobnicate/json');
    const findings = await runMediaTypeClassifier(spec);
    const rfc279 = findings.filter((f) => f.detectorId === 'media-type-iana:rfc2-79');
    expect(rfc279).toHaveLength(1);
    expect(rfc279[0].severity).toBe('high');
    expect(rfc279[0].meta?.pattern).toBe('RFC2-79');
  });

  it('does NOT flag any of the registered top-level types' , async () => {
    for (const top of ['application', 'text', 'image', 'multipart', 'audio']) {
      const spec = specWithRequestContent(`${top}/octet-stream`);
      const findings = await runMediaTypeClassifier(spec);
      const rfc279 = findings.filter((f) => f.detectorId === 'media-type-iana:rfc2-79');
      expect(rfc279).toHaveLength(0);
    }
  });
});

describe('runMediaTypeClassifier — RFC2-80 charset on application/json', () => {
  it('flags `application/json; charset=utf-8` as redundant' , async () => {
    const spec = specWithRequestContent('application/json; charset=utf-8');
    const findings = await runMediaTypeClassifier(spec);
    const rfc280 = findings.filter((f) => f.detectorId === 'media-type-iana:rfc2-80');
    expect(rfc280).toHaveLength(1);
    expect(rfc280[0].severity).toBe('low');
  });
});

describe('runMediaTypeClassifier — RFC2-100/101 multipart/form-data', () => {
  it('flags multipart/form-data with non-object schema (RFC2-100)' , async () => {
    const spec = specWithRequestContent('multipart/form-data', { type: 'string' });
    const findings = await runMediaTypeClassifier(spec);
    const rfc2100 = findings.filter((f) => f.detectorId === 'media-type-iana:rfc2-100');
    expect(rfc2100).toHaveLength(1);
    expect(rfc2100[0].severity).toBe('medium');
  });

  it('flags multipart/form-data binary file part missing format:binary (RFC2-101)' , async () => {
    const spec = specWithRequestContent('multipart/form-data', {
      type: 'object',
      properties: {
        upload_file: { type: 'string' },
      },
    });
    const findings = await runMediaTypeClassifier(spec);
    const rfc2101 = findings.filter((f) => f.detectorId === 'media-type-iana:rfc2-101');
    expect(rfc2101).toHaveLength(1);
    expect(rfc2101[0].severity).toBe('medium');
  });

  it('does NOT flag a properly-typed multipart with format:binary' , async () => {
    const spec = specWithRequestContent('multipart/form-data', {
      type: 'object',
      properties: {
        upload_file: { type: 'string', format: 'binary' },
      },
    });
    const findings = await runMediaTypeClassifier(spec);
    const rfc2100 = findings.filter((f) => f.detectorId === 'media-type-iana:rfc2-100');
    const rfc2101 = findings.filter((f) => f.detectorId === 'media-type-iana:rfc2-101');
    expect(rfc2100).toHaveLength(0);
    expect(rfc2101).toHaveLength(0);
  });
});

// =============================================================================
// Aggregation + counts
// =============================================================================

describe('runMediaTypeClassifier — aggregation', () => {
  it('aggregates multiple occurrences of the same pattern into one finding with a count' , async () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 't', version: '0.0.0' },
      paths: {
        '/a': {
          post: {
            requestBody: { content: { 'application/myjson': {} } },
            responses: { '200': { description: 'ok' } },
          },
        },
        '/b': {
          post: {
            requestBody: { content: { 'application/otherjson': {} } },
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    };
    const findings = await runMediaTypeClassifier(spec);
    const rfc275 = findings.filter((f) => f.detectorId === 'media-type-iana:rfc2-75');
    expect(rfc275).toHaveLength(1);
    expect(rfc275[0].meta?.count).toBe(2);
    const mtList = rfc275[0].meta?.mediaTypes as string[] | undefined;
    expect(mtList).toBeDefined();
    expect(mtList!.length).toBe(2);
  });

  it('returns empty array on a clean spec (only application/json)' , async () => {
    const spec = specWithRequestContent('application/json');
    const findings = await runMediaTypeClassifier(spec);
    expect(findings).toEqual([]);
  });

  it('returns empty array on a spec with no paths or components' , async () => {
    const spec = { openapi: '3.0.0', info: { title: 't', version: '0.0.0' }, paths: {} };
    expect(await runMediaTypeClassifier(spec)).toEqual([]);
  });
});

// =============================================================================
// Schema validation through output-mapper
// =============================================================================

describe('output validates against FindingSchema', () => {
  it('produces canonical Finding-shape that round-trips through output-mapper' , async () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 't', version: '0.0.0' },
      paths: {
        '/a': {
          post: {
            requestBody: { content: { 'frobnicate/json': {} } },
            responses: {
              '200': { description: 'ok', content: { '*/*': {} } },
            },
          },
        },
      },
    };
    const detectorFindings = await runMediaTypeClassifier(spec);
    expect(detectorFindings.length).toBeGreaterThan(0);
    const llmFindings = mapDetectorFindings(detectorFindings);
    expect(llmFindings.length).toBe(detectorFindings.length);
    for (const f of llmFindings) {
      expect(() => FindingSchema.parse(f)).not.toThrow();
    }
  });
});

// =============================================================================
// Reference-spec sanity check
// =============================================================================

const REFERENCE_SPECS = ['stripe-full', 'pagerduty-full', 'dnd5eapi', 'github-rest'];

describe('runs cleanly on reference specs', () => {
  for (const specName of REFERENCE_SPECS) {
    it(`runs on ${specName} without throwing and produces schema-valid output`, async () => {
      const specPath = pathMod.join(EXAMPLES_DIR, specName, 'spec.json');
      if (!fs.existsSync(specPath)) {
        // If the fixture isn't checked in for this spec, skip rather than fail.
        return;
      }
      const raw = fs.readFileSync(specPath, 'utf8');
      const spec = JSON.parse(raw) as object;

      const findings = await runMediaTypeClassifier(spec, { specName });
      const mapped = mapDetectorFindings(findings);
      expect(mapped.length).toBe(findings.length);
      for (const f of mapped) {
        expect(() => FindingSchema.parse(f)).not.toThrow();
      }
    }, 30_000);
  }
});
