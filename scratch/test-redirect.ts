import "dotenv/config";
import { AiHttpClient, HttpFetchError } from "../src/lib/ai/ai-http-client";

type Case = { url: string; label: string };

const cases: Case[] = [
  { url: "http://github.com", label: "http -> https upgrade" },
  { url: "http://example.com/", label: "root http -> https" },
  { url: "http://www.example.com/", label: "www variant" },
];

async function run() {
  console.log("--- AiHttpClient redirect/TLS verification ---");
  let failures = 0;
  for (const c of cases) {
    process.stdout.write(`\n[${c.label}] GET ${c.url} ... `);
    try {
      const body = await AiHttpClient.get(c.url, {
        "User-Agent": "TrustDesk-RedirectTest/1.0",
      });
      const nonEmpty = body.length > 100;
      console.log(nonEmpty ? `OK (${body.length} bytes)` : `FAIL (empty body: ${body.length} bytes)`);
      if (!nonEmpty) failures++;
    } catch (err) {
      if (err instanceof HttpFetchError) {
        console.log(`FAIL kind=${err.kind} status=${err.status ?? "-"} msg=${err.message}`);
      } else {
        console.log(`FAIL ${err instanceof Error ? err.message : String(err)}`);
      }
      failures++;
    }
  }

  console.log(`\n--- Summary: ${cases.length - failures}/${cases.length} succeeded ---`);
  process.exit(failures === 0 ? 0 : 1);
}

run();
