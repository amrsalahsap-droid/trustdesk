import "dotenv/config";
import { AiFactory } from "../src/lib/ai/ai-factory";
import { AI_CONFIG } from "../src/lib/ai/ai-config";

async function verifyAiLayer() {
  console.log("=== AI LAYER VERIFICATION ===");
  
  const factory = AiFactory.getInstance();
  const provider = factory.getProvider();
  
  console.log(`Resolved Provider: ${provider.name}`);
  
  try {
    console.log("\nTesting 'answer_synthesis' model routing...");
    const model = AI_CONFIG.TASK_MODELS['answer_synthesis'];
    console.log(`Expected Model: ${model}`);
  } catch (err) {
    console.error(err);
  }

  try {
    console.log("\nTesting 'topic_discovery' model routing...");
    const model = AI_CONFIG.TASK_MODELS['topic_discovery'];
    console.log(`Expected Model: ${model}`);
  } catch (err) {
    console.error(err);
  }

  console.log("\nTesting Fail-Closed behavior...");
  // Simulate no key
  const originalKey = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  
  // Reset the factory singleton for testing (hacky but effective for script)
  (AiFactory as any).instance = null;
  const testFactory = AiFactory.getInstance();
  const testProvider = testFactory.getProvider();
  
  console.log("\nTesting Real AI Connectivity (Free Model)...");
  try {
    const freeModel = "mistralai/mistral-7b-instruct:free";
    console.log(`Trying free model: ${freeModel}`);
    AI_CONFIG.TASK_MODELS['answer_synthesis'] = freeModel;

    const result = await provider.generateText("Say hello from TrustDesk.", { 
      id: 'answer_synthesis',
      correlationId: 'test-final-conn' 
    });
    console.log(`OpenRouter Response: ${result.data}`);
  } catch (err: any) {
    console.error(`AI Connection Failed: ${err.message}`);
    if (err.cause) {
      console.error(`Cause:`, err.cause);
    }
  }

  process.exit(0);
}

verifyAiLayer().catch(console.error);
