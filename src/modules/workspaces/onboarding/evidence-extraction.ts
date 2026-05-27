/**
 * Evidence Signal Extraction for Trust Profile Decisions
 *
 * Extracts specific, auditable evidence signals from crawled pages
 * to support Trust Profile field decisions. Each signal is linked
 * to a specific field and candidate value with a human-readable snippet.
 */

import { logger } from "@/lib/logging/logger";
import { type CrawlAttempt, type PageType } from "./domain-crawler";
import { 
  type StructuredPageEvidence, 
  getUsableTextFromEvidence, 
  ensureUsableSnippet 
} from "./evidence";

/**
 * Field keys that can be supported by evidence signals.
 */
export type EvidenceFieldKey =
  | "industry"
  | "productType"
  | "customerSegment"
  | "complianceFocus"
  | "securityPosture"
  | "dataHandling"
  | "integrations"
  | "customerIndustries";

/**
 * Type of evidence signal based on how it was derived.
 */
export type SignalType =
  | "DIRECT_QUOTE"      // Direct text extraction from page
  | "HEADING_MATCH"     // Matched section heading
  | "META_EXTRACT"      // From meta description/title
  | "STRUCTURED_DATA"   // From JSON-LD/schema.org
  | "INFERRED"          // Logically inferred from context
  | "CONFLICTING";      // Signal that conflicts with another

/**
 * Strength of evidence signal.
 */
export type EvidenceStrength =
  | "strong"      // High confidence, direct evidence
  | "moderate"    // Good evidence but indirect
  | "weak"        // Low confidence or ambiguous
  | "unknown";    // No evidence found

/**
 * Single evidence signal extracted from a page.
 */
export type EvidenceSignal = {
  /** Field this evidence supports */
  fieldKey: EvidenceFieldKey;
  /** Candidate value this evidence supports */
  candidateValue: string;
  /** How this signal was derived */
  signalType: SignalType;
  /** Human-readable snippet (max 200 chars) */
  snippet: string;
  /** Source URL where evidence was found */
  sourceUrl: string;
  /** Type of page where evidence was found */
  pageType: PageType;
  /** Confidence/strength of this evidence */
  strength: EvidenceStrength;
  /** Machine-readable reason for this classification */
  reason: string;
  /** Excerpt location hint (heading, meta, paragraph) */
  location: string;
  /** Position in page (for ordering) */
  position: number;
};

/**
 * Collection of evidence signals for a field.
 */
export type FieldEvidence = {
  fieldKey: EvidenceFieldKey;
  /** All signals for this field */
  signals: EvidenceSignal[];
  /** Coverage assessment */
  coverage: EvidenceStrength;
  /** Whether conflicting signals exist */
  hasConflicts: boolean;
  /** Primary signal (highest strength) */
  primarySignal?: EvidenceSignal;
};

/**
 * Complete evidence extraction result for all fields.
 */
export type EvidenceExtractionResult = {
  /** Evidence grouped by field */
  fields: Record<EvidenceFieldKey, FieldEvidence>;
  /** Overall coverage assessment */
  overallCoverage: EvidenceStrength;
  /** Pages that contributed evidence */
  contributingPages: string[];
  /** Pages with no usable evidence */
  emptyPages: string[];
  /** Conflicts by field */
  conflicts: Record<EvidenceFieldKey, EvidenceSignal[]>;
};

/**
 * Extraction patterns for matching text to fields and values.
 */
const EVIDENCE_PATTERNS: Array<{
  fieldKey: EvidenceFieldKey;
  candidateValues: string[];
  patterns: RegExp[];
  signalType: SignalType;
  strength: EvidenceStrength;
  reason: string;
}> = [
  // Industry patterns (What the company BUILDS/SELLS)
  {
    fieldKey: "industry",
    candidateValues: ["software", "saas"],
    patterns: [
      /\bsoftware\s+(company|platform|solution|provider|vendor)\b/i,
      /\bsaas\s+(platform|solution|provider|company|product)\b/i,
      /\bcloud\s+(software|platform)\b/i,
      /\benterprise\s+(software|platform|solution)\b/i,
      /\bcybersecurity\s+platform\b/i,
      /\bdata\s+(security|protection|governance|classification)\s+platform\b/i,
      /\bsecurity\s+solution\b/i,
      /\bcompliance\s+automation\b/i,
    ],
    signalType: "DIRECT_QUOTE",
    strength: "strong",
    reason: "Explicit software/SaaS/Security identification",
  },
  {
    fieldKey: "industry",
    candidateValues: ["fintech"],
    patterns: [
      /\bfintech\b/i,
      /\bfinancial\s+technology\b/i,
      /\bbanking\s+(software|platform|solution)\b/i,
      /\bpayment\s+(processing|platform|solution)\b/i,
    ],
    signalType: "DIRECT_QUOTE",
    strength: "strong",
    reason: "Explicit fintech identification",
  },
  {
    fieldKey: "industry",
    candidateValues: ["healthtech"],
    patterns: [
      /\bhealthtech\b/i,
      /\bhealthcare\s+(technology|software|platform|provider|clinic|hospital|service|care)s?\b/i,
      /\bmedical\s+(software|platform|solution|service|treatment|provider|care)s?\b/i,
      /\bdigital\s+health\s+(platform|solution)s?\b/i,
      /\btelemedicine\s+(platform|service|provider)s?\b/i,
    ],
    signalType: "DIRECT_QUOTE",
    strength: "strong",
    reason: "Explicit healthtech/healthcare identification",
  },
  {
    fieldKey: "industry",
    candidateValues: ["ecommerce"],
    patterns: [
      /\be-commerce\b/i,
      /\becommerce\b/i,
      /\bonline\s+(store|marketplace|retail)\b/i,
      /\bshopping\s+(platform|cart)\b/i,
    ],
    signalType: "DIRECT_QUOTE",
    strength: "strong",
    reason: "Explicit ecommerce identification",
  },

  // Customer Industries (Who the company SERVES)
  {
    fieldKey: "customerIndustries",
    candidateValues: ["healthcare"],
    patterns: [
      /\b(for|serving|trusted\s+by|built\s+for|serves?)\s+healthcare\b/i,
      /\b(hospital|medical|clinical)\s+(customers|clients|partners|organizations?|providers?)\b/i,
      /\bhealthcare\s+(industry|sector|organizations?|providers?|market)\b/i,
    ],
    signalType: "DIRECT_QUOTE",
    strength: "strong",
    reason: "Healthcare customer context",
  },
  {
    fieldKey: "customerIndustries",
    candidateValues: ["finance"],
    patterns: [
      /\b(for|serving|trusted\s+by|built\s+for)\s+(finance|financial\s+services|banking)\b/i,
      /\b(bank|fintech|insurance)\s+(customers|clients|partners)\b/i,
      /\bfinancial\s+(industry|sector)\b/i,
    ],
    signalType: "DIRECT_QUOTE",
    strength: "strong",
    reason: "Finance customer context",
  },
  {
    fieldKey: "customerIndustries",
    candidateValues: ["government"],
    patterns: [
      /\b(for|serving|trusted\s+by|built\s+for)\s+(government|public\s+sector|federal)\b/i,
      /\b(government|agency|department)\s+(customers|clients|partners)\b/i,
    ],
    signalType: "DIRECT_QUOTE",
    strength: "strong",
    reason: "Government customer context",
  },

  // Product Type patterns
  {
    fieldKey: "productType",
    candidateValues: ["saas"],
    patterns: [
      /\bsoftware\s+as\s+a\s+service\b/i,
      /\bsaas\s+(platform|solution|product)\b/i,
      /\bcloud-based\s+(software|platform)\b/i,
      /\bno\s+(software|installation)\s+(to\s+install|required)\b/i,
      /\bcloud\s+(platform|hosted)\b/i,
      /\bweb\s+platform\b/i,
      /\bapi\s+platform\b/i,
      /\benterprise\s+platform\b/i,
    ],
    signalType: "DIRECT_QUOTE",
    strength: "strong",
    reason: "Explicit SaaS/Platform identification",
  },
  {
    fieldKey: "productType",
    candidateValues: ["on-premise"],
    patterns: [
      /\bon-premise\b/i,
      /\bon-premises\b/i,
      /\bself-hosted\b/i,
      /\bdeployed\s+in\s+your\s+(data\s+center|infrastructure)\b/i,
    ],
    signalType: "DIRECT_QUOTE",
    strength: "strong",
    reason: "Explicit on-premise identification",
  },
  {
    fieldKey: "productType",
    candidateValues: ["hybrid"],
    patterns: [
      /\bhybrid\s+(deployment|solution|cloud)\b/i,
      /\bboth\s+(cloud|saas)\s+and\s+(on-premise|on-premises)\b/i,
    ],
    signalType: "DIRECT_QUOTE",
    strength: "strong",
    reason: "Explicit hybrid deployment mention",
  },
  {
    fieldKey: "productType",
    candidateValues: ["mobile"],
    patterns: [
      /\bmobile\s+(app|application|first)\b/i,
      /\bavailable\s+on\s+(iOS|Android|app\s+stores)\b/i,
      /\bnative\s+(iOS|Android)\s+app\b/i,
    ],
    signalType: "DIRECT_QUOTE",
    strength: "strong",
    reason: "Explicit mobile app identification",
  },

  // Customer Segment patterns
  {
    fieldKey: "customerSegment",
    candidateValues: ["b2b"],
    patterns: [
      /\bB2B\b/i,
      /\bbusiness-to-business\b/i,
      /\benterprise\s+(customers|clients|solution|organizations)\b/i,
      /\bfor\s+businesses\b/i,
      /\bcorporate\s+(clients|customers)\b/i,
      /\b(for|serving)\s+(vendors|organizations|businesses|teams|security\s+teams|compliance\s+teams)\b/i,
    ],
    signalType: "DIRECT_QUOTE",
    strength: "strong",
    reason: "Explicit B2B/Enterprise identification",
  },
  {
    fieldKey: "customerSegment",
    candidateValues: ["b2c"],
    patterns: [
      /\bB2C\b/i,
      /\bbusiness-to-consumer\b/i,
      /\bfor\s+(consumers|individuals|personal\s+use)\b/i,
      /\bconsumer\s+(app|product|service)\b/i,
    ],
    signalType: "DIRECT_QUOTE",
    strength: "strong",
    reason: "Explicit B2C identification",
  },

  // Compliance Focus patterns
  {
    fieldKey: "complianceFocus",
    candidateValues: ["soc2"],
    patterns: [
      /\bSOC\s?2\b/i,
      /\bSOC2\s+(Type\s+I|Type\s+II|certified|compliant)\b/i,
      /\bSSAE\s+18\b/i,
    ],
    signalType: "DIRECT_QUOTE",
    strength: "strong",
    reason: "Explicit SOC 2 mention",
  },
  {
    fieldKey: "complianceFocus",
    candidateValues: ["iso27001"],
    patterns: [
      /\bISO\s?27001\b/i,
      /\bISO\/IEC\s+27001\b/i,
      /\bISO27001\s+(certified|compliant)\b/i,
    ],
    signalType: "DIRECT_QUOTE",
    strength: "strong",
    reason: "Explicit ISO 27001 mention",
  },
  {
    fieldKey: "complianceFocus",
    candidateValues: ["gdpr"],
    patterns: [
      /\bGDPR\b/i,
      /\bEU\s+General\s+Data\s+Protection\b/i,
      /\bdata\s+protection\s+(regulation|compliance)\b/i,
      /\bDPA\b/i,
    ],
    signalType: "DIRECT_QUOTE",
    strength: "strong",
    reason: "Explicit GDPR/DPA mention",
  },
  {
    fieldKey: "complianceFocus",
    candidateValues: ["hipaa"],
    patterns: [
      /\bHIPAA\b/i,
      /\bHealth\s+Insurance\s+Portability\b/i,
      /\bPHI\s+protection\b/i,
      /\bhealthcare\s+(data\s+privacy|compliance)\b/i,
    ],
    signalType: "DIRECT_QUOTE",
    strength: "strong",
    reason: "Explicit HIPAA mention",
  },
  {
    fieldKey: "complianceFocus",
    candidateValues: ["pci"],
    patterns: [
      /\bPCI\s?DSS\b/i,
      /\bPCI\s+(compliant|certified)\b/i,
      /\bpayment\s+card\s+industry\b/i,
    ],
    signalType: "DIRECT_QUOTE",
    strength: "strong",
    reason: "Explicit PCI DSS mention",
  },
  {
    fieldKey: "complianceFocus",
    candidateValues: ["privacy"],
    patterns: [
      /\bprivacy\s+policy\b/i,
      /\bdata\s+protection\s+addendum\b/i,
    ],
    signalType: "DIRECT_QUOTE",
    strength: "strong",
    reason: "Explicit Privacy/DPA mention",
  },

  // Security Posture patterns
  {
    fieldKey: "securityPosture",
    candidateValues: ["encryption"],
    patterns: [
      /\bAES-?256\b/i,
      /\bend-to-end\s+encryption\b/i,
      /\bencryption\s+(at\s+rest|in\s+transit)\b/i,
      /\bTLS\s?1\.[23]\b/i,
      /\bencryption\b/i,
    ],
    signalType: "DIRECT_QUOTE",
    strength: "strong",
    reason: "Explicit encryption mention",
  },
  {
    fieldKey: "securityPosture",
    candidateValues: ["access_control"],
    patterns: [
      /\baccess\s+control\b/i,
      /\bRBAC\b/i,
      /\bmfa\b/i,
      /\bmulti-factor\s+authentication\b/i,
      /\b2FA\b/i,
    ],
    signalType: "DIRECT_QUOTE",
    strength: "strong",
    reason: "Explicit access control mention",
  },
  {
    fieldKey: "securityPosture",
    candidateValues: ["incident_response"],
    patterns: [
      /\bincident\s+response\b/i,
      /\bbreach\s+notification\b/i,
    ],
    signalType: "DIRECT_QUOTE",
    strength: "strong",
    reason: "Explicit incident response mention",
  },
  {
    fieldKey: "securityPosture",
    candidateValues: ["vulnerability_management"],
    patterns: [
      /\bvulnerability\s+(management|scanning|assessment)\b/i,
    ],
    signalType: "DIRECT_QUOTE",
    strength: "strong",
    reason: "Explicit vulnerability management mention",
  },
  {
    fieldKey: "securityPosture",
    candidateValues: ["sso"],
    patterns: [
      /\bSSO\b/i,
      /\bsingle\s+sign-on\b/i,
      /\b SAML\b/i,
      /\bOAuth\s?2\.?0?\b/i,
      /\bOIDC\b/i,
    ],
    signalType: "DIRECT_QUOTE",
    strength: "strong",
    reason: "Explicit SSO/identity mention",
  },
  {
    fieldKey: "securityPosture",
    candidateValues: ["audit"],
    patterns: [
      /\baudit\s+(logs|trail|logging)\b/i,
      /\blog\s+retention\b/i,
      /\bactivity\s+monitoring\b/i,
    ],
    signalType: "DIRECT_QUOTE",
    strength: "moderate",
    reason: "Audit/logging capabilities mentioned",
  },
  {
    fieldKey: "securityPosture",
    candidateValues: ["pentest"],
    patterns: [
      /\bpenetration\s+test(ing)?\b/i,
      /\bthird-party\s+security\s+assessment\b/i,
      /\bbug\s+bounty\s+(program|reward)\b/i,
    ],
    signalType: "DIRECT_QUOTE",
    strength: "strong",
    reason: "Explicit security testing mention",
  },

  // Data Handling patterns
  {
    fieldKey: "dataHandling",
    candidateValues: ["retention"],
    patterns: [
      /\bdata\s+retention\b/i,
      /\bretention\s+polic(y|ies)\b/i,
      /\bdata\s+stored\s+for\s+\d+\s+(days|months|years)\b/i,
    ],
    signalType: "DIRECT_QUOTE",
    strength: "moderate",
    reason: "Data retention mentioned",
  },
  {
    fieldKey: "dataHandling",
    candidateValues: ["deletion"],
    patterns: [
      /\bdata\s+deletion\b/i,
      /\bright\s+to\s+delet(ion|e)\b/i,
      /\bdata\s+erasure\b/i,
    ],
    signalType: "DIRECT_QUOTE",
    strength: "moderate",
    reason: "Data deletion mentioned",
  },
  {
    fieldKey: "dataHandling",
    candidateValues: ["encryption"],
    patterns: [
      /\bdata\s+encryption\b/i,
      /\bencrypted\s+(storage|database|backup)\b/i,
    ],
    signalType: "DIRECT_QUOTE",
    strength: "strong",
    reason: "Data encryption mentioned",
  },

  // Integration patterns
  {
    fieldKey: "integrations",
    candidateValues: ["api"],
    patterns: [
      /\bAPI\s+(access|available|documentation)\b/i,
      /\bREST\s+API\b/i,
      /\bGraphQL\s+API\b/i,
      /\bwebhook\s+integration\b/i,
    ],
    signalType: "DIRECT_QUOTE",
    strength: "strong",
    reason: "API capabilities mentioned",
  },
  {
    fieldKey: "integrations",
    candidateValues: ["native"],
    patterns: [
      /\bnative\s+integration\b/i,
      /\bintegrates?\s+with\s+(Salesforce|Slack|HubSpot|Stripe)\b/i,
      /\b\d+\s+(pre-built|native)\s+integrations?\b/i,
    ],
    signalType: "DIRECT_QUOTE",
    strength: "moderate",
    reason: "Native integrations mentioned",
  },
];

/**
 * Extract snippets from HTML content.
 */
export function extractSnippets(html: string): Array<{
  text: string;
  source: "title" | "meta" | "h1" | "h2" | "h3" | "paragraph";
  position: number;
}> {
  const snippets: Array<{ text: string; source: "title" | "meta" | "h1" | "h2" | "h3" | "paragraph"; position: number }> = [];
  let position = 0;

  // Extract title
  const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
  if (titleMatch) {
    snippets.push({
      text: titleMatch[1].trim(),
      source: "title",
      position: position++,
    });
  }

  // Extract meta description
  const metaMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ||
                     html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
  if (metaMatch) {
    snippets.push({
      text: metaMatch[1].trim(),
      source: "meta",
      position: position++,
    });
  }

  // Extract h1, h2, h3
  const headingRegex = /<h([123])[^>]*>([^<]*)<\/h[123]>/gi;
  for (const match of html.matchAll(headingRegex)) {
    const level = match[1];
    const text = match[2].replace(/<[^>]+>/g, "").trim();
    if (text) {
      snippets.push({
        text,
        source: `h${level}` as "h1" | "h2" | "h3",
        position: position++,
      });
    }
  }

  // Extract first few paragraphs (for pages with thin headings)
  const paraRegex = /<p[^>]*>([^<]{50,300})<\/p>/gi;
  let paraCount = 0;
  for (const match of html.matchAll(paraRegex)) {
    if (paraCount >= 3) break;
    const text = match[1].replace(/<[^>]+>/g, "").trim();
    if (text.length > 50) {
      snippets.push({
        text: text.slice(0, 200),
        source: "paragraph",
        position: position++,
      });
      paraCount++;
    }
  }

  return snippets;
}

/**
 * Truncate snippet to max length while preserving meaning.
 */
export function truncateSnippet(text: string, maxLength: number = 160): string {
  if (text.length <= maxLength) return text;

  // Try to break at sentence end
  const truncated = text.slice(0, maxLength);
  const lastPeriod = truncated.lastIndexOf(".");
  const lastSpace = truncated.lastIndexOf(" ");

  if (lastPeriod > maxLength * 0.7) {
    return truncated.slice(0, lastPeriod + 1);
  }

  if (lastSpace > maxLength * 0.8) {
    return truncated.slice(0, lastSpace) + "...";
  }

  return truncated + "...";
}

/**
 * Perform evidence extraction across a set of crawled pages.
 */
export function extractEvidence(
  pages: Array<{
    url: string;
    pageType: PageType;
    title: string;
    snippet: string;
    structured: StructuredPageEvidence;
  }>,
): EvidenceExtractionResult {
  const result: EvidenceExtractionResult = {
    fields: {
      industry: { fieldKey: "industry", signals: [], coverage: "unknown", hasConflicts: false },
      productType: { fieldKey: "productType", signals: [], coverage: "unknown", hasConflicts: false },
      customerSegment: { fieldKey: "customerSegment", signals: [], coverage: "unknown", hasConflicts: false },
      complianceFocus: { fieldKey: "complianceFocus", signals: [], coverage: "unknown", hasConflicts: false },
      securityPosture: { fieldKey: "securityPosture", signals: [], coverage: "unknown", hasConflicts: false },
      dataHandling: { fieldKey: "dataHandling", signals: [], coverage: "unknown", hasConflicts: false },
      integrations: { fieldKey: "integrations", signals: [], coverage: "unknown", hasConflicts: false },
      customerIndustries: { fieldKey: "customerIndustries", signals: [], coverage: "unknown", hasConflicts: false },
    },
    overallCoverage: "unknown",
    contributingPages: [],
    emptyPages: [],
    conflicts: {
      industry: [],
      productType: [],
      customerSegment: [],
      complianceFocus: [],
      securityPosture: [],
      dataHandling: [],
      integrations: [],
      customerIndustries: [],
    },
  };

  const contributingPagesSet = new Set<string>();

  for (const page of pages) {
    let pageContributed = false;
    
    // Unified text extraction: always prefer structured content
    const pageText = getUsableTextFromEvidence(page.structured);
    const pageSnippet = ensureUsableSnippet({
      snippet: page.snippet,
      structured: page.structured
    });

    for (const pattern of EVIDENCE_PATTERNS) {
      if (pattern.patterns.some((re) => re.test(pageText))) {
        pageContributed = true;
        contributingPagesSet.add(page.url);

        const field = result.fields[pattern.fieldKey];
        for (const value of pattern.candidateValues) {
          field.signals.push({
            fieldKey: pattern.fieldKey,
            candidateValue: value,
            signalType: pattern.signalType,
            snippet: pageSnippet,
            sourceUrl: page.url,
            pageType: page.pageType,
            strength: pattern.strength,
            reason: pattern.reason,
            location: "body", // Default location
            position: field.signals.length,
          });
        }
      }
    }

    if (!pageContributed) {
      result.emptyPages.push(page.url);
    }
  }

  result.contributingPages = Array.from(contributingPagesSet);

  // Assess coverage for each field
  for (const fieldKey of Object.keys(result.fields) as EvidenceFieldKey[]) {
    const field = result.fields[fieldKey];
    if (field.signals.length > 0) {
      const hasStrong = field.signals.some((s) => s.strength === "strong");
      field.coverage = hasStrong ? "strong" : "moderate";
    }
  }

  return result;
}

/**
 * Extract evidence signals from a single crawled page.
 */
export function extractEvidenceFromPage(
  page: CrawlAttempt,
): EvidenceSignal[] {
  const signals: EvidenceSignal[] = [];

  if (!page.success || !page.fetchedUrl) {
    return signals;
  }

  // For this implementation, we need to re-fetch HTML
  // In production, HTML should be stored in CrawlAttempt
  // For now, we'll create signals based on page metadata

  // Extract from title and metadata we already have
  const textSources: Array<{ text: string; source: string; position: number }> = [];

  if (page.title) {
    textSources.push({ text: page.title, source: "title", position: 0 });
  }

  // Note: To fully implement this, we'd need to store the HTML in CrawlAttempt
  // or fetch it again. For now, we create signals based on URL patterns
  // and classification signals that are already stored.

  // Create inferred signals from page classification
  if (page.classificationSignals.urlPattern) {
    const urlPattern = page.classificationSignals.urlPattern;

    // Map page types to field evidence
    const pageTypeToField: Partial<Record<PageType, EvidenceFieldKey>> = {
      security: "securityPosture",
      trust: "securityPosture",
      compliance: "complianceFocus",
      privacy: "dataHandling",
      legal: "complianceFocus",
      product: "productType",
    };

    const fieldKey = pageTypeToField[page.pageType];
    if (fieldKey) {
      const candidateValue = page.pageType;
      const snippet = page.title
        ? `Page "${truncateSnippet(page.title)}" identified as ${page.pageType} page`
        : `URL pattern indicates ${page.pageType} page`;

      signals.push({
        fieldKey,
        candidateValue,
        signalType: "INFERRED",
        snippet: truncateSnippet(snippet),
        sourceUrl: page.fetchedUrl,
        pageType: page.pageType,
        strength: page.usefulnessTier === "critical" ? "strong" : "moderate",
        reason: `Page classified as ${page.pageType} based on URL pattern`,
        location: "url",
        position: 0,
      });
    }
  }

  return signals;
}

/**
 * Extract all evidence signals from multiple crawled pages.
 */
export async function extractAllEvidence(
  pages: CrawlAttempt[],
): Promise<EvidenceExtractionResult> {
  const allSignals: EvidenceSignal[] = [];
  const contributingPages: string[] = [];
  const emptyPages: string[] = [];

  for (const page of pages) {
    const signals = extractEvidenceFromPage(page);

    if (signals.length > 0) {
      allSignals.push(...signals);
      if (page.fetchedUrl) {
        contributingPages.push(page.fetchedUrl);
      }
    } else if (page.fetchedUrl) {
      emptyPages.push(page.fetchedUrl);
    }
  }

  // Group signals by field
  const fields: Partial<Record<EvidenceFieldKey, FieldEvidence>> = {};
  const conflicts: Partial<Record<EvidenceFieldKey, EvidenceSignal[]>> = {};

  for (const signal of allSignals) {
    if (!fields[signal.fieldKey]) {
      fields[signal.fieldKey] = {
        fieldKey: signal.fieldKey,
        signals: [],
        coverage: "unknown",
        hasConflicts: false,
      };
    }

    fields[signal.fieldKey]!.signals.push(signal);

    // Check for conflicts (different candidate values for same field)
    const existingCandidates = new Set(
      fields[signal.fieldKey]!.signals.map((s) => s.candidateValue),
    );
    if (existingCandidates.size > 1) {
      fields[signal.fieldKey]!.hasConflicts = true;
      if (!conflicts[signal.fieldKey]) {
        conflicts[signal.fieldKey] = [];
      }
      conflicts[signal.fieldKey]!.push(signal);
    }
  }

  // Determine coverage and primary signal for each field
  for (const field of Object.values(fields)) {
    const strengthOrder: EvidenceStrength[] = ["strong", "moderate", "weak", "unknown"];
    const strongestSignal = field.signals.sort(
      (a, b) => strengthOrder.indexOf(a.strength) - strengthOrder.indexOf(b.strength),
    )[0];

    if (strongestSignal) {
      field.coverage = strongestSignal.strength;
      field.primarySignal = strongestSignal;
    }
  }

  // Overall coverage assessment
  const fieldCoverages = Object.values(fields).map((f) => f.coverage);
  const overallCoverage = fieldCoverages.includes("strong")
    ? "strong"
    : fieldCoverages.includes("moderate")
      ? "moderate"
      : fieldCoverages.includes("weak")
        ? "weak"
        : "unknown";

  logger.info("evidence-extraction:complete", {
    totalSignals: allSignals.length,
    fieldsCovered: Object.keys(fields).length,
    contributingPages: contributingPages.length,
    emptyPages: emptyPages.length,
    conflicts: Object.keys(conflicts).length,
    overallCoverage,
  });

  return {
    fields: fields as Record<EvidenceFieldKey, FieldEvidence>,
    overallCoverage,
    contributingPages,
    emptyPages,
    conflicts: conflicts as Record<EvidenceFieldKey, EvidenceSignal[]>,
  };
}

/**
 * Check if evidence coverage is sufficient for a field.
 */
export function hasSufficientEvidence(
  fieldEvidence: FieldEvidence | undefined,
  minimumStrength: EvidenceStrength = "moderate",
): boolean {
  if (!fieldEvidence) return false;

  const strengthOrder: EvidenceStrength[] = ["strong", "moderate", "weak", "unknown"];
  return strengthOrder.indexOf(fieldEvidence.coverage) <= strengthOrder.indexOf(minimumStrength);
}

/**
 * Get conflicting signals for a field.
 */
export function getConflicts(
  result: EvidenceExtractionResult,
  fieldKey: EvidenceFieldKey,
): EvidenceSignal[] {
  return result.conflicts[fieldKey] || [];
}
