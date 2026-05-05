/**
 * Deterministic-Layer public API.
 *
 * Stage-A pre-pass: walks the spec, runs Spectral (OAS3-default + apiq-custom
 * ruleset) + cross-cutting statistical walkers + per-API-family domain-knowledge
 * libraries. Returns findings in the canonical Finding-Schema so they can flow
 * through the same Apply / Patch / Score machinery as LLM findings.
 *
 * Used as Phase-B pre-pass: emits findings for what's mechanically detectable,
 * leaving the LLM Phase-1 + Phase-2 to focus on knowledge-backed-gap class
 * findings instead of repetitive Spectral-class issues.
 *
 * Public entry point:
 *   `runDeterministicLayer(spec, opts) => Promise<DeterministicLayerResult>`
 */

import type { Finding } from '../schema.js';
import type {
  DetectorFinding,
  DetectorLayer,
  DetectorOptions,
  DeterministicLayerResult,
} from './types.js';
import { mapDetectorFindings } from './output-mapper.js';

// Layer-runner functions — each will be implemented by an agent in Tasks
// A1.1 (spectral-oas3-default + spectral-apiq-custom), A1.3 (walkers), A2
// (domain-knowledge). For now they're stubs returning empty arrays so the
// public API compiles and the integration-shape is fixed.

let _spectralRunner: ((spec: object, opts?: DetectorOptions) => Promise<DetectorFinding[]>) | null = null;
let _walkerRunner: ((spec: object, opts?: DetectorOptions) => Promise<DetectorFinding[]>) | null = null;
let _domainKnowledgeRunner: ((spec: object, opts?: DetectorOptions) => Promise<DetectorFinding[]>) | null = null;

/** Late-bind the spectral runner once it's implemented. */
export function registerSpectralRunner(fn: typeof _spectralRunner): void {
  _spectralRunner = fn;
}

/** Late-bind the walkers runner once it's implemented. */
export function registerWalkerRunner(fn: typeof _walkerRunner): void {
  _walkerRunner = fn;
}

/** Late-bind the domain-knowledge runner once it's implemented. */
export function registerDomainKnowledgeRunner(fn: typeof _domainKnowledgeRunner): void {
  _domainKnowledgeRunner = fn;
}

export async function runDeterministicLayer(
  spec: object,
  opts: DetectorOptions = {}
): Promise<DeterministicLayerResult> {
  const startedAt = Date.now();
  const collected: DetectorFinding[] = [];

  if (_spectralRunner) {
    try {
      collected.push(...(await _spectralRunner(spec, opts)));
    } catch (err) {
      console.warn(`[deterministic] spectral-runner failed: ${err instanceof Error ? err.message : err}`);
    }
  }
  if (_walkerRunner) {
    try {
      collected.push(...(await _walkerRunner(spec, opts)));
    } catch (err) {
      console.warn(`[deterministic] walker-runner failed: ${err instanceof Error ? err.message : err}`);
    }
  }
  if (_domainKnowledgeRunner) {
    try {
      collected.push(...(await _domainKnowledgeRunner(spec, opts)));
    } catch (err) {
      console.warn(`[deterministic] domain-knowledge-runner failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  const findings: Finding[] = mapDetectorFindings(collected);

  const perLayer: Record<DetectorLayer, number> = {
    'spectral-oas3-default': 0,
    'spectral-apiq-custom': 0,
    'walker-statistical': 0,
    'domain-knowledge': 0,
  };
  const perDetector: Record<string, number> = {};
  for (const c of collected) {
    perLayer[c.layer]++;
    perDetector[c.detectorId] = (perDetector[c.detectorId] ?? 0) + 1;
  }

  return {
    findings,
    perLayer,
    perDetector,
    durationMs: Date.now() - startedAt,
  };
}

/**
 * Auto-register all default runners. Call once at module-init time in a host
 * (e.g. a CLI script) so the public API "just works" without manual wiring.
 *
 * Each layer-module is loaded lazily and registered if available; missing
 * modules don't break the whole layer (we just lose that layer's findings).
 */
export async function registerDefaultRunners(): Promise<void> {
  try {
    const mod = await import('./spectral-runner.js');
    if (mod.runSpectralLayers) registerSpectralRunner(mod.runSpectralLayers);
  } catch {
    // module not yet present — agents are still building it
  }
  try {
    const mod = await import('./walkers/index.js');
    if (mod.runWalkers) registerWalkerRunner(mod.runWalkers);
  } catch {
    // module not yet present
  }
  try {
    const mod = await import('./domain-knowledge/index.js');
    if (mod.runDomainKnowledgeLayers) registerDomainKnowledgeRunner(mod.runDomainKnowledgeLayers);
  } catch {
    // module not yet present
  }
}

export type { DetectorFinding, DetectorOptions, DeterministicLayerResult, DetectorLayer } from './types.js';
