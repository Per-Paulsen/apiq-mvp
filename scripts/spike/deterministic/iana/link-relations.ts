/**
 * IANA Link Relation Type Registry — snapshot.
 *
 * Source: https://www.iana.org/assignments/link-relations/link-relations.xhtml
 * (CSV mirror at .../link-relations-1.csv)
 * Snapshot date: 2026-05-06.
 *
 * RFC 8288 §2.1: rel value MUST be a registered relation-type OR an absolute URI.
 * Walkers checking Link headers + apiq-E5 (rel=next on paginated) consume this
 * registry. Coverage: T22 IANA dependency for RFC2-52 (rel-token), RFC2-53
 * (rel=next), RFC2-54 (anchor), and other RFC2-55 link-context invariants.
 *
 * NOTE: This snapshot tracks 133 registered relation names as of 2026-05-06.
 * Quarterly refresh per README. "identifiers" appears in the registry HTML
 * but is omitted because it is not present in the canonical CSV at fetch-time.
 */

export const LINK_RELATIONS: ReadonlySet<string> = new Set([
  "about",
  "acl",
  "alternate",
  "amphtml",
  "api-catalog",
  "appendix",
  "apple-touch-icon",
  "apple-touch-startup-image",
  "archives",
  "author",
  "blocked-by",
  "bookmark",
  "c2pa-manifest",
  "canonical",
  "chapter",
  "cite-as",
  "collection",
  "compression-dictionary",
  "contents",
  "convertedfrom",
  "copyright",
  "create-form",
  "current",
  "deprecation",
  "describedby",
  "describes",
  "disclosure",
  "dns-prefetch",
  "duplicate",
  "edit",
  "edit-form",
  "edit-media",
  "enclosure",
  "external",
  "first",
  "geofeed",
  "glossary",
  "help",
  "hosts",
  "hub",
  "ice-server",
  "icon",
  "index",
  "intervalafter",
  "intervalbefore",
  "intervalcontains",
  "intervaldisjoint",
  "intervalduring",
  "intervalequals",
  "intervalfinishedby",
  "intervalfinishes",
  "intervalin",
  "intervalmeets",
  "intervalmetby",
  "intervaloverlappedby",
  "intervaloverlaps",
  "intervalstartedby",
  "intervalstarts",
  "item",
  "last",
  "latest-version",
  "license",
  "linkset",
  "lrdd",
  "manifest",
  "mask-icon",
  "me",
  "media-feed",
  "memento",
  "micropub",
  "modulepreload",
  "monitor",
  "monitor-group",
  "next",
  "next-archive",
  "nofollow",
  "noopener",
  "noreferrer",
  "opener",
  "openid2.local_id",
  "openid2.provider",
  "original",
  "p3pv1",
  "payment",
  "pingback",
  "preconnect",
  "predecessor-version",
  "prefetch",
  "preload",
  "prerender",
  "prev",
  "prev-archive",
  "preview",
  "previous",
  "privacy-policy",
  "profile",
  "publication",
  "rdap-active",
  "rdap-bottom",
  "rdap-down",
  "rdap-top",
  "rdap-up",
  "related",
  "replies",
  "restconf",
  "ruleinput",
  "search",
  "section",
  "self",
  "service",
  "service-desc",
  "service-doc",
  "service-meta",
  "sip-trunking-capability",
  "sponsored",
  "start",
  "status",
  "stylesheet",
  "subsection",
  "successor-version",
  "sunset",
  "tag",
  "terms-of-service",
  "timegate",
  "timemap",
  "type",
  "ugc",
  "up",
  "version-history",
  "via",
  "webmention",
  "working-copy",
  "working-copy-of",
]);

/**
 * Whether a token is a registered link-relation name (case-sensitive per
 * RFC 8288 §2.1). Callers should pre-trim and lowercase before calling — IANA
 * registry stores all names in lower-case.
 */
export function isRegisteredLinkRelation(name: string): boolean {
  return LINK_RELATIONS.has(name);
}

/**
 * RFC 8288 §2.1: rel value MUST be a registered relation OR an absolute URI.
 * Use this to validate a Link header rel-token: registered name OR URI-form.
 */
export function isValidLinkRelationToken(token: string): boolean {
  if (!token) return false;
  if (LINK_RELATIONS.has(token)) return true;
  // Crude absolute-URI test — RFC 3986 has full grammar but for spec-checking
  // we just look for scheme://... or scheme:.. with at least one extra char.
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:[^\s]+$/.test(token);
}
