/**
 * Offline unit-style checks for the evidence extraction + prompt renderer.
 * No network, no AI. Feeds a synthetic HTML fixture and asserts that each
 * distinct kind of evidence is preserved as its own block.
 */

import {
  extractStructuredEvidence,
  renderEvidenceForPrompt,
  resolveSignalCitation,
  toPageEvidenceSummary,
  type EvidenceBlock,
  type HeadingSectionEvidence,
  type JsonLdEvidence,
  type MetaEvidence,
} from "../src/modules/workspaces/onboarding/evidence";

type Check = { name: string; ok: boolean; detail?: string };
const results: Check[] = [];
const record = (name: string, ok: boolean, detail?: string) => results.push({ name, ok, detail });

const HTML = `<!doctype html>
<html>
  <head>
    <title>Example Security Posture</title>
    <meta name="description" content="Enterprise-grade security backed by SOC 2 Type II and ISO 27001." />
    <meta property="og:description" content="Security at Example Inc." />
    <meta property="og:title" content="Example — Security" />
    <link rel="canonical" href="https://example.com/security" />
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "name": "Example, Inc.",
      "sameAs": ["https://www.linkedin.com/company/example"]
    }
    </script>
    <script type="application/ld+json">
    { this is not valid json,
    </script>
    <style>.nav{color:red}</style>
  </head>
  <body>
    <nav>Home | About</nav>
    <h1>Security posture</h1>
    <p>We operate on a shared-responsibility model grounded in SOC 2 Type II and ISO 27001.</p>
    <h2>Encryption</h2>
    <p>All data at rest is encrypted with AES-256; data in transit uses TLS 1.3.</p>
    <p>Customer-managed keys are supported on the Enterprise plan.</p>
    <h2>Access control</h2>
    <p>SSO/SAML and SCIM provisioning are supported across all tiers.</p>
    <footer>Copyright 2026 Example.</footer>
  </body>
</html>`;

const structured = extractStructuredEvidence({
  html: HTML,
  url: "https://example.com/security",
  title: "Example Security Posture",
  pageType: "security",
  score: 95,
});

// --- 1. Meta block ---
const metaBlocks = structured.blocks.filter((b): b is MetaEvidence => b.kind === "meta");
record("exactly one meta block", metaBlocks.length === 1, `got ${metaBlocks.length}`);
if (metaBlocks[0]) {
  record(
    "meta.metaDescription captured",
    !!metaBlocks[0].metaDescription && metaBlocks[0].metaDescription.includes("SOC 2"),
    metaBlocks[0].metaDescription,
  );
  record("meta.ogDescription captured", metaBlocks[0].ogDescription === "Security at Example Inc.");
  record("meta.ogTitle captured", metaBlocks[0].ogTitle === "Example — Security");
  record("meta.canonicalUrl captured", metaBlocks[0].canonicalUrl === "https://example.com/security");
}

// --- 2. JSON-LD blocks ---
const jsonLdBlocks = structured.blocks.filter((b): b is JsonLdEvidence => b.kind === "json-ld");
record("two json-ld blocks", jsonLdBlocks.length === 2, `got ${jsonLdBlocks.length}`);
if (jsonLdBlocks[0]) {
  record("json-ld[0] parsed", jsonLdBlocks[0].parsed !== undefined);
  record("json-ld[0] @type == Organization", jsonLdBlocks[0].type === "Organization", jsonLdBlocks[0].type);
}
if (jsonLdBlocks[1]) {
  record("json-ld[1] parse failed -> raw only", jsonLdBlocks[1].parsed === undefined);
  record("json-ld[1] raw preserved", jsonLdBlocks[1].raw.length > 0);
}

// --- 3. Heading sections ---
const headingBlocks = structured.blocks.filter(
  (b): b is HeadingSectionEvidence => b.kind === "heading-section",
);
record("three heading sections", headingBlocks.length === 3, `got ${headingBlocks.length}`);
const headings = headingBlocks.map((b) => b.heading);
record(
  "heading titles as expected",
  headings[0] === "Security posture" && headings[1] === "Encryption" && headings[2] === "Access control",
  JSON.stringify(headings),
);
for (const h of headingBlocks) {
  record(`heading "${h.heading}" has non-empty body`, h.bodyText.length > 0);
}
record(
  "encryption body captures AES-256 claim",
  !!headingBlocks[1] && headingBlocks[1].bodyText.includes("AES-256"),
  headingBlocks[1]?.bodyText,
);
record(
  "encryption body stops before next heading",
  !!headingBlocks[1] && !headingBlocks[1].bodyText.includes("SSO/SAML"),
);

// --- 4. Body fallback ---
const bodyBlocks = structured.blocks.filter((b): b is Extract<EvidenceBlock, { kind: "body-fallback" }> => b.kind === "body-fallback");
record("one body-fallback block", bodyBlocks.length === 1, `got ${bodyBlocks.length}`);
record(
  "body-fallback excludes <style> content",
  !!bodyBlocks[0] && !bodyBlocks[0].text.includes("color:red"),
);

// --- 5. sourceConfidence ---
record(
  "sourceConfidence is in (0, 1]",
  structured.sourceConfidence > 0 && structured.sourceConfidence <= 1,
  String(structured.sourceConfidence),
);

// --- 6. Rendered prompt ---
const rendered = renderEvidenceForPrompt(structured);
record("prompt contains PAGE url", rendered.includes("PAGE: https://example.com/security"));
record("prompt contains META_DESCRIPTION label", rendered.includes("META_DESCRIPTION:"));
record(
  "prompt contains JSON_LD[0] (@type=Organization) label",
  rendered.includes("JSON_LD[0] (@type=Organization)"),
);
record("prompt contains H1 heading", rendered.includes(`[H1] "Security posture"`));
record("prompt contains H2 Encryption heading", rendered.includes(`[H2] "Encryption"`));
record("prompt contains BODY_FALLBACK label", rendered.includes("BODY_FALLBACK"));

// --- 7. Summary projection for API ---
const summary = toPageEvidenceSummary(structured);
record("summary has pageType security", summary.pageType === "security");
record("summary evidenceKinds includes meta", summary.evidenceKinds.includes("meta"));
record("summary evidenceKinds includes json-ld", summary.evidenceKinds.includes("json-ld"));
record("summary evidenceKinds includes heading-section", summary.evidenceKinds.includes("heading-section"));
record("summary jsonLdTypes contains Organization", summary.jsonLdTypes.includes("Organization"));
record("summary headingsCount == 3", summary.headingsCount === 3, String(summary.headingsCount));

// --- 8. resolveSignalCitation ---
const pages = [structured];
const urlCitation = resolveSignalCitation("https://example.com/security JSON_LD Organization", pages);
record(
  "citation matches url + json-ld kind",
  !!urlCitation && urlCitation.evidenceKind === "json-ld" && urlCitation.pageType === "security",
  JSON.stringify(urlCitation),
);
const headingCitation = resolveSignalCitation(
  "https://example.com/security heading: Encryption",
  pages,
);
record(
  "citation matches url + heading-section",
  !!headingCitation && headingCitation.evidenceKind === "heading-section",
  JSON.stringify(headingCitation),
);
const unknownCitation = resolveSignalCitation("industry-standard guess", pages);
record("citation returns undefined when no URL match", unknownCitation === undefined);

// --- Render summary ---
console.log("\n--- EVIDENCE EXTRACTION CHECKS ---");
console.log(`page=${structured.url} type=${structured.pageType} sourceConfidence=${structured.sourceConfidence.toFixed(2)}`);
console.log(`blocks=${structured.blocks.map((b) => b.kind).join(", ")}`);

const failures = results.filter((r) => !r.ok);
console.log(`\n${results.length - failures.length}/${results.length} checks passed.`);
if (failures.length > 0) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error(` - ${f.name}${f.detail ? ` :: ${f.detail}` : ""}`);
  process.exit(1);
}
console.log("\n[ASSERT OK] evidence extraction preserves every kind of evidence block.");
