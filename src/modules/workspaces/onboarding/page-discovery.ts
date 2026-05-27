import { AiHttpClient } from "@/lib/ai/ai-http-client";
import { logger } from "@/lib/logging/logger";

/**
 * Deterministic, bounded page classification + scoring used to prioritize
 * which discovered URLs the onboarding crawler actually fetches.
 *
 * No I/O here except `fetchRobotsHints` which calls `AiHttpClient.get` with a
 * short timeout. The rest of the module is pure functions so it can be unit
 * tested without network access.
 */

export type PageType =
  | "security"
  | "trust"
  | "compliance"
  | "privacy"
  | "legal"
  | "dpa"
  | "subprocessors"
  | "docs"
  | "status"
  | "pricing"
  | "customers"
  | "case_study"
  | "integrations"
  | "marketplace"
  | "homepage"
  | "about"
  | "company"
  | "product"
  | "platform"
  | "solutions"
  | "other";

export type EvidenceIntent =
  | "trust"
  | "compliance"
  | "privacy"
  | "product"
  | "integration"
  | "security"
  | "marketing"
  | "other";

export type CrawlStage = 1 | 2 | 3 | 4;

export type CandidateLink = {
  url: string;
  anchorText?: string;
  sourceHint: "homepage-html" | "sitemap" | "robots-sitemap-hint";
};

export type ScoredPage = {
  url: string;
  anchorText?: string;
  pageType: PageType;
  score: number;
  reasons: string[];
};

export type RobotsHints = {
  sitemaps: string[];
  disallowPrefixes: string[];
};

/**
 * Page-type weights. Tunable but deterministic. Higher means the crawler
 * should prefer fetching pages of that type first.
 */
export const TYPE_WEIGHT: Record<PageType, number> = {
  security: 100,
  trust: 100,
  compliance: 95,
  privacy: 90,
  dpa: 90,
  subprocessors: 85,
  legal: 80,
  product: 70,
  platform: 70,
  solutions: 65,
  docs: 60,
  status: 60,
  about: 50,
  company: 50,
  homepage: 40,
  pricing: 55,
  customers: 40,
  case_study: 40,
  integrations: 35,
  marketplace: 30,
  other: 10,
};

/**
 * High-signal page types used by the evidence diversity gate and the
 * confidence cap. These are the pages that genuinely shift inference
 * confidence (security posture, trust claims, compliance, data handling).
 */
export const HIGH_SIGNAL_TYPES: ReadonlySet<PageType> = new Set([
  "security",
  "trust",
  "compliance",
  "privacy",
  "dpa",
  "subprocessors",
]);

const TYPE_PATTERNS: Array<{ type: PageType; re: RegExp }> = [
  { type: "security",   re: /(^|\/)(security|infosec|bug-bounty)(\/|$)/i },
  { type: "trust",      re: /(^|\/)(trust|trust-center|trust-portal)(\/|$)/i },
  { type: "compliance", re: /(^|\/)(compliance|soc-?2|iso-?27001|hipaa|gdpr|legal|terms)(\/|$)/i },
  { type: "privacy",    re: /(^|\/)(privacy|privacy-policy|data-protection|privacy-center)(\/|$)/i },
  { type: "dpa",        re: /(^|\/)(dpa|data-processing-agreement|data-processing-addendum)(\/|$)/i },
  { type: "subprocessors", re: /(^|\/)(subprocessors|third-party-processing)(\/|$)/i },
  { type: "product",    re: /(^|\/)(products?|platform|solutions?|services|use-cases|features|guard|cybral-guard|storm|data-classification|data-discovery|dspm|ctem|asm|cloud-security|data-security|marketplace|auctions?|payment|connector|api)(\/|$)/i },
  { type: "docs",       re: /(^|\/)(docs|documentation|developers?|help|support|kb|knowledge)(\/|$)/i },
  { type: "status",     re: /(^|\/)(status|uptime|availability)(\/|$)/i },
  { type: "about",      re: /(^|\/)(about|company|team|careers)(\/|$)/i },
  { type: "marketplace", re: /(^|\/)(marketplace|auctions?|inventory|shop|store|bidding)(\/|$)/i },
];

// Word-boundary variants used against human-readable anchor text.
// These mirror TYPE_PATTERNS but match natural language (e.g. "Trust Center", "Our Security").
const ANCHOR_PATTERNS: Array<{ type: PageType; re: RegExp }> = [
  { type: "security",   re: /\b(security|infosec|bug\s*bounty)\b/i },
  { type: "trust",      re: /\b(trust(?:\s*(?:center|portal))?)\b/i },
  { type: "compliance", re: /\b(compliance|soc\s*2|iso\s*27001|hipaa|gdpr|legal|terms)\b/i },
  { type: "privacy",    re: /\b(privacy|data\s*protection|privacy\s*policy)\b/i },
  { type: "dpa",        re: /\b(dpa|data\s*processing)\b/i },
  { type: "subprocessors", re: /\b(subprocessors)\b/i },
  {
    type: "product",
    re: /\b(products?|platform|solutions?|services|use[\s-]?cases|features|trading|invest(?:ing|ment)?|brokers?|brokerage|mobile\s*app|download\s*(the\s*)?app|app\s*store|google\s*play|onboarding|get\s*started|marketplace|auction|payment|connector|api|data-classification|data-discovery|dspm|ctem|asm|cloud-security|data-security)\b/i,
  },
  {
    type: "marketplace",
    re: /\b(marketplace|auction|inventory|shop|store|bidding)\b/i,
  },
  { type: "docs",       re: /\b(docs|documentation|developers?|help|support|knowledge\s*base)\b/i },
  { type: "status",     re: /\b(status|uptime|availability)\b/i },
  { type: "about",      re: /\b(about|company|team|careers)\b/i },
];

// Anchor text is only trusted to OVERRIDE path when the path-classification is a
// low-signal type and the anchor points to a high-signal type. Otherwise path wins.
const LOW_SIGNAL_PATH_TYPES: ReadonlySet<PageType> = new Set(["other", "about", "docs", "industries", "homepage"]);

const TRUST_CUE_RE = /(soc\s*2|hipaa|iso\s*27001|gdpr|pci|trust\s*center)/i;

/**
 * Classifies a URL into a PageType using the pathname first and the anchor
 * text as a fallback (anchors are often more semantic than slugs).
 */
export function classifyPageType(url: string, anchorText?: string): PageType {
  let pathname: string;
  try {
    pathname = new URL(url).pathname || "/";
  } catch {
    return "other";
  }

  let pathType: PageType = "other";
  if (pathname === "/" || pathname === "") {
    pathType = "homepage";
  } else {
    for (const { type, re } of TYPE_PATTERNS) {
      if (re.test(pathname)) {
        pathType = type;
        break;
      }
    }
  }

  if (!anchorText) return pathType;

  let anchorType: PageType = "other";
  for (const { type, re } of ANCHOR_PATTERNS) {
    if (re.test(anchorText)) {
      anchorType = type;
      break;
    }
  }

  // Anchor overrides path only when path is low-signal and anchor is high-signal.
  // Example from the plan: /company/values labeled "Security" -> security, not about.
  if (LOW_SIGNAL_PATH_TYPES.has(pathType) && HIGH_SIGNAL_TYPES.has(anchorType)) {
    return anchorType;
  }

  return pathType;
}

/**
 * Maps a PageType to a CrawlStage (1-4).
 * Stage 1: Critical Trust & Compliance
 * Stage 2: Operational Security (Docs, Status)
 * Stage 3: Product Understanding (Homepage, Product)
 * Stage 4: Generic / Support
 */
export function getURLStage(url: string, type: PageType): CrawlStage {
  if (HIGH_SIGNAL_TYPES.has(type)) return 1;
  
  // High-value subdomains usually qualify for Stage 1 or 2
  try {
    const hostname = new URL(url).hostname;
    if (hostname.startsWith("trust.") || hostname.startsWith("security.")) return 1;
    if (hostname.startsWith("status.") || hostname.startsWith("docs.")) return 2;
  } catch {}

  // Pattern based overrides
  const path = url.toLowerCase();
  if (path.includes("/security") || path.includes("/trust") || path.includes("/compliance")) return 1;
  if (path.includes("/soc2") || path.includes("/iso27001") || path.includes("/gdpr") || path.includes("/hipaa")) return 1;
  
  if (type === "docs" || type === "status" || path.includes("/api")) return 2;
  
  if (type === "homepage" || type === "product" || type === "platform" || type === "solutions" || type === "marketplace" || type === "integrations") return 3;
  
  return 4;
}

/**
 * Classifies a URL and PageType into a high-level EvidenceIntent.
 */
export function getEvidenceIntent(url: string, type: PageType): EvidenceIntent {
  if (type === "security") return "security";
  if (type === "trust") return "trust";
  if (type === "compliance") return "compliance";
  if (type === "privacy" || type === "dpa" || type === "subprocessors") return "privacy";
  if (type === "integrations" || type === "docs") return "integration";
  if (type === "homepage" || type === "product" || type === "platform" || type === "solutions" || type === "marketplace") return "product";
  
  const path = url.toLowerCase();
  if (path.includes("blog") || path.includes("news") || path.includes("about") || path.includes("careers")) {
    return "marketing";
  }
  
  return "other";
}

/**
 * Deterministic score in [0, 100]. Same inputs always yield the same output.
 */
export function scoreCandidate(
  link: CandidateLink,
  ctx: { pageType: PageType; disallowPrefixes: readonly string[] },
): ScoredPage {
  const reasons: string[] = [];
  let score = TYPE_WEIGHT[ctx.pageType];
  reasons.push(`type=${ctx.pageType} base=${score}`);

  let parsed: URL | null = null;
  try {
    parsed = new URL(link.url);
  } catch {
    // Malformed URL — pin to floor so it never wins the queue.
    return { url: link.url, anchorText: link.anchorText, pageType: "other", score: 0, reasons: ["invalid-url"] };
  }

  // Path-depth penalty: favor top-level pages.
  const depth = parsed.pathname.split("/").filter(Boolean).length;
  if (depth > 2) {
    const depthPenalty = (depth - 2) * 5;
    score -= depthPenalty;
    reasons.push(`depth=${depth} penalty=-${depthPenalty}`);
  }

  // Explicit trust-language bonus in anchor text.
  if (link.anchorText && TRUST_CUE_RE.test(link.anchorText)) {
    score += 5;
    reasons.push(`trust-cue+5`);
  }

  // Query / fragment targeting usually points within a page, not to a distinct page.
  if (parsed.search || parsed.hash) {
    score -= 10;
    reasons.push(`query/hash-10`);
  }

  // robots Disallow penalty (soft: -20, never a hard exclusion).
  if (ctx.disallowPrefixes.some((p) => parsed!.pathname.startsWith(p))) {
    score -= 20;
    reasons.push(`disallow-20`);
  }

  // Intent-based bonus
  const intent = getClassifiedIntent(link.url, ctx.pageType);
  const intentBonuses: Record<CrawlIntent, number> = {
    trust: 20,
    security: 20,
    compliance: 15,
    privacy: 10,
    docs: 5,
    product: 0,
    marketing: -10,
    other: -5,
  };
  const bonus = intentBonuses[intent];
  if (bonus !== 0) {
    score += bonus;
    reasons.push(`intent:${intent}=${bonus > 0 ? "+" : ""}${bonus}`);
  }

  // Source bonus
  if (link.sourceHint === "sitemap") {
    score += 5;
    reasons.push(`source:sitemap+5`);
  }

  score = Math.max(0, Math.min(120, score)); // Allow slight overflow for top-tier signals

  return {
    url: link.url,
    anchorText: link.anchorText,
    pageType: ctx.pageType,
    score,
    reasons,
  };
}

const HREF_RE = /<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
const HREF_BARE_RE = /href="([^"]+)"/gi;

/**
 * Extracts <a href=... >anchor</a> pairs. Falls back to bare href when the
 * anchor-aware pattern misses (some sites use self-closing markup).
 */
export function extractHrefs(html: string): Array<{ href: string; anchorText?: string }> {
  const out: Array<{ href: string; anchorText?: string }> = [];
  const seen = new Set<string>();

  for (const m of html.matchAll(HREF_RE)) {
    const href = m[1];
    const anchor = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const key = `${href}::${anchor}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ href, anchorText: anchor || undefined });
  }

  // Also pick up hrefs that the anchor-aware regex missed.
  for (const m of html.matchAll(HREF_BARE_RE)) {
    const href = m[1];
    if (!out.some((o) => o.href === href)) {
      out.push({ href });
    }
  }

  return out;
}

function sameOrigin(candidate: URL, baseHost: string): boolean {
  const normalized = baseHost.replace(/^www\./, "");
  return candidate.hostname === baseHost || candidate.hostname.endsWith(normalized);
}

function canonicalize(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    let path = u.pathname.replace(/\/+$/, "");
    if (path === "") path = "/";
    u.pathname = path;
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * Produces a sorted (highest score first) list of ScoredPage from the homepage
 * HTML plus any sitemap URLs already fetched plus robots hints. Deterministic.
 */
export function classifyAndScore(
  homepageHtml: string,
  baseUrl: string,
  sitemapUrls: readonly string[],
  robots: RobotsHints,
): ScoredPage[] {
  const base = new URL(baseUrl);
  const candidates = new Map<string, CandidateLink>();

  // 1. Homepage hrefs
  for (const { href, anchorText } of extractHrefs(homepageHtml)) {
    let abs: URL;
    try {
      abs = new URL(href, baseUrl);
    } catch {
      continue;
    }
    if (abs.protocol !== "http:" && abs.protocol !== "https:") continue;
    if (!sameOrigin(abs, base.hostname)) continue;
    const canon = canonicalize(abs.toString());
    if (canon === canonicalize(baseUrl)) continue; // skip self
    if (!candidates.has(canon)) {
      candidates.set(canon, { url: canon, anchorText, sourceHint: "homepage-html" });
    }
  }

  // 2. Sitemap urls (already same-origin by construction upstream, but validate)
  for (const raw of sitemapUrls) {
    let abs: URL;
    try {
      abs = new URL(raw);
    } catch {
      continue;
    }
    if (!sameOrigin(abs, base.hostname)) continue;
    const canon = canonicalize(abs.toString());
    if (canon === canonicalize(baseUrl)) continue;
    if (!candidates.has(canon)) {
      candidates.set(canon, { url: canon, sourceHint: "sitemap" });
    }
  }

  // 3. Score + sort
  const scored: ScoredPage[] = [];
  for (const link of candidates.values()) {
    const pageType = classifyPageType(link.url, link.anchorText);
    scored.push(scoreCandidate(link, { pageType, disallowPrefixes: robots.disallowPrefixes }));
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Tie-breaker: prefer shallower path, then alphabetical for determinism.
    const ad = new URL(a.url).pathname.split("/").filter(Boolean).length;
    const bd = new URL(b.url).pathname.split("/").filter(Boolean).length;
    if (ad !== bd) return ad - bd;
    return a.url.localeCompare(b.url);
  });

  return scored;
}

/**
 * Fetches and parses /robots.txt. Returns empty hints on any failure —
 * robots.txt is advisory, never a hard dependency for this crawler.
 */
export async function fetchRobotsHints(baseUrl: string): Promise<RobotsHints> {
  const hints: RobotsHints = { sitemaps: [], disallowPrefixes: [] };
  let origin: string;
  try {
    origin = new URL(baseUrl).origin;
  } catch {
    return hints;
  }

  const robotsUrl = `${origin}/robots.txt`;
  let body: string;
  try {
    body = await AiHttpClient.get(
      robotsUrl,
      { "User-Agent": "TrustDesk-Onboarding-Scanner/3.0" },
      { timeoutMs: 3_000 },
    );
  } catch (err) {
    logger.info("onboarding:robots:miss", {
      url: robotsUrl,
      error: err instanceof Error ? err.message : String(err),
    });
    return hints;
  }

  const lines = body.split(/\r?\n/);
  let inStarBlock = false;
  const disallow = new Set<string>();
  const sitemaps = new Set<string>();

  for (const raw of lines) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;

    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const field = line.slice(0, colonIdx).trim().toLowerCase();
    const value = line.slice(colonIdx + 1).trim();

    if (field === "sitemap") {
      if (value) sitemaps.add(value);
      continue;
    }
    if (field === "user-agent") {
      inStarBlock = value === "*";
      continue;
    }
    if (field === "disallow" && inStarBlock) {
      // Only collect same-origin path prefixes. Empty Disallow means "allow all" — ignore.
      if (value && value !== "/") {
        const prefix = value.startsWith("/") ? value : `/${value}`;
        disallow.add(prefix);
      }
    }
  }

  hints.sitemaps = Array.from(sitemaps);
  hints.disallowPrefixes = Array.from(disallow);

  logger.info("onboarding:robots:hit", {
    url: robotsUrl,
    sitemaps: hints.sitemaps.length,
    disallow: hints.disallowPrefixes.length,
  });

  return hints;
}
