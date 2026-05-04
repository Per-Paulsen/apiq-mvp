/**
 * Endpoint-splitter for Architecture (C) Two-Call.
 *
 * Given a dereferenced + cycle-stripped OpenAPI spec, produces:
 *   - shared spec metadata (info, servers, security, securitySchemes) — passed
 *     once to each per-endpoint call as compact context
 *   - per-endpoint slices: { path, method, operation, pathLevelParameters }
 *     where the operation's schemas are already inline (no further $ref
 *     resolution needed; the spec is dereferenced upstream).
 *
 * Each slice is sized to fit comfortably in a Haiku-class call (target
 * ≤10K tokens including system prompt and shared metadata).
 */

const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace'] as const;
type Method = (typeof METHODS)[number];

export interface SpecMetadata {
  title: string;
  version: string;
  description?: string;
  servers?: unknown[];
  security?: unknown[];
  securitySchemes?: unknown;
  // Optional: top-level tags carry cross-cutting context that helps each
  // per-endpoint call interpret the operation's domain.
  tags?: unknown[];
}

export interface EndpointSlice {
  path: string;
  method: Method;
  operation: unknown;
  // OpenAPI 3.0 §4.7.6 allows path-level `parameters` shared by all methods
  // on the same path. We carry these alongside the op so the Haiku call sees
  // the full request shape.
  pathLevelParameters?: unknown[];
}

export interface SplitResult {
  metadata: SpecMetadata;
  slices: EndpointSlice[];
}

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export function splitEndpoints(spec: unknown): SplitResult {
  if (!isObject(spec)) {
    throw new Error('splitEndpoints: spec must be an object');
  }

  const info = isObject(spec.info) ? spec.info : {};
  const components = isObject(spec.components) ? spec.components : {};

  const metadata: SpecMetadata = {
    title: typeof info.title === 'string' ? info.title : '(unknown)',
    version: typeof info.version === 'string' ? info.version : '(unknown)',
    description: typeof info.description === 'string' ? info.description : undefined,
    servers: Array.isArray(spec.servers) ? spec.servers : undefined,
    security: Array.isArray(spec.security) ? spec.security : undefined,
    securitySchemes: isObject(components.securitySchemes) ? components.securitySchemes : undefined,
    tags: Array.isArray(spec.tags) ? spec.tags : undefined,
  };

  const paths = isObject(spec.paths) ? spec.paths : {};
  const slices: EndpointSlice[] = [];

  for (const [pathKey, pathItem] of Object.entries(paths)) {
    if (!isObject(pathItem)) continue;
    const pathLevelParameters = Array.isArray(pathItem.parameters)
      ? pathItem.parameters
      : undefined;
    for (const m of METHODS) {
      const op = pathItem[m];
      if (!op || !isObject(op)) continue;
      slices.push({
        path: pathKey,
        method: m,
        operation: op,
        pathLevelParameters,
      });
    }
  }

  return { metadata, slices };
}

/**
 * Estimate per-slice token size (chars / 4 heuristic) for cost-planning.
 * Returns descriptive stats over all slices.
 */
export function estimateSliceTokens(result: SplitResult): {
  count: number;
  metadataChars: number;
  metadataTokens: number;
  sliceMin: number;
  sliceMedian: number;
  sliceP90: number;
  sliceMax: number;
  sliceMean: number;
  totalSliceChars: number;
} {
  const metadataJson = JSON.stringify(result.metadata);
  const metadataChars = metadataJson.length;
  const sizes = result.slices.map((s) => JSON.stringify(s).length);
  sizes.sort((a, b) => a - b);
  const sum = sizes.reduce((a, b) => a + b, 0);
  return {
    count: sizes.length,
    metadataChars,
    metadataTokens: Math.ceil(metadataChars / 4),
    sliceMin: sizes[0] ?? 0,
    sliceMedian: sizes[Math.floor(sizes.length / 2)] ?? 0,
    sliceP90: sizes[Math.floor(sizes.length * 0.9)] ?? 0,
    sliceMax: sizes[sizes.length - 1] ?? 0,
    sliceMean: sizes.length === 0 ? 0 : sum / sizes.length,
    totalSliceChars: sum,
  };
}
