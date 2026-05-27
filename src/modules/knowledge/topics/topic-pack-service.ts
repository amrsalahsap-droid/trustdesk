import { prisma } from "@/lib/db/prisma";
import { TopicsService } from "./topics-service";
import { type KnowledgeTopic } from "@prisma/client";
import {
  CompanyProfileService,
  effectiveArrayForRules,
  effectiveScalarForRules,
  type CompanyProfile,
} from "@/modules/workspaces/company-profile-service";

export type TopicTemplate = {
  key: string;
  name: string;
  description: string;
};

export type TopicPackRule = {
  industries?: string[];
  productTypes?: string[];
  customerSegments?: string[];
  dataTypes?: string[];
  complianceTargets?: string[];
};

export type TopicPack = {
  id: string;
  name: string;
  description: string;
  topics: TopicTemplate[];
  rules: TopicPackRule;
};

export type TopicPackWithRationale = TopicPack & {
  recommendationRationale: string;
};

/**
 * Normalize topic key variations to standard taxonomy keys
 */
export function normalizeTopicKey(key: string): string | null {
  if (!key) return null;
  
  const normalizedKey = key.toLowerCase().trim();
  
  // Map common variations to standard keys
  const keyMappings: Record<string, string> = {
    // Security topics
    'access_management': 'access_management',
    'access control': 'access_management',
    'authentication': 'access_management',
    'authorization': 'access_management',
    
    // Encryption topics
    'encryption': 'encryption',
    'data encryption': 'encryption',
    'encryption at rest': 'encryption',
    'encryption in transit': 'encryption',
    
    // Network security
    'network_security': 'network_security',
    'network security': 'network_security',
    'firewall': 'network_security',
    'network protection': 'network_security',
    
    // API security
    'api_security': 'api_security',
    'api security': 'api_security',
    'api authentication': 'api_security',
    'api authorization': 'api_security',
    'rate limiting': 'api_security',
    
    // Subprocessor security
    'subprocessor_security': 'subprocessor_security',
    'subprocessor management': 'subprocessor_security',
    'third party risk': 'subprocessor_security',
    'vendor management': 'subprocessor_security',
    
    // Privacy topics
    'privacy_policy': 'privacy_policy',
    'privacy by design': 'privacy_by_design',
    'data protection': 'privacy_policy',
    'data privacy': 'privacy_policy',
    
    // HIPAA specific
    'hipaa_security': 'hipaa_security',
    'phi_handling': 'phi_handling',
    'phi security': 'phi_handling',
    'patient data': 'phi_handling',
    
    // AML/KYC topics
    'aml_kyc': 'aml_kyc',
    'anti money laundering': 'aml_kyc',
    'kyc procedures': 'aml_kyc',
    'transaction monitoring': 'transaction_monitoring',
    'sanctions screening': 'sanctions_screening',
    
    // Business continuity
    'bc_dr_plan': 'bc_dr_plan',
    'business continuity': 'bc_dr_plan',
    'disaster recovery': 'bc_dr_plan',
    'incident response': 'bc_dr_plan',
    
    // Compliance topics
    'compliance_management': 'compliance_management',
    'policy management': 'compliance_management',
    'audit readiness': 'compliance_management',
    'regulatory compliance': 'compliance_management',
    
    // Governance topics
    'governance': 'governance',
    'risk management': 'governance',
    'policy enforcement': 'governance',
    'compliance monitoring': 'governance',
  };
  
  // Return mapped key or original if no mapping exists
  return keyMappings[normalizedKey] || normalizedKey;
}

function topicPackRationale(pack: TopicPack, cp: CompanyProfile): string {
  const r = pack.rules;
  const industries = effectiveArrayForRules(cp.industry);
  const productTypes = effectiveArrayForRules(cp.productType);
  const customerSegments = effectiveArrayForRules(cp.customerSegment);
  const dataTypes = effectiveArrayForRules(cp.dataTypes);
  const complianceTargets = effectiveArrayForRules(cp.complianceSignals);
  const reasons: string[] = [];
  const matchingIndustries = industries.filter(i => r.industries?.includes(i));
  if (matchingIndustries.length > 0) {
    reasons.push(`Industry "${matchingIndustries.join(", ")}" matches this pack.`);
  }
  const matchingProducts = productTypes.filter(p => r.productTypes?.includes(p));
  if (matchingProducts.length > 0) {
    reasons.push(`Product model "${matchingProducts.join(", ")}" matches infrastructure-oriented controls in this pack.`);
  }
  const matchingSegments = customerSegments.filter(s => r.customerSegments?.includes(s));
  if (matchingSegments.length > 0) {
    reasons.push(`Customer segment "${matchingSegments.join(", ")}" often triggers enterprise procurement topics in this pack.`);
  }
  if (dataTypes.some(dt => r.dataTypes?.includes(dt))) {
    reasons.push(`Data types ${dataTypes.filter(dt => r.dataTypes?.includes(dt)).join(", ")} align with privacy-focused topics here.`);
  }
  if (complianceTargets.some(ct => r.complianceTargets?.includes(ct))) {
    reasons.push(
      `Compliance targets ${complianceTargets.filter(ct => r.complianceTargets?.includes(ct)).join(", ")} map to this pack.`,
    );
  }
  return reasons.join(" ") || "Matched from your TrustDesk business profile rules.";
}

export const TOPIC_PACKS: TopicPack[] = [
  {
    id: "fintech_core",
    name: "FinTech Compliance & Fraud",
    description: "Core topics for payment processing, banking, and financial services.",
    rules: { industries: ["fintech"] },
    topics: [
      { key: "aml_kyc", name: "AML & KYC", description: "Anti-Money Laundering and Know Your Customer procedures." },
      { key: "pci_dss", name: "PCI-DSS Compliance", description: "Payment Card Industry Data Security Standard requirements." },
      { key: "fraud_prevention", name: "Transaction Fraud", description: "Monitoring and prevention of unauthorized or fraudulent transactions." },
      { key: "ledger_integrity", name: "Financial Ledger Security", description: "Ensuring the immutability and accuracy of financial transaction records." },
    ]
  },
  {
    id: "healthtech_core",
    name: "HealthTech & Clinical Privacy",
    description: "Patient data protection and clinical compliance standards.",
    rules: { industries: ["healthtech"] },
    topics: [
      { key: "hipaa_compliance", name: "HIPAA Security Rule", description: "Administrative, physical, and technical safeguards for PHI." },
      { key: "patient_consent", name: "Patient Consent Management", description: "Procedures for obtaining and tracking patient data usage authorizations." },
      { key: "ehr_security", name: "EHR Integrity", description: "Security controls specifically for Electronic Health Record systems." },
      { key: "clinical_audit", name: "Clinical Audit Trails", description: "Logging and review of access to sensitive medical information." },
    ]
  },
  {
    id: "privacy_deep_dive",
    name: "Advanced Privacy (GDPR/CCPA)",
    description: "In-depth topics for companies handling high volumes of consumer PII.",
    rules: { dataTypes: ["PII", "PHI"] },
    topics: [
      { key: "right_to_forget", name: "Right to be Forgotten", description: "Procedures for full data erasure requests from data subjects." },
      { key: "data_portability", name: "Data Portability", description: "Formats and procedures for providing users with their data exports." },
      { key: "pia_process", name: "Privacy Impact Assessments", description: "Standard process for evaluating privacy risks in new products." },
      { key: "cross_border_data", name: "Cross-Border Transfers", description: "Legal basis and safeguards for moving data between jurisdictions." },
    ]
  },
  {
    id: "saas_enterprise",
    name: "Enterprise SaaS Readiness",
    description: "Topics commonly required by enterprise procurement teams.",
    rules: { customerSegments: ["b2b"] },
    topics: [
      { key: "scim_provisioning", name: "SCIM Provisioning", description: "Automated user lifecycle management via SCIM protocol." },
      { key: "data_residency_europe", name: "European Data Residency", description: "Specific controls and legal entities for data storage in the EU." },
      { key: "sla_availability", name: "SLA & Uptime Commitments", description: "Service level agreements and public uptime tracking." },
      { key: "subprocessor_review", name: "Subprocessor Audits", description: "Annual security reviews of downstream data processors." },
    ]
  },
  {
    id: "cloud_infra",
    name: "Cloud & DevSecOps",
    description: "Security of high-velocity deployment pipelines and infrastructure.",
    rules: { productTypes: ["cloud", "hybrid"] },
    topics: [
      { key: "k8s_security", name: "Container Orchestration", description: "Hardening and isolation of Kubernetes or similar clusters." },
      { key: "iam_least_privilege", name: "IAM & Least Privilege", description: "Granular access policies for cloud infrastructure services." },
      { key: "iac_scanning", name: "Infrastructure as Code Security", description: "Automated scanning of Terraform/CloudFormation for misconfigurations." },
      { key: "secrets_mgmt", name: "Secrets & Key Management", description: "Vaulting, rotation, and lifecycle of application secrets." },
    ]
  }
];

export class TopicPackService {
  /**
   * Recommends topic packs from a merged {@link CompanyProfile}.
   */
  static getRecommendationsForProfile(cp: CompanyProfile): TopicPackWithRationale[] {
    const industries = effectiveArrayForRules(cp.industry);
    const productTypes = effectiveArrayForRules(cp.productType);
    const customerSegments = effectiveArrayForRules(cp.customerSegment);
    const dataTypes = effectiveArrayForRules(cp.dataTypes);
    const complianceTargets = effectiveArrayForRules(cp.complianceSignals);

    return TOPIC_PACKS.filter(pack => {
      const r = pack.rules;

      const industryMatch = industries.some(i => r.industries?.includes(i));
      const productTypeMatch = productTypes.some(p => r.productTypes?.includes(p));
      const segmentMatch = customerSegments.some(s => r.customerSegments?.includes(s));
      const dataTypeMatch = dataTypes.some(dt => r.dataTypes?.includes(dt));
      const complianceMatch = complianceTargets.some(ct =>
        r.complianceTargets?.includes(ct),
      );

      return !!(industryMatch || productTypeMatch || segmentMatch || dataTypeMatch || complianceMatch);
    }).map(pack => ({
      ...pack,
      recommendationRationale: topicPackRationale(pack, cp),
    }));
  }

  /**
   * Recommends topic packs based on a workspace's business profile.
   * Matches declarative rules against profile values.
   * @deprecated Prefer {@link TopicPackService.getRecommendationsForProfile} with {@link CompanyProfileService.build}.
   */
  static getRecommendations(profile: {
    industry?: string;
    productType?: string;
    customerSegment?: string;
    dataTypes?: string[];
    complianceTargets?: string[];
  }): TopicPack[] {
    return TopicPackService.getRecommendationsForProfile(
      CompanyProfileService.build({
        id: "",
        name: "",
        industry: profile.industry ?? null,
        productType: profile.productType ?? null,
        customerSegment: profile.customerSegment ?? null,
        dataTypes: profile.dataTypes ?? [],
        complianceTargets: profile.complianceTargets ?? [],
        deepProfileJson: null,
      }),
    ) as TopicPack[];
  }

  /**
   * Seeds approved topics from packs into a workspace as SUGGESTED for review.
   */
  static async seedApprovedTopics(workspaceId: string, topicKeys: string[], reason: string = "Recommended based on your business profile") {
    // Collect all topics from all packs that match the keys
    const allTemplates = TOPIC_PACKS.flatMap(p => p.topics);
    const selected = allTemplates.filter(t => topicKeys.includes(t.key));

    return Promise.all(
      selected.map(t => 
        TopicsService.upsertWorkspaceTopic(workspaceId, {
          key: t.key,
          name: t.name,
          description: t.description
        }).then(topic => 
          prisma.knowledgeTopic.update({
            where: { id: topic.id, workspaceId },
            data: { 
              status: "SUGGESTED",
              isRecommended: true,
              suggestionReason: reason
            }
          })
        )
      )
    );
  }
}
