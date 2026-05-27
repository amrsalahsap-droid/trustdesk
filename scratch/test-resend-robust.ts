import * as https from "node:https";
import dotenv from "dotenv";

dotenv.config();

async function testRobustResend() {
  const apiKey = process.env.RESEND_API_KEY;
  console.log("Using API Key:", apiKey ? `${apiKey.substring(0, 5)}...` : "MISSING");
  
  if (!apiKey) {
    console.error("No RESEND_API_KEY found in .env");
    process.exit(1);
  }

  // Use insecure TLS for testing if requested
  const allowInsecure = process.env.AI_INSECURE_TLS === "true";
  console.log("Allow Insecure TLS:", allowInsecure);

  const url = "https://api.resend.com/domains";
  const parsedUrl = new URL(url);

  const options = {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    rejectUnauthorized: !allowInsecure,
  };

  console.log("Testing GET /domains with robust settings...");

  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        console.log("Status:", res.statusCode);
        console.log("Body:", data);
        resolve(data);
      });
    });

    req.on("error", (err) => {
      console.error("Request Error:", err.message);
      reject(err);
    });

    req.end();
  });
}

testRobustResend();
