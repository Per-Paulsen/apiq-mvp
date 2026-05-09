import { describe, it, expect } from 'vitest';
import {
  getRequestBodyContent,
  forEachRequestBodyMediaType,
} from '../../../../deterministic/spectral-functions/_helpers/request-body.js';

describe('request-body helper', () => {
  describe('getRequestBodyContent', () => {
    it('returns the content map for a normal op', () => {
      const op = {
        requestBody: {
          content: {
            'application/json': { schema: { type: 'object' } },
            'application/xml': { schema: { type: 'object' } },
          },
        },
      };
      const c = getRequestBodyContent(op);
      expect(Object.keys(c).sort()).toEqual(['application/json', 'application/xml']);
      expect(c['application/json']).toEqual({ schema: { type: 'object' } });
    });

    it('returns empty obj for missing requestBody / content / non-object op', () => {
      expect(getRequestBodyContent(null)).toEqual({});
      expect(getRequestBodyContent({})).toEqual({});
      expect(getRequestBodyContent({ requestBody: null })).toEqual({});
      expect(getRequestBodyContent({ requestBody: {} })).toEqual({});
      expect(getRequestBodyContent({ requestBody: { content: null } })).toEqual({});
    });

    it('skips non-object media-type entries (defensive)', () => {
      const op = {
        requestBody: {
          content: {
            'application/json': { schema: {} },
            'text/plain': null,
            'application/xml': 'invalid-string-value',
          },
        },
      };
      const c = getRequestBodyContent(op);
      expect(Object.keys(c)).toEqual(['application/json']);
    });
  });

  describe('forEachRequestBodyMediaType', () => {
    it('visits every media-type', () => {
      const op = {
        requestBody: {
          content: {
            'a/b': { schema: { type: 'object' } },
            'c/d': { schema: { type: 'array' } },
          },
        },
      };
      const seen: string[] = [];
      forEachRequestBodyMediaType(op, (mt) => {
        seen.push(mt);
      });
      expect(seen.sort()).toEqual(['a/b', 'c/d']);
    });

    it('short-circuits when visitor returns false', () => {
      const op = {
        requestBody: {
          content: {
            'first/one': {},
            'second/two': {},
            'third/three': {},
          },
        },
      };
      const seen: string[] = [];
      const stopped = forEachRequestBodyMediaType(op, (mt) => {
        seen.push(mt);
        if (mt === 'second/two') return false;
      });
      expect(stopped).toBe(true);
      expect(seen.length).toBe(2);
    });

    it('returns false when no short-circuit (and tolerates missing requestBody)', () => {
      expect(forEachRequestBodyMediaType({}, () => undefined)).toBe(false);
      const op = { requestBody: { content: { 'a/b': {} } } };
      expect(forEachRequestBodyMediaType(op, () => undefined)).toBe(false);
    });
  });
});
