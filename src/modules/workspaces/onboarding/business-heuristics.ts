import { flattenEvidenceToText, resolveSignalCitation, type StructuredPageEvidence } from "./evidence";
import type {
  DeepInferredProfile,
  IndustryEnum,
  ProductTypeEnum,
  Signal,
} from "./website-analysis-service";

type EvidenceItemLike = { structured: StructuredPageEvidence };

export const BUSINESS_KEYWORD_TABLES = {
  industry: {
    fintech: [
      /trading/i,
      /brokerage/i,
      /stocks?/i,
      /margin\s+trading/i,
      /short[-\s]?selling/i,
      /portfolio\s+management/i,
      /technical\s+analysis/i,
      /forex/i,
      /crypto/i,
      /invest(?:ing|ment)/i,
    ],
    healthtech: [
      /patient/i,
      /ehr/i,
      /hipaa/i,
      /clinic/i,
      /medical\s+records?/i,
      /tele(?:health|medicine)/i,
    ],
    ecommerce: [/checkout/i, /cart/i, /storefront/i, /marketplace/i, /inventory/i, /fulfillment/i],
    software: [
      /api\s+docs?/i,
      /sdk/i,
      /webhooks?/i,
      /integrations?/i,
      /\bplatform\b/i,
      /software\s+(company|platform|solution|provider|vendor)/i,
      /cybersecurity\s+platform/i,
      /data\s+(security|protection|governance|classification)\s+platform/i,
      /enterprise\s+software/i,
      /cloud\s+software/i,
      /security\s+solution/i,
      /compliance\s+automation/i,
    ],
  },
  productType: {
    mobile: [
      /app\s+store/i,
      /google\s+play/i,
      /download\s+the\s+app/i,
      /activate\s+account/i,
      /mobile\s+app/i,
    ],
    saas: [
      /log\s*in/i,
      /sign\s*in/i,
      /dashboard/i,
      /workspace/i,
      /web\s+app/i,
      /cloud\s+platform/i,
      /hosted\s+platform/i,
      /web\s+platform/i,
      /api\s+platform/i,
      /enterprise\s+platform/i,
      /\bsaas\b/i,
    ],
  },
  operationalWorkflows: [
    /digital\s+onboarding/i,
    /\bkyc\b/i,
    /\baml\b/i,
    /account\s+activation/i,
    /id\s+verification/i,
    /deposit/i,
    /withdraw(?:al)?/i,
    /order\s+execution/i,
    /settlement/i,
    /risk\s+limits/i,
  ],
} as const;

const BOILERPLATE_STRIP = /\b(home|about|contact|menu|login|sign\s*up|cookie|privacy\s*policy|terms)\b/gi;

export function getBusinessKeywordHitsOnPage(structured: StructuredPageEvidence): string[] {
  const text = flattenEvidenceToText(structured).replace(BOILERPLATE_STRIP, "");
  const hits: string[] = [];
  
  for (const group of Object.values(BUSINESS_KEYWORD_TABLES.industry)) {
    for (const re of group) {
      const m = text.match(re);
      if (m) hits.push(m[0]);
    }
  }
  for (const group of Object.values(BUSINESS_KEYWORD_TABLES.productType)) {
    for (const re of group) {
      const m = text.match(re);
      if (m) hits.push(m[0]);
    }
  }
  for (const re of BUSINESS_KEYWORD_TABLES.operationalWorkflows) {
    const m = text.match(re);
    if (m) hits.push(m[0]);
  }
  return [...new Set(hits)];
}

export function countBusinessKeywordHitsOnPage(structured: StructuredPageEvidence): number {
  return getBusinessKeywordHitsOnPage(structured).length;
}

/**
 * Bounded block appended to the inference prompt listing regex hits per page.
 */
export function buildExtractedTermsPromptBlock(items: EvidenceItemLike[]): string {
  const lines: string[] = [];
  const capPages = 8;
  let n = 0;
  for (const it of items) {
    if (n++ >= capPages) break;
    const url = it.structured.url;
    const hits: string[] = [];
    const text = flattenEvidenceToText(it.structured);
    for (const [k, arr] of Object.entries(BUSINESS_KEYWORD_TABLES.industry)) {
      for (const re of arr) {
        if (re.test(text)) hits.push(`industry:${k}:${re.source}`);
      }
    }
    for (const [k, arr] of Object.entries(BUSINESS_KEYWORD_TABLES.productType)) {
      for (const re of arr) {
        if (re.test(text)) hits.push(`productType:${k}:${re.source}`);
      }
    }
    for (const re of BUSINESS_KEYWORD_TABLES.operationalWorkflows) {
      if (re.test(text)) hits.push(`operationalWorkflows:${re.source}`);
    }
    if (hits.length) {
      lines.push(`- ${url}: ${hits.slice(0, 12).join("; ")}`);
    }
  }
  if (!lines.length) return "";
  return `EXTRACTED_TERMS (literal substring matches on evidence — prefer OBSERVED with citations when these align):\n${lines.join("\n")}\n`;
}

function firstMatchingIndustry(text: string): IndustryEnum | undefined {
  for (const [ind, patterns] of Object.entries(BUSINESS_KEYWORD_TABLES.industry) as [
    IndustryEnum,
    readonly RegExp[],
  ][]) {
    if (ind === "other") continue;
    if (patterns.some((re) => re.test(text))) return ind;
  }
  return undefined;
}

function firstMatchingProductType(text: string): ProductTypeEnum | undefined {
  for (const [pt, patterns] of Object.entries(BUSINESS_KEYWORD_TABLES.productType) as [
    ProductTypeEnum,
    readonly RegExp[],
  ][]) {
    if (patterns.some((re) => re.test(text))) return pt;
  }
  return undefined;
}

function matchedWorkflowTerms(text: string): string[] {
  const out: string[] = [];
  for (const re of BUSINESS_KEYWORD_TABLES.operationalWorkflows) {
    const m = text.match(re);
    if (m) out.push(m[0]);
  }
  return [...new Set(out)].slice(0, 8);
}

function textSupportsWorkflowValue(text: string, value: string): boolean {
  const t = text.toLowerCase();
  const v = value.toLowerCase();
  if (!v.trim()) return false;
  if (t.includes(v)) return true;
  return matchedWorkflowTerms(text).some((term) => v.includes(term.toLowerCase()) || term.toLowerCase().includes(v));
}

/**
 * When the model marked a business field DERIVED but literal page text matches
 * curated keywords, upgrade to OBSERVED and attach a resolved citation.
 */
export function reinforceObservedFromKeywords(
  profile: DeepInferredProfile,
  pages: StructuredPageEvidence[],
): DeepInferredProfile {
  const pageTexts = pages.map((p) => ({ p, text: flattenEvidenceToText(p) }));

  const reinforceEnum = <T extends string>(
    sig: Signal<T> | undefined,
    pick: (text: string) => T | undefined,
  ): Signal<T> | undefined => {
    if (!sig || sig.category === "OBSERVED") return sig;
    if (sig.category !== "DERIVED" && sig.category !== "HYPOTHESIZED") return sig;
    for (const { p, text } of pageTexts) {
      const hit = pick(text);
      if (!hit || hit !== sig.value) continue;
      const cite = resolveSignalCitation(p.url, pages);
      if (!cite) continue;
      return {
        ...sig,
        category: "OBSERVED",
        confidence: Math.min(Math.max(sig.confidence, 0.55), 0.85),
        source: p.url,
        citations: [cite],
      };
    }
    return sig;
  };

  let next: DeepInferredProfile = {
    ...profile,
    industry: reinforceEnum(profile.industry, firstMatchingIndustry),
    productType: reinforceEnum(profile.productType, firstMatchingProductType),
  };

  const ow = profile.operationalWorkflows;
  if (ow && ow.category !== "OBSERVED" && (ow.category === "DERIVED" || ow.category === "HYPOTHESIZED")) {
    outer: for (const { p, text } of pageTexts) {
      const supported = ow.value.filter((v) => textSupportsWorkflowValue(text, v));
      if (!supported.length) continue;
      const cite = resolveSignalCitation(p.url, pages);
      if (!cite) continue;
      next = {
        ...next,
        operationalWorkflows: {
          ...ow,
          category: "OBSERVED",
          confidence: Math.min(Math.max(ow.confidence, 0.55), 0.85),
          source: p.url,
          citations: [cite],
        },
      };
      break outer;
    }
  }

  return next;
}
