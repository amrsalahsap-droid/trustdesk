/**
 * Deterministic Industry Candidate Scoring
 *
 * Computes support scores for industry candidates based on evidence signals.
 * This is separate from LLM confidence - it's calculated purely from extracted evidence.
 *
 * Scoring rules:
 * - Explicit "software company/platform/vendor/provider/SaaS" direct quote: +40 points
 * - Product/platform/solution wording on product/homepage pages: +25 points
 * - JSON-LD industry = Software: +35 points
 * - Repeated software/SaaS terms across multiple pages: +10 per page (max 30)
 * - Security/trust/compliance page supporting software vendor posture: +15 points
 * - Healthcare/finance CUSTOMER wording (not company): -10 points (penalty)
 * - Conflicting primary-industry signals: -20 points per conflict
 * - Company provides healthcare/clinical services: +40 points healthtech
 */

import { logger } from "@/lib/logging/logger";
import { type PageType } from "./domain-crawler";
import { type EvidenceSignal, type EvidenceStrength } from "./evidence-extraction";

export type ConfidenceBand = "high" | "medium" | "limited" | "unknown";
export type EvidenceCoverage = "strong" | "medium" | "limited" | "weak" | "none";

export type IndustryCandidate = {
  value: string;
  supportScore: number;
  confidenceBand: ConfidenceBand;
  evidenceCoverage: EvidenceCoverage;
  evidenceRefs: IndustryEvidenceRef[];
  reasons: string[];
  conflictingSignals: IndustryEvidenceRef[];
  isConflicted: boolean;
};

export type IndustryEvidenceRef = {
  sourceUrl: string;
  pageType: PageType;
  snippet: string;
  signalType: string;
  strength: EvidenceStrength;
  contribution: number; // Points this evidence contributed
};

export type IndustryScoringInput = {
  signals: EvidenceSignal[];
  pages: Map<string, { pageType: PageType; text: string; jsonLd?: unknown }>;
};

export type IndustryScoringResult = {
  candidates: IndustryCandidate[];
  primaryIndustry: string | null;
  hasConflict: boolean;
  totalSignals: number;
};

// Industry patterns with their weights
const INDUSTRY_PATTERNS: Array<{
  industry: string;
  patterns: RegExp[];
  weight: number;
  signalType: string;
  isCompanyIndicator: boolean; // true = indicates company IS this industry
  isCustomerIndicator: boolean; // true = indicates company SERVES this industry
}> = [
  // Software/SaaS - Strong Company indicators
  {
    industry: "software",
    patterns: [
      /\bsoftware\s+(company|platform|provider|vendor|solution|product)\b/i,
      /\bwe\s+(are|build|develop|make)\s+(a\s+)?software\s+(company|platform)\b/i,
      /\bsaas\s+(platform|solution|provider|company|product)\b/i,
      /\bsoftware-as-a-service\b/i,
      /\bcloud\s+(software|platform|solution)\b/i,
      /\benterprise\s+(software|platform|solution)\b/i,
      // Domain-specific reinforcement
      /\bcybersecurity\s+(platform|solution|product|software)\b/i,
      /\bdata\s+security\s+(platform|solution|product|software)\b/i,
      /\bai-powered\s+(platform|solution|product|software)\b/i,
      /\bdigital\s+(platform|solution|product|software)\b/i,
      /\bcloud-native\s+(platform|solution|product|software)\b/i,
      /\bautomation\s+(platform|solution|product|software)\b/i,
    ],
    weight: 45,
    signalType: "DIRECT_QUOTE",
    isCompanyIndicator: true,
    isCustomerIndicator: false,
  },
  // Software - Inferred indicators
  {
    industry: "software",
    patterns: [
      /\bplatform\s+for\b/i,
      /\bsolution\s+for\b/i,
      /\bsoftware\s+for\b/i,
    ],
    weight: 25,
    signalType: "INFERRED",
    isCompanyIndicator: true,
    isCustomerIndicator: false,
  },
  // Healthcare - Company indicator (company provides healthcare)
  {
    industry: "healthtech",
    patterns: [
      /\b(we\s+)?provide\s+(healthcare|medical|clinical|telemedicine)\s+(services|care|treatment|provider|clinic|hospital)s?\b/i,
      /\bhealthcare\s+(provider|clinic|hospital|practice|service|care)s?\b/i,
      /\bwe\s+(are|serve\s+as)\s+a\s+(healthcare|medical)\s+(provider|clinic|hospital)\b/i,
      /\btelemedicine\s+platform\s+(for\s+patients|providing)\b/i,
      /\bmedical\s+(services|practice|care|treatment)\s+platform\b/i,
    ],
    weight: 45,
    signalType: "DIRECT_QUOTE",
    isCompanyIndicator: true,
    isCustomerIndicator: false,
  },
  // Healthtech - Technology indicator (company provides software FOR healthcare)
  {
    industry: "healthtech",
    patterns: [
      /\bhealthcare\s+(technology|software|platform|solution)s?\b/i,
      /\bmedical\s+(software|platform|solution)s?\b/i,
      /\bhealthtech\s+(platform|solution|company)\b/i,
    ],
    weight: 35,
    signalType: "DIRECT_QUOTE",
    isCompanyIndicator: true,
    isCustomerIndicator: false,
  },
  // Healthcare - Customer indicator (company serves healthcare)
  {
    industry: "healthcare_customer",
    patterns: [
      /\b(helps?|for|serves?|trusted\s+by)\s+(healthcare|medical|hospitals?|clinics?|patients?|physicians?)\b/i,
      /\b(healthcare|medical|hospital)\s+(customers?|clients?|organizations?)\b/i,
      /\bHIPAA\s+(compliant|compliance)\b/i,
      /\bfor\s+(the\s+)?healthcare\s+(industry|sector)\b/i,
    ],
    weight: 15,
    signalType: "CUSTOMER_SIGNAL",
    isCompanyIndicator: false,
    isCustomerIndicator: true,
  },
  // Fintech - Company indicator
  {
    industry: "fintech",
    patterns: [
      /\bfintech\s+(company|platform|provider|solution)\b/i,
      /\bfinancial\s+(technology|services|platform)\s+(company|provider)\b/i,
      /\bwe\s+(provide|offer|build)\s+(financial|banking|payment)\s+(technology|solutions|platforms?)\b/i,
      /\bbanking\s+(software|platform|technology)\b/i,
      /\bpayment\s+(processing|platform|solution)\s+(provider|company)\b/i,
    ],
    weight: 45,
    signalType: "DIRECT_QUOTE",
    isCompanyIndicator: true,
    isCustomerIndicator: false,
  },
  // Fintech - Customer indicator
  {
    industry: "finance_customer",
    patterns: [
      /\b(helps?|for|serves?|trusted\s+by)\s+(banks?|financial|fintech|payments?|lenders?)\b/i,
      /\b(financial|banking|fintech)\s+(customers?|clients?|institutions?)\b/i,
      /\bPCI\s+DSS\s+(compliant|compliance)\b/i,
      /\bfor\s+(the\s+)?finance\s+(industry|sector)\b/i,
    ],
    weight: 15,
    signalType: "CUSTOMER_SIGNAL",
    isCompanyIndicator: false,
    isCustomerIndicator: true,
  },
  // Ecommerce - Company indicator
  {
    industry: "ecommerce",
    patterns: [
      /\be-commerce\s+(platform|solution|provider|company)\b/i,
      /\becommerce\s+(platform|solution|provider)\b/i,
      /\bonline\s+(store|marketplace|retail|shop)\s+(platform|provider)\b/i,
      /\bwe\s+(are|operate)\s+(an?\s+)?(e-commerce|ecommerce|online\s+store)\b/i,
    ],
    weight: 40,
    signalType: "DIRECT_QUOTE",
    isCompanyIndicator: true,
    isCustomerIndicator: false,
  },
];

// Page type multipliers - certain pages provide stronger evidence
const PAGE_TYPE_MULTIPLIERS: Record<PageType, number> = {
  homepage: 1.5,
  about: 1.3,
  company: 1.3,
  product: 1.4,
  platform: 1.4,
  solutions: 1.3,
  security: 1.2,
  trust: 1.2,
  compliance: 1.2,
  privacy: 1.1,
  legal: 1.0,
  dpa: 1.0,
  docs: 1.0,
  pricing: 1.0,
  customers: 0.9, // Customer pages are weaker for company industry
  case_study: 0.9,
  integrations: 1.0,
  unknown: 1.0,
};

// JSON-LD industry mappings
const JSON_LD_INDUSTRY_MAP: Record<string, string> = {
  "software": "software",
  "computer software": "software",
  "saas": "software",
  "fintech": "fintech",
  "financial technology": "fintech",
  "healthcare": "healthtech",
  "health technology": "healthtech",
  "medical": "healthtech",
  "ecommerce": "ecommerce",
  "e-commerce": "ecommerce",
};

/**
 * Score industry candidates based on extracted evidence signals.
 */
export function scoreIndustryCandidates(input: IndustryScoringInput): IndustryScoringResult {
  const { signals, pages } = input;
  
  const candidateScores = new Map<string, {
    score: number;
    refs: IndustryEvidenceRef[];
    reasons: Set<string>;
    conflicts: IndustryEvidenceRef[];
  }>();

  // Initialize candidates from patterns
  for (const pattern of INDUSTRY_PATTERNS) {
    if (!candidateScores.has(pattern.industry)) {
      candidateScores.set(pattern.industry, {
        score: 0,
        refs: [],
        reasons: new Set(),
        conflicts: [],
      });
    }
  }

  // Score each signal
  for (const signal of signals) {
    const page = pages.get(signal.sourceUrl);
    const pageType = page?.pageType ?? "unknown";
    const pageMultiplier = PAGE_TYPE_MULTIPLIERS[pageType] ?? 1.0;

    // Match against industry patterns
    for (const pattern of INDUSTRY_PATTERNS) {
      const matches = pattern.patterns.some(p => p.test(signal.snippet));
      
      if (matches) {
        const entry = candidateScores.get(pattern.industry)!;
        
        // Calculate contribution
        let contribution = pattern.weight * pageMultiplier;
        
        // Adjust for signal strength
        const strengthMultipliers: Record<EvidenceStrength, number> = {
          strong: 1.0,
          moderate: 0.7,
          weak: 0.4,
          unknown: 0.2,
        };
        contribution *= strengthMultipliers[signal.strength];

        // Customer indicators on company pages are weaker
        if (pattern.isCustomerIndicator && (pageType === "homepage" || pageType === "about" || pageType === "product")) {
          contribution *= 0.5; // Reduce weight on primary company pages
        }

        entry.score += contribution;
        entry.refs.push({
          sourceUrl: signal.sourceUrl,
          pageType,
          snippet: signal.snippet.slice(0, 200),
          signalType: signal.signalType,
          strength: signal.strength,
          contribution: Math.round(contribution),
        });
        
        entry.reasons.add(`${pattern.signalType} match: ${pattern.industry}`);
      }
    }
  }

  // Score JSON-LD structured data
  for (const [url, page] of pages) {
    if (page.jsonLd) {
      const jsonLd = JSON.stringify(page.jsonLd).toLowerCase();
      
      for (const [key, industry] of Object.entries(JSON_LD_INDUSTRY_MAP)) {
        if (jsonLd.includes(key)) {
          const entry = candidateScores.get(industry)!;
          if (entry) {
            const contribution = 35 * PAGE_TYPE_MULTIPLIERS[page.pageType];
            entry.score += contribution;
            entry.refs.push({
              sourceUrl: url,
              pageType: page.pageType,
              snippet: `JSON-LD: ${key}`,
              signalType: "STRUCTURED_DATA",
              strength: "strong",
              contribution: Math.round(contribution),
            });
            entry.reasons.add(`JSON-LD industry: ${key}`);
          }
        }
      }
    }
  }

  // Apply repetition bonus for software/SaaS terms across multiple pages
  const softwareEntry = candidateScores.get("software");
  if (softwareEntry && softwareEntry.refs.length >= 2) {
    const uniquePages = new Set(softwareEntry.refs.map(r => r.sourceUrl)).size;
    const repetitionBonus = Math.min((uniquePages - 1) * 10, 30);
    softwareEntry.score += repetitionBonus;
    if (repetitionBonus > 0) {
      softwareEntry.reasons.add(`Repeated across ${uniquePages} pages (+${repetitionBonus})`);
    }
  }

  
  // Adjust for customer vs company indicators
  // If software has strong company indicators but healthtech only has customer indicators
  const softwareScore = candidateScores.get("software")?.score ?? 0;
  const healthtechScore = candidateScores.get("healthtech")?.score ?? 0;
  const healthcareCustomerScore = candidateScores.get("healthcare_customer")?.score ?? 0;

  if (softwareScore > 50 && healthtechScore > 0 && healthtechScore < 40) {
    // Likely a software company serving healthcare
    const healthtechEntry = candidateScores.get("healthtech")!;
    // Check if healthtech is from customer signals only
    const hasCompanyHealthIndicator = healthtechEntry.refs.some(r => 
      INDUSTRY_PATTERNS.find(p => p.industry === "healthtech")?.isCompanyIndicator
    );
    if (!hasCompanyHealthIndicator) {
      // Reduce healthtech score - it's just customer industry
      healthtechEntry.score *= 0.3;
      healthtechEntry.reasons.add("Healthcare appears to be customer industry, not company");
    }
  }

  // Calculate evidence coverage for each candidate
  const calculateEvidenceCoverage = (refs: IndustryEvidenceRef[]): EvidenceCoverage => {
    const strongSignals = refs.filter(r => r.strength === "strong").length;
    const uniquePages = new Set(refs.map(r => r.sourceUrl)).size;
    const highSignalPages = refs.filter(r => 
      ["security", "trust", "compliance", "privacy", "legal", "product", "platform"].includes(r.pageType)
    ).length;
    
    const totalPoints = refs.reduce((sum, r) => sum + r.contribution, 0);

    if ((strongSignals >= 2 && uniquePages >= 2 && highSignalPages >= 1) || (totalPoints >= 100)) {
      return "strong";
    } else if (strongSignals >= 1 || uniquePages >= 2 || highSignalPages >= 1 || totalPoints >= 60) {
      return "medium";
    } else if (refs.length > 0 || totalPoints >= 30) {
      return "limited";
    } else {
      return "none";
    }
  };

  // Convert support score to confidence band
  const calculateConfidenceBand = (score: number, coverage: EvidenceCoverage, isConflicted: boolean): ConfidenceBand => {
    // Conflict overrides normal confidence band
    if (isConflicted) {
      return "unknown";
    }
    
    // Evidence coverage caps confidence
    if (coverage === "none") {
      return "unknown";
    } else if (coverage === "weak") {
      return score >= 60 ? "limited" : "unknown";
    } else if (coverage === "limited") {
      return score >= 80 ? "medium" : score >= 60 ? "limited" : "unknown";
    } else if (coverage === "medium") {
      if (score >= 80) return "high";
      if (score >= 60) return "medium";
      return "limited";
    } else { // strong coverage
      if (score >= 80) return "high";
      if (score >= 60) return "medium";
      return "limited";
    }
  };

  // Detect conflicts between top candidates using 15-point threshold
  const detectConflicts = (candidates: Array<{industry: string; score: number}>): Map<string, boolean> => {
    const conflicts = new Map<string, boolean>();
    const primaryIndustries = ["software", "fintech", "healthtech", "ecommerce"];
    
    const primaryCandidates = primaryIndustries
      .map(industry => ({
        industry,
        score: candidateScores.get(industry)?.score ?? 0
      }))
      .filter(c => c.score > 0)
      .sort((a, b) => b.score - a.score);
    
    if (primaryCandidates.length >= 2) {
      const top = primaryCandidates[0];
      const second = primaryCandidates[1];
      
      if (top.score - second.score <= 15) {
        conflicts.set(top.industry, true);
        conflicts.set(second.industry, true);
      }
    }
    
    return conflicts;
  };

  const conflictMap = detectConflicts(Array.from(candidateScores.entries()).map(([industry, entry]) => ({ industry, score: entry.score })));

  // Convert to result format
  const candidates: IndustryCandidate[] = Array.from(candidateScores.entries())
    .filter(([_, entry]) => entry.score > 0 || entry.refs.length > 0)
    .map(([industry, entry]) => {
      const supportScore = Math.round(Math.max(0, Math.min(100, entry.score)));
      const evidenceCoverage = calculateEvidenceCoverage(entry.refs);
      const isConflicted = conflictMap.get(industry) ?? false;
      const confidenceBand = calculateConfidenceBand(supportScore, evidenceCoverage, isConflicted);
      
      return {
        value: industry,
        supportScore,
        confidenceBand,
        evidenceCoverage,
        evidenceRefs: entry.refs,
        reasons: Array.from(entry.reasons),
        conflictingSignals: entry.conflicts,
        isConflicted,
      };
    })
    .sort((a, b) => b.supportScore - a.supportScore);

  // Determine primary industry
  const primaryCandidate = candidates.find(c => 
    !["healthcare_customer", "finance_customer"].includes(c.value)
  );

  // Determine if there are any conflicts
  const hasConflict = candidates.some(c => c.isConflicted);

  logger.info("industry-scoring:complete", {
    candidateCount: candidates.length,
    primaryIndustry: primaryCandidate?.value ?? null,
    topScore: primaryCandidate?.supportScore ?? 0,
    hasConflict,
  });

  return {
    candidates,
    primaryIndustry: primaryCandidate?.value ?? null,
    hasConflict,
    totalSignals: signals.length,
  };
}

/**
 * Get a human-readable explanation of why an industry was scored.
 */
export function explainIndustryScore(candidate: IndustryCandidate): string {
  const lines: string[] = [];
  lines.push(`Industry: ${candidate.value}`);
  lines.push(`Support Score: ${candidate.supportScore}/100`);
  lines.push("");
  
  if (candidate.reasons.length > 0) {
    lines.push("Reasons:");
    for (const reason of candidate.reasons) {
      lines.push(`  • ${reason}`);
    }
  }
  
  if (candidate.evidenceRefs.length > 0) {
    lines.push("");
    lines.push("Evidence Sources:");
    for (const ref of candidate.evidenceRefs.slice(0, 5)) {
      lines.push(`  • ${ref.pageType}: "${ref.snippet.slice(0, 60)}..." (+${ref.contribution})`);
    }
  }
  
  if (candidate.conflictingSignals.length > 0) {
    lines.push("");
    lines.push("Conflicting Signals:");
    for (const conflict of candidate.conflictingSignals.slice(0, 3)) {
      lines.push(`  • ${conflict.pageType}: "${conflict.snippet.slice(0, 40)}..."`);
    }
  }
  
  return lines.join("\n");
}
