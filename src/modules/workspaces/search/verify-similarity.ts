import { SimilarityService } from "./similarity-service";
import { EmbeddingService } from "@/lib/ai/embedding-service";

async function verifySimilarity() {
  console.log("--- Starting Similarity Layer Verification ---");

  try {
    // 1. Test Embedding Generation
    console.log("1. Testing Local Embedding Generation...");
    const text1 = "How do you handle multi-factor authentication?";
    const text2 = "We enforce MFA for all employees.";
    const text3 = "The weather is nice today.";

    const vec1 = await EmbeddingService.getEmbedding(text1);
    const vec2 = await EmbeddingService.getEmbedding(text2);
    const vec3 = await EmbeddingService.getEmbedding(text3);

    console.log(`Vector Dimension: ${vec1.length}`);
    if (vec1.length !== 384) {
        throw new Error(`Expected dimension 384, got ${vec1.length}`);
    }

    // 2. Test Cosine Similarity Logic
    console.log("\n2. Testing Similarity Scores...");
    const score12 = SimilarityService.cosineSimilarity(vec1, vec2);
    const score13 = SimilarityService.cosineSimilarity(vec1, vec3);

    console.log(`Similarity (MFA question vs MFA answer): ${score12.toFixed(4)}`);
    console.log(`Similarity (MFA question vs Weather): ${score13.toFixed(4)}`);

    if (score12 <= score13) {
        throw new Error("Semantic mismatch: MFA should be more similar to MFA than to Weather.");
    }
    console.log("SUCCESS: Semantic ranking works as expected.");

    // 3. Test SimilarityService Methods (Deep Check)
    // Note: This requires DB records, so we mainly check the math here.
    console.log("\n3. Verifying math edge cases...");
    const zeroVec = new Array(384).fill(0);
    const scoreZero = SimilarityService.cosineSimilarity(vec1, zeroVec);
    console.log(`Similarity with Zero Vector: ${scoreZero}`);
    
    const scoreSelf = SimilarityService.cosineSimilarity(vec1, vec1);
    console.log(`Similarity with Self: ${scoreSelf.toFixed(4)}`);
    
    if (Math.abs(scoreSelf - 1.0) > 0.001) {
        throw new Error("Self-similarity should be ~1.0");
    }

    console.log("\n--- Similarity Layer Verification Complete ---");
  } catch (err) {
    console.error("\nVerification FAILED:", err);
    process.exit(1);
  }
}

verifySimilarity();
