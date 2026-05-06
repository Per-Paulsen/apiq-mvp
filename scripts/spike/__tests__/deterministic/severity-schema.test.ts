/**
 * Tests for the Severity-Schema Final (Task T23 / #36).
 *
 * Coverage matrix:
 *   - Round-trip parse for each enum axis (Severity, Direction, Lens, Source,
 *     CodegenTarget, Stakeholder, LifecyclePhase, DefectClass, IsoIec25010,
 *     Priority).
 *   - Multi-lens patterns parse correctly.
 *   - All 10 lenses validate.
 *   - Invalid lens / severity / source-discriminator are rejected.
 *   - Legacy severity-only -> full RuleMetadata migration with conservative
 *     defaults + override-merging.
 *   - tagFinding() helper round-trips and applies defaults.
 *   - codegenTargets default applied when omitted.
 *   - FindingMetadata extends RuleMetadata correctly.
 */

import { describe, it, expect } from 'vitest';
import {
  SeveritySchema,
  SeverityDirectionSchema,
  LensSchema,
  RuleSourceSchema,
  CodegenTargetSchema,
  StakeholderSchema,
  LifecyclePhaseSchema,
  DefectClassSchema,
  IsoIec25010Schema,
  PrioritySchema,
  RuleMetadataSchema,
  FindingLocationSchema,
  LENS_TO_NUMBER,
  SEVERITY_DOCS,
  SEVERITY_DIRECTION_DOCS,
  PRIORITY_DOCS,
  DEFAULT_CODEGEN_TARGETS,
  validateMetadata,
  safeValidateMetadata,
  validateFindingMetadata,
  safeValidateFindingMetadata,
  tagFinding,
  migrateLegacyRule,
  type RuleMetadata,
  type FindingMetadata,
  type RuleMetadataInput,
  type Lens,
} from '../../deterministic/severity-schema.js';

// ---------------------------------------------------------------------------
// Test 1 — All atomic enums round-trip
// ---------------------------------------------------------------------------

describe('severity-schema atomic enums round-trip', () => {
  it('parses all 4 severity tiers', () => {
    expect(SeveritySchema.parse('error')).toBe('error');
    expect(SeveritySchema.parse('warn')).toBe('warn');
    expect(SeveritySchema.parse('hint')).toBe('hint');
    expect(SeveritySchema.parse('info')).toBe('info');
  });

  it('parses all 3 severity directions', () => {
    expect(SeverityDirectionSchema.parse('tighten')).toBe('tighten');
    expect(SeverityDirectionSchema.parse('loosen')).toBe('loosen');
    expect(SeverityDirectionSchema.parse('drift')).toBe('drift');
  });

  it('parses all 5 priority tiers + has docs for each', () => {
    for (const p of ['P1', 'P2', 'P3', 'P4', 'P5'] as const) {
      expect(PrioritySchema.parse(p)).toBe(p);
      expect(PRIORITY_DOCS[p]).toBeTruthy();
    }
  });

  it('parses all 10 codegen targets', () => {
    for (const t of ['*', 'java', 'go', 'python', 'typescript', 'rust', 'csharp', 'kotlin', 'php', 'ruby'] as const) {
      expect(CodegenTargetSchema.parse(t)).toBe(t);
    }
  });

  it('parses all 8 stakeholders', () => {
    for (const s of ['spec-author', 'client-dev', 'end-user', 'operations', 'security', 'codegen-tool', 'docs-tool', 'self'] as const) {
      expect(StakeholderSchema.parse(s)).toBe(s);
    }
  });

  it('parses all 8 lifecycle phases', () => {
    for (const lp of ['build-time', 'test-time', 'deploy-time', 'runtime-happy', 'runtime-edge', 'runtime-scale', 'evolution-time', 'documentation-time'] as const) {
      expect(LifecyclePhaseSchema.parse(lp)).toBe(lp);
    }
  });

  it('parses all 6 defect classes', () => {
    for (const d of ['syntax', 'semantic', 'norm', 'ergonomics', 'incompleteness', 'over-specification'] as const) {
      expect(DefectClassSchema.parse(d)).toBe(d);
    }
  });

  it('parses all 8 ISO/IEC 25010 characteristics', () => {
    for (const i of ['functional-suitability', 'performance-efficiency', 'compatibility', 'usability', 'reliability', 'security', 'maintainability', 'portability'] as const) {
      expect(IsoIec25010Schema.parse(i)).toBe(i);
    }
  });

  it('has documentation strings for every severity tier + direction', () => {
    expect(Object.keys(SEVERITY_DOCS)).toEqual(expect.arrayContaining(['error', 'warn', 'hint', 'info']));
    expect(Object.keys(SEVERITY_DIRECTION_DOCS)).toEqual(expect.arrayContaining(['tighten', 'loosen', 'drift']));
  });
});

// ---------------------------------------------------------------------------
// Test 2 — All 10 lenses validate + numeric mapping is exhaustive
// ---------------------------------------------------------------------------

describe('severity-schema 10-lens framework', () => {
  const ALL_LENSES: Lens[] = [
    'threat-modeling',
    'standards-compliance',
    'evolution-friction',
    'client-friction',
    'style-coherence',
    'privacy-data-class',
    'operations',
    'internal-consistency',
    'ai-agent-consumability',
    'operational-metadata',
  ];

  it('parses all 10 lens enum members', () => {
    for (const lens of ALL_LENSES) {
      expect(LensSchema.parse(lens)).toBe(lens);
    }
  });

  it('maps every lens to a unique number 1..10', () => {
    const numbers = ALL_LENSES.map(l => LENS_TO_NUMBER[l]);
    expect(numbers.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('rejects unknown lens', () => {
    const result = LensSchema.safeParse('fictional-lens');
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Test 3 — RuleSource discriminated-union covers all 6 source types
// ---------------------------------------------------------------------------

describe('severity-schema source-distinction', () => {
  it('parses RFC source with section', () => {
    const src = { type: 'rfc' as const, number: 9110, section: '15.5.6' };
    expect(RuleSourceSchema.parse(src)).toEqual(src);
  });

  it('parses BCP source with rfc reference', () => {
    const src = { type: 'bcp' as const, number: 240, rfc: 9700 };
    expect(RuleSourceSchema.parse(src)).toEqual(src);
  });

  it('parses ISO 25010 source', () => {
    const src = { type: 'iso' as const, standard: '25010' as const, characteristic: 'security' };
    expect(RuleSourceSchema.parse(src)).toEqual(src);
  });

  it('parses IANA-registry source', () => {
    const src = { type: 'iana-registry' as const, registry: 'http-status-codes' };
    expect(RuleSourceSchema.parse(src)).toEqual(src);
  });

  it('parses vendor source', () => {
    const src = { type: 'vendor' as const, name: 'Stripe' };
    expect(RuleSourceSchema.parse(src)).toEqual(src);
  });

  it('parses mining source with phase + subagent', () => {
    const src = { type: 'mining' as const, phase: 'round2' as const, subagent: 'phase-c-evolution' };
    expect(RuleSourceSchema.parse(src)).toEqual(src);
  });

  it('rejects unknown source type', () => {
    const result = RuleSourceSchema.safeParse({ type: 'tea-leaves', wisdom: 'great' });
    expect(result.success).toBe(false);
  });

  it('rejects RFC source with non-positive number', () => {
    const result = RuleSourceSchema.safeParse({ type: 'rfc', number: 0 });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Test 4 — Combined RuleMetadata round-trip + multi-lens
// ---------------------------------------------------------------------------

describe('severity-schema RuleMetadata round-trip + multi-lens', () => {
  it('parses a minimal valid RuleMetadata + applies codegenTargets default', () => {
    const input: RuleMetadataInput = {
      severity: 'error',
      lenses: ['threat-modeling'],
      sources: [{ type: 'rfc', number: 9110, section: '15.5.6' }],
      stakeholders: ['security'],
      lifecyclePhase: 'build-time',
      defectClass: 'norm',
      iso25010: 'security',
    };
    const parsed: RuleMetadata = validateMetadata(input);
    expect(parsed.severity).toBe('error');
    expect(parsed.codegenTargets).toEqual(['*']);
    expect(parsed.lenses).toEqual(['threat-modeling']);
  });

  it('parses a multi-lens RuleMetadata (e.g. RFC2-94 spans 5 lenses)', () => {
    const meta: RuleMetadata = validateMetadata({
      severity: 'error',
      lenses: [
        'threat-modeling',
        'standards-compliance',
        'evolution-friction',
        'operations',
        'operational-metadata',
      ],
      sources: [{ type: 'rfc', number: 9110, section: '10.2.3' }],
      stakeholders: ['spec-author', 'client-dev'],
      lifecyclePhase: 'runtime-edge',
      defectClass: 'norm',
      iso25010: 'reliability',
      patternId: 'RFC2-94',
      priority: 'P1',
    });
    expect(meta.lenses).toHaveLength(5);
    expect(meta.lenses).toContain('operations');
    expect(meta.lenses).toContain('operational-metadata');
    expect(meta.patternId).toBe('RFC2-94');
    expect(meta.priority).toBe('P1');
  });

  it('parses an evolution-friction pattern with direction-modifier', () => {
    const meta = validateMetadata({
      severity: 'warn',
      direction: 'tighten',
      lenses: ['evolution-friction'],
      sources: [{ type: 'mining', phase: 'round2', subagent: 'phase-c-evolution' }],
      stakeholders: ['spec-author'],
      lifecyclePhase: 'evolution-time',
      defectClass: 'over-specification',
      iso25010: 'compatibility',
    });
    expect(meta.direction).toBe('tighten');
  });

  it('rejects RuleMetadata with empty lenses array', () => {
    const result = safeValidateMetadata({
      severity: 'error',
      lenses: [],
      sources: [{ type: 'rfc', number: 9110 }],
      stakeholders: ['spec-author'],
      lifecyclePhase: 'build-time',
      defectClass: 'norm',
      iso25010: 'maintainability',
    });
    expect(result.success).toBe(false);
  });

  it('rejects RuleMetadata with invalid severity', () => {
    const result = safeValidateMetadata({
      severity: 'apocalyptic',
      lenses: ['threat-modeling'],
      sources: [{ type: 'rfc', number: 9110 }],
      stakeholders: ['security'],
      lifecyclePhase: 'build-time',
      defectClass: 'norm',
      iso25010: 'security',
    });
    expect(result.success).toBe(false);
  });

  it('rejects RuleMetadata missing required fields', () => {
    const result = safeValidateMetadata({
      severity: 'error',
      lenses: ['threat-modeling'],
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Test 5 — FindingMetadata extends RuleMetadata + tagFinding helper
// ---------------------------------------------------------------------------

describe('severity-schema FindingMetadata + tagFinding', () => {
  const baseRule: RuleMetadata = validateMetadata({
    severity: 'error',
    lenses: ['threat-modeling'],
    sources: [{ type: 'vendor', name: 'OWASP-API2' }],
    stakeholders: ['security'],
    lifecyclePhase: 'build-time',
    defectClass: 'norm',
    iso25010: 'security',
    patternId: 'Y-2',
  });

  it('tagFinding produces a valid FindingMetadata with default count', () => {
    const f: FindingMetadata = tagFinding(baseRule, {
      detectorId: 'spectral:apiq:y-2',
      locations: [{ jsonPointer: '/paths/~1v1~1users/get/parameters/0' }],
      message: 'API key in URL',
    });
    expect(f.detectorId).toBe('spectral:apiq:y-2');
    expect(f.severity).toBe('error');
    expect(f.lenses).toEqual(['threat-modeling']);
    expect(f.count).toBe(1);
    expect(f.message).toBe('API key in URL');
    expect(f.locations[0].jsonPointer).toBe('/paths/~1v1~1users/get/parameters/0');
  });

  it('tagFinding accepts custom count', () => {
    const f = tagFinding(baseRule, {
      detectorId: 'walker:apiq:rate-limit-headers',
      locations: [
        { jsonPointer: '/paths/~1a/get' },
        { jsonPointer: '/paths/~1b/get' },
      ],
      count: 47,
    });
    expect(f.count).toBe(47);
    expect(f.locations).toHaveLength(2);
  });

  it('FindingMetadata with location line+column round-trips', () => {
    const result = safeValidateFindingMetadata({
      severity: 'warn',
      lenses: ['client-friction'],
      sources: [{ type: 'mining', phase: 'round2', subagent: 'phase-d-client' }],
      stakeholders: ['client-dev'],
      lifecyclePhase: 'build-time',
      defectClass: 'ergonomics',
      iso25010: 'usability',
      detectorId: 'walker:apiq:no-examples',
      locations: [{ jsonPointer: '/paths/~1foo/post/requestBody', line: 42, column: 7 }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.locations[0].line).toBe(42);
      expect(result.data.locations[0].column).toBe(7);
      expect(result.data.count).toBe(1);
    }
  });

  it('rejects FindingMetadata with empty locations', () => {
    const result = safeValidateFindingMetadata({
      severity: 'error',
      lenses: ['threat-modeling'],
      sources: [{ type: 'rfc', number: 9110 }],
      stakeholders: ['security'],
      lifecyclePhase: 'build-time',
      defectClass: 'norm',
      iso25010: 'security',
      detectorId: 'whatever',
      locations: [],
    });
    expect(result.success).toBe(false);
  });

  it('FindingLocationSchema rejects empty jsonPointer', () => {
    const result = FindingLocationSchema.safeParse({ jsonPointer: '' });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Test 6 — Legacy migration
// ---------------------------------------------------------------------------

describe('severity-schema legacy migration', () => {
  it('migrateLegacyRule fills sensible defaults from severity-only legacy rule', () => {
    const migrated = migrateLegacyRule({ severity: 'warn' });
    expect(migrated.severity).toBe('warn');
    expect(migrated.lenses).toEqual(['standards-compliance']);
    expect(migrated.sources).toHaveLength(1);
    expect(migrated.sources[0]).toMatchObject({ type: 'mining', phase: 'round1', subagent: 'legacy' });
    expect(migrated.codegenTargets).toEqual(['*']);
    expect(migrated.stakeholders).toEqual(['spec-author']);
    expect(migrated.lifecyclePhase).toBe('build-time');
    expect(migrated.defectClass).toBe('norm');
    expect(migrated.iso25010).toBe('maintainability');
  });

  it('migrateLegacyRule preserves the legacy patternId', () => {
    const migrated = migrateLegacyRule({ severity: 'hint', patternId: 'apiq-fk-fields-need-format-or-pattern' });
    expect(migrated.patternId).toBe('apiq-fk-fields-need-format-or-pattern');
  });

  it('migrateLegacyRule applies overrides over the defaults', () => {
    const migrated = migrateLegacyRule(
      { severity: 'warn' },
      { lenses: ['client-friction', 'style-coherence'], iso25010: 'usability', priority: 'P2' }
    );
    expect(migrated.lenses).toEqual(['client-friction', 'style-coherence']);
    expect(migrated.iso25010).toBe('usability');
    expect(migrated.priority).toBe('P2');
    expect(migrated.lifecyclePhase).toBe('build-time');
    expect(migrated.defectClass).toBe('norm');
  });

  it('migrateLegacyRule round-trips through validateMetadata', () => {
    const migrated = migrateLegacyRule({ severity: 'error' });
    const reparsed = validateMetadata(migrated);
    expect(reparsed).toEqual(migrated);
  });

  it('migrateLegacyRule accepts all 3 legacy severities', () => {
    expect(() => migrateLegacyRule({ severity: 'error' })).not.toThrow();
    expect(() => migrateLegacyRule({ severity: 'warn' })).not.toThrow();
    expect(() => migrateLegacyRule({ severity: 'hint' })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Test 7 — Default-application discipline
// ---------------------------------------------------------------------------

describe('severity-schema defaults + helpers', () => {
  it('DEFAULT_CODEGEN_TARGETS is the wildcard star', () => {
    expect([...DEFAULT_CODEGEN_TARGETS]).toEqual(['*']);
  });

  it('codegenTargets default is applied when omitted', () => {
    const meta = RuleMetadataSchema.parse({
      severity: 'error',
      lenses: ['threat-modeling'],
      sources: [{ type: 'vendor', name: 'OWASP' }],
      stakeholders: ['security'],
      lifecyclePhase: 'build-time',
      defectClass: 'norm',
      iso25010: 'security',
    });
    expect(meta.codegenTargets).toEqual(['*']);
  });

  it('codegenTargets explicit value overrides default', () => {
    const meta = RuleMetadataSchema.parse({
      severity: 'warn',
      lenses: ['client-friction'],
      sources: [{ type: 'vendor', name: 'openapi-generator' }],
      codegenTargets: ['java', 'python'],
      stakeholders: ['codegen-tool'],
      lifecyclePhase: 'build-time',
      defectClass: 'ergonomics',
      iso25010: 'usability',
    });
    expect(meta.codegenTargets).toEqual(['java', 'python']);
  });

  it('rejects codegenTargets with empty array', () => {
    const result = safeValidateMetadata({
      severity: 'warn',
      lenses: ['client-friction'],
      sources: [{ type: 'vendor', name: 'openapi-generator' }],
      codegenTargets: [],
      stakeholders: ['codegen-tool'],
      lifecyclePhase: 'build-time',
      defectClass: 'ergonomics',
      iso25010: 'usability',
    });
    expect(result.success).toBe(false);
  });

  it('validateMetadata throws on invalid input', () => {
    expect(() => validateMetadata({ severity: 'nope' })).toThrow();
  });

  it('validateFindingMetadata throws on missing detectorId', () => {
    expect(() =>
      validateFindingMetadata({
        severity: 'error',
        lenses: ['threat-modeling'],
        sources: [{ type: 'rfc', number: 9110 }],
        stakeholders: ['security'],
        lifecyclePhase: 'build-time',
        defectClass: 'norm',
        iso25010: 'security',
        locations: [{ jsonPointer: '/foo' }],
      })
    ).toThrow();
  });
});
