import "dotenv/config";
import type { Prisma } from "@prisma/client";
import { CompanyProfileService } from "../src/modules/workspaces/company-profile-service";
import { WebsiteAnalysisService } from "../src/modules/workspaces/onboarding/website-analysis-service";
import {
  classifyPageType,
  HIGH_SIGNAL_TYPES,
} from "../src/modules/workspaces/onboarding/page-discovery";

async function run() {
  const target = "https://cybral.com";
  console.log("--- STARTING DEEP INSPECTION FOR:", target, "---");

  try {
    const result = await WebsiteAnalysisService.analyze(target);
    console.log("\nanalysisStatus:", result.analysisStatus);
    console.log("pagesScanned:", result.pagesScanned);

    if (result.pagesScanned?.length) {
      const rows = result.pagesScanned.map((url) => {
        const pageType = classifyPageType(url);
        return {
          url,
          pageType,
          highSignal: HIGH_SIGNAL_TYPES.has(pageType) ? "yes" : "no",
        };
      });
      console.log("\n--- PAGE CLASSIFICATION ---");
      console.table(rows);
      const highSignalCount = rows.filter((r) => r.highSignal === "yes").length;
      console.log(`highSignalCount=${highSignalCount}/${rows.length}`);
    }

    if (result.analysisStatus !== "success") {
      console.log("\nreason:", result.reason);
      console.log("\n[ASSERT] Expected success for cybral.com but got:", result.analysisStatus);
      process.exit(1);
    }

    const { profile, pageEvidenceSummary } = result;
    console.log("\n--- FINAL RENDERED PROFILE ---");
    console.log(JSON.stringify(profile, null, 2));

    console.log("\n--- PAGE EVIDENCE SUMMARY ---");
    console.table(
      pageEvidenceSummary.map((s) => ({
        url: s.url,
        pageType: s.pageType,
        score: s.score,
        sourceConfidence: s.sourceConfidence.toFixed(2),
        kinds: s.evidenceKinds.join(","),
        headings: s.headingsCount,
        jsonLdTypes: s.jsonLdTypes.join(",") || "-",
      })),
    );

    type CitationShape = { pageUrl: string; pageType: string; evidenceKind: string; excerpt?: string };
    type CandidateShape = {
      value: unknown;
      confidence: number;
      sources: CitationShape[];
      sourcePages?: string[];
    };
    type SignalShape = {
      value?: unknown;
      category: string;
      confidence: number;
      source?: string;
      citations?: CitationShape[];
      candidates?: CandidateShape[];
      conflict?: {
        hasConflict: boolean;
        rival?: { value: unknown; confidence: number; sources: CitationShape[] };
      };
    };

    const fieldsWithCategory: Array<{
      field: string;
      value?: string;
      category: string;
      confidence: string;
      source?: string;
      cited?: string;
      excerpt?: string;
      candidates?: string;
      conflict?: string;
    }> = [];
    const push = (field: string, sig: SignalShape | undefined) => {
      if (!sig) return;
      const c = sig.citations?.[0];
      fieldsWithCategory.push({
        field,
        value: Array.isArray(sig.value) ? sig.value.join(",") : String(sig.value ?? ""),
        category: sig.category,
        confidence: sig.confidence.toFixed(2),
        source: sig.source,
        cited: c ? `${c.evidenceKind}@${c.pageUrl}` : undefined,
        excerpt: c?.excerpt,
        candidates: sig.candidates
          ? sig.candidates
              .map((cand) => `${String(cand.value)}(${cand.confidence.toFixed(2)})[${cand.sources.length}src]`)
              .join(" | ")
          : undefined,
        conflict: sig.conflict?.hasConflict
          ? `rival=${String(sig.conflict.rival?.value)}@${sig.conflict.rival?.confidence.toFixed(2)}`
          : undefined,
      });
    };
    push("industry", profile.industry);
    push("productType", profile.productType);
    push("customerSegment", profile.customerSegment);
    push("dataTypes", profile.dataTypes);
    push("complianceSignals", profile.complianceSignals);
    push("userTypes", profile.userTypes);
    push("internalRoles", profile.internalRoles);
    push("operationalWorkflows", profile.operationalWorkflows);
    push("trustClaims", profile.trustClaims);
    push("riskAreas", profile.riskAreas);

    console.log("\n--- SIGNAL CATEGORY + PROVENANCE ---");
    console.table(fieldsWithCategory);

    const merged = CompanyProfileService.build({
      id: "inspect-mock",
      name: "Cybral (mock workspace)",
      industry: null,
      productType: null,
      customerSegment: null,
      dataTypes: [],
      complianceTargets: [],
      deepProfileJson: profile as unknown as Prisma.JsonValue,
    });
    const mergedRows = [
      { field: "industry", value: merged.industry.value, source: merged.industry.source, confidence: merged.industry.confidence.toFixed(2) },
      { field: "productType", value: merged.productType.value, source: merged.productType.source, confidence: merged.productType.confidence.toFixed(2) },
      { field: "customerSegment", value: merged.customerSegment.value, source: merged.customerSegment.source, confidence: merged.customerSegment.confidence.toFixed(2) },
      { field: "dataTypes", value: merged.dataTypes.value.join(",") || "-", source: merged.dataTypes.source, confidence: merged.dataTypes.confidence.toFixed(2) },
      { field: "complianceSignals", value: merged.complianceSignals.value.join(",") || "-", source: merged.complianceSignals.source, confidence: merged.complianceSignals.confidence.toFixed(2) },
      { field: "userTypes", value: merged.userTypes.value.join(",") || "-", source: merged.userTypes.source, confidence: merged.userTypes.confidence.toFixed(2) },
      { field: "internalRoles", value: merged.internalRoles.value.join(",") || "-", source: merged.internalRoles.source, confidence: merged.internalRoles.confidence.toFixed(2) },
      { field: "operationalWorkflows", value: merged.operationalWorkflows.value.join(",") || "-", source: merged.operationalWorkflows.source, confidence: merged.operationalWorkflows.confidence.toFixed(2) },
      { field: "trustClaims", value: merged.trustClaims.value.join(",") || "-", source: merged.trustClaims.source, confidence: merged.trustClaims.confidence.toFixed(2) },
      { field: "riskAreas", value: merged.riskAreas.value.join(",") || "-", source: merged.riskAreas.source, confidence: merged.riskAreas.confidence.toFixed(2) },
      { field: "tailoringConfidence", value: merged.tailoringConfidence.toFixed(2), source: "-", confidence: "-" },
      { field: "mode", value: merged.mode, source: "-", confidence: "-" },
    ];
    console.log("\n--- MERGED CompanyProfile (no DB; deepProfileJson = analyze profile) ---");
    console.table(mergedRows);

    // --- FIELD CANDIDATES detail table (enum fields only) ---
    type CandidateRow = {
      field: string;
      value: string;
      confidence: string;
      sourcePages: string;
      resolvedSources: string;
    };
    const candidateRows: CandidateRow[] = [];
    const pushCandidates = (field: string, sig: SignalShape | undefined) => {
      if (!sig?.candidates) return;
      for (const cand of sig.candidates) {
        candidateRows.push({
          field,
          value: String(cand.value),
          confidence: cand.confidence.toFixed(2),
          sourcePages: (cand.sourcePages ?? []).join(" | ") || "-",
          resolvedSources:
            cand.sources.length > 0
              ? cand.sources.map((s) => `${s.pageType}:${s.evidenceKind}`).join(" | ")
              : "-",
        });
      }
    };
    pushCandidates("industry", profile.industry);
    pushCandidates("productType", profile.productType);
    pushCandidates("customerSegment", profile.customerSegment);

    if (candidateRows.length > 0) {
      console.log("\n--- FIELD CANDIDATES ---");
      console.table(candidateRows);
    } else {
      console.log("\n[info] no candidates on enum fields (older schema or empty).");
    }

    const conflictFields = fieldsWithCategory.filter((f) => f.conflict);
    if (conflictFields.length > 0) {
      console.log(
        `\n[conflict] ${conflictFields.length} field(s) flagged as conflicted:`,
        conflictFields.map((f) => f.field).join(", "),
      );
    } else {
      console.log("\n[conflict] no conflicts detected.");
    }

    const observedWithSource = fieldsWithCategory.filter(
      (f) => f.category === "OBSERVED" && f.source && f.source.length > 0,
    );
    if (observedWithSource.length === 0) {
      console.error("\n[ASSERT FAIL] Expected at least one OBSERVED signal with a non-empty source.");
      process.exit(1);
    }
    console.log(`\n[ASSERT OK] ${observedWithSource.length} OBSERVED signal(s) with source citations.`);
    console.log("\n--- INSPECTION COMPLETE ---");
  } catch (err) {
    console.error("INSPECTION FAILED:", err);
    process.exit(1);
  }
}

run();
