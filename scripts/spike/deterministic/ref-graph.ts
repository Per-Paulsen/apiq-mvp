/**
 * $ref-Graph-Analyse — Stage-A deterministic detector (Task A1.3 #3).
 *
 * Builds the $ref-graph of an OpenAPI spec (nodes = component-objects,
 * edges = `$ref` pointers) and emits four classes of finding:
 *
 *   1. **Cycle-Detection** (Brainstorm-ID A2). `cycleStripSpec` already strips
 *      cycles silently before we hand the dereferenced spec to the LLM. This
 *      detector lifts that knowledge into a reportable finding so users see
 *      that recursive schemas exist in the spec.
 *
 *   2. **Orphan-Components** (Brainstorm-ID O1) across all 9 OAS-3 component
 *      classes — `schemas`, `headers`, `parameters`, `responses`, `examples`,
 *      `requestBodies`, `links`, `callbacks`, `securitySchemes`. Spectral's
 *      built-in `oas3-unused-component` only covers `schemas` (the rule's
 *      `given` filter lists `$.components.schemas` only). The
 *      `walkUnusedComponentHeaders` walker covers `headers`. We generalise to
 *      every component class so codegen consumers don't ship dead code.
 *
 *   3. **Deep-$ref-Chain** (refactor-smell). Schemas that sit at the end of a
 *      chain of `>5` `$ref` hops are usually the result of unwinding inheritance
 *      via `allOf`-of-`$ref` chains. Codegen often loses precision (or hits its
 *      own depth limit) on these.
 *
 *   4. **Component-Reuse-Histogram**. We count how often each component is
 *      `$ref`-erenced and emit a finding when the distribution is very skewed
 *      (a large fraction of components are referenced exactly once → could be
 *      inlined; a small number is referenced very many times → reuse-hotspots
 *      worth highlighting).
 *
 * All findings are emitted as `DetectorFinding` records; `output-mapper.ts`
 * normalises them into canonical `FindingSchema` shape.
 *
 * The graph is built from the **raw spec** (with `$ref`s intact). Callers that
 * accidentally pass a fully-dereferenced spec get a defensive `cycleStripSpec`
 * pre-pass so we don't blow the stack on recursive schemas, but the cycle
 * finding will be empty (cycles only appear via $ref chains in the raw spec).
 *
 * CLI:
 *   `npx tsx deterministic/ref-graph.ts <spec-name>`
 */

import type { DetectorFinding, DetectorOptions } from './types.js';
import { cycleStripSpec } from '../stringify-spec.js';

// =============================================================================
// Component classes — OAS 3.0/3.1 lists 9 distinct component sub-objects under
// `components.*`. Spectral's `oas3-unused-component` covers only the first one;
// our `walkUnusedComponentHeaders` covers `headers`. We generalise to all 9.
// =============================================================================

const COMPONENT_CLASSES = [
  'schemas',
  'headers',
  'parameters',
  'responses',
  'examples',
  'requestBodies',
  'links',
  'callbacks',
  'securitySchemes',
] as const;

type ComponentClass = (typeof COMPONENT_CLASSES)[number];

// =============================================================================
// $ref-graph data model
// =============================================================================

/** A node in the ref-graph: a component identified by class + name. */
interface ComponentNode {
  componentClass: ComponentClass;
  name: string;
  /** JSON-pointer of the component definition itself, e.g. `#/components/schemas/Pet`. */
  pointer: string;
  /** $ref targets this component points TO (out-edges). */
  outEdges: string[];
  /** Times this component is $ref'd from anywhere in the spec (in-degree). */
  inDegree: number;
  /** Times this component is $ref'd from outside `components.*` (i.e. real "use"). */
  externalInDegree: number;
}

interface RefGraph {
  nodes: Map<string, ComponentNode>;
  /** Cycles: each entry is a list of pointers forming the cycle. */
  cycles: string[][];
  /** Pointers that are referenced but not declared (dangling refs). Reported separately. */
  dangling: Set<string>;
}

// =============================================================================
// Helpers
// =============================================================================

const COMPONENT_REF_PATTERN =
  /^#\/components\/(schemas|headers|parameters|responses|examples|requestBodies|links|callbacks|securitySchemes)\/([^/]+)(\/.*)?$/;

function isComponentRef(ref: string): { cls: ComponentClass; name: string } | null {
  const m = ref.match(COMPONENT_REF_PATTERN);
  if (!m) return null;
  return { cls: m[1] as ComponentClass, name: decodeURIComponent(m[2]) };
}

function pointerFor(cls: ComponentClass, name: string): string {
  // JSON-pointer escape: `~` → `~0`, `/` → `~1`. Component names rarely contain
  // these but Stripe occasionally has dotted names which JSON-pointer leaves alone.
  const escaped = name.replace(/~/g, '~0').replace(/\//g, '~1');
  return `#/components/${cls}/${escaped}`;
}

/**
 * Collect every `$ref` string under `node`, returning them as an array. We
 * deliberately keep duplicates so the caller can count usage frequencies.
 *
 * The traversal is safe against pre-dereferenced specs (real JS cycles) via
 * the `seen` WeakSet.
 */
function collectRefsUnder(node: unknown): string[] {
  const out: string[] = [];
  const seen = new WeakSet<object>();
  function visit(n: unknown): void {
    if (!n || typeof n !== 'object') return;
    if (seen.has(n as object)) return;
    seen.add(n as object);
    if (Array.isArray(n)) {
      for (const item of n) visit(item);
      return;
    }
    for (const [k, v] of Object.entries(n as Record<string, unknown>)) {
      if (k === '$ref' && typeof v === 'string') {
        out.push(v);
      } else {
        visit(v);
      }
    }
  }
  visit(node);
  return out;
}

// =============================================================================
// Graph construction
// =============================================================================

export function buildRefGraph(spec: object): RefGraph {
  const root = spec as Record<string, unknown>;
  const components = (root.components as Record<string, unknown> | undefined) ?? {};

  const nodes = new Map<string, ComponentNode>();

  // 1. Declare every component as a node.
  for (const cls of COMPONENT_CLASSES) {
    const bucket = components[cls];
    if (!bucket || typeof bucket !== 'object') continue;
    for (const [name, def] of Object.entries(bucket as Record<string, unknown>)) {
      const pointer = pointerFor(cls, name);
      const outEdges = collectRefsUnder(def);
      nodes.set(pointer, {
        componentClass: cls,
        name,
        pointer,
        outEdges,
        inDegree: 0,
        externalInDegree: 0,
      });
    }
  }

  // 2. Walk the WHOLE spec to compute in-degree (incl. references inside
  //    components.* — those count for in-degree but not for "external" use).
  const allRefs = collectRefsUnder(spec);
  const dangling = new Set<string>();
  for (const ref of allRefs) {
    const parsed = isComponentRef(ref);
    if (!parsed) continue;
    const ptr = pointerFor(parsed.cls, parsed.name);
    const node = nodes.get(ptr);
    if (!node) {
      dangling.add(ref);
      continue;
    }
    node.inDegree++;
  }

  // 3. Walk the spec EXCLUDING `components.*` to compute external in-degree
  //    (the proper "is this component actually used in operations?" measure).
  const externalRefs: string[] = [];
  for (const [topKey, topVal] of Object.entries(root)) {
    if (topKey === 'components') continue;
    externalRefs.push(...collectRefsUnder(topVal));
  }
  for (const ref of externalRefs) {
    const parsed = isComponentRef(ref);
    if (!parsed) continue;
    const ptr = pointerFor(parsed.cls, parsed.name);
    const node = nodes.get(ptr);
    if (!node) continue; // already counted in dangling above
    node.externalInDegree++;
  }

  // 4. Cycle-detection via Tarjan-style DFS. We work on the component-level
  //    graph (component → component edges). Since out-edges are recorded as
  //    ref-strings, we resolve them to pointers and ignore non-component refs.
  const cycles = detectCycles(nodes);

  return { nodes, cycles, dangling };
}

/**
 * Detect cycles in the component graph using iterative Tarjan SCC.
 * Returns one representative cycle per non-trivial SCC (size ≥ 2, OR size = 1
 * with a self-edge).
 *
 * Iterative form is needed because recursive DFS overflows on Stripe-scale
 * specs (1000+ components).
 */
function detectCycles(nodes: Map<string, ComponentNode>): string[][] {
  const cycles: string[][] = [];

  const index = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  let nextIndex = 0;

  // Build adjacency: pointer → array of pointer-targets.
  const adj = new Map<string, string[]>();
  for (const node of nodes.values()) {
    const targets: string[] = [];
    for (const ref of node.outEdges) {
      const parsed = isComponentRef(ref);
      if (!parsed) continue;
      const targetPtr = pointerFor(parsed.cls, parsed.name);
      if (nodes.has(targetPtr)) targets.push(targetPtr);
    }
    adj.set(node.pointer, targets);
  }

  // Iterative Tarjan:
  // Frame: { v, iter: index-into-adj[v] }. Push frame on call, pop on return.
  type Frame = { v: string; i: number };
  const frames: Frame[] = [];

  function strongconnect(v0: string): void {
    frames.push({ v: v0, i: 0 });
    index.set(v0, nextIndex);
    lowlink.set(v0, nextIndex);
    nextIndex++;
    stack.push(v0);
    onStack.add(v0);

    while (frames.length > 0) {
      const top = frames[frames.length - 1];
      const successors = adj.get(top.v) ?? [];
      if (top.i < successors.length) {
        const w = successors[top.i++];
        if (!index.has(w)) {
          // recurse
          index.set(w, nextIndex);
          lowlink.set(w, nextIndex);
          nextIndex++;
          stack.push(w);
          onStack.add(w);
          frames.push({ v: w, i: 0 });
        } else if (onStack.has(w)) {
          lowlink.set(top.v, Math.min(lowlink.get(top.v)!, index.get(w)!));
        }
      } else {
        // Done with v: emit SCC if v is the SCC root.
        if (lowlink.get(top.v) === index.get(top.v)) {
          const scc: string[] = [];
          let w: string | undefined;
          do {
            w = stack.pop();
            if (w === undefined) break;
            onStack.delete(w);
            scc.push(w);
          } while (w !== top.v);
          // Non-trivial SCC: size > 1 OR self-edge.
          const isSelfLoop =
            scc.length === 1 && (adj.get(scc[0]) ?? []).includes(scc[0]);
          if (scc.length > 1 || isSelfLoop) {
            cycles.push(scc.reverse());
          }
        }
        frames.pop();
        // Propagate lowlink up to parent.
        if (frames.length > 0) {
          const parent = frames[frames.length - 1];
          lowlink.set(
            parent.v,
            Math.min(lowlink.get(parent.v)!, lowlink.get(top.v)!)
          );
        }
      }
    }
  }

  for (const ptr of nodes.keys()) {
    if (!index.has(ptr)) {
      strongconnect(ptr);
    }
  }

  return cycles;
}

// =============================================================================
// Deepest-chain analysis. Computes the longest acyclic dependency-chain rooted
// at each component. We use an iterative DFS with a memoization map so a single
// component is visited once even on Stripe-scale specs.
// =============================================================================

interface DepthResult {
  /** Pointer → max-depth (longest acyclic out-chain). */
  depth: Map<string, number>;
  /** Pointer → representative deepest path (one of possibly many). */
  pathTo: Map<string, string[]>;
}

function computeDepths(graph: RefGraph): DepthResult {
  const depth = new Map<string, number>();
  const pathTo = new Map<string, string[]>();
  // Build pointer-targets adjacency once.
  const adj = new Map<string, string[]>();
  for (const node of graph.nodes.values()) {
    const targets: string[] = [];
    for (const ref of node.outEdges) {
      const parsed = isComponentRef(ref);
      if (!parsed) continue;
      const targetPtr = pointerFor(parsed.cls, parsed.name);
      if (graph.nodes.has(targetPtr)) targets.push(targetPtr);
    }
    adj.set(node.pointer, targets);
  }

  // Iterative post-order DFS. To handle cycles we mark `visiting` and treat
  // back-edges as depth=0 (they're already accounted for in cycle-finding).
  const VISITING = 1;
  const VISITED = 2;
  const state = new Map<string, number>();

  type Frame = { v: string; i: number; bestD: number; bestPath: string[] };

  for (const start of graph.nodes.keys()) {
    if (state.get(start) === VISITED) continue;
    const stack: Frame[] = [{ v: start, i: 0, bestD: 0, bestPath: [start] }];
    state.set(start, VISITING);

    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      const successors = adj.get(top.v) ?? [];
      if (top.i < successors.length) {
        const w = successors[top.i++];
        const wState = state.get(w);
        if (wState === VISITED) {
          const wd = depth.get(w) ?? 0;
          const candidate = 1 + wd;
          if (candidate > top.bestD) {
            top.bestD = candidate;
            top.bestPath = [top.v, ...(pathTo.get(w) ?? [w])];
          }
        } else if (wState === VISITING) {
          // Back-edge → cycle. Treat as depth 0; cycle-detector handles it.
          continue;
        } else {
          state.set(w, VISITING);
          stack.push({ v: w, i: 0, bestD: 0, bestPath: [w] });
        }
      } else {
        // Pop: record depth.
        depth.set(top.v, top.bestD);
        pathTo.set(top.v, top.bestPath);
        state.set(top.v, VISITED);
        stack.pop();
        if (stack.length > 0) {
          const parent = stack[stack.length - 1];
          const candidate = 1 + top.bestD;
          if (candidate > parent.bestD) {
            parent.bestD = candidate;
            parent.bestPath = [parent.v, ...top.bestPath];
          }
        }
      }
    }
  }

  return { depth, pathTo };
}

// =============================================================================
// Findings emitters
// =============================================================================

/** `>` this many hops on a single chain triggers the deep-chain finding. */
const DEEP_CHAIN_THRESHOLD = 5;
/** Single-use ratio above which the reuse-histogram finding fires. */
const SINGLE_USE_RATIO_THRESHOLD = 0.5;

function emitCycleFinding(graph: RefGraph): DetectorFinding[] {
  if (graph.cycles.length === 0) return [];

  const totalCycleNodes = graph.cycles.reduce((a, c) => a + c.length, 0);
  const exampleCycles = graph.cycles
    .slice(0, 3)
    .map((c) => {
      // Show short forms: components/schemas/Foo → Foo
      const names = c.map((p) => p.replace(/^#\/components\/[^/]+\//, ''));
      // Close the loop visually for clarity.
      return `${names.join(' → ')} → ${names[0]}`;
    });
  const moreSuffix =
    graph.cycles.length > 3 ? ` (and ${graph.cycles.length - 3} more)` : '';

  return [
    {
      detectorId: 'refgraph:cycles',
      layer: 'walker-statistical',
      title:
        graph.cycles.length === 1
          ? '$ref cycle in component graph'
          : `${graph.cycles.length} $ref cycles in component graph`,
      narration:
        `The component graph contains ${graph.cycles.length} cycle(s) covering ` +
        `${totalCycleNodes} component(s). Example cycle(s): ${exampleCycles.join('; ')}${moreSuffix}. ` +
        `Cycles arise when recursive schemas reference themselves (e.g. tree-shaped ` +
        `domain models like \`Comment.replies[].replies[]\`). They are valid OpenAPI but ` +
        `force every consumer (codegen, doc-renderer, LLM analysis) to break the cycle ` +
        `with its own placeholder. \`apiq\` strips cycles silently before LLM analysis ` +
        `via \`cycleStripSpec\`; this finding makes the silent stripping visible to spec authors.`,
      rationale:
        'Recursive `$ref` chains are a well-known OpenAPI footgun: JSON.stringify, ' +
        'fast-json-patch, and several codegen libraries (openapi-typescript, openapi-generator) ' +
        'either crash or silently truncate at an arbitrary depth. Reporting cycles lets spec ' +
        'authors decide whether the recursion is intentional (graph data model) or accidental ' +
        '(inheritance modelled the wrong way).',
      category: 'design',
      severity: 'medium',
      scope: 'spec',
      affectedEndpoints: [],
      patchOps: [],
      patchSummary:
        graph.cycles.length === 1
          ? 'Break the recursive $ref cycle (introduce a leaf-stop or document the recursion).'
          : `Break or document the ${graph.cycles.length} recursive $ref cycles in the component graph.`,
      meta: {
        cycleCount: graph.cycles.length,
        totalCycleNodes,
        cycles: graph.cycles,
      },
    },
  ];
}

function emitOrphanFindings(graph: RefGraph): DetectorFinding[] {
  // Group orphans by component-class so each class gets its own finding —
  // narrations stay focused and the user can address them independently.
  const orphansByClass: Record<string, string[]> = {};
  const totalsByClass: Record<string, number> = {};

  for (const node of graph.nodes.values()) {
    totalsByClass[node.componentClass] =
      (totalsByClass[node.componentClass] ?? 0) + 1;
    if (node.externalInDegree === 0) {
      (orphansByClass[node.componentClass] ??= []).push(node.name);
    }
  }

  const findings: DetectorFinding[] = [];
  for (const cls of COMPONENT_CLASSES) {
    const orphans = orphansByClass[cls];
    if (!orphans || orphans.length === 0) continue;
    const total = totalsByClass[cls] ?? orphans.length;
    const examples = orphans.slice(0, 10).join(', ');
    const moreSuffix =
      orphans.length > 10 ? ` (and ${orphans.length - 10} more)` : '';

    findings.push({
      detectorId: `refgraph:orphans:${cls}`,
      layer: 'walker-statistical',
      title:
        orphans.length === 1
          ? `Unused component.${cls} entry: ${orphans[0]}`
          : `${orphans.length} unused component.${cls} entries`,
      narration:
        `\`components.${cls}\` declares ${total} entry/entries; ` +
        `${orphans.length} of them are never referenced from anywhere outside ` +
        `\`components.*\`: ${examples}${moreSuffix}. ` +
        `Spectral's built-in \`oas3-unused-component\` rule only checks ` +
        `\`components.schemas\`, leaving the other 8 component classes uncovered. ` +
        `Unused component definitions are dead code in the spec — they bloat the ` +
        `document, mislead consumers into thinking the API surface is larger than it ` +
        `is, and break codegen tools that emit one type per component.`,
      rationale:
        `OpenAPI 3.0 §4.7.18 ("Components Object") lists ${cls} as a reusable component ` +
        `class. A definition is only meaningful if at least one operation, response, ` +
        `parameter, or other component references it via \`$ref\`. Definitions reachable ` +
        `only from inside \`components.*\` itself are unreachable from the public surface.`,
      category: 'design',
      severity: 'low',
      scope: 'spec',
      affectedEndpoints: [],
      patchOps: [],
      patchSummary:
        orphans.length === 1
          ? `Remove unused \`components.${cls}.${orphans[0]}\` or reference it from an operation.`
          : `Remove or reference the ${orphans.length} unused \`components.${cls}\` entries.`,
      meta: { componentClass: cls, total, orphanCount: orphans.length, orphans },
    });
  }
  return findings;
}

function emitDeepChainFinding(graph: RefGraph): DetectorFinding[] {
  const { depth, pathTo } = computeDepths(graph);

  const deep: Array<{ pointer: string; depth: number; path: string[] }> = [];
  for (const [ptr, d] of depth.entries()) {
    if (d > DEEP_CHAIN_THRESHOLD) {
      deep.push({ pointer: ptr, depth: d, path: pathTo.get(ptr) ?? [ptr] });
    }
  }
  if (deep.length === 0) return [];

  // Sort deepest-first; report top 5.
  deep.sort((a, b) => b.depth - a.depth);
  const top = deep.slice(0, 5);
  const examples = top
    .map((d) => {
      const shortNames = d.path.map((p) =>
        p.replace(/^#\/components\/[^/]+\//, '')
      );
      return `${shortNames[0]} (${d.depth} hops via ${shortNames.join(' → ')})`;
    })
    .join('; ');
  const moreSuffix = deep.length > 5 ? ` (+ ${deep.length - 5} more)` : '';

  return [
    {
      detectorId: 'refgraph:deep-chain',
      layer: 'walker-statistical',
      title: `${deep.length} component(s) sit at the end of >${DEEP_CHAIN_THRESHOLD}-hop $ref chains`,
      narration:
        `${deep.length} component(s) reach a transitive \`$ref\` depth greater than ` +
        `${DEEP_CHAIN_THRESHOLD} hops. Examples: ${examples}${moreSuffix}. ` +
        `Deep \`$ref\` chains usually result from inheritance modelled as ` +
        `\`allOf\`-of-\`$ref\` ladders (e.g. \`Pet → Mammal → Animal → LivingThing\`). ` +
        `Some codegen tools either lose precision on the leaf type or hit a built-in ` +
        `recursion limit; LLM consumers spend disproportionate token budget unwinding ` +
        `the chain. Consider flattening with \`allOf\` collapse or splitting into ` +
        `discriminated subtypes.`,
      rationale:
        'JSON Schema permits arbitrary `$ref` nesting, but in practice tooling has ' +
        'depth-limits (openapi-generator caps at 10, redocly warns at 12, several SDK ' +
        'generators silently inline up to 5). Chains beyond 5 hops are an architectural ' +
        'smell that hurts both human and machine readers.',
      category: 'design',
      severity: 'low',
      scope: 'spec',
      affectedEndpoints: [],
      patchOps: [],
      patchSummary: `Flatten or split the ${deep.length} component(s) sitting at >${DEEP_CHAIN_THRESHOLD}-hop $ref depth.`,
      meta: {
        threshold: DEEP_CHAIN_THRESHOLD,
        count: deep.length,
        deepest: top.map((d) => ({ pointer: d.pointer, depth: d.depth, path: d.path })),
      },
    },
  ];
}

function emitReuseHistogramFinding(graph: RefGraph): DetectorFinding[] {
  // Only consider component classes that have any non-orphan members; mixing
  // orphans (externalInDegree=0) into the histogram would inflate single-use
  // and conflict with the orphan finding.
  const used: ComponentNode[] = [];
  for (const node of graph.nodes.values()) {
    if (node.externalInDegree > 0) used.push(node);
  }
  if (used.length === 0) return [];

  // Only emit histogram findings for SCHEMAS — other component classes are
  // genuinely "single-use OK" semantically (e.g. one parameter shared across
  // 2 paths is plenty). Schemas are where the inline-vs-extract trade-off
  // shows up most often.
  const schemaUsed = used.filter((n) => n.componentClass === 'schemas');
  if (schemaUsed.length < 10) return []; // too small to call statistical pattern

  const counts: number[] = schemaUsed.map((n) => n.externalInDegree);
  counts.sort((a, b) => a - b);
  const singleUse = counts.filter((c) => c === 1).length;
  const total = counts.length;
  const ratio = singleUse / total;

  // Hot-spots: top-3 most-referenced.
  const hotspots = [...schemaUsed]
    .sort((a, b) => b.externalInDegree - a.externalInDegree)
    .slice(0, 3);
  const median = counts[Math.floor(counts.length / 2)];
  const max = counts[counts.length - 1];

  if (ratio < SINGLE_USE_RATIO_THRESHOLD) {
    // Healthy distribution; nothing to report.
    return [];
  }

  const pctSingle = Math.round(ratio * 1000) / 10;
  const hotspotStr =
    hotspots.length > 0
      ? hotspots.map((h) => `\`${h.name}\` (${h.externalInDegree}×)`).join(', ')
      : '(none above median)';
  const singleUseExamples = schemaUsed
    .filter((n) => n.externalInDegree === 1)
    .slice(0, 5)
    .map((n) => n.name)
    .join(', ');

  return [
    {
      detectorId: 'refgraph:reuse-histogram',
      layer: 'walker-statistical',
      title: `${pctSingle}% of component schemas are referenced exactly once`,
      narration:
        `Of ${total} used component schemas, ${singleUse} (${pctSingle}%) are referenced ` +
        `exactly once. Median reuse = ${median}; max reuse = ${max} (top hotspots: ${hotspotStr}). ` +
        `Single-use examples: ${singleUseExamples}. ` +
        `Single-use schemas often indicate that the author extracted them for ` +
        `cosmetic reasons (one type per file) rather than for genuine reuse. The ` +
        `inlined alternative reduces \`$ref\` indirection, keeps the operation's full ` +
        `request/response shape readable in one place, and lowers tooling depth-traversal ` +
        `cost. Conversely, schemas referenced 50× or more (the hotspots above) are doing ` +
        `their job — those are the abstractions worth investing in documentation for.`,
      rationale:
        'OpenAPI 3.0 §4.7.18 lets `components.schemas` host both genuinely-reusable ' +
        'and merely-cosmetic extractions. A right-skewed reuse histogram (many singleton ' +
        'definitions) suggests the spec was generated from a code-first toolchain that ' +
        'extracts every named class, regardless of reuse value, which inflates the ' +
        'document and the LLM token-budget without delivering reuse benefit.',
      category: 'design',
      severity: 'low',
      scope: 'spec',
      affectedEndpoints: [],
      patchOps: [],
      patchSummary: `Inline the ${singleUse} single-use component schema(s) or document the rationale for keeping them extracted.`,
      meta: {
        totalUsed: total,
        singleUse,
        singleUseRatio: ratio,
        median,
        max,
        hotspots: hotspots.map((h) => ({ name: h.name, count: h.externalInDegree })),
      },
    },
  ];
}

// =============================================================================
// Public API
// =============================================================================

export async function runRefGraphAnalysis(
  spec: object,
  _opts?: DetectorOptions
): Promise<DetectorFinding[]> {
  // Defensive cycleStripSpec: callers may hand us a fully-dereferenced spec.
  // The graph is built from $ref strings so a dereffed spec produces an empty
  // graph (no $refs left), which is fine — we simply emit no findings. The
  // strip is to prevent infinite loops in `collectRefsUnder` if real JS cycles
  // are present.
  const safeSpec = cycleStripSpec(spec) as object;
  const graph = buildRefGraph(safeSpec);

  const findings: DetectorFinding[] = [];
  findings.push(...emitCycleFinding(graph));
  findings.push(...emitOrphanFindings(graph));
  findings.push(...emitDeepChainFinding(graph));
  findings.push(...emitReuseHistogramFinding(graph));
  return findings;
}

// =============================================================================
// CLI
// =============================================================================

async function main(): Promise<void> {
  const path = await import('node:path');
  const fs = await import('node:fs');
  const { fileURLToPath } = await import('node:url');

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const SPIKE_DIR = path.resolve(__dirname, '..');
  const REPO_ROOT = path.resolve(SPIKE_DIR, '..', '..');
  const EXAMPLES_DIR = path.join(REPO_ROOT, 'openapi-examples');

  const specName = process.argv[2];
  if (!specName) {
    console.error('Usage: tsx deterministic/ref-graph.ts <spec-name>');
    console.error('  e.g. tsx deterministic/ref-graph.ts stripe-full');
    process.exit(1);
  }

  const specDir = path.join(EXAMPLES_DIR, specName);
  let specPath: string | null = null;
  for (const ext of ['json', 'yaml', 'yml']) {
    const candidate = path.join(specDir, `spec.${ext}`);
    if (fs.existsSync(candidate)) {
      specPath = candidate;
      break;
    }
  }
  if (!specPath) {
    console.error(`No spec.{json,yaml,yml} found in ${specDir}`);
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

  console.log(`Loaded spec: ${specPath}`);
  const startedAt = Date.now();
  const findings = await runRefGraphAnalysis(spec);
  const durationMs = Date.now() - startedAt;
  console.log(
    `ref-graph analysis: ${findings.length} finding(s) (${durationMs}ms)\n`
  );
  for (const f of findings) {
    console.log(`[${f.detectorId}]`);
    console.log(`  title: ${f.title}`);
    if (f.meta) {
      const metaSummary = JSON.stringify(f.meta).slice(0, 250);
      console.log(`  meta:  ${metaSummary}${metaSummary.length === 250 ? '...' : ''}`);
    }
    console.log('');
  }
}

// Cross-platform-safe entry-point guard
{
  const { pathToFileURL } = await import('node:url');
  if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
    main().catch((err) => {
      console.error(err);
      process.exit(1);
    });
  }
}
