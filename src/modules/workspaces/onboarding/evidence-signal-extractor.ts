/**
 * Evidence Signal Extractor for TrustDesk
 * 
 * Extracts field-specific evidence signals from Domain Evidence Pack
 * to support Trust Profile decisions with exact evidence signals.
 */

import type { EvidencePage, EvidenceSnippet, PageType } from "./domain-crawler";

/**
 * Signal strength levels for confidence scoring
 */
export type SignalStrength = "high" | "medium" | "low";

/**
 * Signal types for categorizing evidence extraction methods
 */
export type SignalType = 
  | "direct_quote" 
  | "product_language" 
  | "compliance_language"
  | "security_language"
  | "industry_language"
  | "customer_language"
  | "business_model_language"
  | "integration_language";

/**
 * Evidence signal for field-specific Trust Profile decisions
 */
export interface EvidenceSignal {
  /** Field key this signal applies to */
  fieldKey: string;
  /** Candidate value for the field */
  candidateValue: string;
  /** Type of signal extraction method */
  signalType: SignalType;
  /** Confidence strength of this signal */
  strength: SignalStrength;
  /** Source URL where signal was found */
  sourceUrl: string;
  /** Page type where signal was found */
  pageType: PageType;
  /** Evidence snippet supporting this signal */
  snippet: string;
  /** Reason for signal classification */
  reason: string;
  /** Confidence score (0-100) */
  confidenceScore: number;
}

/**
 * Extracted signals organized by field
 */
export interface ExtractedSignals {
  /** Primary industry classification */
  industry?: EvidenceSignal;
  /** Customer industries served */
  customerIndustries: EvidenceSignal[];
  /** Business model classification */
  businessModel?: EvidenceSignal;
  /** Compliance focus areas */
  complianceFocus: EvidenceSignal[];
  /** Security posture assessment */
  securityPosture: EvidenceSignal[];
  /** Data handling practices */
  dataHandling: EvidenceSignal[];
  /** Supported integrations */
  integrations: EvidenceSignal[];
}

/**
 * Industry classification options
 */
export type IndustryType = 
  | "software" 
  | "healthcare" 
  | "healthtech" 
  | "fintech" 
  | "ecommerce" 
  | "education" 
  | "manufacturing" 
  | "consulting" 
  | "other";

/**
 * Business model options
 */
export type BusinessModelType = 
  | "saas" 
  | "b2b" 
  | "b2c" 
  | "marketplace" 
  | "agency" 
  | "product" 
  | "service" 
  | "other";

/**
 * Compliance focus options
 */
export type ComplianceType = 
  | "GDPR" 
  | "SOC2" 
  | "ISO27001" 
  | "HIPAA" 
  | "PCI-DSS" 
  | "CCPA" 
  | "other";

/**
 * Security posture options
 */
export type SecurityPostureType = 
  | "enterprise_grade" 
  | "standard" 
  | "basic" 
  | "comprehensive" 
  | "certified" 
  | "other";

/**
 * Data handling options
 */
export type DataHandlingType = 
  | "encrypted" 
  | "secure" 
  | "compliant" 
  | "minimal" 
  | "comprehensive" 
  | "other";

/**
 * Integration options
 */
export type IntegrationType = 
  | "api" 
  | "sso" 
  | "webhook" 
  | "embedded" 
  | "marketplace" 
  | "other";

/**
 * Extract field-specific evidence signals from evidence pack
 */
export function extractEvidenceSignals(evidencePages: EvidencePage[]): ExtractedSignals {
  const signals: ExtractedSignals = {
    customerIndustries: [],
    complianceFocus: [],
    securityPosture: [],
    dataHandling: [],
    integrations: [],
  };

  // Group pages by type for targeted extraction
  const pagesByType = groupPagesByType(evidencePages);

  // Extract industry signals (primary classification)
  signals.industry = extractIndustrySignal(pagesByType);

  // Extract customer industry signals
  signals.customerIndustries = extractCustomerIndustrySignals(pagesByType);

  // Extract business model signals
  signals.businessModel = extractBusinessModelSignal(pagesByType);

  // Extract compliance focus signals
  signals.complianceFocus = extractComplianceSignals(pagesByType);

  // Extract security posture signals
  signals.securityPosture = extractSecurityPostureSignals(pagesByType);

  // Extract data handling signals
  signals.dataHandling = extractDataHandlingSignals(pagesByType);

  // Extract integration signals
  signals.integrations = extractIntegrationSignals(pagesByType);

  return signals;
}

/**
 * Group evidence pages by type for targeted extraction
 */
function groupPagesByType(pages: EvidencePage[]): Record<PageType, EvidencePage[]> {
  const grouped: Record<PageType, EvidencePage[]> = {} as any;
  
  for (const page of pages) {
    if (!grouped[page.pageType]) {
      grouped[page.pageType] = [];
    }
    grouped[page.pageType].push(page);
  }
  
  return grouped;
}

/**
 * Extract primary industry signal with software vs healthcare distinction
 */
function extractIndustrySignal(pagesByType: Record<PageType, EvidencePage[]>): EvidenceSignal | undefined {
  const relevantPages = [
    ...(pagesByType.homepage || []),
    ...(pagesByType.product || []),
    ...(pagesByType.platform || []),
    ...(pagesByType.about || []),
    ...(pagesByType.company || []),
  ];

  let bestSignal: EvidenceSignal | undefined;

  for (const page of relevantPages) {
    for (const snippet of page.evidenceSnippets) {
      const content = snippet.content.toLowerCase();
      
      // Software/SaaS signals (highest priority)
      if (isSoftwareSignal(content)) {
        const signal: EvidenceSignal = {
          fieldKey: "industry",
          candidateValue: "software",
          signalType: "product_language",
          strength: "high",
          sourceUrl: page.url,
          pageType: page.pageType,
          snippet: snippet.content,
          reason: "explicit software/platform/vendor wording",
          confidenceScore: calculateConfidence(content, "software"),
        };
        
        if (!bestSignal || signal.confidenceScore > bestSignal.confidenceScore) {
          bestSignal = signal;
        }
      }
      
      // Healthcare/Healthtech signals
      if (isHealthcareSignal(content)) {
        const signal: EvidenceSignal = {
          fieldKey: "industry",
          candidateValue: isHealthtechSignal(content) ? "healthtech" : "healthcare",
          signalType: "industry_language",
          strength: "high",
          sourceUrl: page.url,
          pageType: page.pageType,
          snippet: snippet.content,
          reason: "explicit healthcare/medical service language",
          confidenceScore: calculateConfidence(content, "healthcare"),
        };
        
        // Only use healthcare as primary if no software signal found
        if (!bestSignal || (bestSignal.candidateValue !== "software" && signal.confidenceScore > bestSignal.confidenceScore)) {
          bestSignal = signal;
        }
      }
    }
  }

  return bestSignal;
}

/**
 * Extract customer industry signals (separate from primary industry)
 */
function extractCustomerIndustrySignals(pagesByType: Record<PageType, EvidencePage[]>): EvidenceSignal[] {
  const signals: EvidenceSignal[] = [];
  const relevantPages = [
    ...(pagesByType.customers || []),
    ...(pagesByType.case_study || []),
    ...(pagesByType.about || []),
    ...(pagesByType.homepage || []),
  ];

  for (const page of relevantPages) {
    for (const snippet of page.evidenceSnippets) {
      const content = snippet.content.toLowerCase();
      
      // Healthcare customer signals
      if (isHealthcareCustomerSignal(content)) {
        signals.push({
          fieldKey: "customerIndustries",
          candidateValue: "healthcare",
          signalType: "customer_language",
          strength: "medium",
          sourceUrl: page.url,
          pageType: page.pageType,
          snippet: snippet.content,
          reason: "healthcare customer/client language",
          confidenceScore: calculateConfidence(content, "healthcare_customer"),
        });
      }
      
      // Other industry customer signals
      if (isFintechCustomerSignal(content)) {
        signals.push({
          fieldKey: "customerIndustries",
          candidateValue: "fintech",
          signalType: "customer_language",
          strength: "medium",
          sourceUrl: page.url,
          pageType: page.pageType,
          snippet: snippet.content,
          reason: "fintech customer/client language",
          confidenceScore: calculateConfidence(content, "fintech_customer"),
        });
      }
      
      if (isEcommerceCustomerSignal(content)) {
        signals.push({
          fieldKey: "customerIndustries",
          candidateValue: "ecommerce",
          signalType: "customer_language",
          strength: "medium",
          sourceUrl: page.url,
          pageType: page.pageType,
          snippet: snippet.content,
          reason: "ecommerce customer/client language",
          confidenceScore: calculateConfidence(content, "ecommerce_customer"),
        });
      }
    }
  }

  // Remove duplicates and return top signals
  return deduplicateSignals(signals).slice(0, 5);
}

/**
 * Extract business model signals
 */
function extractBusinessModelSignal(pagesByType: Record<PageType, EvidencePage[]>): EvidenceSignal | undefined {
  const relevantPages = [
    ...(pagesByType.homepage || []),
    ...(pagesByType.product || []),
    ...(pagesByType.platform || []),
    ...(pagesByType.pricing || []),
    ...(pagesByType.about || []),
  ];

  let bestSignal: EvidenceSignal | undefined;

  for (const page of relevantPages) {
    for (const snippet of page.evidenceSnippets) {
      const content = snippet.content.toLowerCase();
      
      if (isSaaSSignal(content)) {
        const signal: EvidenceSignal = {
          fieldKey: "businessModel",
          candidateValue: "saas",
          signalType: "business_model_language",
          strength: "high",
          sourceUrl: page.url,
          pageType: page.pageType,
          snippet: snippet.content,
          reason: "explicit SaaS/subscription language",
          confidenceScore: calculateConfidence(content, "saas"),
        };
        
        if (!bestSignal || signal.confidenceScore > bestSignal.confidenceScore) {
          bestSignal = signal;
        }
      }
      
      if (isB2BSignal(content)) {
        const signal: EvidenceSignal = {
          fieldKey: "businessModel",
          candidateValue: "b2b",
          signalType: "business_model_language",
          strength: "medium",
          sourceUrl: page.url,
          pageType: page.pageType,
          snippet: snippet.content,
          reason: "B2B business language",
          confidenceScore: calculateConfidence(content, "b2b"),
        };
        
        if (!bestSignal || signal.confidenceScore > bestSignal.confidenceScore) {
          bestSignal = signal;
        }
      }
    }
  }

  return bestSignal;
}

/**
 * Extract compliance focus signals
 */
function extractComplianceSignals(pagesByType: Record<PageType, EvidencePage[]>): EvidenceSignal[] {
  const signals: EvidenceSignal[] = [];
  const relevantPages = [
    ...(pagesByType.privacy || []),
    ...(pagesByType.legal || []),
    ...(pagesByType.dpa || []),
    ...(pagesByType.compliance || []),
    ...(pagesByType.security || []),
    ...(pagesByType.trust || []),
  ];

  for (const page of relevantPages) {
    for (const snippet of page.evidenceSnippets) {
      const content = snippet.content.toLowerCase();
      
      // GDPR signals
      if (isGDPRSignal(content)) {
        signals.push({
          fieldKey: "complianceFocus",
          candidateValue: "GDPR",
          signalType: "compliance_language",
          strength: "high",
          sourceUrl: page.url,
          pageType: page.pageType,
          snippet: snippet.content,
          reason: "GDPR privacy or data processing language",
          confidenceScore: calculateConfidence(content, "gdpr"),
        });
      }
      
      // SOC 2 signals
      if (isSOC2Signal(content)) {
        signals.push({
          fieldKey: "complianceFocus",
          candidateValue: "SOC2",
          signalType: "compliance_language",
          strength: "high",
          sourceUrl: page.url,
          pageType: page.pageType,
          snippet: snippet.content,
          reason: "SOC 2 compliance language",
          confidenceScore: calculateConfidence(content, "soc2"),
        });
      }
      
      // ISO 27001 signals
      if (isISO27001Signal(content)) {
        signals.push({
          fieldKey: "complianceFocus",
          candidateValue: "ISO27001",
          signalType: "compliance_language",
          strength: "high",
          sourceUrl: page.url,
          pageType: page.pageType,
          snippet: snippet.content,
          reason: "ISO 27001 compliance language",
          confidenceScore: calculateConfidence(content, "iso27001"),
        });
      }
      
      // HIPAA signals
      if (isHIPAASignal(content)) {
        signals.push({
          fieldKey: "complianceFocus",
          candidateValue: "HIPAA",
          signalType: "compliance_language",
          strength: "high",
          sourceUrl: page.url,
          pageType: page.pageType,
          snippet: snippet.content,
          reason: "HIPAA healthcare compliance language",
          confidenceScore: calculateConfidence(content, "hipaa"),
        });
      }
      
      // PCI DSS signals
      if (isPCIDSSSignal(content)) {
        signals.push({
          fieldKey: "complianceFocus",
          candidateValue: "PCI-DSS",
          signalType: "compliance_language",
          strength: "high",
          sourceUrl: page.url,
          pageType: page.pageType,
          snippet: snippet.content,
          reason: "PCI DSS payment compliance language",
          confidenceScore: calculateConfidence(content, "pci_dss"),
        });
      }
    }
  }

  return deduplicateSignals(signals);
}

/**
 * Extract security posture signals
 */
function extractSecurityPostureSignals(pagesByType: Record<PageType, EvidencePage[]>): EvidenceSignal[] {
  const signals: EvidenceSignal[] = [];
  const relevantPages = [
    ...(pagesByType.security || []),
    ...(pagesByType.trust || []),
    ...(pagesByType.compliance || []),
  ];

  for (const page of relevantPages) {
    for (const snippet of page.evidenceSnippets) {
      const content = snippet.content.toLowerCase();
      
      if (isEnterpriseGradeSecuritySignal(content)) {
        signals.push({
          fieldKey: "securityPosture",
          candidateValue: "enterprise_grade",
          signalType: "security_language",
          strength: "high",
          sourceUrl: page.url,
          pageType: page.pageType,
          snippet: snippet.content,
          reason: "enterprise-grade security language",
          confidenceScore: calculateConfidence(content, "enterprise_security"),
        });
      }
      
      if (isCertifiedSecuritySignal(content)) {
        signals.push({
          fieldKey: "securityPosture",
          candidateValue: "certified",
          signalType: "security_language",
          strength: "high",
          sourceUrl: page.url,
          pageType: page.pageType,
          snippet: snippet.content,
          reason: "security certification language",
          confidenceScore: calculateConfidence(content, "certified_security"),
        });
      }
    }
  }

  return deduplicateSignals(signals);
}

/**
 * Extract data handling signals
 */
function extractDataHandlingSignals(pagesByType: Record<PageType, EvidencePage[]>): EvidenceSignal[] {
  const signals: EvidenceSignal[] = [];
  const relevantPages = [
    ...(pagesByType.privacy || []),
    ...(pagesByType.security || []),
    ...(pagesByType.dpa || []),
  ];

  for (const page of relevantPages) {
    for (const snippet of page.evidenceSnippets) {
      const content = snippet.content.toLowerCase();
      
      if (isEncryptedDataSignal(content)) {
        signals.push({
          fieldKey: "dataHandling",
          candidateValue: "encrypted",
          signalType: "security_language",
          strength: "high",
          sourceUrl: page.url,
          pageType: page.pageType,
          snippet: snippet.content,
          reason: "data encryption language",
          confidenceScore: calculateConfidence(content, "encrypted_data"),
        });
      }
      
      if (isSecureDataSignal(content)) {
        signals.push({
          fieldKey: "dataHandling",
          candidateValue: "secure",
          signalType: "security_language",
          strength: "medium",
          sourceUrl: page.url,
          pageType: page.pageType,
          snippet: snippet.content,
          reason: "secure data handling language",
          confidenceScore: calculateConfidence(content, "secure_data"),
        });
      }
    }
  }

  return deduplicateSignals(signals);
}

/**
 * Extract integration signals
 */
function extractIntegrationSignals(pagesByType: Record<PageType, EvidencePage[]>): EvidenceSignal[] {
  const signals: EvidenceSignal[] = [];
  const relevantPages = [
    ...(pagesByType.integrations || []),
    ...(pagesByType.docs || []),
    ...(pagesByType.product || []),
    ...(pagesByType.platform || []),
  ];

  for (const page of relevantPages) {
    for (const snippet of page.evidenceSnippets) {
      const content = snippet.content.toLowerCase();
      
      if (isAPISignal(content)) {
        signals.push({
          fieldKey: "integrations",
          candidateValue: "api",
          signalType: "integration_language",
          strength: "high",
          sourceUrl: page.url,
          pageType: page.pageType,
          snippet: snippet.content,
          reason: "API integration language",
          confidenceScore: calculateConfidence(content, "api_integration"),
        });
      }
      
      if (isSSOSignal(content)) {
        signals.push({
          fieldKey: "integrations",
          candidateValue: "sso",
          signalType: "integration_language",
          strength: "medium",
          sourceUrl: page.url,
          pageType: page.pageType,
          snippet: snippet.content,
          reason: "SSO integration language",
          confidenceScore: calculateConfidence(content, "sso_integration"),
        });
      }
    }
  }

  return deduplicateSignals(signals);
}

// Signal detection functions

function isSoftwareSignal(content: string): boolean {
  const softwarePatterns = [
    /\bsoftware\b/,
    /\bplatform\b/,
    /\bsaas\b/,
    /\bvendor\b/,
    /\bapplication\b/,
    /\bservice\b/,
    /\btechnology\b/,
    /\bsolution\b/,
    /\btool\b/,
    /\bsystem\b/,
  ];
  return softwarePatterns.some(pattern => pattern.test(content));
}

function isHealthtechSignal(content: string): boolean {
  const healthtechPatterns = [
    /\bhealthtech\b/,
    /\bhealth tech\b/,
    /\bmedical software\b/,
    /\bhealthcare it\b/,
    /\bdigital health\b/,
    /\bclinical software\b/,
    /\behr\b/,
    /\bemr\b/,
  ];
  return healthtechPatterns.some(pattern => pattern.test(content));
}

function isHealthcareSignal(content: string): boolean {
  const healthcarePatterns = [
    /\bhealthcare\b/,
    /\bmedical\b/,
    /\bclinical\b/,
    /\bpatient\b/,
    /\bhospital\b/,
    /\bhealth\s+care\b/,
    /\bphysician\b/,
    /\bdoctor\b/,
  ];
  return healthcarePatterns.some(pattern => pattern.test(content));
}

function isHealthcareCustomerSignal(content: string): boolean {
  const customerPatterns = [
    /\bhealthcare\s+(providers|organizations|customers|clients)\b/,
    /\bhospitals\b/,
    /\bclinics\b/,
    /\bmedical\s+(centers|facilities)\b/,
    /\bhealthcare\s+(industry|sector)\b/,
  ];
  return customerPatterns.some(pattern => pattern.test(content));
}

function isFintechCustomerSignal(content: string): boolean {
  const customerPatterns = [
    /\bfintech\b/,
    /\bbanking\b/,
    /\bfinancial\s+(services|institutions)\b/,
    /\bcredit\s+unions?\b/,
    /\binsurance\b/,
  ];
  return customerPatterns.some(pattern => pattern.test(content));
}

function isEcommerceCustomerSignal(content: string): boolean {
  const customerPatterns = [
    /\becommerce\b/,
    /\be-commerce\b/,
    /\bonline\s+retail\b/,
    /\bshopping\s+(cart|platform)\b/,
    /\bmerchants?\b/,
  ];
  return customerPatterns.some(pattern => pattern.test(content));
}

function isSaaSSignal(content: string): boolean {
  const saasPatterns = [
    /\bsaas\b/,
    /\bsubscription\b/,
    /\bcloud-based\b/,
    /\bmonthly\s+(pricing|fee)\b/,
    /\bannual\s+(pricing|fee)\b/,
    /\bper\s+user\b/,
    /\brecurring\s+(revenue|billing)\b/,
  ];
  return saasPatterns.some(pattern => pattern.test(content));
}

function isB2BSignal(content: string): boolean {
  const b2bPatterns = [
    /\bb2b\b/,
    /\bbusiness-to-business\b/,
    /\benterprise\b/,
    /\bcorporate\b/,
    /\bcommercial\b/,
  ];
  return b2bPatterns.some(pattern => pattern.test(content));
}

function isGDPRSignal(content: string): boolean {
  const gdprPatterns = [
    /\bgdpr\b/,
    /\bgeneral data protection regulation\b/,
    /\bdata protection officer\b/,
    /\bdpo\b/,
    /\beu data protection\b/,
    /\barticle\s+\d+.*gdpr\b/,
  ];
  return gdprPatterns.some(pattern => pattern.test(content));
}

function isSOC2Signal(content: string): boolean {
  const soc2Patterns = [
    /\bsoc 2\b/,
    /\bsoc2\b/,
    /\bservice organization control\b/,
    /\bsoc\s+type\s+(i|ii)\b/,
    /\bsoc\s+report\b/,
  ];
  return soc2Patterns.some(pattern => pattern.test(content));
}

function isISO27001Signal(content: string): boolean {
  const isoPatterns = [
    /\biso\s+27001\b/,
    /\biso27001\b/,
    /\biso\s+27001:2013\b/,
    /\biso\/iec\s+27001\b/,
    /\bisms\b/,
  ];
  return isoPatterns.some(pattern => pattern.test(content));
}

function isHIPAASignal(content: string): boolean {
  const hipaaPatterns = [
    /\bhipaa\b/,
    /\bhealth insurance portability\b/,
    /\bphi\b/,
    /\bprotected health information\b/,
    /\bhipaa\s+compliance\b/,
  ];
  return hipaaPatterns.some(pattern => pattern.test(content));
}

function isPCIDSSSignal(content: string): boolean {
  const pciPatterns = [
    /\bpci\s+dss\b/,
    /\bpci dss\b/,
    /\bpayment card industry\b/,
    /\bpci\s+compliance\b/,
    /\bcardholder data\b/,
  ];
  return pciPatterns.some(pattern => pattern.test(content));
}

function isEnterpriseGradeSecuritySignal(content: string): boolean {
  const enterprisePatterns = [
    /\benterprise-grade\b/,
    /\bmilitary-grade\b/,
    /\bbank-grade\b/,
    /\benterprise\s+security\b/,
    /\badvanced\s+security\b/,
  ];
  return enterprisePatterns.some(pattern => pattern.test(content));
}

function isCertifiedSecuritySignal(content: string): boolean {
  const certifiedPatterns = [
    /\bcertified\b/,
    /\bcompliance\s+certified\b/,
    /\bsecurity\s+certified\b/,
    /\bthird-party\s+audit\b/,
    /\bindependent\s+validation\b/,
  ];
  return certifiedPatterns.some(pattern => pattern.test(content));
}

function isEncryptedDataSignal(content: string): boolean {
  const encryptedPatterns = [
    /\bencryption\b/,
    /\bencrypted\b/,
    /\baes-256\b/,
    /\btls\s+1\.[23]\b/,
    /\bend-to-end\s+encryption\b/,
    /\bat-rest\s+encryption\b/,
    /\bin-transit\s+encryption\b/,
  ];
  return encryptedPatterns.some(pattern => pattern.test(content));
}

function isSecureDataSignal(content: string): boolean {
  const securePatterns = [
    /\bsecure\b/,
    /\bsecurity\b/,
    /\bprotection\b/,
    /\bsafeguard\b/,
    /\bdata\s+security\b/,
  ];
  return securePatterns.some(pattern => pattern.test(content));
}

function isAPISignal(content: string): boolean {
  const apiPatterns = [
    /\bapi\b/,
    /\brest\s+api\b/,
    /\bwebhook\b/,
    /\bintegration\b/,
    /\bconnectors?\b/,
  ];
  return apiPatterns.some(pattern => pattern.test(content));
}

function isSSOSignal(content: string): boolean {
  const ssoPatterns = [
    /\bsso\b/,
    /\bsingle sign-on\b/,
    /\bsaml\b/,
    /\boauth\b/,
    /\bidentity\s+provider\b/,
  ];
  return ssoPatterns.some(pattern => pattern.test(content));
}

/**
 * Calculate confidence score for a signal based on content and signal type
 */
function calculateConfidence(content: string, signalType: string): number {
  let score = 50; // Base score
  
  // Boost for specific, explicit language
  if (content.includes("explicit") || content.includes("specifically")) {
    score += 10;
  }
  
  // Boost for longer content (more context)
  if (content.length > 100) {
    score += 10;
  }
  
  // Boost for multiple matching patterns
  const patternCounts: Record<string, number> = {
    software: 3,
    healthcare: 2,
    gdpr: 3,
    saas: 2,
    api: 2,
  };
  
  const expectedCount = patternCounts[signalType] || 1;
  score += Math.min(20, expectedCount * 5);
  
  return Math.min(100, score);
}

/**
 * Remove duplicate signals by field and candidate value
 */
function deduplicateSignals(signals: EvidenceSignal[]): EvidenceSignal[] {
  const seen = new Set<string>();
  const deduplicated: EvidenceSignal[] = [];
  
  for (const signal of signals) {
    const key = `${signal.fieldKey}:${signal.candidateValue}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduplicated.push(signal);
    }
  }
  
  return deduplicated.sort((a, b) => b.confidenceScore - a.confidenceScore);
}
