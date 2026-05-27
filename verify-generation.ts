import { AnswerGenerationService } from "./src/modules/workspaces/intelligence/answer-generation-service";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function verifyGeneration() {
  try {
    console.log("--- Starting AI Answer Generation Verification ---");

    const workspace = await prisma.workspace.findFirst();
    if (!workspace) {
      console.log("No workspace found to test.");
      return;
    }

    // 1. Generate with relevant context
    console.log(`\nGenerating draft for: 'What encryption do we use?' in workspace ${workspace.name}...`);
    const result = await AnswerGenerationService.generate("What encryption do we use?", workspace.id);

    console.log("AI Result:");
    console.log(`Answer: ${result.answer}`);
    console.log(`Confidence: ${result.confidenceScore.toFixed(4)}`);
    console.log(`Sources used: ${result.sources.length}`);

    if (result.answer.includes("AES-256") || result.answer.includes("GCM")) {
        console.log("SUCCESS: AI correctly incorporated document evidence (Encryption).");
    } else {
        console.log("WARNING: AI did not mention expected technical details. Check context retrieval.");
    }

    // 2. Generate with IRRELEVANT context
    console.log(`\nGenerating draft for: 'How do we clean our office windows?'...`);
    const result2 = await AnswerGenerationService.generate("How do we clean our office windows?", workspace.id);
    console.log(`AI Result (Irrelevant): ${result2.answer.substring(0, 100)}...`);

    if (result2.answer.includes("could not find any relevant documentation")) {
        console.log("SUCCESS: AI correctly identified lack of context.");
    }

    console.log("\n--- AI Answer Generation Verification Complete ---");
  } catch (err) {
    console.error("Verification FAILED:", err);
  } finally {
    await prisma.$disconnect();
  }
}

verifyGeneration();
