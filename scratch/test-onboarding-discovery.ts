import { WebsiteAnalysisService } from "../src/modules/workspaces/onboarding/website-analysis-service";
import * as dotenv from "dotenv";

dotenv.config();

async function testDiscovery() {
    const urls = [
        "https://stripe.com",
        "https://zoom.us"
    ];

    for (const url of urls) {
        console.log(`\n--- Analyzing ${url} ---`);
        try {
            const result = await WebsiteAnalysisService.analyze(url);
            console.log("analysisStatus:", result.analysisStatus);
            console.log(JSON.stringify(result, null, 2));
        } catch (err) {
            console.error(`Inference failed for ${url}:`, err);
        }
    }
}

testDiscovery().catch(console.error);
