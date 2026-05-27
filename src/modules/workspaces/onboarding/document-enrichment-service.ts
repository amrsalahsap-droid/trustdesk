import { AiFactory } from "@/lib/ai/ai-factory";
import type { IAiProvider } from "@/lib/ai/provider-interface";
import { logger } from "@/lib/logging/logger";
import { prisma } from "@/lib/db/prisma";
import { type RecommendedDocument } from "./document-recommendation-service";
import {
  CompanyProfileService,
  formatDeepIntelPromptBlock,
  type CompanyProfile,
} from "../company-profile-service";
import { wrapBriefsForPersist } from "./document-briefs-persist";
import { type DocumentBrief, type TailoredDocumentGuidance } from "./document-brief-types";
import { onboardingFlags } from "@/lib/feature-flags/onboarding-flags";
import { getDocumentTypeRule } from "./document-type-rules";
import { type TailoredProfile } from "./tailoring-engine";

export type { DocumentBrief, DocumentBriefStatus, TailoredDocumentGuidance } from "./document-brief-types";

function coerceStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(x => String(x)).filter(Boolean);
  if (typeof v === "string" && v.trim()) return [v.trim()];
  return [];
}

/** Normalize model output so optional array fields are always arrays. */
export function normalizeDocumentBrief(raw: DocumentBrief): DocumentBrief {
  return {
    ...raw,
    seededTopics: coerceStringArray(raw.seededTopics),
    sectionRationales: raw.sectionRationales ? coerceStringArray(raw.sectionRationales) : undefined,
    workflowsToCover: raw.workflowsToCover ? coerceStringArray(raw.workflowsToCover) : undefined,
    rolesPersonas: raw.rolesPersonas ? coerceStringArray(raw.rolesPersonas) : undefined,
    sensitiveDataTypes: raw.sensitiveDataTypes ? coerceStringArray(raw.sensitiveDataTypes) : undefined,
    trustComplianceClaims: raw.trustComplianceClaims ? coerceStringArray(raw.trustComplianceClaims) : undefined,
    helpsSeedTrustDeskTopics: raw.helpsSeedTrustDeskTopics
      ? coerceStringArray(raw.helpsSeedTrustDeskTopics)
      : undefined,
    evidenceUsed: coerceStringArray(raw.evidenceUsed),
    specificSectionsNeeded: coerceStringArray(raw.specificSectionsNeeded),
    suggestedControls: coerceStringArray(raw.suggestedControls),
  };
}

function postValidateBrief(brief: DocumentBrief, profile: TailoredProfile): DocumentBrief {
  let b = { ...brief };
  const contentUnion =
    (b.workflowsToCover?.length ?? 0) +
    (b.rolesPersonas?.length ?? 0) +
    (b.sensitiveDataTypes?.length ?? 0);
  if (onboardingFlags.docTypeTailoring && contentUnion === 0) {
    b = { ...b, status: "MANUAL_REVIEW_REQUIRED" };
  }
  if (profile.mode === "HIGH_PRECISION" && (b.evidenceUsed?.length ?? 0) === 0) {
    b = { ...b, status: "MANUAL_REVIEW_REQUIRED" };
  }
  return b;
}

function buildPerDocumentBriefPrompt(
  doc: RecommendedDocument,
  profile: TailoredProfile,
  deepIntel: string,
  seededTopicKeysHint: string,
): string {
  const rule = getDocumentTypeRule(doc.id);
  const ruleBlock = rule
    ? `
DOCUMENT TYPE: ${rule.name}
You MUST make this brief materially different from other policy types (e.g. privacy vs infosec vs access control).
Required section themes for this document type: ${rule.requiredSections.join("; ")}
Emphasis: ${rule.emphasis}
`
    : "";

  return `
Generate ONE structured "DocumentBrief" JSON object for the SINGLE document below.

COMPANY INTELLIGENCE (flat):
- Company: ${profile.companyName}
- Domain/Model: ${profile.industry} (${profile.productType})
- Customers: ${profile.customerSegment}
- Data types in scope: ${JSON.stringify(profile.dataTypes)}
- Compliance targets: ${JSON.stringify(profile.complianceSignals)}
- Graded signals (field/category): ${JSON.stringify(profile.signalsUsed.slice(0, 24))}
${deepIntel ? `\n${deepIntel}\n` : ""}
${ruleBlock}
TARGET DOCUMENT (only this one):
- ID: ${doc.id}
- Name: ${doc.name}
- Description: ${doc.description}
${doc.recommendationReason ? `- Recommendation context: ${doc.recommendationReason}` : ""}

OUTPUT: Return a single JSON object matching DocumentBrief with "id": "${doc.id}".

Each DocumentBrief MUST include:
- id: "${doc.id}"
- tailoringStrategy: how OBSERVED/DERIVED signals shape **this** document type specifically
- criticalWorkflowLink: tie a concrete on-site workflow to a section of this document (empty string only if none)
- specificSectionsNeeded: include the document-type themes above PLUS any extra company-specific sections
- sectionRationales: optional; aligned to specificSectionsNeeded when present
- suggestedControls: concrete controls/clauses to emphasize for this document type
- seededTopics: strings — prefer TrustDesk topic keys (${seededTopicKeysHint || "e.g. aml_kyc, hipaa_compliance, right_to_forget"})
- businessReason: concise summary
- whyItMattersForBusiness: one paragraph, business-specific, no legal guarantees
- workflowsToCover: grounded in profile/deep intel
- rolesPersonas: inferred with evidence only
- sensitiveDataTypes: subset relevant to THIS document type
- trustComplianceClaims: themes relevant to THIS document type
- helpsSeedTrustDeskTopics: topic keys this document should help seed
- evidenceUsed: cite OBSERVED evidence as "excerpt — URL" where possible
- status:
  - READY only if primary content is driven by OBSERVED or strong DERIVED site signals
  - MANUAL_REVIEW_REQUIRED if mostly HYPOTHESIZED or evidence is thin
  - GENERIC_FALLBACK only if you cannot tie the document to any non-default profile field

RULES:
1. Do NOT invent workflows, roles, or data types not supported by the profile/deep intel.
2. Leave arrays empty rather than filler when unknown.
3. No wording that claims legal compliance or certification.
4. Privacy/infosec/access/BC-DR/SDLC briefs must NOT reuse the same section list — each document type needs distinct workflows and compliance hooks.
`;
}

function briefToGuidance(doc: RecommendedDocument, brief: DocumentBrief, profile: TailoredProfile): TailoredDocumentGuidance {
  const whyBiz =
    brief.whyItMattersForBusiness?.trim() || brief.businessReason || brief.tailoringStrategy;

  return {
    id: doc.id,
    tailoredDescription: brief.businessReason,
    whyItMatters: brief.criticalWorkflowLink?.trim() || whyBiz,
    recommendedSections: brief.specificSectionsNeeded,
    seededTopics: Array.isArray(brief.seededTopics) ? brief.seededTopics : [],
    importanceIndicator: doc.priority === "HIGH" ? "CRITICAL" : "RECOMMENDED",
    mode:
      profile.mode === "HIGH_PRECISION"
        ? "HIGH_PRECISION"
        : profile.mode === "LIMITED_FALLBACK"
          ? "LIMITED"
          : "STANDARD",
    brief,
    whyItMattersForBusiness: brief.whyItMattersForBusiness,
    workflowsToCover: brief.workflowsToCover,
    rolesPersonas: brief.rolesPersonas,
    sensitiveDataTypes: brief.sensitiveDataTypes,
    trustComplianceClaims: brief.trustComplianceClaims,
    helpsSeedTrustDeskTopics: brief.helpsSeedTrustDeskTopics,
  };
}

/**
 * D15-EN-04: Document Enrichment Service.
 * Implements a two-stage flow: Signal-to-Brief, then Brief-to-Guidance.
 */
export class DocumentEnrichmentService {
  /**
   * Generates tailored guidance for a set of documents based on a tailored business profile.
   */
  static async enrichDocuments(
    workspaceId: string,
    docs: RecommendedDocument[],
    companyProfile: CompanyProfile,
  ): Promise<Record<string, TailoredDocumentGuidance>> {
    if (docs.length === 0) return {};

    const profile = CompanyProfileService.toTailoredProfile(companyProfile);
    const deepIntel = formatDeepIntelPromptBlock(companyProfile);

    const factory = AiFactory.getInstance();
    const provider = factory.getProvider();

    const seededTopicKeysHint = docs
      .map(d => (Array.isArray(d.helpsSeedTopicKeys) ? d.helpsSeedTopicKeys.join(", ") : ""))
      .filter(Boolean)
      .join("; ");


    if (!onboardingFlags.docTypeTailoring) {
      return DocumentEnrichmentService.enrichDocumentsLegacyBatch({
        workspaceId,
        docs,
        profile,
        deepIntel,
        seededTopicKeysHint,
        provider,
      });
    }

    const briefs: Record<string, DocumentBrief> = {};
    const CONCURRENCY = 3;

    for (let i = 0; i < docs.length; i += CONCURRENCY) {
      const batch = docs.slice(i, i + CONCURRENCY);
      await Promise.all(
        batch.map(async doc => {
          try {
            const prompt = buildPerDocumentBriefPrompt(doc, profile, deepIntel, seededTopicKeysHint);
            const res = await provider.generateObject<DocumentBrief>(prompt, {
              id: "document_briefing",
              context: { workspaceId },
              options: { temperature: 0.1 },
            });
            const raw = res.data;
            if (!raw || typeof raw !== "object") return;
            const normalized = normalizeDocumentBrief({
              ...(raw as DocumentBrief),
              id: (raw as DocumentBrief).id || doc.id,
            });
            briefs[doc.id] = postValidateBrief(normalized, profile);
          } catch (err) {
            logger.error("onboarding:document-enrichment:per-doc-failed", {
              workspaceId,
              docId: doc.id,
              error: String(err),
            });
          }
        }),
      );
    }

    const guidance: Record<string, TailoredDocumentGuidance> = {};
    for (const doc of docs) {
      const brief = briefs[doc.id];
      if (!brief) continue;
      guidance[doc.id] = briefToGuidance(doc, brief, profile);
    }

    if (Object.keys(briefs).length > 0) {
      await prisma.workspace.update({
        where: { id: workspaceId },
        data: {
          documentBriefsJson: wrapBriefsForPersist(briefs) as object,
        },
      });
    } else {
      logger.warn("onboarding:document-enrichment:no-briefs-persisted", { workspaceId });
    }

    logger.info("onboarding:document-enrichment:deep-briefing-complete", {
      workspaceId,
      docCount: Object.keys(guidance).length,
      tailoringMode: profile.mode,
      perDoc: true,
      readyCount: Object.values(briefs).filter(b => b.status === "READY").length,
    });

    return guidance;
  }

  private static async enrichDocumentsLegacyBatch(params: {
    workspaceId: string;
    docs: RecommendedDocument[];
    profile: TailoredProfile;
    deepIntel: string;
    seededTopicKeysHint: string;
    provider: IAiProvider;
  }): Promise<Record<string, TailoredDocumentGuidance>> {
    const { workspaceId, docs, profile, deepIntel, seededTopicKeysHint, provider } = params;

    const briefPrompt = `
Generate a structured "Document Brief" for EACH requested document using company intelligence (user-confirmed where present, otherwise AI-inferred with confidence).

COMPANY INTELLIGENCE (flat):
- Company: ${profile.companyName}
- Domain/Model: ${profile.industry} (${profile.productType})
- Customers: ${profile.customerSegment}
- Data types in scope: ${JSON.stringify(profile.dataTypes)}
- Compliance targets: ${JSON.stringify(profile.complianceSignals)}
- Graded signals (field/category): ${JSON.stringify(profile.signalsUsed.slice(0, 24))}
${deepIntel ? `\n${deepIntel}\n` : ""}
DOCUMENTS TO BRIEF:
${docs.map(d => `- ${d.name} (ID: ${d.id}): ${d.description}${d.recommendationReason ? `\n  Recommendation context: ${d.recommendationReason}` : ""}`).join("\n")}

OUTPUT: For each document ID, one DocumentBrief object keyed exactly by document id in the returned map.

Each DocumentBrief MUST include:
- id: same as document id
- tailoringStrategy: how OBSERVED/DERIVED signals (not guesswork) shape this document
- criticalWorkflowLink: tie a concrete on-site workflow to a section of this document (empty string only if none)
- specificSectionsNeeded: section titles tailored to this company
- sectionRationales: optional; one short rationale per section when you have evidence (same length as sections or omit)
- suggestedControls: concrete controls/clauses to emphasize
- seededTopics: strings — prefer TrustDesk topic keys when they clearly apply (${seededTopicKeysHint ? `hints from recommendations: ${seededTopicKeysHint}` : "e.g. aml_kyc, hipaa_compliance, right_to_forget"})
- businessReason: concise summary
- whyItMattersForBusiness: one paragraph, business-specific, no legal guarantees
- workflowsToCover: bullet-style strings grounded in profile/deep intel
- rolesPersonas: roles inferred with evidence; do not invent job titles not supported by signals
- sensitiveDataTypes: subset relevant to THIS document (PII, PHI, payment data, etc.)
- trustComplianceClaims: trust/compliance themes from the site relevant to this document
- helpsSeedTrustDeskTopics: topic keys from the TrustDesk library this document should help seed
- evidenceUsed: cite OBSERVED evidence as "excerpt — URL" where possible; empty array if none
- status:
  - READY only if primary content is driven by OBSERVED or strong DERIVED site signals
  - MANUAL_REVIEW_REQUIRED if mostly HYPOTHESIZED or evidence is thin
  - GENERIC_FALLBACK only if you cannot tie the document to any non-default profile field

RULES:
1. Do NOT invent workflows, roles, or data types not supported by the profile/deep intel.
2. Leave arrays empty rather than filler when unknown.
3. No wording that claims legal compliance or certification.
`;

    try {
      const briefsResponse = await provider.generateObject<Record<string, DocumentBrief>>(briefPrompt, {
        id: "document_briefing",
        context: { workspaceId },
        options: { temperature: 0.1 },
      });

      const rawBriefs = briefsResponse.data;
      const briefs: Record<string, DocumentBrief> = {};
      for (const [k, v] of Object.entries(rawBriefs)) {
        if (v && typeof v === "object") briefs[k] = normalizeDocumentBrief({ ...v, id: v.id || k });
      }

      const guidance: Record<string, TailoredDocumentGuidance> = {};

      for (const doc of docs) {
        const brief = briefs[doc.id];
        if (!brief) continue;
        guidance[doc.id] = briefToGuidance(doc, postValidateBrief(brief, profile), profile);
      }

      await prisma.workspace.update({
        where: { id: workspaceId },
        data: {
          documentBriefsJson: wrapBriefsForPersist(briefs) as object,
        },
      });

      logger.info("onboarding:document-enrichment:deep-briefing-complete", {
        workspaceId,
        docCount: Object.keys(guidance).length,
        tailoringMode: profile.mode,
        highPrecisionCount: Object.values(briefs).filter(b => b.status === "READY").length,
      });

      return guidance;
    } catch (err) {
      logger.error("onboarding:document-enrichment:failed", { workspaceId, error: String(err) });
      return {};
    }
  }
}
