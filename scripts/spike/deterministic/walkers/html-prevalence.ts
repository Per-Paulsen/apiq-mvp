/**
 * Walker: HTML markup prevalence in operation descriptions.
 *
 * Targets stripe F3 ("Operation descriptions use HTML markup; OpenAPI 3.x
 * assumes CommonMark") and github F11-style HTML-in-prose patterns.
 *
 * Threshold: >5% of operations carry HTML in their `description`.
 */

import type { DetectorFinding, DetectorOptions } from '../types.js';
import { walkOperations, pct, formatExamples } from './_shared.js';

const HTML_TAG_RE = /<\s*(p|a|code|strong|em|li|ul|ol|h[1-6]|br|div|span|b|i|table|tr|td|th|blockquote|pre)\b/i;

export async function walkHtmlPrevalence(
  spec: object,
  _opts?: DetectorOptions
): Promise<DetectorFinding[]> {
  let total = 0;
  let withHtml = 0;
  const examples: string[] = [];

  for (const { path, method, operation } of walkOperations(spec)) {
    total++;
    const desc = operation.description;
    if (typeof desc === 'string' && HTML_TAG_RE.test(desc)) {
      withHtml++;
      if (examples.length < 3) {
        examples.push(`${method.toUpperCase()} ${path}`);
      }
    }
  }

  if (total === 0) return [];
  const ratio = withHtml / total;
  if (ratio <= 0.05) return [];

  const percentage = pct(withHtml, total);
  return [
    {
      detectorId: 'walker:html-prevalence',
      layer: 'walker-statistical',
      title: 'Operation descriptions use HTML markup; OpenAPI 3.x assumes CommonMark',
      narration:
        `${withHtml}/${total} operations (${percentage}%) carry HTML tags ` +
        `(\`<p>\`, \`<a>\`, \`<code>\`, \`<strong>\`, ...) in their \`description\` field. ` +
        `Examples: ${formatExamples(examples)}. ` +
        `OpenAPI 3.0 §3 specifies that all description fields support CommonMark Markdown; ` +
        `renderers (ReDoc, SwaggerUI, Stoplight Elements) handle inline HTML inconsistently, ` +
        `especially around block elements. AI agents that consume the spec to generate ` +
        `documentation prompts get HTML they then have to sanitise or convert.`,
      rationale:
        'OpenAPI 3.0 §3 ("Specification") states that all description fields support CommonMark ' +
        'Markdown formatting. Consistently using HTML rather than Markdown defeats the cross-renderer ' +
        'compatibility that the standard provides.',
      category: 'clarity',
      severity: 'high',
      scope: 'spec',
      affectedEndpoints: [],
      patchOps: [],
      patchSummary: 'Convert HTML markup in operation `description` fields to CommonMark.',
      meta: { withHtml, total, percentage },
    },
  ];
}
