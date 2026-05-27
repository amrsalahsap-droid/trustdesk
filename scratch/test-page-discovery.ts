/**
 * Unit-style checks for the page-discovery module. Runs entirely offline —
 * no network, no AI. Asserts:
 *   1. classifyPageType maps pathnames to the right PageType.
 *   2. scoreCandidate applies type weight + depth penalty + trust cue + disallow penalty.
 *   3. classifyAndScore sorts candidates by business-signal value (security > trust > ...).
 */

import {
  classifyAndScore,
  classifyPageType,
  scoreCandidate,
  type CandidateLink,
  type PageType,
  type RobotsHints,
} from "../src/modules/workspaces/onboarding/page-discovery";

type Check = { name: string; ok: boolean; detail?: string };
const results: Check[] = [];
const record = (name: string, ok: boolean, detail?: string) => results.push({ name, ok, detail });

const BASE = "https://example.com";

// 1. classifyPageType
const classificationCases: Array<{ path: string; expected: PageType; anchor?: string }> = [
  { path: "/", expected: "homepage" },
  { path: "/security", expected: "security" },
  { path: "/security/bug-bounty", expected: "security" },
  { path: "/trust-center", expected: "trust" },
  { path: "/compliance/soc2", expected: "compliance" },
  { path: "/soc-2", expected: "compliance" },
  { path: "/privacy", expected: "privacy" },
  { path: "/privacy-policy", expected: "privacy" },
  { path: "/products", expected: "product" },
  { path: "/platform", expected: "product" },
  { path: "/solutions/enterprise", expected: "product" },
  { path: "/industries/healthcare", expected: "industries" },
  { path: "/customers", expected: "industries" },
  { path: "/docs/api", expected: "docs" },
  { path: "/developers", expected: "docs" },
  { path: "/about", expected: "about" },
  { path: "/careers/openings", expected: "about" },
  { path: "/blog/some-post", expected: "other" },
  { path: "/random", expected: "other" },
  // anchor-based fallback:
  { path: "/misc", anchor: "Our Security", expected: "security" },
  { path: "/company/values", anchor: "Trust Center", expected: "trust" },
];

for (const c of classificationCases) {
  const got = classifyPageType(`${BASE}${c.path}`, c.anchor);
  record(
    `classify ${c.path}${c.anchor ? ` [anchor="${c.anchor}"]` : ""} -> ${c.expected}`,
    got === c.expected,
    got === c.expected ? undefined : `got ${got}`,
  );
}

// 2. scoreCandidate — property checks
const mkLink = (path: string, anchorText?: string): CandidateLink => ({
  url: `${BASE}${path}`,
  anchorText,
  sourceHint: "homepage-html",
});

const noRobots: string[] = [];
const secScore = scoreCandidate(mkLink("/security"), { pageType: "security", disallowPrefixes: noRobots });
const otherScore = scoreCandidate(mkLink("/blog"), { pageType: "other", disallowPrefixes: noRobots });
record("security outranks other", secScore.score > otherScore.score, `${secScore.score} vs ${otherScore.score}`);

const shallow = scoreCandidate(mkLink("/products"), { pageType: "product", disallowPrefixes: noRobots });
const deep = scoreCandidate(mkLink("/products/a/b/c/d"), { pageType: "product", disallowPrefixes: noRobots });
record("depth penalty applies", deep.score < shallow.score, `shallow=${shallow.score} deep=${deep.score}`);

const trustCued = scoreCandidate(mkLink("/about", "Our SOC 2 compliance"), {
  pageType: "about",
  disallowPrefixes: noRobots,
});
const plainAbout = scoreCandidate(mkLink("/about"), { pageType: "about", disallowPrefixes: noRobots });
record("trust-cue anchor adds +5", trustCued.score === plainAbout.score + 5, `${plainAbout.score} -> ${trustCued.score}`);

const disallowed = scoreCandidate(mkLink("/search/query"), {
  pageType: "other",
  disallowPrefixes: ["/search"],
});
const notDisallowed = scoreCandidate(mkLink("/search/query"), {
  pageType: "other",
  disallowPrefixes: [],
});
record("disallow applies -20 penalty", disallowed.score === Math.max(0, notDisallowed.score - 20), `${notDisallowed.score} -> ${disallowed.score}`);

// 3. classifyAndScore — relative ordering on a synthetic homepage
const html = `
  <a href="/security">Security</a>
  <a href="/trust-center">Trust Center</a>
  <a href="/compliance/soc2">SOC 2</a>
  <a href="/privacy">Privacy</a>
  <a href="/products">Product</a>
  <a href="/industries/healthcare">Industries</a>
  <a href="/docs">Docs</a>
  <a href="/about">About</a>
  <a href="/blog/post">Blog</a>
`;
const robots: RobotsHints = { sitemaps: [], disallowPrefixes: [] };
const scored = classifyAndScore(html, BASE, [], robots);

const firstByType: Partial<Record<PageType, number>> = {};
scored.forEach((p, i) => {
  if (firstByType[p.pageType] === undefined) firstByType[p.pageType] = i;
});

const expectedOrder: PageType[] = [
  "security",
  "trust",
  "compliance",
  "privacy",
  "product",
  "industries",
  "docs",
  "about",
  "other",
];

let orderOk = true;
let orderDetail = "";
for (let i = 0; i < expectedOrder.length - 1; i++) {
  const a = firstByType[expectedOrder[i]];
  const b = firstByType[expectedOrder[i + 1]];
  if (a === undefined || b === undefined) continue;
  if (!(a < b)) {
    orderOk = false;
    orderDetail = `${expectedOrder[i]}@${a} not before ${expectedOrder[i + 1]}@${b}`;
    break;
  }
}
record("classifyAndScore produces expected priority order", orderOk, orderDetail);

record("classifyAndScore deduplicates self-link", scored.every((s) => s.url !== `${BASE}/`));

// Render summary
console.log("\n--- PAGE DISCOVERY UNIT CHECKS ---");
console.table(
  scored.map((s) => ({
    url: s.url.replace(BASE, ""),
    pageType: s.pageType,
    score: s.score,
  })),
);

const failures = results.filter((r) => !r.ok);
console.log(`\n${results.length - failures.length}/${results.length} checks passed.`);
if (failures.length > 0) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error(` - ${f.name}${f.detail ? ` :: ${f.detail}` : ""}`);
  process.exit(1);
}
console.log("\n[ASSERT OK] page-discovery classification + scoring behaves as specified.");
