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
  validateApiqMetaYamlBlock,
  // Welle F new exports:
  ImpactLevelSchema,
  AgentReadinessImpactSchema,
  DetectionPrecisionSchema,
  COST_IMPACT_DOCS,
  MTTR_IMPACT_DOCS,
  AGENT_READINESS_IMPACT_DOCS,
  type RuleMetadata,
  type FindingMetadata,
  type RuleMetadataInput,
  type Lens,
} from '../../deterministic/infra/severity-schema.js';

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

  it('parses all 9 stakeholders (incl. ai-agent — Welle F)', () => {
    for (const s of ['spec-author', 'client-dev', 'end-user', 'operations', 'security', 'codegen-tool', 'docs-tool', 'self', 'ai-agent'] as const) {
      expect(StakeholderSchema.parse(s)).toBe(s);
    }
  });

  it('parses all 10 lifecycle phases (incl. authoring-time + validation-time + runtime-at-scale — Welle F)', () => {
    for (const lp of ['authoring-time', 'build-time', 'test-time', 'validation-time', 'deploy-time', 'runtime-happy', 'runtime-edge', 'runtime-at-scale', 'evolution-time', 'documentation-time'] as const) {
      expect(LifecyclePhaseSchema.parse(lp)).toBe(lp);
    }
  });

  it('parses all 8 defect classes (incl. privacy-leakage + operational-metadata-missing — Welle F; renamed ergonomic/incomplete)', () => {
    for (const d of ['syntax', 'semantic', 'norm', 'ergonomic', 'incomplete', 'over-specification', 'privacy-leakage', 'operational-metadata-missing'] as const) {
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
      iso25010: ['security'],
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
      iso25010: ['reliability'],
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
      iso25010: ['compatibility'],
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
      iso25010: ['maintainability'],
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
      iso25010: ['security'],
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
    iso25010: ['security'],
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
      defectClass: 'ergonomic',
      iso25010: ['usability'],
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
      iso25010: ['security'],
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
    expect(migrated.iso25010).toEqual(['maintainability']);
  });

  it('migrateLegacyRule preserves the legacy patternId', () => {
    const migrated = migrateLegacyRule({ severity: 'hint', patternId: 'apiq-fk-fields-need-format-or-pattern' });
    expect(migrated.patternId).toBe('apiq-fk-fields-need-format-or-pattern');
  });

  it('migrateLegacyRule applies overrides over the defaults', () => {
    const migrated = migrateLegacyRule(
      { severity: 'warn' },
      { lenses: ['client-friction', 'style-coherence'], iso25010: ['usability'], priority: 'P2' }
    );
    expect(migrated.lenses).toEqual(['client-friction', 'style-coherence']);
    expect(migrated.iso25010).toEqual(['usability']);
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
      iso25010: ['security'],
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
      defectClass: 'ergonomic',
      iso25010: ['usability'],
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
      defectClass: 'ergonomic',
      iso25010: ['usability'],
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
        iso25010: ['security'],
        locations: [{ jsonPointer: '/foo' }],
      })
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Welle F — F1 / F2 / F8 / F9 / F10 / F-NEU schema-extensions
// ---------------------------------------------------------------------------

/**
 * Build a minimal-but-valid RuleMetadataInput. Test helpers below override
 * specific fields to exercise the Welle-F additions.
 */
function baseInput(extra: Partial<RuleMetadataInput> = {}): RuleMetadataInput {
  return {
    severity: 'error',
    lenses: ['threat-modeling'],
    sources: [{ type: 'rfc', number: 9110, section: '15.5.6' }],
    stakeholders: ['security'],
    lifecyclePhase: 'build-time',
    defectClass: 'norm',
    iso25010: ['security'],
    ...extra,
  };
}

describe('Welle F — F1 autoFixSafe + detectionPrecision', () => {
  it('autoFixSafe parses true', () => {
    const m = validateMetadata(baseInput({ autoFixSafe: true }));
    expect(m.autoFixSafe).toBe(true);
  });

  it('autoFixSafe parses false', () => {
    const m = validateMetadata(baseInput({ autoFixSafe: false }));
    expect(m.autoFixSafe).toBe(false);
  });

  it('autoFixSafe defaults to false (conservative)', () => {
    const m = validateMetadata(baseInput());
    expect(m.autoFixSafe).toBe(false);
  });

  it('detectionPrecision parses high/medium/low', () => {
    for (const p of ['high', 'medium', 'low'] as const) {
      expect(DetectionPrecisionSchema.parse(p)).toBe(p);
      const m = validateMetadata(baseInput({ detectionPrecision: p }));
      expect(m.detectionPrecision).toBe(p);
    }
  });

  it('detectionPrecision defaults to medium (conservative)', () => {
    const m = validateMetadata(baseInput());
    expect(m.detectionPrecision).toBe('medium');
  });

  it('detectionPrecision rejects invalid value', () => {
    const r = DetectionPrecisionSchema.safeParse('absolute');
    expect(r.success).toBe(false);
  });
});

describe('Welle F — F2 enum-additions + renames', () => {
  it('Stakeholder includes ai-agent (Lens-9 USP)', () => {
    expect(StakeholderSchema.parse('ai-agent')).toBe('ai-agent');
  });

  it('LifecyclePhase includes authoring-time + validation-time', () => {
    expect(LifecyclePhaseSchema.parse('authoring-time')).toBe('authoring-time');
    expect(LifecyclePhaseSchema.parse('validation-time')).toBe(
      'validation-time'
    );
  });

  it('LifecyclePhase has runtime-at-scale (renamed from runtime-scale)', () => {
    expect(LifecyclePhaseSchema.parse('runtime-at-scale')).toBe(
      'runtime-at-scale'
    );
    const r = LifecyclePhaseSchema.safeParse('runtime-scale');
    expect(r.success).toBe(false);
  });

  it('DefectClass includes privacy-leakage + operational-metadata-missing', () => {
    expect(DefectClassSchema.parse('privacy-leakage')).toBe('privacy-leakage');
    expect(DefectClassSchema.parse('operational-metadata-missing')).toBe(
      'operational-metadata-missing'
    );
  });

  it('DefectClass uses ergonomic + incomplete (renamed singular form)', () => {
    expect(DefectClassSchema.parse('ergonomic')).toBe('ergonomic');
    expect(DefectClassSchema.parse('incomplete')).toBe('incomplete');
    expect(DefectClassSchema.safeParse('ergonomics').success).toBe(false);
    expect(DefectClassSchema.safeParse('incompleteness').success).toBe(false);
  });
});

describe('Welle F — F8 RuleSource verbatim + verifiedAt on all 6 source-types', () => {
  it('RFC source accepts verbatim + verifiedAt', () => {
    const src = {
      type: 'rfc' as const,
      number: 9110,
      section: '15.5.6',
      verbatim: 'A 404 (Not Found) status code indicates...',
      verifiedAt: '2026-05-08',
    };
    expect(RuleSourceSchema.parse(src)).toEqual(src);
  });

  it('BCP source accepts verbatim + verifiedAt', () => {
    const src = {
      type: 'bcp' as const,
      number: 240,
      rfc: 9700,
      verbatim: 'Implementations MUST...',
      verifiedAt: '2026-05-08',
    };
    expect(RuleSourceSchema.parse(src)).toEqual(src);
  });

  it('ISO source accepts verbatim + verifiedAt', () => {
    const src = {
      type: 'iso' as const,
      standard: '25010' as const,
      characteristic: 'security',
      verbatim: 'Confidentiality: degree to which a product...',
      verifiedAt: '2026-05-08',
    };
    expect(RuleSourceSchema.parse(src)).toEqual(src);
  });

  it('IANA-registry source accepts verbatim + verifiedAt', () => {
    const src = {
      type: 'iana-registry' as const,
      registry: 'http-status-codes',
      verbatim: '429 Too Many Requests',
      verifiedAt: '2026-05-08',
    };
    expect(RuleSourceSchema.parse(src)).toEqual(src);
  });

  it('vendor source accepts verbatim + verifiedAt', () => {
    const src = {
      type: 'vendor' as const,
      name: 'Stripe',
      verbatim: 'idempotency-keys are kept for 24h',
      verifiedAt: '2026-05-08',
    };
    expect(RuleSourceSchema.parse(src)).toEqual(src);
  });

  it('mining source accepts verbatim + verifiedAt', () => {
    const src = {
      type: 'mining' as const,
      phase: 'round2' as const,
      subagent: 'phase-c-evolution',
      verbatim: 'Direction-modifier emerges across 18 case-studies',
      verifiedAt: '2026-05-08',
    };
    expect(RuleSourceSchema.parse(src)).toEqual(src);
  });

  it('quote rejects strings >200 chars (Welle-D Phase-3 schema-split)', () => {
    const tooLong = 'x'.repeat(201);
    const r = RuleSourceSchema.safeParse({
      type: 'rfc',
      number: 9110,
      quote: tooLong,
    });
    expect(r.success).toBe(false);
  });

  it('quote accepts exactly 200 chars (boundary)', () => {
    const exactly = 'x'.repeat(200);
    const r = RuleSourceSchema.safeParse({
      type: 'rfc',
      number: 9110,
      quote: exactly,
    });
    expect(r.success).toBe(true);
  });

  it('summary accepts arbitrary length (paraphrase, not T25-checked)', () => {
    const long = 'paraphrased sentence about API behavior. '.repeat(20);
    const r = RuleSourceSchema.safeParse({
      type: 'mining',
      phase: 'round2',
      subagent: 'long-paraphrase',
      summary: long,
    });
    expect(r.success).toBe(true);
  });

  it('legacy verbatim field still accepted (passthrough during migration)', () => {
    const r = RuleSourceSchema.safeParse({
      type: 'rfc',
      number: 9110,
      verbatim: 'legacy-style text without quote/summary split',
    });
    expect(r.success).toBe(true);
  });

  it('quote + summary can coexist on the same source', () => {
    const src = {
      type: 'rfc' as const,
      number: 9110,
      quote: 'A sender MUST NOT generate the chunked transfer coding',
      summary: 'Forbids chunked encoding in particular response shapes',
      verifiedAt: '2026-05-09',
    };
    expect(RuleSourceSchema.parse(src)).toEqual(src);
  });

  it('verifiedAt rejects non-ISO date format', () => {
    for (const bad of ['2026/05/08', '08-05-2026', 'May 8 2026', '2026-5-8']) {
      const r = RuleSourceSchema.safeParse({
        type: 'rfc',
        number: 9110,
        verifiedAt: bad,
      });
      expect(r.success).toBe(false);
    }
  });

  it('quote + summary + verifiedAt are all optional (existing sources still parse)', () => {
    const src = { type: 'rfc' as const, number: 9110, section: '15.5.6' };
    expect(RuleSourceSchema.parse(src)).toEqual(src);
  });
});

describe('Welle F — F9 regulatoryMapping', () => {
  it('regulatoryMapping accepts all 5 axes', () => {
    const m = validateMetadata(
      baseInput({
        regulatoryMapping: {
          nist: ['PR.DS-2', 'GV.OC-01'],
          asvs: ['V9.1.1'],
          cis: ['CIS-3.10'],
          gdpr: ['Art-5', 'Art-32'],
          soc2: ['CC6.1', 'CC7.2'],
        },
      })
    );
    expect(m.regulatoryMapping?.nist).toEqual(['PR.DS-2', 'GV.OC-01']);
    expect(m.regulatoryMapping?.asvs).toEqual(['V9.1.1']);
    expect(m.regulatoryMapping?.cis).toEqual(['CIS-3.10']);
    expect(m.regulatoryMapping?.gdpr).toEqual(['Art-5', 'Art-32']);
    expect(m.regulatoryMapping?.soc2).toEqual(['CC6.1', 'CC7.2']);
  });

  it('regulatoryMapping is fully optional', () => {
    const m = validateMetadata(baseInput());
    expect(m.regulatoryMapping).toBeUndefined();
  });

  it('regulatoryMapping with only one axis is valid', () => {
    const m = validateMetadata(
      baseInput({ regulatoryMapping: { gdpr: ['Art-5'] } })
    );
    expect(m.regulatoryMapping?.gdpr).toEqual(['Art-5']);
    expect(m.regulatoryMapping?.nist).toBeUndefined();
  });

  it('regulatoryMapping rejects empty control-id strings', () => {
    const r = safeValidateMetadata(
      baseInput({ regulatoryMapping: { gdpr: [''] } })
    );
    expect(r.success).toBe(false);
  });
});

describe('Welle F — F10 costImpact + mttrImpact', () => {
  it('ImpactLevel parses low/medium/high', () => {
    for (const v of ['low', 'medium', 'high'] as const) {
      expect(ImpactLevelSchema.parse(v)).toBe(v);
    }
  });

  it('costImpact defaults to medium', () => {
    const m = validateMetadata(baseInput());
    expect(m.costImpact).toBe('medium');
  });

  it('mttrImpact defaults to medium', () => {
    const m = validateMetadata(baseInput());
    expect(m.mttrImpact).toBe('medium');
  });

  it('costImpact + mttrImpact accept explicit values', () => {
    const m = validateMetadata(
      baseInput({ costImpact: 'high', mttrImpact: 'low' })
    );
    expect(m.costImpact).toBe('high');
    expect(m.mttrImpact).toBe('low');
  });

  it('COST_IMPACT_DOCS + MTTR_IMPACT_DOCS have entries for all 3 tiers', () => {
    for (const tier of ['low', 'medium', 'high'] as const) {
      expect(COST_IMPACT_DOCS[tier]).toBeTruthy();
      expect(MTTR_IMPACT_DOCS[tier]).toBeTruthy();
    }
  });
});

describe('Welle F — F-NEU agentReadinessImpact (strategic-vision coupling)', () => {
  it('AgentReadinessImpact parses high/medium/low/none', () => {
    for (const v of ['high', 'medium', 'low', 'none'] as const) {
      expect(AgentReadinessImpactSchema.parse(v)).toBe(v);
    }
  });

  it('agentReadinessImpact defaults to none (most rules are human-only)', () => {
    const m = validateMetadata(baseInput());
    expect(m.agentReadinessImpact).toBe('none');
  });

  it('agentReadinessImpact accepts explicit value', () => {
    const m = validateMetadata(baseInput({ agentReadinessImpact: 'high' }));
    expect(m.agentReadinessImpact).toBe('high');
  });

  it('AGENT_READINESS_IMPACT_DOCS has entries for all 4 tiers', () => {
    for (const tier of ['high', 'medium', 'low', 'none'] as const) {
      expect(AGENT_READINESS_IMPACT_DOCS[tier]).toBeTruthy();
    }
  });
});

describe('Welle F — iso25010 single -> array migration', () => {
  it('iso25010 accepts array of one characteristic', () => {
    const m = validateMetadata(baseInput({ iso25010: ['security'] }));
    expect(m.iso25010).toEqual(['security']);
  });

  it('iso25010 accepts array of multiple characteristics', () => {
    const m = validateMetadata(
      baseInput({ iso25010: ['security', 'reliability'] })
    );
    expect(m.iso25010).toEqual(['security', 'reliability']);
  });

  it('iso25010 rejects empty array', () => {
    const r = safeValidateMetadata(baseInput({ iso25010: [] }));
    expect(r.success).toBe(false);
  });

  it('iso25010 rejects single string (no longer valid post-Welle-F)', () => {
    // @ts-expect-error — intentional: iso25010 is now array, not single value
    const r = safeValidateMetadata(baseInput({ iso25010: 'security' }));
    expect(r.success).toBe(false);
  });
});

describe('Welle F — migrateLegacyRule populates all new defaults', () => {
  it('populates costImpact + mttrImpact + agentReadinessImpact + detectionPrecision + autoFixSafe with conservative defaults', () => {
    const m = migrateLegacyRule({ severity: 'warn' });
    expect(m.costImpact).toBe('medium');
    expect(m.mttrImpact).toBe('medium');
    expect(m.agentReadinessImpact).toBe('none');
    expect(m.detectionPrecision).toBe('medium');
    expect(m.autoFixSafe).toBe(false);
  });

  it('iso25010 default is now an array (Welle F migration)', () => {
    const m = migrateLegacyRule({ severity: 'hint' });
    expect(Array.isArray(m.iso25010)).toBe(true);
    expect(m.iso25010).toEqual(['maintainability']);
  });

  it('overrides still apply over Welle-F defaults', () => {
    const m = migrateLegacyRule(
      { severity: 'error' },
      {
        costImpact: 'high',
        agentReadinessImpact: 'high',
        autoFixSafe: true,
      }
    );
    expect(m.costImpact).toBe('high');
    expect(m.agentReadinessImpact).toBe('high');
    expect(m.autoFixSafe).toBe(true);
    // Non-overridden defaults still apply:
    expect(m.mttrImpact).toBe('medium');
    expect(m.detectionPrecision).toBe('medium');
  });
});

describe('Welle F — full RuleMetadata round-trip with all new fields', () => {
  it('parses + round-trips a maximally-tagged RuleMetadata', () => {
    const input: RuleMetadataInput = {
      severity: 'error',
      direction: 'tighten',
      lenses: [
        'threat-modeling',
        'standards-compliance',
        'ai-agent-consumability',
      ],
      sources: [
        {
          type: 'rfc',
          number: 9110,
          section: '15.5.6',
          verbatim: 'A 404 (Not Found) status code indicates that the origin server did not find a current representation for the target resource.',
          verifiedAt: '2026-05-08',
        },
        {
          type: 'mining',
          phase: 'round2',
          subagent: 'welle-m-r4',
          verbatim: 'Stripe webhook-order-not-guaranteed (vendor-blog confirmed)',
          verifiedAt: '2026-05-07',
        },
      ],
      codegenTargets: ['typescript', 'python'],
      stakeholders: ['security', 'ai-agent', 'spec-author'],
      lifecyclePhase: 'authoring-time',
      defectClass: 'privacy-leakage',
      iso25010: ['security', 'reliability'],
      priority: 'P1',
      patternId: 'F-NEU-test',
      autoFixSafe: true,
      detectionPrecision: 'high',
      regulatoryMapping: {
        nist: ['PR.DS-2'],
        gdpr: ['Art-32'],
        asvs: ['V9.1.1'],
      },
      costImpact: 'high',
      mttrImpact: 'high',
      agentReadinessImpact: 'high',
    };
    const parsed = validateMetadata(input);
    // Round-trip: re-parse the parsed output and expect equality.
    const reparsed = validateMetadata(parsed);
    expect(reparsed).toEqual(parsed);
    // Spot-check Welle-F-specific fields:
    expect(parsed.autoFixSafe).toBe(true);
    expect(parsed.detectionPrecision).toBe('high');
    expect(parsed.costImpact).toBe('high');
    expect(parsed.mttrImpact).toBe('high');
    expect(parsed.agentReadinessImpact).toBe('high');
    expect(parsed.regulatoryMapping?.nist).toEqual(['PR.DS-2']);
    expect(parsed.regulatoryMapping?.gdpr).toEqual(['Art-32']);
    expect(parsed.regulatoryMapping?.asvs).toEqual(['V9.1.1']);
    expect(parsed.iso25010).toEqual(['security', 'reliability']);
    expect(parsed.stakeholders).toContain('ai-agent');
    expect(parsed.lifecyclePhase).toBe('authoring-time');
    expect(parsed.defectClass).toBe('privacy-leakage');
    expect(parsed.sources[0]).toMatchObject({
      type: 'rfc',
      verifiedAt: '2026-05-08',
    });
    expect(
      parsed.sources[0].type === 'rfc' && parsed.sources[0].verbatim
    ).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Test 11 — validateApiqMetaYamlBlock (Welle Arch+ A2b)
// kebab-case YAML block -> camelCase RuleMetadata
// ---------------------------------------------------------------------------

describe('validateApiqMetaYamlBlock — kebab→camel + schema validation', () => {
  it('parses a real apiq-meta block (kebab-case YAML shape) into RuleMetadata', () => {
    const yamlBlock = {
      'pattern-id': 'Y-2',
      lenses: ['threat-modeling'],
      sources: [
        {
          type: 'vendor',
          name: 'OWASP API2:2023 (Broken Authentication)',
        },
        {
          type: 'rfc',
          number: 6750,
          section: '2.3',
          summary: 'clients MUST NOT use the URI',
        },
      ],
      stakeholders: ['security', 'end-user'],
      'lifecycle-phase': 'deploy-time',
      'defect-class': 'semantic',
      iso25010: ['security'],
      'codegen-targets': ['*'],
      'detection-precision': 'high',
      'auto-fix-safe': false,
      'regulatory-mapping': {
        nist: ['PR.AA-01', 'PR.DS-02'],
        asvs: ['V2.1.1', 'V9.1.1'],
        cis: ['CIS-3.10', 'CIS-6.1'],
      },
      'cost-impact': 'medium',
      'mttr-impact': 'high',
      'agent-readiness-impact': 'high',
      severity: 'error',
    };
    const result = validateApiqMetaYamlBlock(yamlBlock);
    expect('errors' in result).toBe(false);
    if (!('errors' in result)) {
      expect(result.patternId).toBe('Y-2');
      expect(result.lenses).toEqual(['threat-modeling']);
      expect(result.lifecyclePhase).toBe('deploy-time');
      expect(result.defectClass).toBe('semantic');
      expect(result.codegenTargets).toEqual(['*']);
      expect(result.detectionPrecision).toBe('high');
      expect(result.autoFixSafe).toBe(false);
      expect(result.regulatoryMapping?.nist).toEqual(['PR.AA-01', 'PR.DS-02']);
      expect(result.costImpact).toBe('medium');
      expect(result.mttrImpact).toBe('high');
      expect(result.agentReadinessImpact).toBe('high');
    }
  });

  it('returns errors when lens is invalid', () => {
    const result = validateApiqMetaYamlBlock({
      'pattern-id': 'BAD-LENS',
      lenses: ['fictional-lens'],
      sources: [{ type: 'rfc', number: 9110 }],
      stakeholders: ['spec-author'],
      'lifecycle-phase': 'build-time',
      'defect-class': 'norm',
      iso25010: ['maintainability'],
      severity: 'warn',
    });
    expect('errors' in result).toBe(true);
    if ('errors' in result) {
      expect(result.errors.some(e => e.includes('lenses'))).toBe(true);
    }
  });

  it('returns errors when severity is missing', () => {
    const result = validateApiqMetaYamlBlock({
      'pattern-id': 'NO-SEVERITY',
      lenses: ['threat-modeling'],
      sources: [{ type: 'rfc', number: 9110 }],
      stakeholders: ['spec-author'],
      'lifecycle-phase': 'build-time',
      'defect-class': 'norm',
      iso25010: ['security'],
    });
    expect('errors' in result).toBe(true);
    if ('errors' in result) {
      expect(result.errors.some(e => e.includes('severity'))).toBe(true);
    }
  });

  it('returns errors when required field stakeholders is empty array', () => {
    const result = validateApiqMetaYamlBlock({
      'pattern-id': 'NO-STAKEHOLDERS',
      lenses: ['threat-modeling'],
      sources: [{ type: 'rfc', number: 9110 }],
      stakeholders: [],
      'lifecycle-phase': 'build-time',
      'defect-class': 'norm',
      iso25010: ['security'],
      severity: 'warn',
    });
    expect('errors' in result).toBe(true);
  });

  it('returns errors when block is null/non-object', () => {
    expect('errors' in validateApiqMetaYamlBlock(null)).toBe(true);
    expect('errors' in validateApiqMetaYamlBlock('string')).toBe(true);
    expect('errors' in validateApiqMetaYamlBlock([])).toBe(true);
  });

  it('preserves a sources entry that uses verbatim alongside summary', () => {
    const result = validateApiqMetaYamlBlock({
      'pattern-id': 'EV-1',
      lenses: ['evolution-friction'],
      sources: [
        {
          type: 'rfc',
          number: 9745,
          section: '2',
          summary: 'Servers SHOULD include the Sunset header.',
          verbatim: 'Sunset: Sat, 31 Dec 2025 23:59:59 GMT',
          verifiedAt: '2026-04-15',
        },
      ],
      stakeholders: ['client-dev'],
      'lifecycle-phase': 'evolution-time',
      'defect-class': 'semantic',
      iso25010: ['compatibility'],
      severity: 'warn',
      direction: 'tighten',
    });
    expect('errors' in result).toBe(false);
    if (!('errors' in result)) {
      expect(result.direction).toBe('tighten');
      expect(result.sources[0].type).toBe('rfc');
    }
  });

  it('applies RuleMetadata defaults when optional fields are absent', () => {
    const result = validateApiqMetaYamlBlock({
      'pattern-id': 'MIN-1',
      lenses: ['threat-modeling'],
      sources: [{ type: 'rfc', number: 9110 }],
      stakeholders: ['security'],
      'lifecycle-phase': 'build-time',
      'defect-class': 'norm',
      iso25010: ['security'],
      severity: 'error',
    });
    expect('errors' in result).toBe(false);
    if (!('errors' in result)) {
      // RuleMetadataSchema applies defaults: codegenTargets=['*'],
      // detectionPrecision='medium', autoFixSafe=false, costImpact='medium',
      // mttrImpact='medium', agentReadinessImpact='none'.
      expect(result.codegenTargets).toEqual(['*']);
      expect(result.detectionPrecision).toBe('medium');
      expect(result.autoFixSafe).toBe(false);
      expect(result.costImpact).toBe('medium');
      expect(result.mttrImpact).toBe('medium');
      expect(result.agentReadinessImpact).toBe('none');
    }
  });
});
