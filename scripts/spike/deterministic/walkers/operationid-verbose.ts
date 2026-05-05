/**
 * Walker: verbose machine-generated operationId values.
 *
 * Targets stripe F26 ("`operationId` values are excessively verbose
 * machine-generated names rather than human-readable identifiers").
 *
 * Threshold: >50% of operationIds are >40 characters.
 */

import type { DetectorFinding, DetectorOptions } from '../types.js';
import { walkOperations, pct } from './_shared.js';

const VERBOSE_THRESHOLD = 40;

export async function walkOperationIdVerbose(
  spec: object,
  _opts?: DetectorOptions
): Promise<DetectorFinding[]> {
  let total = 0;
  let verbose = 0;
  const lengths: number[] = [];
  const examples: string[] = [];

  for (const { operation } of walkOperations(spec)) {
    const opId = operation.operationId;
    if (typeof opId !== 'string' || opId.length === 0) continue;
    total++;
    lengths.push(opId.length);
    if (opId.length > VERBOSE_THRESHOLD) {
      verbose++;
      if (examples.length < 3) examples.push(opId);
    }
  }

  if (total === 0) return [];
  const ratio = verbose / total;
  if (ratio <= 0.5) return [];

  // Median + p90
  lengths.sort((a, b) => a - b);
  const median = lengths[Math.floor(lengths.length / 2)] ?? 0;
  const p90 = lengths[Math.floor(lengths.length * 0.9)] ?? 0;
  const longest = lengths[lengths.length - 1] ?? 0;

  const percentage = pct(verbose, total);
  return [
    {
      detectorId: 'walker:operationid-verbose',
      layer: 'walker-statistical',
      title: 'operationId values are verbose machine-generated names',
      narration:
        `${verbose}/${total} operationIds (${percentage}%) are longer than ${VERBOSE_THRESHOLD} ` +
        `characters. Length statistics: median ${median} characters, p90 ${p90}, longest ${longest}. ` +
        `These appear to follow a \`<HTTPMethod><PathSegmentsConcatenated>\` machine-generation pattern. ` +
        `Examples: ${examples.join(', ')}. ` +
        `These names are unidiomatic in any language they're rendered into ` +
        `(\`stripe.PostCustomersCustomerSubscriptionsSubscriptionExposedIdDiscount\` vs. ` +
        `\`stripe.subscriptions.deleteDiscount\`). Idiomatic operationIds (verb-noun, GitHub-style ` +
        `\`repos/listForOrg\` or Twilio-style \`messages.create\`) produce far more readable SDKs.`,
      rationale:
        'OpenAPI 3.0 §4.7.4 names `operationId` as "a unique string used to identify the operation" ' +
        'with no length convention, but the de-facto industry pattern (GitHub, Twilio, Slack, Discord) ' +
        'uses verb-noun (or noun-verb) idiomatic forms. Long auto-generated names are technically ' +
        'valid but a clarity regression.',
      category: 'clarity',
      severity: 'medium',
      scope: 'spec',
      affectedEndpoints: [],
      patchOps: [],
      patchSummary: 'Replace machine-generated operationId names with shorter, idiomatic verbs (e.g. `listCustomers`, `createCharge`).',
      meta: { verbose, total, percentage, median, p90, longest },
    },
  ];
}
