/**
 * One-shot readonly inspection helper for the false-positive contradiction bug.
 *
 * Usage:
 *   npx tsx scripts/inspect-contradiction.ts <questionnaireItemId>
 *
 * Prints the questionnaire item, its linked library answer, its ContradictionResult,
 * and every eligible canonical answer under the row's topic so the operator can confirm
 * which canonical the engine would have picked.
 *
 * Safe to delete after the bug is confirmed — this file is not imported by the app.
 */

import { PrismaClient } from "@prisma/client";

async function main() {
  const itemId = process.argv[2];
  if (!itemId) {
    console.error("usage: npx tsx scripts/inspect-contradiction.ts <questionnaireItemId>");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const item = await prisma.questionnaireItem.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        workspaceId: true,
        questionnaireId: true,
        rowNumber: true,
        type: true,
        question: true,
        topicId: true,
        topicKey: true,
        topicName: true,
        suggestedAnswerId: true,
        suggestedAnswer: true,
        finalAnswer: true,
        reviewed: true,
        reviewStatus: true,
        verificationStatus: true,
        unresolvedReason: true,
        suggestionStatus: true,
        provenanceJson: true,
      },
    });

    if (!item) {
      console.log(JSON.stringify({ found: false, itemId }, null, 2));
      return;
    }

    const linkedAnswer = item.suggestedAnswerId
      ? await prisma.answerLibraryItem.findUnique({
          where: { id: item.suggestedAnswerId },
          select: {
            id: true,
            topicId: true,
            subControlKey: true,
            subControlLabels: true,
            title: true,
            status: true,
            governanceStatus: true,
            approvalScope: true,
            exportSafe: true,
            versionNumber: true,
            answer: true,
          },
        })
      : null;

    const contradiction = await prisma.contradictionResult.findUnique({
      where: { questionnaireItemId: itemId },
      select: {
        id: true,
        resolutionStatus: true,
        contradictionFound: true,
        severity: true,
        contradictionType: true,
        ruleId: true,
        rulePackVersion: true,
        canonicalAnswerId: true,
        canonicalVersionNumber: true,
        canonicalAnswerExcerpt: true,
        canonicalGovernanceStatus: true,
        message: true,
        reason: true,
        topicId: true,
        topicKey: true,
        subControlKey: true,
        detectedAt: true,
        isStale: true,
      },
    });

    const candidatePool = item.topicId
      ? await prisma.answerLibraryItem.findMany({
          where: {
            workspaceId: item.workspaceId,
            topicId: item.topicId,
            status: { not: "ARCHIVED" },
          },
          orderBy: [
            { versionNumber: "desc" },
            { approvedAt: "desc" },
            { createdAt: "desc" },
          ],
          select: {
            id: true,
            subControlKey: true,
            title: true,
            status: true,
            governanceStatus: true,
            approvalScope: true,
            exportSafe: true,
            versionNumber: true,
            approvedAt: true,
            createdAt: true,
          },
        })
      : [];

    const out = {
      item: {
        ...item,
        suggestedAnswer: item.suggestedAnswer?.slice(0, 400) ?? null,
        finalAnswer: item.finalAnswer?.slice(0, 400) ?? null,
      },
      linkedAnswer: linkedAnswer
        ? { ...linkedAnswer, answer: linkedAnswer.answer?.slice(0, 400) ?? null }
        : null,
      contradiction: contradiction
        ? {
            ...contradiction,
            canonicalAnswerExcerpt: contradiction.canonicalAnswerExcerpt?.slice(0, 400) ?? null,
          }
        : null,
      candidatePool,
    };
    console.log(JSON.stringify(out, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
