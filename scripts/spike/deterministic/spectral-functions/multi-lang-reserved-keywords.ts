/**
 * Custom Spectral function — multi-language reserved-keyword allowlist.
 *
 * Pattern: CL-1 (Lens 4 Client-Friction, P1, Konkurrenz-Pari-Pflicht).
 *
 * Generated SDK code suffers when OpenAPI property names or operationIds
 * collide with reserved keywords / built-in identifiers in the target
 * language. openapi-generator silently renames (e.g. `type` -> `_type` in
 * Java; `class` -> `_class` in Python), Go-codegen strip-collides, Rust
 * fails to compile.
 *
 * apiq G-SP-6 has the same idea for the SPS-target only — CL-1 broadens to
 * a multi-language UNION, which is the load-bearing signal: any name that
 * collides in ANY of the seven major SDK target-languages (Java + Go +
 * Python + JavaScript + Rust + C# + Kotlin) is reported, with the
 * specific colliding language(s) named in the message.
 *
 * Sources:
 *   - openapi-generator #1831, #7100  (Java + multi-lang collisions)
 *   - swagger-codegen   #4805         (multi-lang)
 *   - swagger-codegen reserved-words.txt (Java)
 *   - openapi-python-client (Python keyword + builtin collisions)
 *   - oapi-codegen Go templates       (Go keyword + builtin collisions)
 *   - Rust 2024 edition reserved keywords
 *   - C# language spec (contextual + reserved keywords)
 *   - Kotlin language reference (hard + soft + modifier keywords)
 *   - ECMA-262 §11.6.2.1 (JavaScript reserved words, strict mode)
 *
 * The allowlist tables below are public-domain enumerations of each
 * language's reserved tokens. We compare the OpenAPI identifier
 * case-sensitively against each table — codegen tools generally compare
 * case-sensitive too (Java is case-sensitive; Go camel-cases but `type`
 * is lower so the collision survives camel-casing).
 *
 * Spectral function shape: takes an input string (the property name or
 * operationId) and options { kind: 'property' | 'operationId',
 * targets?: string[] }. Returns an array of IFunctionResult — one per
 * language collision (so the message names every colliding language).
 */

import type { RulesetFunctionContext, IFunctionResult } from '@stoplight/spectral-core';

// =============================================================================
// 1. Allowlist tables — one per supported codegen target.
// =============================================================================

/**
 * Java reserved keywords + restricted identifiers + commonly-collided
 * built-in types. Sources:
 *   - JLS §3.9 (keywords)
 *   - JLS §3.11 (separators)
 *   - swagger-codegen-core/src/main/resources/reserved-words.txt
 *   - openapi-generator JavaClientCodegen
 *
 * Includes:
 *   - 50 reserved keywords (`abstract` .. `while`)
 *   - reserved literals (`true`, `false`, `null`)
 *   - restricted identifiers (`var`, `yield`, `record`, `sealed`, `permits`)
 *   - `_` (since Java 9)
 *   - common built-in types that codegen wraps poorly (`Object`, `String`,
 *     `Integer`, `Boolean`, `Long`, `Float`, `Double`, `Class`)
 */
const JAVA_RESERVED: ReadonlySet<string> = new Set([
  // JLS §3.9 — 50 keywords
  'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char',
  'class', 'const', 'continue', 'default', 'do', 'double', 'else', 'enum',
  'extends', 'final', 'finally', 'float', 'for', 'goto', 'if', 'implements',
  'import', 'instanceof', 'int', 'interface', 'long', 'native', 'new',
  'package', 'private', 'protected', 'public', 'return', 'short', 'static',
  'strictfp', 'super', 'switch', 'synchronized', 'this', 'throw', 'throws',
  'transient', 'try', 'void', 'volatile', 'while',
  // Reserved literals
  'true', 'false', 'null',
  // JLS §3.9 contextual keywords (Java 9+)
  'var', 'yield', 'record', 'sealed', 'permits', 'non-sealed',
  // _ since Java 9
  '_',
  // Frequently-collided built-in / SDK class names
  'Object', 'String', 'Integer', 'Boolean', 'Long', 'Float', 'Double',
  'Class', 'Number', 'Byte', 'Short', 'Character', 'Void',
]);

/**
 * Go keywords + predeclared identifiers + builtins.
 * Sources:
 *   - go/spec.html#Keywords (25 keywords)
 *   - go/spec.html#Predeclared_identifiers
 *   - oapi-codegen reserved-words handling
 */
const GO_RESERVED: ReadonlySet<string> = new Set([
  // 25 keywords
  'break', 'case', 'chan', 'const', 'continue', 'default', 'defer', 'else',
  'fallthrough', 'for', 'func', 'go', 'goto', 'if', 'import', 'interface',
  'map', 'package', 'range', 'return', 'select', 'struct', 'switch', 'type',
  'var',
  // Predeclared types
  'bool', 'byte', 'complex64', 'complex128', 'error', 'float32', 'float64',
  'int', 'int8', 'int16', 'int32', 'int64', 'rune', 'string', 'uint', 'uint8',
  'uint16', 'uint32', 'uint64', 'uintptr', 'any', 'comparable',
  // Predeclared constants
  'true', 'false', 'iota', 'nil',
  // Predeclared functions
  'append', 'cap', 'close', 'complex', 'copy', 'delete', 'imag', 'len',
  'make', 'new', 'panic', 'print', 'println', 'real', 'recover', 'min', 'max',
  'clear',
]);

/**
 * Python keywords + soft-keywords + builtins.
 * Sources:
 *   - keyword.kwlist for Python 3.13
 *   - keyword.softkwlist for Python 3.13
 *   - https://docs.python.org/3/library/functions.html (built-ins)
 *   - openapi-python-client reserved-list handling
 */
const PYTHON_RESERVED: ReadonlySet<string> = new Set([
  // Python 3 keywords
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break',
  'class', 'continue', 'def', 'del', 'elif', 'else', 'except', 'finally',
  'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal',
  'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield',
  // Soft keywords (3.10+)
  'match', 'case', 'type', '_',
  // Frequently-collided built-ins
  'print', 'list', 'dict', 'set', 'tuple', 'str', 'int', 'float', 'bool',
  'bytes', 'bytearray', 'object', 'type', 'len', 'range', 'iter', 'open',
  'input', 'sum', 'min', 'max', 'abs', 'all', 'any', 'sorted', 'reversed',
  'enumerate', 'zip', 'map', 'filter', 'id', 'hash', 'help', 'dir',
  'isinstance', 'issubclass', 'super', 'property', 'staticmethod',
  'classmethod', 'next', 'globals', 'locals', 'vars', 'callable', 'compile',
  'eval', 'exec', 'format', 'getattr', 'setattr', 'delattr', 'hasattr',
  'repr', 'round', 'slice', 'frozenset', 'memoryview', 'complex',
]);

/**
 * JavaScript / TypeScript reserved words.
 * Sources:
 *   - ECMA-262 §11.6.2.1 (reserved words)
 *   - ECMA-262 §11.6.2.2 (future reserved)
 *   - TypeScript §2.2.1 (additions: `any`, `boolean`, `number`, `string` etc.)
 *   - openapi-typescript known-collision list
 */
const JAVASCRIPT_RESERVED: ReadonlySet<string> = new Set([
  // ECMA-262 reserved
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger',
  'default', 'delete', 'do', 'else', 'export', 'extends', 'false', 'finally',
  'for', 'function', 'if', 'import', 'in', 'instanceof', 'new', 'null',
  'return', 'super', 'switch', 'this', 'throw', 'true', 'try', 'typeof',
  'var', 'void', 'while', 'with', 'yield',
  // Strict-mode reserved
  'let', 'static', 'arguments', 'eval', 'implements', 'interface', 'package',
  'private', 'protected', 'public',
  // Future reserved
  'enum', 'await',
  // TypeScript additions / common collisions
  'any', 'boolean', 'number', 'string', 'symbol', 'undefined', 'never',
  'object', 'unknown', 'bigint', 'declare', 'namespace', 'type', 'as', 'is',
  'from', 'of', 'readonly',
  // Built-in objects that clobber when used as identifiers
  'Object', 'Array', 'Function', 'Number', 'String', 'Boolean', 'Date',
  'RegExp', 'Error', 'Map', 'Set', 'Promise', 'Symbol', 'BigInt', 'JSON',
  'Math',
]);

/**
 * Rust 2024 edition reserved keywords (strict + reserved-for-future).
 * Sources:
 *   - https://doc.rust-lang.org/reference/keywords.html
 *   - utoipa reserved-words handling
 */
const RUST_RESERVED: ReadonlySet<string> = new Set([
  // Strict keywords
  'as', 'break', 'const', 'continue', 'crate', 'else', 'enum', 'extern',
  'false', 'fn', 'for', 'if', 'impl', 'in', 'let', 'loop', 'match', 'mod',
  'move', 'mut', 'pub', 'ref', 'return', 'self', 'Self', 'static', 'struct',
  'super', 'trait', 'true', 'type', 'unsafe', 'use', 'where', 'while',
  // 2018 edition
  'async', 'await', 'dyn',
  // Reserved for future use
  'abstract', 'become', 'box', 'do', 'final', 'macro', 'override', 'priv',
  'typeof', 'unsized', 'virtual', 'yield',
  // 2024 edition
  'try', 'gen',
  // Weak keywords (contextual)
  'union',
  // Built-in types
  'bool', 'char', 'i8', 'i16', 'i32', 'i64', 'i128', 'isize', 'u8', 'u16',
  'u32', 'u64', 'u128', 'usize', 'f32', 'f64', 'str', 'String', 'Vec',
  'Option', 'Result', 'Box',
]);

/**
 * C# reserved keywords + contextual keywords + common built-in types.
 * Sources:
 *   - https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/keywords/
 *   - openapi-generator CSharpClientCodegen
 */
const CSHARP_RESERVED: ReadonlySet<string> = new Set([
  // Reserved keywords (~78)
  'abstract', 'as', 'base', 'bool', 'break', 'byte', 'case', 'catch', 'char',
  'checked', 'class', 'const', 'continue', 'decimal', 'default', 'delegate',
  'do', 'double', 'else', 'enum', 'event', 'explicit', 'extern', 'false',
  'finally', 'fixed', 'float', 'for', 'foreach', 'goto', 'if', 'implicit',
  'in', 'int', 'interface', 'internal', 'is', 'lock', 'long', 'namespace',
  'new', 'null', 'object', 'operator', 'out', 'override', 'params', 'private',
  'protected', 'public', 'readonly', 'ref', 'return', 'sbyte', 'sealed',
  'short', 'sizeof', 'stackalloc', 'static', 'string', 'struct', 'switch',
  'this', 'throw', 'true', 'try', 'typeof', 'uint', 'ulong', 'unchecked',
  'unsafe', 'ushort', 'using', 'virtual', 'void', 'volatile', 'while',
  // Contextual keywords
  'add', 'alias', 'ascending', 'async', 'await', 'by', 'descending',
  'dynamic', 'equals', 'from', 'get', 'global', 'group', 'into', 'join',
  'let', 'nameof', 'on', 'orderby', 'partial', 'remove', 'select', 'set',
  'value', 'var', 'when', 'where', 'yield', 'init', 'record', 'required',
  'file', 'scoped', 'with',
]);

/**
 * Kotlin keywords (hard + soft + modifier).
 * Sources:
 *   - https://kotlinlang.org/docs/keyword-reference.html
 */
const KOTLIN_RESERVED: ReadonlySet<string> = new Set([
  // Hard keywords
  'as', 'break', 'class', 'continue', 'do', 'else', 'false', 'for', 'fun',
  'if', 'in', 'interface', 'is', 'null', 'object', 'package', 'return',
  'super', 'this', 'throw', 'true', 'try', 'typealias', 'typeof', 'val',
  'var', 'when', 'while',
  // Soft keywords
  'by', 'catch', 'constructor', 'delegate', 'dynamic', 'field', 'file',
  'finally', 'get', 'import', 'init', 'param', 'property', 'receiver',
  'set', 'setparam', 'where', 'value',
  // Modifier keywords
  'abstract', 'actual', 'annotation', 'companion', 'const', 'crossinline',
  'data', 'enum', 'expect', 'external', 'final', 'infix', 'inline', 'inner',
  'internal', 'lateinit', 'noinline', 'open', 'operator', 'out', 'override',
  'private', 'protected', 'public', 'reified', 'sealed', 'suspend', 'tailrec',
  'vararg',
  // Special identifiers
  'it',
]);

// =============================================================================
// 2. Aggregate map.
// =============================================================================

export type Target =
  | 'java'
  | 'go'
  | 'python'
  | 'javascript'
  | 'rust'
  | 'csharp'
  | 'kotlin';

export const RESERVED_BY_TARGET: Readonly<Record<Target, ReadonlySet<string>>> = Object.freeze({
  java: JAVA_RESERVED,
  go: GO_RESERVED,
  python: PYTHON_RESERVED,
  javascript: JAVASCRIPT_RESERVED,
  rust: RUST_RESERVED,
  csharp: CSHARP_RESERVED,
  kotlin: KOTLIN_RESERVED,
});

/** All seven SDK targets — used as default if `targets` option omitted. */
export const ALL_TARGETS: readonly Target[] = [
  'java', 'go', 'python', 'javascript', 'rust', 'csharp', 'kotlin',
] as const;

// =============================================================================
// 3. Detection logic.
// =============================================================================

/**
 * Return the list of targets where `name` collides with a reserved keyword
 * / built-in identifier. Empty array = safe in all asked targets.
 */
export function findCollisions(
  name: string,
  targets: readonly Target[] = ALL_TARGETS,
): Target[] {
  if (typeof name !== 'string' || name.length === 0) return [];
  const hits: Target[] = [];
  for (const t of targets) {
    if (RESERVED_BY_TARGET[t].has(name)) hits.push(t);
  }
  return hits;
}

/**
 * Spectral-compatible total-keyword count helper (handy for tests).
 * Sums distinct keyword-tokens across all 7 tables.
 */
export function totalKeywordCount(): number {
  const all = new Set<string>();
  for (const t of ALL_TARGETS) {
    for (const k of RESERVED_BY_TARGET[t]) all.add(`${t}:${k}`);
  }
  return all.size;
}

/**
 * Distinct identifier-token count (collapsed across languages).
 * Useful sanity-check for the comprehensiveness audit.
 */
export function distinctIdentifierCount(): number {
  const all = new Set<string>();
  for (const t of ALL_TARGETS) {
    for (const k of RESERVED_BY_TARGET[t]) all.add(k);
  }
  return all.size;
}

// =============================================================================
// 4. Spectral function options + factory.
// =============================================================================

export interface MultiLangReservedKeywordsOptions {
  /** What kind of identifier the input represents (used in error message). */
  kind: 'property' | 'operationId' | 'parameter';
  /**
   * Subset of targets to check — defaults to all seven if omitted. Useful
   * to silence specific-language collisions when the spec author has opted
   * out of generating SDKs for that language.
   */
  targets?: readonly Target[];
}

/**
 * Spectral RulesetFunction implementation.
 *
 * Spectral hands us:
 *   - input  : the resolved value at `given` (must be the identifier string)
 *   - options: { kind, targets? }
 *   - context: rule context (we use context.path for location-attribution
 *              upstream)
 *
 * We return one IFunctionResult per call (with all colliding targets named
 * in the message) — Spectral attaches the existing `path` automatically.
 *
 * Note: Spectral may pass us either the value (when `field` is set on
 * `then`) or the parent object. Our YAML-rules will use a JSONPath that
 * lands on the parent, with `field: '@key'` (when checking property keys)
 * — in which case Spectral hands us the key as the input.
 */
export const multiLangReservedKeywords = (
  input: unknown,
  options: MultiLangReservedKeywordsOptions,
  _context: RulesetFunctionContext,
): IFunctionResult[] => {
  const name = typeof input === 'string' ? input : null;
  if (name === null || name.length === 0) return [];

  const targets = options?.targets ?? ALL_TARGETS;
  const collisions = findCollisions(name, targets);
  if (collisions.length === 0) return [];

  const kindLabel =
    options?.kind === 'operationId'
      ? 'operationId'
      : options?.kind === 'parameter'
        ? 'Parameter name'
        : 'Property name';

  return [
    {
      message:
        `${kindLabel} \`${name}\` collides with reserved keywords / built-ins in ` +
        `${collisions.length === 1 ? 'this SDK target' : 'these SDK targets'}: ${collisions.join(', ')}. ` +
        `Codegen tools either silently rename (e.g. \`type\` -> \`_type\` in Java), ` +
        `produce un-compilable output, or strip-collide adjacent identifiers. Rename to avoid collisions.`,
    },
  ];
};

export default multiLangReservedKeywords;
