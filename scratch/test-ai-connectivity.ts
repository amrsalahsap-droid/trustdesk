
import { AiHttpClient } from '../src/lib/ai/ai-http-client';
import { aiConfig } from '../src/lib/ai/ai-config-service';

async function testConnectivity() {
    console.log("=== AI Connectivity Test ===");
    console.log(`Provider: ${aiConfig.provider}`);
    console.log(`Proxy: ${aiConfig.proxyUrl || 'None'}`);
    console.log(`CA Bundle: ${aiConfig.caBundlePath || 'None'}`);
    console.log(`Allow Insecure TLS (Dev): ${aiConfig.allowInsecureTls}`);
    console.log("----------------------------");

    const url = 'https://api.groq.com/openai/v1/chat/completions';
    const body = {
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 5
    };

    try {
        console.log("Attempting request to Groq...");
        const response = await AiHttpClient.post<any>(url, {
            'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        }, body);
        
        console.log("✅ Success! API Response received.");
        console.log("Preview:", response.choices[0]?.message?.content);
    } catch (err: any) {
        console.error("❌ Request Failed");
        if (err.message.includes('SELF_SIGNED_CERT_IN_CHAIN')) {
            console.error("\n[REASON] Self-signed certificate in chain.");
            console.error("[ACTION] To bypass this in development, set AI_INSECURE_TLS=true in your .env file.");
        } else if (err.status === 401) {
            console.error("\n[REASON] Unauthorized. Please check your GROQ_API_KEY.");
        } else {
            console.error("\n[REASON]", err.message);
        }
    }
}

testConnectivity();
