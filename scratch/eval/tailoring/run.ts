/**
 * Lightweight regression checks for document tailoring + onboarding evidence helpers.
 * Run: npm run eval:tailoring
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { computeTemplateShingleJaccard } from "../../../src/modules/workspaces/onboarding/document-template-service";
import { DOCUMENT_LIBRARY } from "../../../src/modules/workspaces/onboarding/document-library-data";
import { getDocumentTypeRule } from "../../../src/modules/workspaces/onboarding/document-type-rules";
import {
  extractStructuredEvidence,
  flattenEvidenceToText,
  mergeStructuredPageEvidence,
} from "../../../src/modules/workspaces/onboarding/evidence";
import {
  buildAnalysisHealthSnapshot,
  type DeepInferredProfile,
  type EvidenceItem,
} from "../../../src/modules/workspaces/onboarding/website-analysis-service";
import { countBusinessKeywordHitsOnPage, reinforceObservedFromKeywords } from "../../../src/modules/workspaces/onboarding/business-heuristics";

const __dirname = dirname(fileURLToPath(import.meta.url));

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

const isp = DOCUMENT_LIBRARY.infosec_policy?.sampleText ?? "";
const priv = DOCUMENT_LIBRARY.privacy_policy?.sampleText ?? "";

const j = computeTemplateShingleJaccard(isp, priv);
console.log("Jaccard(infosec_sample, privacy_sample) =", j.toFixed(3));
assert(j < 0.95, "Library samples should not be identical");

const r1 = getDocumentTypeRule("infosec_policy");
const r2 = getDocumentTypeRule("privacy_policy");
assert(!!r1 && !!r2, "document-type rules must exist for core policies");
assert(
  r1!.requiredSections.join("|") !== r2!.requiredSections.join("|"),
  "ISP and Privacy required section scaffolds must differ",
);

// --- Onboarding evidence / health smoke (no live crawl) ---
const spaHtml = readFileSync(join(__dirname, "fixtures", "spa-shell.html"), "utf8");
const spaEv = extractStructuredEvidence({
  html: spaHtml,
  url: "https://spa.example/",
  title: "SPA Co",
  pageType: "homepage",
  score: 30,
  contentSource: "static",
});
const spaFlat = flattenEvidenceToText(spaEv).length;
assert(spaFlat < 600, "fixture spa-shell should be thin static text");

const tradingHtml = readFileSync(join(__dirname, "fixtures", "trading-rendered.html"), "utf8");
const staticThin = extractStructuredEvidence({
  html: spaHtml,
  url: "https://trade.example/",
  title: "TradeCo",
  pageType: "product",
  score: 72,
  contentSource: "static",
});
const renderedRich = extractStructuredEvidence({
  html: tradingHtml,
  url: "https://trade.example/",
  title: "TradeCo",
  pageType: "product",
  score: 72,
  contentSource: "rendered",
});
const merged = mergeStructuredPageEvidence(staticThin, renderedRich);
assert(
  merged.contentSource === "hybrid" || merged.contentSource === "rendered",
  "merge should mark hybrid/rendered when rendered adds text",
);
assert(flattenEvidenceToText(merged).length > spaFlat, "merge should increase text vs spa shell");

const kwHits = countBusinessKeywordHitsOnPage(
  extractStructuredEvidence({
    html: tradingHtml,
    url: "https://trade.example/p",
    title: "T",
    pageType: "product",
    score: 70,
  }),
);
assert(kwHits >= 2, "trading fixture should hit multiple business keyword buckets");

const profile: DeepInferredProfile = {
  industry: {
    value: "fintech",
    category: "DERIVED",
    confidence: 0.55,
    source: "model",
  },
  productType: { value: "mobile", category: "DERIVED", confidence: 0.5, source: "model" },
  tailoringConfidence: 0.55,
  suggestedDocuments: [],
  pagesScanned: ["https://trade.example/p"],
};
const pages = [
  extractStructuredEvidence({
    html: tradingHtml,
    url: "https://trade.example/p",
    title: "T",
    pageType: "product",
    score: 70,
  }),
];
const reinforced = reinforceObservedFromKeywords(profile, pages);
assert(
  reinforced.industry?.category === "OBSERVED",
  "keyword reinforcement should upgrade industry when text matches value",
);

const item: EvidenceItem = {
  evidence: {
    url: "https://trade.example/p",
    title: "T",
    headings: [],
    snippet: flattenEvidenceToText(pages[0]!),
  },
  pageType: "product",
  score: 70,
  structured: pages[0]!,
};
const crawlHealth = {
  pagesAttempted: 2,
  pagesReached: 2,
  statusCodes: [200],
  finalUrl: "https://trade.example/",
  redirectChain: [],
  durationMs: 1,
};
const health = buildAnalysisHealthSnapshot(reinforced, [item], crawlHealth, 1);
assert(health.extraction.ok, "extraction.ok when renderedPages >= 1");
assert(health.business.ok, "business.ok after reinforcement on trading fixture");
assert(health.reachability.ok, "reachability.ok with pagesReached and finalUrl");

console.log("OK: tailoring eval harness passed.");
