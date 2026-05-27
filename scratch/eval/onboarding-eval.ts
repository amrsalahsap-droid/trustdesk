/**
 * Offline evaluation harness for onboarding recommendations (no network).
 * Run: npx tsx scratch/eval/onboarding-eval.ts
 */
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import {
  CompanyProfileService,
  effectiveScalarForRules,
} from "../../src/modules/workspaces/company-profile-service";
import { DocumentRecommendationService } from "../../src/modules/workspaces/onboarding/document-recommendation-service";
import { TopicPackService } from "../../src/modules/knowledge/topics/topic-pack-service";

type Expect = {
  industryEffective: string;
  documentIdsMustInclude: string[];
  topicPackIdsMustInclude: string[];
};

type Fixture = {
  id: string;
  workspace: {
    name: string;
    industry: string;
    productType: string;
    customerSegment: string;
    dataTypes: string[];
    complianceTargets: string[];
  };
  deepProfile: unknown;
  expect: Expect;
};

type Verdict = "exact" | "acceptable" | "unknown" | "wrong" | "conflicted";

function containsAll(haystack: string[], needles: string[]): boolean {
  return needles.every(n => haystack.includes(n));
}

function evaluateFixture(f: Fixture): { ok: boolean; lines: string[] } {
  const lines: string[] = [`\n=== Fixture: ${f.id} ===`];
  const cp = CompanyProfileService.build({
    id: "eval-ws",
    name: f.workspace.name,
    industry: f.workspace.industry,
    productType: f.workspace.productType,
    customerSegment: f.workspace.customerSegment,
    dataTypes: f.workspace.dataTypes,
    complianceTargets: f.workspace.complianceTargets,
    deepProfileJson: f.deepProfile as object,
  });

  const eff = effectiveScalarForRules(cp.industry);
  const indOk = eff === f.expect.industryEffective;
  const indVerdict: Verdict = indOk ? "exact" : "wrong";
  lines.push(`industry_effective: ${eff} (${indVerdict}, expected ${f.expect.industryEffective})`);

  const docs = DocumentRecommendationService.getRecommendationsForProfile(cp);
  const docIds = docs.map(d => d.id);
  const docOk = containsAll(docIds, f.expect.documentIdsMustInclude);
  lines.push(
    `documents: ${docOk ? "acceptable" : "wrong"} (have: ${docIds.join(",")})`,
  );

  const packs = TopicPackService.getRecommendationsForProfile(cp);
  const packIds = packs.map(p => p.id);
  const packOk = containsAll(packIds, f.expect.topicPackIdsMustInclude);
  lines.push(
    `topic_packs: ${packOk ? "acceptable" : "wrong"} (have: ${packIds.join(",")})`,
  );

  const rationaleOk = packs.every(p => typeof p.recommendationRationale === "string" && p.recommendationRationale.length > 10);
  lines.push(`pack_rationales: ${rationaleOk ? "acceptable" : "wrong"}`);

  const reasonOk = docs.every(d => !!d.recommendationReason && d.recommendationReason.length > 20);
  lines.push(`doc_recommendation_reasons: ${reasonOk ? "acceptable" : "wrong"}`);

  const ok = indOk && docOk && packOk && rationaleOk && reasonOk;
  lines.push(ok ? "RESULT: PASS" : "RESULT: FAIL");
  return { ok, lines };
}

function main() {
  const dir = join(__dirname, "fixtures");
  const files = readdirSync(dir).filter(f => f.endsWith(".json"));
  let allOk = true;
  for (const file of files) {
    const raw = readFileSync(join(dir, file), "utf8");
    const fixture = JSON.parse(raw) as Fixture;
    const { ok, lines } = evaluateFixture(fixture);
    allOk = allOk && ok;
    console.log(lines.join("\n"));
  }
  if (!files.length) {
    console.error("No fixtures in scratch/eval/fixtures");
    process.exit(1);
  }
  if (!allOk) {
    console.error("\nOne or more fixtures failed.");
    process.exit(1);
  }
  console.log("\nAll onboarding eval fixtures passed.");
}

main();
