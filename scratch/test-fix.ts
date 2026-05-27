import { AiHttpClient } from "./src/lib/ai/ai-http-client";
import { logger } from "./src/lib/logging/logger";

async function test() {
    console.log("Testing fetch for cybral.com...");
    try {
        const content = await AiHttpClient.get("https://www.cybral.com/", {
            'User-Agent': 'TrustDesk-Onboarding-Scanner/1.0',
        });
        console.log("Fetch successful! content length:", content.length);
        console.log("Snippet:", content.substring(0, 100));
    } catch (err) {
        console.error("Fetch failed as expected if no config loaded:", err);
    }
}

test();
