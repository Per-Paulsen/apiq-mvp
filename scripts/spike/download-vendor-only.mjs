// One-shot vendor-only patch: write the 4 vendor specs that fail strict filter but
// are known-good high-quality APIs (stripe, digitalocean, twilio, gitlab).
// They get force-included on disk so M2c can use them by name.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CORPUS_DIR = path.join(__dirname, 'data', 'healthy-corpus');

const VENDOR_PATCH = [
  { id: 'stripe--core--latest', url: 'https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json' },
  { id: 'digitalocean--core--main', url: 'https://raw.githubusercontent.com/digitalocean/openapi/main/specification/DigitalOcean-public.v2.yaml' },
  { id: 'twilio--core--main', url: 'https://raw.githubusercontent.com/twilio/twilio-oai/main/spec/json/twilio_api_v2010.json' },
  { id: 'gitlab--core--main', url: 'https://gitlab.com/gitlab-org/gitlab/-/raw/master/doc/api/openapi/openapi_v2.yaml' },
];

async function main() {
  for (const v of VENDOR_PATCH) {
    try {
      const text = await fetch(v.url, { signal: AbortSignal.timeout(60_000) }).then(r => r.text());
      let body;
      const trimmed = text.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        body = JSON.parse(text);
      } else {
        const yaml = await import('yaml');
        body = yaml.parse(text);
      }
      // sanitize (strip x-logo)
      if (body?.info?.['x-logo']) delete body.info['x-logo'];
      const ops = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];
      let opsCount = 0, descCount = 0;
      for (const p of Object.values(body.paths || {})) {
        if (!p || typeof p !== 'object') continue;
        for (const m of ops) {
          if (p[m] && typeof p[m] === 'object') {
            opsCount++;
            if (((p[m].description || p[m].summary) || '').trim()) descCount++;
          }
        }
      }
      const fp = path.join(CORPUS_DIR, `${v.id}.json`);
      fs.writeFileSync(fp, JSON.stringify(body));
      console.log(`OK ${v.id}: oas=${body.openapi || body.swagger}, ops=${opsCount}, desc=${descCount} (${(descCount/opsCount*100).toFixed(0)}%), tags=${(body.tags || []).length}, size=${(fs.statSync(fp).size / 1024).toFixed(0)}KB`);
    } catch (e) {
      console.error(`FAIL ${v.id}:`, e.message);
    }
  }
}

main();
