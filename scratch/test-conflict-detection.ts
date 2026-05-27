/**
 * Offline unit-style checks for field-level conflict detection + honest
 * confidence capping. No network, no AI. Feeds a synthetic
 * {@link DeepInferredProfile} with two competing industry candidates (one
 * on /pricing, one on /careers) directly through the two private pipeline
 * stages via a cast-to-any escape hatch — that's the accepted pattern for
 * scratch/ tests (mirrors inspect-cybral.ts and friends).
 */

import type { SignalCitation } from "../src/modules/workspaces/onboarding/evidence";
import {
  WebsiteAnalysisService,
  type DeepInferredProfile,
  type Signal,
} from "../src/modules/workspaces/onboarding/website-analysis-service";

type Check = { name: string; ok: boolean; detail?: string };
const results: Check[] = [];
const record = (name: string, ok: boolean, detail?: string) => results.push({ name, ok, detail });

// --- Synthetic fixture ---

const pricingCitation: SignalCitation = {
  pageUrl: "https://example.com/pricing",
  pageType: "product",
  evidenceKind: "heading-section",
  excerpt: "Monthly pricing for our SaaS subscription plans…",
};

const careersCitation: SignalCitation = {
  pageUrl: "https://example.com/careers",
  pageType: "homepage",
  evidenceKind: "heading-section",
  excerpt: "Join our engineering team — we build payments infrastructure…",
};

const industrySignal: Signal<"software" | "fintech" | "healthtech" | "ecommerce" | "other"> = {
  value: "fintech",
  category: "OBSERVED",
  confidence: 0.75,
  source: "https://example.com/pricing",
  citations: [pricingCitation],
  candidates: [
    {
      value: "fintech",
      confidence: 0.75,
      sources: [pricingCitation],
      sourcePages: ["https://example.com/pricing"],
    },
    {
      value: "software",
      confidence: 0.55,
      sources: [careersCitation],
      sourcePages: ["https://example.com/careers"],
    },
  ],
};

// A "weak rival" case: rival on a low-signal page (docs) with decent confidence.
// Should NOT trigger conflict because the rival isn't on a high-signal or
// homepage page.
const industrySignalWeakRival: Signal<"software" | "fintech" | "healthtech" | "ecommerce" | "other"> = {
  value: "fintech",
  category: "OBSERVED",
  confidence: 0.8,
  source: "https://example.com/pricing",
  citations: [pricingCitation],
  candidates: [
    {
      value: "fintech",
      confidence: 0.8,
      sources: [pricingCitation],
      sourcePages: ["https://example.com/pricing"],
    },
    {
      value: "software",
      confidence: 0.5,
      sources: [
        {
          pageUrl: "https://example.com/docs/api",
          pageType: "docs",
          evidenceKind: "body-fallback",
        },
      ],
      sourcePages: ["https://example.com/docs/api"],
    },
  ],
};

// A "timid rival" case: rival on a trusted page but with <0.4 confidence.
// Should NOT trigger conflict.
const industrySignalTimidRival: Signal<"software" | "fintech" | "healthtech" | "ecommerce" | "other"> = {
  value: "fintech",
  category: "OBSERVED",
  confidence: 0.8,
  source: "https://example.com/pricing",
  citations: [pricingCitation],
  candidates: [
    {
      value: "fintech",
      confidence: 0.8,
      sources: [pricingCitation],
      sourcePages: ["https://example.com/pricing"],
    },
    {
      value: "software",
      confidence: 0.3,
      sources: [careersCitation],
      sourcePages: ["https://example.com/careers"],
    },
  ],
};

const profileConflict: DeepInferredProfile = {
  companyName: "Example Inc.",
  industry: industrySignal,
  productType: {
    value: "saas",
    category: "OBSERVED",
    confidence: 0.7,
    source: "https://example.com/pricing",
    candidates: [
      {
        value: "saas",
        confidence: 0.7,
        sources: [pricingCitation],
        sourcePages: ["https://example.com/pricing"],
      },
    ],
  },
  customerSegment: {
    value: "b2b",
    category: "OBSERVED",
    confidence: 0.6,
    candidates: [
      {
        value: "b2b",
        confidence: 0.6,
        sources: [pricingCitation],
        sourcePages: ["https://example.com/pricing"],
      },
    ],
  },
  tailoringConfidence: 0.7,
  suggestedDocuments: [],
  pagesScanned: ["https://example.com/pricing", "https://example.com/careers"],
};

// --- Invoke private methods via escape hatch ---

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Svc = WebsiteAnalysisService as any;

// --- 1. detectFieldConflicts flags the credible rival ---
const afterDetect: DeepInferredProfile = Svc.detectFieldConflicts(profileConflict);
record(
  "conflict flagged on industry (rival on homepage page)",
  afterDetect.industry?.conflict?.hasConflict === true,
  JSON.stringify(afterDetect.industry?.conflict),
);
record(
  "rival value === software",
  afterDetect.industry?.conflict?.rival?.value === "software",
);
record(
  "rival confidence preserved >= 0.55",
  (afterDetect.industry?.conflict?.rival?.confidence ?? 0) >= 0.55,
  String(afterDetect.industry?.conflict?.rival?.confidence),
);
record(
  "rival sources include careers page citation",
  !!afterDetect.industry?.conflict?.rival?.sources.some((s) => s.pageUrl.includes("/careers")),
);

// productType + customerSegment have single candidates only -> no conflict.
record(
  "no conflict on productType (single candidate)",
  !afterDetect.productType?.conflict?.hasConflict,
);
record(
  "no conflict on customerSegment (single candidate)",
  !afterDetect.customerSegment?.conflict?.hasConflict,
);

// --- 2. Weak-rival case should NOT flag ---
const afterDetectWeak: DeepInferredProfile = Svc.detectFieldConflicts({
  ...profileConflict,
  industry: industrySignalWeakRival,
});
record(
  "no conflict when rival is on low-signal docs page",
  !afterDetectWeak.industry?.conflict?.hasConflict,
);

// --- 3. Timid-rival case should NOT flag ---
const afterDetectTimid: DeepInferredProfile = Svc.detectFieldConflicts({
  ...profileConflict,
  industry: industrySignalTimidRival,
});
record(
  "no conflict when rival confidence < 0.4",
  !afterDetectTimid.industry?.conflict?.hasConflict,
);

// --- 4. capConfidenceForEvidence clamps and downgrades on conflict ---
// Use strong evidence (highSignalCount >= 2) so the non-conflict caps do NOT
// fire; only the conflict cap should. This isolates the conflict branch.
const fakeEvidenceItems: unknown[] = [
  { pageType: "security", evidence: { url: "https://example.com/security" }, structured: null, score: 1 },
  { pageType: "trust", evidence: { url: "https://example.com/trust" }, structured: null, score: 1 },
];

const afterCap: DeepInferredProfile = Svc.capConfidenceForEvidence(afterDetect, fakeEvidenceItems, {
  highSignalCount: 2,
  softWeakEvidence: false,
});

record(
  "conflict field confidence capped at <= 0.45",
  (afterCap.industry?.confidence ?? 1) <= 0.45,
  String(afterCap.industry?.confidence),
);
record(
  "conflict field category downgraded OBSERVED -> DERIVED",
  afterCap.industry?.category === "DERIVED",
  String(afterCap.industry?.category),
);

// Non-conflict fields should NOT be capped when highSignalCount >= 2.
record(
  "non-conflict productType confidence preserved",
  (afterCap.productType?.confidence ?? 0) === 0.7,
  String(afterCap.productType?.confidence),
);
record(
  "non-conflict productType category preserved",
  afterCap.productType?.category === "OBSERVED",
  String(afterCap.productType?.category),
);

// --- 5. Conflict cap must still fire even when evidence is otherwise clean ---
const cleanProfile: DeepInferredProfile = {
  ...profileConflict,
  industry: {
    ...industrySignal,
    conflict: { hasConflict: true, rival: { value: "software", confidence: 0.55, sources: [careersCitation] } },
  },
};
const cappedClean: DeepInferredProfile = Svc.capConfidenceForEvidence(cleanProfile, fakeEvidenceItems, {
  highSignalCount: 5,
  softWeakEvidence: false,
});
record(
  "conflict cap applies even with high-signal abundance",
  (cappedClean.industry?.confidence ?? 1) <= 0.45 && cappedClean.industry?.category === "DERIVED",
  `conf=${cappedClean.industry?.confidence} cat=${cappedClean.industry?.category}`,
);

// --- Render summary ---
console.log("\n--- CONFLICT DETECTION + CAP CHECKS ---");
console.log(`industry.conflict.hasConflict=${afterDetect.industry?.conflict?.hasConflict}`);
console.log(`industry.conflict.rival.value=${afterDetect.industry?.conflict?.rival?.value}`);
console.log(`capped industry.confidence=${afterCap.industry?.confidence} category=${afterCap.industry?.category}`);

const failures = results.filter((r) => !r.ok);
console.log(`\n${results.length - failures.length}/${results.length} checks passed.`);
if (failures.length > 0) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error(` - ${f.name}${f.detail ? ` :: ${f.detail}` : ""}`);
  process.exit(1);
}
