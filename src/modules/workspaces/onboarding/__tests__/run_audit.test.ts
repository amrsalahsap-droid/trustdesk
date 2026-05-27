import { describe, it } from "vitest";
import { prisma } from "../../../../lib/db/prisma";
import { ProductGraphEngine } from "../product-graph/product-graph-engine";
import { DeepInferredProfile } from "../../onboarding-core-types";

describe("Cybral Capability Confidence Audit", () => {
  it("should query the database, run the product graph engine build on the cybral.com profile, and print the required audit table", async () => {
    const latestWorkspace = await prisma.workspace.findFirst({
      orderBy: { createdAt: "desc" },
    });

    if (!latestWorkspace) {
      console.log("No workspaces found in the database.");
      return;
    }

    console.log(`[AUDIT] Workspace Found: ${latestWorkspace.name} (${latestWorkspace.id})`);

    const profile = latestWorkspace.deepProfileJson as unknown as DeepInferredProfile;
    if (!profile) {
      console.log("No deepProfileJson found for the latest workspace.");
      return;
    }

    // Prepare extracted pages from the profile or database
    const extractedPages = profile.pagesScanned?.map((url, index) => {
      // Mock page elements from crawldata or database if available, or just map standard evidence structure
      return {
        url,
        title: `Scanned Page ${index}`,
        pageType: url.includes("security") || url.includes("trust") ? "security" : "other",
        score: 0.8,
        sourceConfidence: 0.8,
        blocks: [
          {
            kind: "body-fallback" as const,
            source: "visible_text" as const,
            text: "This is a crawled security page containing evidence for compliance training and supply chain subprocessor management."
          }
        ]
      };
    }) || [];

    const graph = ProductGraphEngine.build({ profile, extractedPages });

    console.log("\n=================================================================================");
    console.log("                CAPABILITY CONFIDENCE AUDIT REPORT (cybral.com)                 ");
    console.log("=================================================================================\n");

    const auditRows: string[] = [];
    auditRows.push("| Capability Label | Source URL | Snippet | Authority Score | Confidence Label | Recommended Final Label |");
    auditRows.push("| --- | --- | --- | --- | --- | --- |");

    for (const cap of graph.productCapabilities) {
      const ref = cap.evidenceRefs[0];
      const sourceUrl = ref?.sourceUrl || "profile://dataInteractionModel";
      const snippet = ref?.snippet || "Inferred from profile metadatafallback.";
      const authorityScore = cap.authorityScore ?? 0;
      const confidenceLabel = cap.confidenceLabel ?? "Weak";
      const recommendedLabel = cap.recommendedFinalLabel ?? "Needs Review / Weak Evidence";

      auditRows.push(`| ${cap.label} | \`${sourceUrl}\` | "${snippet.replace(/\n/g, " ").trim()}" | ${authorityScore} | **${confidenceLabel}** | \`${recommendedLabel}\` |`);
    }

    console.log(auditRows.join("\n"));
    console.log("\n=================================================================================");
  });
});
