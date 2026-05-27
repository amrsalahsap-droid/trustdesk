/**
 * Read-only diagnostic for the questionnaire answer-resolution pipeline.
 *
 * Dumps the full persisted state of one failing row plus what the live
 * matcher WOULD compute today (topic scores, library candidates, evidence
 * counts). The output is designed to pinpoint the exact stage where the
 * pipeline breaks: topic resolution, answer retrieval, evidence linking,
 * synthesis, fallback handling, confidence calculation, or UI state.
 *
 *   Usage:
 *     tsx scratch/diag-row-resolution.ts
 *     tsx scratch/diag-row-resolution.ts --question="role-based access"
 *     tsx scratch/diag-row-resolution.ts --workspace=<wid>
 *
 * This script never writes to the database.
 */

import { PrismaClient } from "@prisma/client";

import { EmbeddingService } from "../src/lib/ai/embedding-service";
import { QuestionnaireMatchingService } from "../src/modules/workspaces/intelligence/questionnaire-matching-service";

type Args = { question: string; workspaceId?: string };

function parseArgs(argv: string[]): Args {
  const args: Args = { question: "role-based access control" };
  for (const raw of argv.slice(2)) {
    if (raw.startsWith("--question=")) args.question = raw.slice("--question=".length);
    else if (raw.startsWith("--workspace=")) args.workspaceId = raw.slice("--workspace=".length);
    else if (raw === "--help" || raw === "-h") {
      console.log("Usage: tsx scratch/diag-row-resolution.ts [--question=<substring>] [--workspace=<id>]");
      process.exit(0);
    }
  }
  return args;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const mag = Math.sqrt(na) * Math.sqrt(nb);
  return mag === 0 ? 0 : dot / mag;
}

function header(label: string) {
  console.log("\n" + "=".repeat(80));
  console.log(label);
  console.log("=".repeat(80));
}

async function main() {
  const args = parseArgs(process.argv);
  const prisma = new PrismaClient();
  console.log(`[diag] question substring=${JSON.stringify(args.question)} workspace=${args.workspaceId ?? "<any>"}`);

  try {
    // 1. Persisted row state
    header("1. PERSISTED QuestionnaireItem");
    const item = await prisma.questionnaireItem.findFirst({
      where: {
        type: "question_row",
        question: { contains: args.question, mode: "insensitive" },
        ...(args.workspaceId ? { workspaceId: args.workspaceId } : {}),
      },
      orderBy: { createdAt: "desc" },
    });

    if (!item) {
      console.log("No matching QuestionnaireItem found. Try a different --question substring.");
      return;
    }

    const persisted = {
      id: item.id,
      workspaceId: item.workspaceId,
      questionnaireId: item.questionnaireId,
      rowNumber: item.rowNumber,
      question: item.question,
      topicId: item.topicId,
      topicName: item.topicName,
      topicKey: item.topicKey,
      confidence: item.confidence,
      reviewStatus: item.reviewStatus,
      suggestionStatus: item.suggestionStatus,
      unresolvedReason: item.unresolvedReason,
      reviewed: item.reviewed,
      verificationStatus: item.verificationStatus,
      suggestedAnswerId: item.suggestedAnswerId,
      suggestedAnswerLen: item.suggestedAnswer.length,
      finalAnswerLen: item.finalAnswer.length,
      reviewSummary: item.reviewSummary,
      sourcesJsonCount: Array.isArray(item.sourcesJson) ? (item.sourcesJson as unknown[]).length : "(not-array)",
      candidatesJsonCount: Array.isArray(item.candidatesJson) ? (item.candidatesJson as unknown[]).length : "(not-array)",
    };
    console.log(JSON.stringify(persisted, null, 2));

    const workspaceId = item.workspaceId;

    // 2. Live topic scoring for this question
    header("2. LIVE TOPIC SCORES (matcher would see)");
    const topics = await prisma.knowledgeTopic.findMany({
      where: {
        OR: [{ workspaceId }, { workspaceId: null }],
        embedding: { isEmpty: false },
      },
    });
    console.log(`topicsWithEmbeddings=${topics.length}`);

    let questionVec: number[] | null = null;
    try {
      const [vec] = await EmbeddingService.getEmbeddings([item.question]);
      questionVec = vec;
    } catch (err) {
      console.log("EMBEDDING FAILED:", err instanceof Error ? err.message : String(err));
    }

    let bestTopicId: string | null = null;
    let bestTopicScore = 0;
    if (questionVec) {
      const scored = topics
        .map((t) => ({
          id: t.id,
          name: t.name,
          key: t.key,
          score: cosineSimilarity(questionVec!, t.embedding as number[]),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
      console.log(JSON.stringify(scored, null, 2));

      const top = scored[0];
      const runnerUp = scored[1];
      if (top && top.score >= 0.4) {
        const isAmbiguous = runnerUp && (top.score - runnerUp.score) < 0.05;
        console.log(`topicStatus=${isAmbiguous ? "ambiguous" : "matched"} topicId=${top.id} topicName=${top.name} score=${top.score.toFixed(3)}`);
        bestTopicId = top.id;
        bestTopicScore = top.score;
      } else {
        console.log(`topicStatus=unresolved bestScore=${top?.score.toFixed(3) ?? "n/a"} (threshold=0.4)`);
      }
    }

    // 3. Live answer candidates (approved + draft) scored with the same boosts
    header("3. LIVE ANSWER CANDIDATES for this question");
    const library = await prisma.answerLibraryItem.findMany({
      where: {
        workspaceId,
        status: { not: "ARCHIVED" },
        embedding: { isEmpty: false },
      },
      include: {
        topic: { select: { id: true, name: true } },
        _count: { select: { evidence: true } },
      },
    });
    console.log(`librarySize=${library.length}`);

    if (questionVec) {
      const scored = library
        .map((a) => {
          const base = cosineSimilarity(questionVec!, a.embedding as number[]);
          const topicBoost = bestTopicId && a.topicId === bestTopicId ? 0.05 : 0;
          const approvedBoost = a.status === "APPROVED" ? 0.15 : 0;
          return {
            id: a.id,
            title: a.title,
            status: a.status,
            generationScope: (a as any).generationScope ?? null,
            topicName: a.topic?.name ?? null,
            topicMatches: bestTopicId ? a.topicId === bestTopicId : null,
            evidenceCount: a._count.evidence,
            cosine: Number(base.toFixed(4)),
            topicBoost,
            approvedBoost,
            finalScore: Number((base + topicBoost + approvedBoost).toFixed(4)),
          };
        })
        .sort((a, b) => b.finalScore - a.finalScore)
        .slice(0, 8);
      console.log(JSON.stringify(scored, null, 2));

      const bestApproved = scored.find((s) => s.status === "APPROVED");
      const draftsForTopic = scored.filter((s) => s.topicMatches && s.status === "DRAFT");
      console.log(`bestApproved=${bestApproved ? `${bestApproved.id} score=${bestApproved.finalScore}` : "(none)"}`);
      console.log(`draftsMatchingTopic=${draftsForTopic.length}`);
      if (draftsForTopic.length > 0) {
        console.log(
          `NOTE: matcher's bestApproved logic IGNORES DRAFT answers — seeded drafts here do NOT drive suggestedAnswerId/confidence.`,
        );
      }
    }

    // 4. Evidence on the stored suggestedAnswerId (if any)
    header("4. EVIDENCE linked to stored suggestedAnswerId");
    if (item.suggestedAnswerId) {
      const evidence = await prisma.answerEvidence.findMany({
        where: { answerId: item.suggestedAnswerId },
        include: { chunk: { include: { sourceDocument: { select: { fileName: true } } } } },
      });
      console.log(
        JSON.stringify(
          evidence.map((e) => ({
            id: e.id,
            chunkId: e.chunkId,
            documentName: e.chunk.sourceDocument.fileName,
            quoteLen: (e.quote ?? "").length,
          })),
          null,
          2,
        ),
      );
    } else {
      console.log("(no suggestedAnswerId persisted — evidence cannot be linked)");
    }

    // 5. Invariant checks on the persisted row
    header("5. INVARIANT CHECKS on persisted row");
    const invariants: Array<{ name: string; broken: boolean; detail?: string }> = [];
    invariants.push({
      name: "HIGH confidence + null topicId",
      broken: item.confidence === "high" && item.topicId == null,
    });
    invariants.push({
      name: "HIGH confidence + null suggestedAnswerId",
      broken: item.confidence === "high" && item.suggestedAnswerId == null,
    });
    invariants.push({
      name: "HIGH confidence + empty finalAnswer AND empty suggestedAnswer",
      broken: item.confidence === "high" && item.finalAnswer === "" && item.suggestedAnswer === "",
    });
    invariants.push({
      name: "reviewSummary empty + confidence not low",
      broken: (!item.reviewSummary || item.reviewSummary.trim() === "") && item.confidence !== "low",
    });
    const credibleTopicButNullStored = bestTopicId && bestTopicScore >= 0.4 && item.topicId == null;
    invariants.push({
      name: "Credible topic available (score>=0.4) but persisted topicId is null",
      broken: !!credibleTopicButNullStored,
      detail: credibleTopicButNullStored ? `live top topic score=${bestTopicScore.toFixed(3)}` : undefined,
    });
    for (const inv of invariants) {
      console.log(`  ${inv.broken ? "BROKEN" : "ok    "} — ${inv.name}${inv.detail ? ` (${inv.detail})` : ""}`);
    }

    // 6. Replay: what would the live matcher produce for this single row right now?
    header("6. LIVE MATCHER REPLAY (read-only)");
    try {
      const matcherMap = await QuestionnaireMatchingService.matchRows(workspaceId, [
        {
          rowNumber: item.rowNumber ?? 1,
          question: item.question,
          answer: "",
          type: "question_row",
          confidence: "high",
        },
      ]);
      const result = matcherMap.get(item.rowNumber ?? 1);
      if (!result) {
        console.log(
          "MATCHER RETURNED NO ENTRY for this row. Check the `questionnaire:matching:failed` log line above for the actual thrown error. Typical causes: MultiTenantScopingError (warmup fails), ReferenceError `rowUnresolvedReason` (line 163 of matching-service.ts when low-quality synthesis branch runs), or a synthesis timeout.",
        );
      } else {
        const replay = {
          rowNumber: result.rowNumber,
          topicId: result.topicId,
          topicName: result.topicName,
          status: result.status,
          suggestedAnswerId: result.suggestedAnswerId,
          suggestedAnswerLen: (result.suggestedAnswer ?? "").length,
          confidence: result.confidence,
          reviewed: result.reviewed,
          explanationPreview: (result.explanation ?? "").slice(0, 200),
          sourcesCount: result.sources.length,
          candidatesCount: result.candidates.length,
        };
        console.log(JSON.stringify(replay, null, 2));
        console.log("\nCOMPARISON live-matcher vs persisted:");
        console.log(`  confidence           live=${result.confidence} persisted=${item.confidence}`);
        console.log(`  topicId              live=${result.topicId ?? "null"} persisted=${item.topicId ?? "null"}`);
        console.log(`  suggestedAnswerId    live=${result.suggestedAnswerId ?? "null"} persisted=${item.suggestedAnswerId ?? "null"}`);
        console.log(`  reviewSummary empty? live=${!result.explanation} persisted=${!item.reviewSummary}`);
      }
    } catch (err) {
      console.log("MATCHER THREW:", err instanceof Error ? err.message : String(err));
      if (err instanceof Error && err.stack) console.log(err.stack);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[diag] fatal", err);
  process.exit(1);
});
