/**
 * Read-only probe that dumps what Prisma would return for the review
 * endpoint of a given questionnaire: id, rowNumber, type, 40-char preview
 * of the persisted question text. Diff against the drawer's rendered
 * preview to decide whether a row-identity mismatch is parser / DB side
 * or UI side.
 *
 *   tsx scratch/diag-review-dto.ts --questionnaire=<id>
 *   tsx scratch/diag-review-dto.ts --questionnaire=<id> --workspace=<id>
 *
 * No writes. No tenant-scoped client (uses uncheckedPrisma) so the probe
 * works even when the caller does not own the workspace.
 */

import { uncheckedPrisma } from "../src/lib/db/prisma";

type Args = { questionnaireId?: string; workspaceId?: string };

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (const raw of argv.slice(2)) {
    if (raw.startsWith("--questionnaire=")) args.questionnaireId = raw.slice("--questionnaire=".length);
    else if (raw.startsWith("--workspace=")) args.workspaceId = raw.slice("--workspace=".length);
    else if (raw === "--help" || raw === "-h") {
      console.log("Usage: tsx scratch/diag-review-dto.ts --questionnaire=<id> [--workspace=<id>]");
      process.exit(0);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.questionnaireId) {
    console.error("Missing --questionnaire=<id>");
    process.exit(1);
  }

  const questionnaire = await uncheckedPrisma.questionnaire.findUnique({
    where: { id: args.questionnaireId },
    select: { id: true, workspaceId: true, title: true },
  });

  if (!questionnaire) {
    console.error(JSON.stringify({ event: "diag-review-dto.not-found", questionnaireId: args.questionnaireId }));
    process.exit(1);
  }

  if (args.workspaceId && questionnaire.workspaceId !== args.workspaceId) {
    console.error(
      JSON.stringify({
        event: "diag-review-dto.workspace-mismatch",
        questionnaireId: args.questionnaireId,
        questionnaireWorkspaceId: questionnaire.workspaceId,
        requestedWorkspaceId: args.workspaceId,
      }),
    );
    process.exit(1);
  }

  const items = await uncheckedPrisma.questionnaireItem.findMany({
    where: { questionnaireId: questionnaire.id, workspaceId: questionnaire.workspaceId },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      rowNumber: true,
      type: true,
      question: true,
      suggestedAnswerId: true,
      unresolvedReason: true,
      confidence: true,
      createdAt: true,
    },
  });

  console.log(
    JSON.stringify({
      event: "diag-review-dto.header",
      questionnaireId: questionnaire.id,
      questionnaireTitle: questionnaire.title,
      workspaceId: questionnaire.workspaceId,
      itemCount: items.length,
    }),
  );

  // Quick duplicate-id / duplicate-text sanity sweep.
  const idCounts = new Map<string, number>();
  const textCounts = new Map<string, number>();
  for (const it of items) {
    idCounts.set(it.id, (idCounts.get(it.id) ?? 0) + 1);
    const trimmed = (it.question ?? "").trim();
    if (trimmed) textCounts.set(trimmed, (textCounts.get(trimmed) ?? 0) + 1);
  }
  const dupIds = Array.from(idCounts.entries()).filter(([, n]) => n > 1);
  const dupTexts = Array.from(textCounts.entries())
    .filter(([, n]) => n > 1)
    .map(([t, n]) => ({ preview: t.slice(0, 40), count: n }));
  console.log(
    JSON.stringify({
      event: "diag-review-dto.duplicates",
      duplicateIds: dupIds,
      duplicateTexts: dupTexts,
    }),
  );

  for (const it of items) {
    console.log(
      JSON.stringify({
        event: "diag-review-dto.item",
        id: it.id,
        rowNumber: it.rowNumber,
        type: it.type,
        confidence: it.confidence,
        suggestedAnswerId: it.suggestedAnswerId,
        unresolvedReason: it.unresolvedReason,
        questionPreview: (it.question ?? "").slice(0, 40),
        questionLen: (it.question ?? "").length,
      }),
    );
  }
}

main()
  .then(() => uncheckedPrisma.$disconnect())
  .catch((err) => {
    console.error(err);
    void uncheckedPrisma.$disconnect();
    process.exit(1);
  });
