import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadReferenceTarget } from '../../eval/reference.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURE_DIR = path.resolve(__dirname, '..', '__fixtures__');
const SAMPLE_JSON = path.join(FIXTURE_DIR, 'sample-reference.json');
const MALFORMED_JSON = path.join(FIXTURE_DIR, 'malformed-reference.json');
const SAMPLE_TXT = path.join(FIXTURE_DIR, 'sample.txt');

// Repo-root anchor is …/scripts/spike/__tests__/eval → up 4 levels.
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const LEGACY_MD = path.join(
  REPO_ROOT,
  'openapi-examples',
  'stripe-full',
  'reference',
  'findings-target-big.md'
);

describe('loadReferenceTarget — JSON path', () => {
  it('returns a ReferenceTarget with classification tags populated', () => {
    const ref = loadReferenceTarget(SAMPLE_JSON);
    expect(ref.spec).toBe('test-spec');
    expect(ref.findings).toHaveLength(2);
    const f1 = ref.findings.find((f) => f.id === 'F1')!;
    // Classification tags must be the bool/array/string types defined in the schema.
    expect(typeof f1.classification.isLintFlavoured).toBe('boolean');
    expect(typeof f1.classification.isKnowledgeBackedGap).toBe('boolean');
    expect(typeof f1.classification.isPureSpectralDetectable).toBe('boolean');
    expect(typeof f1.classification.isDomainKnowledgeDetectable).toBe('boolean');
    expect(Array.isArray(f1.classification.narrationKeywords)).toBe(true);
    expect(f1.classification.isLintFlavoured).toBe(true);
    expect(f1.classification.isPureSpectralDetectable).toBe(true);
  });

  it('handles a finding with expectedClusterKey and narrationKeywords', () => {
    const ref = loadReferenceTarget(SAMPLE_JSON);
    const f2 = ref.findings.find((f) => f.id === 'F2')!;
    expect(f2.classification.expectedClusterKey).toBe('missing 429 response');
    expect(f2.classification.narrationKeywords).toContain('429');
    expect(f2.classification.narrationKeywords.length).toBeGreaterThan(0);
  });
});

describe('loadReferenceTarget — legacy markdown path', () => {
  it('returns a ReferenceTarget where every finding has classification all-false', () => {
    const ref = loadReferenceTarget(LEGACY_MD);
    expect(ref.findings.length).toBeGreaterThan(0);
    for (const f of ref.findings) {
      expect(f.classification.isLintFlavoured).toBe(false);
      expect(f.classification.isKnowledgeBackedGap).toBe(false);
      expect(f.classification.isPureSpectralDetectable).toBe(false);
      expect(f.classification.isDomainKnowledgeDetectable).toBe(false);
      expect(f.classification.narrationKeywords).toEqual([]);
      expect(f.classification.expectedClusterKey).toBeNull();
    }
  });
});

describe('loadReferenceTarget — error paths', () => {
  it('throws a clear error on an unsupported extension', () => {
    expect(() => loadReferenceTarget(SAMPLE_TXT)).toThrow(
      /Unsupported reference-target extension/
    );
  });

  it('throws a zod validation error on malformed JSON', () => {
    expect(() => loadReferenceTarget(MALFORMED_JSON)).toThrow();
  });
});
