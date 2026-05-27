/**
 * Re-embed every non-archived AnswerLibraryItem whose `embedding` array is
 * empty. Idempotent: a second run skips rows that already have a vector.
 *
 *   tsx scripts/backfill-answer-embeddings.ts            # dry-run (default)
 *   tsx scripts/backfill-answer-embeddings.ts --apply
 *   tsx scripts/backfill-answer-embeddings.ts --workspace=<id>
 *
 * Rationale: the matcher warmup filters `embedding: { isEmpty: false }`.
 * Historically every write path wrote `embedding: []` so the library was
 * invisible to questionnaire matching. Fix 1 of the
 * answer-retrieval-integrity-fix plan populates the column on new writes;
 * this script repairs pre-existing rows.
 */

import { uncheckedPrisma } from "../src/lib/db/prisma";
import {
  buildAnswerEmbeddingInput,
  computeAnswerEmbedding,
} from "../src/modules/workspaces/intelligence/answer-embedding";
import { EmbeddingService } from "../src/lib/ai/embedding-service";

type Args = {
  apply: boolean;
  workspaceId?: string;
  batchSize: number;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false, batchSize: 32 };
  for (const raw of argv.slice(2)) {
    if (raw === "--apply") args.apply = true;
    else if (raw === "--dry-run") args.apply = false;
    else if (raw.startsWith("--workspace=")) args.workspaceId = raw.slice("--workspace=".length);
    else if (raw.startsWith("--batch=")) args.batchSize = Math.max(1, Number(raw.slice("--batch=".length)));
    else if (raw === "--help" || raw === "-h") {
      console.log(
        "Usage: tsx scripts/backfill-answer-embeddings.ts [--apply] [--workspace=<id>] [--batch=<n>]",
      );
      process.exit(0);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);

  const candidates = await uncheckedPrisma.answerLibraryItem.findMany({
    where: {
      status: { not: "ARCHIVED" },
      ...(args.workspaceId ? { workspaceId: args.workspaceId } : {}),
    },
    select: {
      id: true,
      workspaceId: true,
      title: true,
      answer: true,
      status: true,
      embedding: true,
    },
  });

  let scanned = 0;
  let skippedNonEmpty = 0;
  let skippedNoText = 0;
  let updated = 0;
  let failed = 0;

  // Work in batches through EmbeddingService.getEmbeddings to amortise
  // provider latency. Keep the id<->text association by index.
  const targets = candidates.filter((c) => {
    scanned++;
    const emb = Array.isArray(c.embedding) ? (c.embedding as number[]) : [];
    if (emb.length > 0) {
      skippedNonEmpty++;
      return false;
    }
    const text = buildAnswerEmbeddingInput(c.title, c.answer);
    if (!text) {
      skippedNoText++;
      return false;
    }
    return true;
  });

  console.log(
    JSON.stringify({
      event: "answer.embedding.backfill.plan",
      scanned,
      skippedNonEmpty,
      skippedNoText,
      targetsCount: targets.length,
      apply: args.apply,
      batchSize: args.batchSize,
    }),
  );

  if (targets.length === 0) {
    console.log(JSON.stringify({ event: "answer.embedding.backfill.summary", updated: 0, failed: 0 }));
    return;
  }

  for (let offset = 0; offset < targets.length; offset += args.batchSize) {
    const slice = targets.slice(offset, offset + args.batchSize);
    const texts = slice.map((c) => buildAnswerEmbeddingInput(c.title, c.answer));

    let vectors: number[][];
    try {
      vectors = await EmbeddingService.getEmbeddings(texts);
    } catch (err) {
      failed += slice.length;
      console.log(
        JSON.stringify({
          event: "answer.embedding.backfill.batch_failed",
          offset,
          size: slice.length,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
      continue;
    }

    for (let i = 0; i < slice.length; i++) {
      const item = slice[i]!;
      const vector = vectors[i];
      const payload = {
        event: "answer.embedding.backfill.candidate",
        id: item.id,
        workspaceId: item.workspaceId,
        status: item.status,
        titlePreview: (item.title ?? "").slice(0, 60),
        embeddingLen: vector?.length ?? 0,
        apply: args.apply,
      };
      console.log(JSON.stringify(payload));

      if (!args.apply) continue;
      if (!vector || vector.length === 0) {
        failed++;
        continue;
      }

      try {
        await uncheckedPrisma.answerLibraryItem.update({
          where: { id: item.id },
          data: { embedding: vector },
        });
        updated++;
      } catch (err) {
        failed++;
        console.log(
          JSON.stringify({
            event: "answer.embedding.backfill.update_failed",
            id: item.id,
            workspaceId: item.workspaceId,
            error: err instanceof Error ? err.message : String(err),
          }),
        );
      }
    }
  }

  console.log(
    JSON.stringify({
      event: "answer.embedding.backfill.summary",
      scanned,
      skippedNonEmpty,
      skippedNoText,
      targets: targets.length,
      updated,
      failed,
      apply: args.apply,
    }),
  );
}

main()
  .then(() => uncheckedPrisma.$disconnect())
  .catch((err) => {
    console.error(err);
    void uncheckedPrisma.$disconnect();
    process.exit(1);
  });
