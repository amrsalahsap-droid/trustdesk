import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Header,
  Footer,
  PageNumber,
} from "docx";
import { AiFactory } from "@/lib/ai/ai-factory";
import { logger } from "@/lib/logging/logger";
import { onboardingFlags } from "@/lib/feature-flags/onboarding-flags";
import { type TailoredProfile } from "./tailoring-engine";
import { type DocumentBrief } from "./document-brief-types";
import { DOCUMENT_LIBRARY } from "./document-library-data";
import { getDocumentTypeRule, type DocumentTypeRule } from "./document-type-rules";

/** Honest labeling for generated starter text (never mislabel weak output as fully tailored). */
export type TemplateQuality = "tailored" | "limited" | "manual_required";

export type TemplateSignalUsed = {
  field: string;
  value: string;
  category: string;
  source?: string;
  citations: { pageUrl: string; pageType: string; evidenceKind: string; excerpt?: string }[];
};

export type TemplateGenerationResult = {
  template: string;
  templateQuality: TemplateQuality;
  signalsUsed?: TemplateSignalUsed[];
};

const peerTemplateCache = new Map<string, Record<string, string>>();

function rememberPeerTemplate(workspaceId: string | undefined, docId: string, text: string) {
  if (!workspaceId) return;
  let m = peerTemplateCache.get(workspaceId);
  if (!m) {
    m = {};
    peerTemplateCache.set(workspaceId, m);
  }
  m[docId] = text;
  if (peerTemplateCache.size > 80) {
    const first = peerTemplateCache.keys().next().value;
    if (first) peerTemplateCache.delete(first);
  }
}

function peerTemplatesFor(workspaceId: string | undefined, excludeDocId: string): Record<string, string> {
  if (!workspaceId) return {};
  const m = peerTemplateCache.get(workspaceId);
  if (!m) return {};
  const { [excludeDocId]: _, ...rest } = m;
  return rest;
}

function tokenizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 1);
}

/** 5-gram Jaccard similarity in [0,1] — used for quality gate + eval harness. */
export function computeTemplateShingleJaccard(a: string, b: string, n = 5): number {
  const wa = tokenizeWords(a);
  const wb = tokenizeWords(b);
  if (wa.length < n || wb.length < n) return 0;
  const sa = new Set<string>();
  const sb = new Set<string>();
  for (let i = 0; i <= wa.length - n; i++) sa.add(wa.slice(i, i + n).join(" "));
  for (let i = 0; i <= wb.length - n; i++) sb.add(wb.slice(i, i + n).join(" "));
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

function extractMarkdownHeadings(md: string): string[] {
  const out: string[] = [];
  for (const line of md.split("\n")) {
    const t = line.trim();
    if (t.startsWith("### ")) out.push(t.replace(/^#+\s*/, "").trim().toLowerCase());
    else if (t.startsWith("## ")) out.push(t.replace(/^#+\s*/, "").trim().toLowerCase());
    else if (t.startsWith("# ") && !t.startsWith("# -"))
      out.push(t.replace(/^#\s*/, "").trim().toLowerCase());
  }
  return out;
}

function sectionCoverageScore(headings: string[], required: string[]): number {
  if (required.length === 0) return 1;
  let hit = 0;
  for (const r of required) {
    const rl = r.toLowerCase();
    if (headings.some(h => h.includes(rl) || rl.includes(h))) hit++;
  }
  return hit / required.length;
}

function collectLibraryBoilerplateNeedles(): string[] {
  const needles: string[] = [];
  for (const e of Object.values(DOCUMENT_LIBRARY)) {
    const s = e.sampleText;
    if (!s) continue;
    for (const line of s.split("\n")) {
      const t = line.trim().toLowerCase();
      if (t.length >= 48) needles.push(t.slice(0, 120));
    }
  }
  return [...new Set(needles)];
}

const LIBRARY_NEEDLES = collectLibraryBoilerplateNeedles();

function fieldSnippet(profile: TailoredProfile, field: string): string {
  switch (field) {
    case "industry":
      return profile.industry || "";
    case "productType":
      return profile.productType || "";
    case "customerSegment":
      return profile.customerSegment || "";
    case "dataTypes":
      return profile.dataTypes.join(", ");
    case "complianceSignals":
      return profile.complianceSignals.join(", ");
    case "userTypes":
      return profile.userTypes.join(", ");
    case "internalRoles":
      return profile.internalRoles.join(", ");
    case "operationalWorkflows":
      return profile.operationalWorkflows.join(", ");
    case "trustClaims":
      return profile.trustClaims.join(", ");
    case "riskAreas":
      return profile.riskAreas.join(", ");
    default:
      return "";
  }
}

function buildSignalsUsed(profile: TailoredProfile, brief: DocumentBrief | undefined): TemplateSignalUsed[] {
  const base: TemplateSignalUsed[] = profile.signalsUsed.map(s => ({
    field: s.field,
    category: s.category,
    source: s.source,
    citations: (s.citations ?? []).map(c => ({
      pageUrl: c.pageUrl,
      pageType: c.pageType,
      evidenceKind: c.evidenceKind,
      excerpt: c.excerpt,
    })),
    value: fieldSnippet(profile, s.field).slice(0, 400),
  }));
  const seen = new Set(base.map(b => `${b.field}:${b.source}`));
  for (const line of brief?.evidenceUsed ?? []) {
    const key = `evidence:${line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    base.push({
      field: "evidenceUsed",
      category: "OBSERVED",
      source: line,
      citations: [],
      value: line.slice(0, 400),
    });
  }
  return base.slice(0, 32);
}

/**
 * D15-EN-05: Document Template Service.
 * Implements confidence-aware tailoring with a strict quality gate.
 */
export class DocumentTemplateService {
  static async generateTemplateWithQuality(
    profile: TailoredProfile,
    brief: DocumentBrief | undefined,
    docId: string,
    opts?: { workspaceId?: string },
  ): Promise<TemplateGenerationResult> {
    const baseEntry = DOCUMENT_LIBRARY[docId];
    if (!baseEntry) {
      throw new Error(`Document type ${docId} not found in library.`);
    }

    const signalsUsed = buildSignalsUsed(profile, brief);
    const rule = getDocumentTypeRule(docId);
    const useDocTailoring = onboardingFlags.docTypeTailoring;

    const briefTier = this.classifyBriefForPresentation(brief);
    if (briefTier === "manual_required") {
      return {
        template: this.generateLimitedTailoringMarkdown(profile, brief, baseEntry.name, docId),
        templateQuality: "manual_required",
        signalsUsed,
      };
    }

    const factory = AiFactory.getInstance();
    const provider = factory.getProvider();

    let prompt = useDocTailoring
      ? this.buildDocTailoredPrompt(profile, brief, baseEntry, rule)
      : this.buildLegacyPromptWithSample(profile, brief, baseEntry);

    let attempts = 0;
    const peers = peerTemplatesFor(opts?.workspaceId, docId);
    while (attempts < 3) {
      attempts++;
      try {
        const response = await provider.generateText(prompt, {
          id: "template_generation",
          correlationId: `template_gen_${docId}_v${attempts}`,
          context: { workspaceId: opts?.workspaceId ?? "temp" },
          options: { temperature: attempts === 1 ? 0.2 : 0.4 },
        });

        const quality = this.validateTemplateQuality(response.data, profile, brief, docId, {
          peers,
          rule,
          useDocTailoring,
        });

        if (quality.passed) {
          rememberPeerTemplate(opts?.workspaceId, docId, response.data);
          return { template: response.data, templateQuality: "tailored", signalsUsed };
        }

        logger.warn("onboarding:template-gen:quality-gate-failed", {
          docId,
          attempt: attempts,
          reason: quality.reason,
        });

        prompt = this.buildPrompt(profile, brief, baseEntry, quality.reason, rule, useDocTailoring);
      } catch (err) {
        logger.error("onboarding:template-gen:attempt-failed", {
          docId,
          attempt: attempts,
          error: String(err),
        });
      }
    }

    return {
      template: this.generateLimitedTailoringMarkdown(profile, brief, baseEntry.name, docId),
      templateQuality: profile.mode === "LIMITED_FALLBACK" ? "limited" : "manual_required",
      signalsUsed,
    };
  }

  /** @deprecated Prefer {@link DocumentTemplateService.generateTemplateWithQuality} for honest UI labels. */
  static async generateTemplate(
    profile: TailoredProfile,
    brief: DocumentBrief | undefined,
    docId: string,
  ): Promise<string> {
    const r = await this.generateTemplateWithQuality(profile, brief, docId);
    return r.template;
  }

  private static classifyBriefForPresentation(brief: DocumentBrief | undefined): TemplateQuality | "ok" {
    if (!brief) return "manual_required";
    if (brief.status === "GENERIC_FALLBACK" || brief.status === "MANUAL_REVIEW_REQUIRED") {
      return "manual_required";
    }
    const evidence = (brief.evidenceUsed || []).filter(Boolean);
    if (evidence.length === 0 && (brief.workflowsToCover?.length || brief.rolesPersonas?.length)) {
      return "ok";
    }
    if (evidence.length === 0) return "manual_required";
    return "ok";
  }

  private static buildLegacyPromptWithSample(
    profile: TailoredProfile,
    brief: DocumentBrief | undefined,
    baseEntry: (typeof DOCUMENT_LIBRARY)[string],
  ): string {
    return `
You are a high-fidelity document tailoring agent. You MUST generate a tailored ${baseEntry.name} based on the following evidence and strategy.

DOCUMENT BRIEF:
- Strategy: ${brief?.tailoringStrategy || "Standard policy alignment."}
- Critical Evidence: ${brief?.criticalWorkflowLink || "General operational security."}
- Why it matters: ${brief?.whyItMattersForBusiness || brief?.businessReason || "N/A"}
- Workflows: ${(brief?.workflowsToCover || []).join("; ") || "N/A"}
- Roles: ${(brief?.rolesPersonas || []).join("; ") || "N/A"}
- Observed Roles/Workflows (evidence lines): ${brief?.evidenceUsed?.join(", ") || "Industry standards."}

STRICT TAILORING RULES:
1. BAN generic phrases like "We protect our customers" or "annual assessments" unless followed by company-specific context.
2. Explicitly mention specific roles and workflows from the brief when provided.
3. QUALITY GATE: If you cannot ground clauses in the brief/profile, return a SHORT outline only (max 8 bullets) instead of fake policy prose.

TEMPLATE STARTER (editable baseline, not legal advice):
${baseEntry.sampleText || "No starter available."}
`.trim();
  }

  private static buildDocTailoredPrompt(
    profile: TailoredProfile,
    brief: DocumentBrief | undefined,
    baseEntry: (typeof DOCUMENT_LIBRARY)[string],
    rule: DocumentTypeRule | undefined,
  ): string {
    const sections = [
      ...(rule?.requiredSections ?? []),
      ...(brief?.specificSectionsNeeded ?? []),
    ];
    const uniqueSections = [...new Set(sections)];
    const evidenceBlock =
      brief?.evidenceUsed?.map(e => `- ${e}`).join("\n") || "- (No excerpt-level evidence lines; ground only in confirmed profile fields.)";

    const ruleBlock = rule
      ? `DOCUMENT-TYPE MANDATE (${rule.name}):\n${rule.emphasis}\n\nRequired section themes (use as ## headings; reorder if needed for clarity):\n${uniqueSections.map(s => `- ${s}`).join("\n")}\n`
      : "";

    return `
You are a TrustDesk policy drafting assistant. Produce a **${baseEntry.name}** starter in Markdown for **${profile.companyName}**.

${ruleBlock}
BUSINESS PROFILE (confirmed + inferred; do not invent beyond this):
- Industry / product model: ${profile.industry || "Unknown"} / ${profile.productType || "Unknown"}
- Customer segment: ${profile.customerSegment || "Unknown"}
- Data types in scope: ${profile.dataTypes.join(", ") || "TBD"}
- Compliance targets: ${profile.complianceSignals.join(", ") || "TBD"}
- User types: ${profile.userTypes.join(", ") || "—"}
- Operational workflows: ${profile.operationalWorkflows.join(", ") || "—"}
- Trust claims (from site): ${profile.trustClaims.join(", ") || "—"}
- Risk areas (from site): ${profile.riskAreas.join(", ") || "—"}
- Tailoring mode: ${profile.mode} (confidence ${profile.confidence.toFixed(2)})

DOCUMENT BRIEF (must materially shape content):
- Strategy: ${brief?.tailoringStrategy || "—"}
- Critical workflow link: ${brief?.criticalWorkflowLink || "—"}
- Why it matters: ${brief?.whyItMattersForBusiness || brief?.businessReason || "—"}
- Workflows to cover: ${(brief?.workflowsToCover || []).join("; ") || "—"}
- Roles / personas: ${(brief?.rolesPersonas || []).join("; ") || "—"}
- Sensitive data types: ${(brief?.sensitiveDataTypes || []).join("; ") || "—"}
- Trust/compliance themes: ${(brief?.trustComplianceClaims || []).join("; ") || "—"}
- Suggested controls: ${(brief?.suggestedControls || []).join("; ") || "—"}

EVIDENCE LINES (cite these explicitly where used):
${evidenceBlock}

RULES:
1. Do **not** paste generic security or privacy boilerplate. Every ## section must reference at least one concrete item from the brief or profile lists above.
2. If you lack evidence for a section, write: \`> Needs your input — no grounded signal for this section.\` and do not invent legal claims.
3. Do **not** reuse wording suitable for a different policy type (e.g. do not write a privacy lifecycle section inside an infosec-only doc unless the brief ties it to security processing).
4. This is not legal advice; do not claim certification.

FORMAT: Valid Markdown with ## and ### headings.
`.trim();
  }

  private static buildPrompt(
    profile: TailoredProfile,
    brief: DocumentBrief | undefined,
    baseEntry: (typeof DOCUMENT_LIBRARY)[string],
    correction: string | undefined,
    rule: DocumentTypeRule | undefined,
    useDocTailoring: boolean,
  ): string {
    const evidenceLines = brief?.evidenceUsed?.length
      ? brief.evidenceUsed.map(e => `- ${e}`).join("\n")
      : "Ground only in confirmed profile lists.";
    const sections = [
      ...(rule?.requiredSections ?? []),
      ...(brief?.specificSectionsNeeded ?? []),
    ];
    const sectionLine = [...new Set(sections)].join(", ") || "Purpose, Scope, Roles, Procedures";

    return `
Generate a professional STARTER TEMPLATE for: **${baseEntry.name}** (${baseEntry.id}).
${useDocTailoring && rule ? `Document-type emphasis: ${rule.emphasis}\n` : ""}
DO NOT use generic boilerplate. Use the provided business intelligence to make it specific.
This is not legal advice and must not claim certification or compliance guarantees.

EVIDENCE CITED:
${evidenceLines}

BUSINESS INTELLIGENCE (Strictness: ${profile.mode}):
- Industry/Model: ${profile.industry} (${profile.productType})
- Targeted Customers: ${profile.customerSegment}
- User Personas: ${profile.userTypes.join(", ")}
- Verified Workflows: ${profile.operationalWorkflows.join(", ")}
- Trust Signals: ${profile.trustClaims.join(", ")}

${correction ? `\nCRITICAL CORRECTION FROM PREVIOUS ATTEMPT: ${correction}. Stop using generic placeholders.\n` : ""}

TAILORING INSTRUCTIONS:
1. Mention specific roles and workflows from the brief when present.
2. BAN broad safe-harbor phrases like "We are committed to privacy" without company-specific context.
3. SECTIONS: ${sectionLine}

FORMAT: Return valid Markdown.
`.trim();
  }

  private static validateTemplateQuality(
    text: string,
    profile: TailoredProfile,
    brief: DocumentBrief | undefined,
    docId: string,
    ctx: {
      peers: Record<string, string>;
      rule?: DocumentTypeRule;
      useDocTailoring: boolean;
    },
  ): { passed: boolean; reason?: string } {
    const lower = text.toLowerCase();
    const words = tokenizeWords(text);
    const wordCount = Math.max(1, words.length);

    const genericPhrases = [
      "committed to protecting the privacy",
      "applies to employees, contractors, and third-party vendors",
      "employees, contractors, and vendors",
      "perform annual risk assessments",
      "annual risk assessment",
      "annual security training",
      "confidentiality, integrity, and availability",
      "cia triad",
      "maintain the confidentiality",
      "we are committed to security",
      "industry best practices",
      "reasonable measures to protect",
    ];

    const foundGeneric = genericPhrases.filter(p => lower.includes(p.toLowerCase()));
    const genericDensity = foundGeneric.length / wordCount;

    const briefKeywords = [
      ...(brief?.rolesPersonas || []),
      ...(brief?.workflowsToCover || []),
      ...(brief?.trustComplianceClaims || []),
      ...(brief?.sensitiveDataTypes || []),
      profile.companyName,
      profile.industry,
      profile.productType,
      profile.customerSegment,
    ];
    const profileKeywords = [
      ...profile.userTypes,
      ...profile.operationalWorkflows,
      ...profile.trustClaims,
      ...profile.riskAreas,
      ...profile.dataTypes,
      ...profile.complianceSignals,
    ];
    const specificKeywords = [...briefKeywords, ...profileKeywords].filter(
      k => typeof k === "string" && k.trim().length > 2,
    );

    const distinctMatches = new Set<string>();
    for (const k of specificKeywords) {
      const kw = k.toLowerCase();
      if (kw.length > 2 && lower.includes(kw)) distinctMatches.add(kw);
    }
    const matchCount = distinctMatches.size;

    if (brief && brief.status !== "READY") {
      return {
        passed: false,
        reason: "Document brief is not READY; refusing to pass boilerplate-heavy template as tailored.",
      };
    }

    for (const needle of LIBRARY_NEEDLES) {
      if (needle.length >= 48 && lower.includes(needle)) {
        return { passed: false, reason: "Output contains verbatim boilerplate from the document library sample." };
      }
    }

    if (ctx.useDocTailoring) {
      if (matchCount < 3) {
        return {
          passed: false,
          reason: `Need at least 3 distinct business-specific keyword hits from brief/profile; got ${matchCount}.`,
        };
      }
      if (genericDensity > 0.005) {
        return {
          passed: false,
          reason: `Generic phrase density too high (${(genericDensity * 1000).toFixed(3)}‰).`,
        };
      }
      const headings = extractMarkdownHeadings(text);
      const req = ctx.rule?.requiredSections ?? [];
      if (req.length > 0 && sectionCoverageScore(headings, req) < 0.7) {
        return {
          passed: false,
          reason: `Section coverage below 70% of required themes for ${docId}.`,
        };
      }
      for (const [, peerText] of Object.entries(ctx.peers)) {
        if (peerText && computeTemplateShingleJaccard(text, peerText) > 0.35) {
          return {
            passed: false,
            reason: "Template is too similar to another document type generated for this workspace.",
          };
        }
      }
    } else {
      if (foundGeneric.length >= 2 && matchCount === 0) {
        return {
          passed: false,
          reason: "Output contains generic boilerplate and lacks brief-grounded roles/workflows.",
        };
      }
      if (matchCount === 0 && profile.mode === "HIGH_PRECISION") {
        return {
          passed: false,
          reason: "High Precision mode requires verified business workflows/roles in generated text.",
        };
      }
      if (matchCount === 0 && profile.mode === "STANDARD_GUIDANCE" && foundGeneric.length >= 3) {
        return { passed: false, reason: "Too many generic safe-harbor phrases for standard mode." };
      }
      if (matchCount === 0 && profile.mode === "LIMITED_FALLBACK") {
        return {
          passed: false,
          reason: "Limited evidence profile: require structured limited output instead of pseudo-tailored prose.",
        };
      }
    }

    return { passed: true };
  }

  /** Structured, honest output when we should not ship generic "policy" prose. */
  static generateLimitedTailoringMarkdown(
    profile: TailoredProfile,
    brief: DocumentBrief | undefined,
    documentTitle: string,
    docId: string,
  ): string {
    const rule = getDocumentTypeRule(docId);
    const sections = brief?.specificSectionsNeeded?.length
      ? [...new Set([...(rule?.requiredSections ?? []), ...brief.specificSectionsNeeded])]
      : rule?.requiredSections?.length
        ? rule.requiredSections
        : ["Purpose & scope", "Roles & responsibilities", "Operational controls", "Review cycle"];

    const bullets = [
      ...(brief?.workflowsToCover || []).slice(0, 6),
      ...(brief?.rolesPersonas || []).slice(0, 6),
    ].filter(Boolean);

    const wf = bullets.length
      ? bullets.map(b => `- ${b}`).join("\n")
      : `- Ground clauses in workflows observed for ${profile.companyName} (see trust profile evidence).`;

    return `
# ${documentTitle} — guided starter (not tailored prose)

> **Important:** This is **not** legal or compliance advice and **not** a certification. TrustDesk generated **structured guidance** only because automated high-confidence tailoring was not available for \`${docId}\`.

## What to cover for ${profile.companyName}
${wf}

## Recommended sections to draft
${sections.map(s => `### ${s}\n- [ ] Company-specific procedures\n- [ ] Data types in scope: ${profile.dataTypes.join(", ") || "TBD"}\n`).join("\n")}

## Evidence / signals to reflect (if any)
${(brief?.evidenceUsed || []).slice(0, 8).map(e => `- ${e}`).join("\n") || "- Add citations from your trust center / security pages when publishing."}

## Trust / compliance themes to connect (non-exhaustive)
${(brief?.trustComplianceClaims || profile.trustClaims).slice(0, 6).map(t => `- ${t}`).join("\n") || "- Add themes supported by your public materials."}

---
*Optional: Start from your organization’s existing policy template if you have one; this outline is intentionally high-level.*
`.trim();
  }

  static async generateDocx(
    profile: TailoredProfile,
    brief: DocumentBrief | undefined,
    docId: string,
    opts?: { workspaceId?: string },
  ): Promise<Buffer> {
    const baseEntry = DOCUMENT_LIBRARY[docId];
    const { template: content, templateQuality } = await this.generateTemplateWithQuality(
      profile,
      brief,
      docId,
      opts,
    );

    const lines = content.split("\n");
    const sectionNodes: Paragraph[] = [];

    sectionNodes.push(
      new Paragraph({
        text: baseEntry.name,
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { before: 2000, after: 400 },
      }),
    );

    sectionNodes.push(
      new Paragraph({
        text: profile.companyName || "Your Company",
        heading: HeadingLevel.HEADING_2,
        alignment: AlignmentType.CENTER,
        spacing: { after: 1000 },
      }),
    );

    sectionNodes.push(
      new Paragraph({
        children: [
          new TextRun({ text: "STARTER TEMPLATE", bold: true, color: "0066CC" }),
          new TextRun({ text: "\nTrustDesk onboarding — not legal advice", italics: true }),
          new TextRun({
            text: `\nPresentation: ${templateQuality} | Profile mode: ${profile.mode}`,
            italics: true,
            size: 20,
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 4000 },
      }),
    );

    let currentParagraph: TextRun[] = [];

    lines.forEach(line => {
      const cleanLine = line.trim();
      if (!cleanLine) {
        if (currentParagraph.length > 0) {
          sectionNodes.push(new Paragraph({ children: currentParagraph, spacing: { after: 200 } }));
          currentParagraph = [];
        }
        return;
      }

      if (cleanLine.startsWith("### ")) {
        sectionNodes.push(
          new Paragraph({
            text: cleanLine.replace("### ", ""),
            heading: HeadingLevel.HEADING_3,
            spacing: { before: 400, after: 200 },
          }),
        );
      } else if (cleanLine.startsWith("## ")) {
        sectionNodes.push(
          new Paragraph({
            text: cleanLine.replace("## ", ""),
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 600, after: 300 },
          }),
        );
      } else if (cleanLine.startsWith("# ")) {
        sectionNodes.push(
          new Paragraph({
            text: cleanLine.replace("# ", ""),
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 800, after: 400 },
          }),
        );
      } else if (cleanLine.startsWith("- ") || cleanLine.startsWith("* ")) {
        sectionNodes.push(
          new Paragraph({
            text: cleanLine.substring(2),
            bullet: { level: 0 },
            spacing: { after: 120 },
          }),
        );
      } else {
        const parts = cleanLine.split(/(\*\*.*?\*\*)/g);
        parts.forEach(part => {
          if (part.startsWith("**") && part.endsWith("**")) {
            currentParagraph.push(new TextRun({ text: part.replace(/\*\*/g, ""), bold: true }));
          } else {
            currentParagraph.push(new TextRun({ text: part }));
          }
        });
        sectionNodes.push(new Paragraph({ children: currentParagraph, spacing: { after: 200 } }));
        currentParagraph = [];
      }
    });

    const doc = new Document({
      sections: [
        {
          headers: {
            default: new Header({
              children: [
                new Paragraph({
                  text: `${baseEntry.name} — starter (not legal advice)`,
                  alignment: AlignmentType.RIGHT,
                  style: "small",
                }),
              ],
            }),
          },
          footers: {
            default: new Footer({
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new TextRun("TrustDesk | Onboarding starter | Page "),
                    new TextRun({ children: [PageNumber.CURRENT] }),
                  ],
                }),
              ],
            }),
          },
          children: sectionNodes,
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);
    return buffer as Buffer;
  }
}
