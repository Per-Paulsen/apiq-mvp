/**
 * Tests for `cycleStripSpec` / `stringifySpecForPrompt` (Epic 03 AC #17 —
 * the cyclic-ref handling that makes dereferenced specs JSON-safe).
 *
 * The marker shape `{ "$ref": "#cyclic" }` is part of the Epic 04 LLM prompt
 * AND the Epic 06 patch validator's contract — it MUST NOT change.
 */
import { describe, expect, it } from 'vitest';

import { cycleStripSpec, stringifySpecForPrompt } from '@/lib/analysis/stringify-spec';

describe('cycleStripSpec', () => {
  it('passes non-cyclic input through unchanged (deep equal)', () => {
    const input = {
      openapi: '3.0.1',
      info: { title: 't', version: '1' },
      paths: {
        '/users': {
          get: {
            responses: {
              '200': {
                description: 'ok',
                content: {
                  'application/json': {
                    schema: { type: 'object', properties: { id: { type: 'string' } } },
                  },
                },
              },
            },
          },
        },
      },
    };

    const out = cycleStripSpec(input);
    expect(out).toEqual(input);
    // Verify deep clone (not aliased reference).
    expect(out).not.toBe(input);
  });

  it('replaces a self-cycle with the marker { $ref: "#cyclic" }', () => {
    type Node = { name: string; self?: unknown };
    const node: Node = { name: 'a' };
    node.self = node; // self-cycle

    const out = cycleStripSpec(node) as Record<string, unknown>;
    expect(out.name).toBe('a');
    expect(out.self).toEqual({ $ref: '#cyclic' });
  });

  it('replaces back-references in a recursive tree-node schema', () => {
    type TreeNode = {
      type: string;
      properties: { children?: unknown; name?: unknown };
    };
    // Build a recursive schema where `children.items` points back to the root.
    const schema: TreeNode = {
      type: 'object',
      properties: {
        name: { type: 'string' } as unknown,
      },
    };
    schema.properties.children = {
      type: 'array',
      items: schema, // cycle: items === schema (root)
    };

    const stripped = cycleStripSpec(schema);
    // After strip the result is JSON-safe — would otherwise throw
    // "Converting circular structure to JSON".
    const json = JSON.stringify(stripped);
    expect(json).toContain('#cyclic');

    // Round-trip parse — guarantees the tree is acyclic.
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const props = parsed.properties as Record<string, unknown>;
    const children = props.children as Record<string, unknown>;
    expect(children.items).toEqual({ $ref: '#cyclic' });
  });

  it('handles cycles inside arrays', () => {
    const arr: unknown[] = [{ value: 1 }];
    (arr[0] as Record<string, unknown>).back = arr;

    const stripped = cycleStripSpec(arr) as unknown[];
    expect(stripped).toHaveLength(1);
    const item = stripped[0] as Record<string, unknown>;
    expect(item.value).toBe(1);
    expect(item.back).toEqual({ $ref: '#cyclic' });
  });

  it('does not mutate the input', () => {
    type Node = { name: string; self?: unknown };
    const node: Node = { name: 'a' };
    node.self = node;

    cycleStripSpec(node);
    // Original cycle still intact.
    expect((node.self as Node).name).toBe('a');
    expect((node.self as Node).self).toBe(node);
  });
});

describe('stringifySpecForPrompt', () => {
  it('produces minified JSON for a non-cyclic spec', () => {
    const spec = {
      openapi: '3.0.1',
      info: { title: 't', version: '1' },
      paths: {},
    };
    const out = stringifySpecForPrompt(spec);
    // Minified — no spaces/newlines outside of strings.
    expect(out).toBe(JSON.stringify(spec));
  });

  it('handles a cyclic spec without throwing', () => {
    const recursive: Record<string, unknown> = { type: 'object' };
    recursive.self = recursive;
    expect(() => stringifySpecForPrompt(recursive)).not.toThrow();
    const out = stringifySpecForPrompt(recursive);
    expect(out).toContain('#cyclic');
  });
});
