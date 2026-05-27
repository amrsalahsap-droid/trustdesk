import { Resend } from "resend";
import dotenv from "dotenv";

dotenv.config();

async function testResend() {
  const apiKey = process.env.RESEND_API_KEY;
  console.log("Using API Key:", apiKey ? `${apiKey.substring(0, 5)}...` : "MISSING");
  
  if (!apiKey) {
    console.error("No RESEND_API_KEY found in .env");
    process.exit(1);
  }

  const resend = new Resend(apiKey);

  try {
    console.log("Fetching API key info (to test connectivity)...");
    // There isn't a direct 'get self' in Resend SDK usually, but we can try listing something
    const domains = await resend.domains.list();
    console.log("Domains response:", JSON.stringify(domains, null, 2));
  } catch (err) {
    console.error("Resend test failed:", err);
  }
}

testResend();
