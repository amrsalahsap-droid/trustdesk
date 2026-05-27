/**
 * Offline checks for CompanyProfileService merge + TailoredProfile projection.
 * Run: npx tsx scratch/test-company-profile.ts
 */

import { CompanyProfileService } from "../src/modules/workspaces/company-profile-service";
import type { DeepInferredProfile } from "../src/modules/workspaces/onboarding/website-analysis-service";

type Check = { name: string; ok: boolean; detail?: string };
const results: Check[] = [];
const record = (name: string, ok: boolean, detail?: string) => results.push({ name, ok, detail });

const citation = {
  pageUrl: "https://ex.com/sec",
  pageType: "security" as const,
  evidenceKind: "heading-section" as const,
  excerpt: "We are a bank",
};

const baseDeep = (over: Partial<DeepInferredProfile> = {}): DeepInferredProfile => ({
  industry: {
    value: "fintech",
    category: "OBSERVED",
    confidence: 0.85,
    citations: [citation],
  },
  productType: { value: "saas", category: "DERIVED", confidence: 0.7 },
  customerSegment: { value: "b2b", category: "DERIVED", confidence: 0.6 },
  dataTypes: { value: ["PII"], category: "OBSERVED", confidence: 0.8 },
  complianceSignals: { value: ["SOC2"], category: "DERIVED", confidence: 0.5 },
  tailoringConfidence: 0.82,
  suggestedDocuments: [],
  pagesScanned: ["https://ex.com"],
  ...over,
});

// 1) User-confirmed industry overrides inference; no inferred citations on that field
{
  const cp = CompanyProfileService.build({
    id: "w1",
    name: "Acme",
    industry: "software",
    productType: null,
    customerSegment: null,
    dataTypes: [],
    complianceTargets: [],
    deepProfileJson: baseDeep(),
  });
  record(
    "industry user-confirmed overrides AI",
    cp.industry.source === "user-confirmed" &&
      cp.industry.confidence === 1.0 &&
      cp.industry.value === "software" &&
      cp.industry.citations === undefined,
    JSON.stringify(cp.industry),
  );
}

// 2) Empty scalar falls through to inference with citations
{
  const cp = CompanyProfileService.build({
    id: "w2",
    name: "Acme",
    industry: null,
    productType: null,
    customerSegment: null,
    dataTypes: [],
    complianceTargets: [],
    deepProfileJson: baseDeep(),
  });
  record(
    "industry AI preserves citations",
    cp.industry.source === "ai-inferred" &&
      cp.industry.citations?.length === 1 &&
      cp.industry.citations[0].pageUrl === citation.pageUrl,
    JSON.stringify({ source: cp.industry.source, n: cp.industry.citations?.length }),
  );
}

// 3) internalRoles suppressed below 0.5
{
  const cp = CompanyProfileService.build({
    id: "w3",
    name: "Acme",
    industry: null,
    productType: null,
    customerSegment: null,
    dataTypes: [],
    complianceTargets: [],
    deepProfileJson: baseDeep({
      internalRoles: {
        value: ["Admin", "Auditor"],
        category: "HYPOTHESIZED",
        confidence: 0.3,
      },
    }),
  });
  record(
    "internalRoles low confidence -> default empty",
    cp.internalRoles.source === "default" &&
      cp.internalRoles.confidence === 0 &&
      cp.internalRoles.value.length === 0,
    JSON.stringify(cp.internalRoles),
  );
}

// 4) internalRoles surfaced at 0.6+
{
  const cp = CompanyProfileService.build({
    id: "w4",
    name: "Acme",
    industry: null,
    productType: null,
    customerSegment: null,
    dataTypes: [],
    complianceTargets: [],
    deepProfileJson: baseDeep({
      internalRoles: {
        value: ["Admin"],
        category: "DERIVED",
        confidence: 0.6,
      },
    }),
  });
  record(
    "internalRoles 0.6+ surfaced",
    cp.internalRoles.source === "ai-inferred" &&
      cp.internalRoles.value.includes("Admin") &&
      cp.internalRoles.confidence === 0.6,
    JSON.stringify(cp.internalRoles),
  );
}

// 5) Mode: HIGH_PRECISION when tailoring high + OBSERVED on an AI field
{
  const cp = CompanyProfileService.build({
    id: "w5",
    name: "Acme",
    industry: null,
    productType: null,
    customerSegment: null,
    dataTypes: [],
    complianceTargets: [],
    deepProfileJson: baseDeep({ tailoringConfidence: 0.82 }),
  });
  record(
    "mode HIGH_PRECISION band",
    cp.mode === "HIGH_PRECISION" && cp.tailoringConfidence === 0.82,
    cp.mode,
  );
}

// 6) LIMITED_FALLBACK when tailoring low
{
  const cp = CompanyProfileService.build({
    id: "w6",
    name: "Acme",
    industry: null,
    productType: null,
    customerSegment: null,
    dataTypes: [],
    complianceTargets: [],
    deepProfileJson: baseDeep({ tailoringConfidence: 0.25 }),
  });
  record("mode LIMITED_FALLBACK band", cp.mode === "LIMITED_FALLBACK", cp.mode);
}

// 7) toTailoredProfile shape (legacy consumers)
{
  const cp = CompanyProfileService.build({
    id: "w7",
    name: "Globex",
    industry: "healthtech",
    productType: null,
    customerSegment: null,
    dataTypes: ["PHI"],
    complianceTargets: [],
    deepProfileJson: baseDeep(),
  });
  const tp = CompanyProfileService.toTailoredProfile(cp);
  record(
    "toTailoredProfile keys + values",
    tp.companyName === "Globex" &&
      tp.industry === "healthtech" &&
      Array.isArray(tp.signalsUsed) &&
      typeof tp.confidence === "number" &&
      tp.mode === cp.mode,
    JSON.stringify({ keys: Object.keys(tp), mode: tp.mode }),
  );
}

const failed = results.filter(r => !r.ok);
for (const r of results) {
  console.log(r.ok ? `[OK]  ${r.name}` : `[FAIL] ${r.name}`, r.detail ?? "");
}
if (failed.length) {
  console.error(`\n${failed.length} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll company-profile checks passed.");
