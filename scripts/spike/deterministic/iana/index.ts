/**
 * IANA Registry Snapshot — public re-exports.
 *
 * Wave-2 detector tasks consume IANA registries through this barrel. Each
 * sub-module is a hand-curated snapshot of the relevant IANA registry, with
 * helper functions over Sets / Maps. Quarterly refresh per ./README.md.
 *
 * Coverage / dependency for Wave-2:
 *   - status-codes:       T10 http-protocol-pairings, RFC2-16, RFC2-32
 *   - methods:            T10 http-protocol-pairings, RFC2-8, RFC2-12
 *   - link-relations:     RFC2-52..55 (Link header semantics), apiq-E5
 *   - cache-directives:   RFC2-35..39 (Cache-Control validation), T10
 *   - media-types:        T13 media-type-IANA-validator, RFC2-75..80
 *   - field-names:        T10 http-protocol-pairings, RFC2-12, RFC2-18
 *   - range-units:        RFC2-30..34 (Range / Accept-Ranges)
 */

export * from "./status-codes.js";
export * from "./methods.js";
export * from "./link-relations.js";
export * from "./cache-directives.js";
export * from "./media-types.js";
export * from "./field-names.js";
export * from "./range-units.js";
