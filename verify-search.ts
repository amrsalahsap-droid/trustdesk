import { SemanticSearchService } from "./src/modules/workspaces/search/semantic-search-service";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function verifySemanticSearch() {
  try {
    console.log("--- Starting Semantic Search Verification ---");

    const workspace = await prisma.workspace.findFirst();
    if (!workspace) {
      console.log("No workspace found to test.");
      return;
    }

    // 1. Basic Search
    console.log(`\nQuerying for: 'MFA and Password Policy' in workspace ${workspace.name}...`);
    const results = await SemanticSearchService.search("MFA and Password Policy", workspace.id);

    if (results.length === 0) {
      console.log("No results found. (Ensure you have run verify-embeddings.ts recently to seed data).");
    } else {
      console.log(`Found ${results.length} relevant chunks:`);
      results.forEach((r, i) => {
        console.log(`[Rank ${i+1}] Score: ${r.relevanceScore.toFixed(4)} | Doc: ${r.docName} | Heading: ${r.heading || 'N/A'}`);
        console.log(`Snippet: ${r.content.substring(0, 100)}...`);
        console.log("-" .repeat(40));
      });
    }

    // 2. Similarity Check (Semantic logic)
    console.log("\nVerifying Semantic logic (Query vs irrelevant)...");
    const results2 = await SemanticSearchService.search("Encryption keys", workspace.id);
    console.log(`Results for 'Encryption keys' count: ${results2.length}`);

    console.log("\n--- Semantic Search Verification Complete ---");
  } catch (err) {
    console.error("Verification FAILED:", err);
  } finally {
    await prisma.$disconnect();
  }
}

verifySemanticSearch();
