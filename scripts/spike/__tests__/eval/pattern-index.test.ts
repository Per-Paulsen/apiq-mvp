import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildPatternIndex,
  findRelatedPatterns,
  loadAllPatterns,
  resetPatternIndexCache,
} from '../../eval/pattern-index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const INDEX_PATH = path.resolve(__dirname, '../../eval/cache/pattern-index.json');

const HAS_API_KEY = !!process.env.OPENAI_API_KEY;
const SKIP_REASON = HAS_API_KEY
  ? null
  : 'OPENAI_API_KEY not set; skipping embedding-dependent tests';

describe('pattern-index parser', () => {
  it('loadAllPatterns yields >= 250 patterns from rules-brainstorm.md', () => {
    const patterns = loadAllPatterns();
    expect(patterns.length).toBeGreaterThanOrEqual(250);
  });

  it('every pattern has at least one lens', () => {
    const patterns = loadAllPatterns();
    for (const p of patterns) {
      expect(p.lens.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('all three rounds are represented', () => {
    const patterns = loadAllPatterns();
    const byRound = patterns.reduce<Record<number, number>>((a, p) => {
      a[p.round] = (a[p.round] ?? 0) + 1;
      return a;
    }, {});
    expect(byRound[1]).toBeGreaterThan(0);
    expect(byRound[2]).toBeGreaterThan(0);
    expect(byRound[3]).toBeGreaterThan(0);
  });

  it('pattern-IDs are unique', () => {
    const patterns = loadAllPatterns();
    const ids = patterns.map((p) => p.patternId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('pattern-index search', () => {
  beforeAll(async () => {
    if (!fs.existsSync(INDEX_PATH)) {
      if (!HAS_API_KEY) return;
      await buildPatternIndex();
    }
    resetPatternIndexCache();
  }, 600000);

  it.skipIf(!HAS_API_KEY)(
    'findRelatedPatterns("oauth2 implicit flow") returns >=3 patterns with similarity >= 0.5',
    async () => {
      if (!fs.existsSync(INDEX_PATH)) {
        // eslint-disable-next-line no-console
        console.warn(`pattern-index.json not built; skipping (${SKIP_REASON ?? 'no index'})`);
        return;
      }
      const matches = await findRelatedPatterns('oauth2 implicit flow', {
        topK: 10,
        minSimilarity: 0.5,
      });
      expect(matches.length).toBeGreaterThanOrEqual(3);
      expect(matches[0].similarity).toBeGreaterThanOrEqual(0.5);
      // Verify we actually retrieve OAuth-relevant patterns
      const titles = matches.map((m) => m.pattern.description.toLowerCase()).join(' | ');
      expect(/oauth|implicit|password|flow|token/i.test(titles)).toBe(true);
    },
    60000
  );

  it.skipIf(!HAS_API_KEY)(
    'findRelatedPatterns supports lens-filter',
    async () => {
      if (!fs.existsSync(INDEX_PATH)) return;
      const matches = await findRelatedPatterns('rate limiting headers', {
        lens: 'threat-modeling',
        topK: 5,
      });
      expect(matches.length).toBeGreaterThan(0);
      for (const m of matches) {
        expect(m.pattern.lens).toContain('threat-modeling');
      }
    },
    60000
  );

  it.skipIf(!HAS_API_KEY)(
    'findRelatedPatterns supports sourceType-filter',
    async () => {
      if (!fs.existsSync(INDEX_PATH)) return;
      const matches = await findRelatedPatterns('webhook signature', {
        sourceType: 'rfc',
        topK: 5,
      });
      // RFC-source patterns are present in the corpus; if any matches above min-sim, they
      // must all be sourceType='rfc'. Empty result is acceptable (no RFC pattern within
      // similarity threshold) — assertion only triggers when results exist.
      for (const m of matches) {
        expect(m.pattern.sourceType).toBe('rfc');
      }
    },
    60000
  );

  it.skipIf(!HAS_API_KEY)(
    'findRelatedPatterns respects topK',
    async () => {
      if (!fs.existsSync(INDEX_PATH)) return;
      const matches = await findRelatedPatterns('schema validation', {
        topK: 3,
        minSimilarity: 0,
      });
      expect(matches.length).toBeLessThanOrEqual(3);
    },
    60000
  );

  it.skipIf(!HAS_API_KEY)(
    'findRelatedPatterns returns descending similarity-order',
    async () => {
      if (!fs.existsSync(INDEX_PATH)) return;
      const matches = await findRelatedPatterns('authentication scheme', {
        topK: 10,
        minSimilarity: 0,
      });
      for (let i = 1; i < matches.length; i++) {
        expect(matches[i].similarity).toBeLessThanOrEqual(matches[i - 1].similarity);
      }
    },
    60000
  );
});
