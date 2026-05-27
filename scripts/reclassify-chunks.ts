/**
 * One-shot repair: re-run the (now top-K) chunk classifier for an existing
 * workspace. Wipes stale SourceChunkTopic rows for every document in scope
 * so the new floor and top-K assignments are persisted cleanly.
 *
 *   tsx scripts/reclassify-chunks.ts --workspace=<id>
 *   tsx scripts/reclassify-chunks.ts --workspace=<id> --document=<id>
 *
 * Reports before / after orphan counts per document so the operator can see
 * the recall lift. Not dry-run-capable because the classifier itself is
 * idempotent — a re-run with the same thresholds produces the same output.
 */
import { uncheckedPrisma } from "../src/lib/db/prisma";
import { ClassificationService } from "../src/modules/workspaces/source-documents/parsing/classification-service";

type Args = { workspaceId?: string; documentId?: string };

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (const raw of argv.slice(2)) {
    if (raw.startsWith("--workspace=")) args.workspaceId = raw.slice("--workspace=".length);
    else if (raw.startsWith("--document=")) args.documentId = raw.slice("--document=".length);
    else if (raw === "--help" || raw === "-h") {
      console.log("Usage: tsx scripts/reclassify-chunks.ts --workspace=<id> [--document=<id>]");
      process.exit(0);
    }
  }
  return args;
}

async function countPerDocument(workspaceId: string): Promise<Map<string, { fileName: string; chunkCount: number; classified: number }>> {
  const docs = await uncheckedPrisma.sourceDocument.findMany({
    where: { workspaceId },
    select: { id: true, fileName: true, chunks: { select: { id: true } } },
  });
  const associations = await uncheckedPrisma.sourceChunkTopic.findMany({
    where: { workspaceId },
    select: { chunkId: true },
  });
  const classifiedChunkIds = new Set(associations.map((a) => a.chunkId));
  const out = new Map<string, { fileName: string; chunkCount: number; classified: number }>();
  for (const d of docs) {
    const classified = d.chunks.filter((c) => classifiedChunkIds.has(c.id)).length;
    out.set(d.id, { fileName: d.fileName, chunkCount: d.chunks.length, classified });
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.workspaceId) {
    console.error("Missing --workspace=<id>");
    process.exit(1);
  }
  const workspaceId = args.workspaceId;

  const before = await countPerDocument(workspaceId);
  for (const [docId, { fileName, chunkCount, classified }] of before) {
    console.log(JSON.stringify({
      event: "reclassify.before",
      workspaceId,
      sourceDocumentId: docId,
      fileName,
      chunkCount,
      classified,
      orphan: chunkCount - classified,
    }));
  }

  if (args.documentId) {
    const matches = await ClassificationService.classifyDocumentChunks(workspaceId, args.documentId);
    console.log(JSON.stringify({ event: "reclassify.document.complete", workspaceId, documentId: args.documentId, matches }));
  } else {
    // Wipe per document (re-using classifyDocumentChunks so the wipe-first
    // semantics match exactly what happens on a re-parse).
    for (const docId of before.keys()) {
      const matches = await ClassificationService.classifyDocumentChunks(workspaceId, docId);
      console.log(JSON.stringify({ event: "reclassify.document.complete", workspaceId, documentId: docId, matches }));
    }
  }

  const after = await countPerDocument(workspaceId);
  for (const [docId, { fileName, chunkCount, classified }] of after) {
    console.log(JSON.stringify({
      event: "reclassify.after",
      workspaceId,
      sourceDocumentId: docId,
      fileName,
      chunkCount,
      classified,
      orphan: chunkCount - classified,
      delta: classified - (before.get(docId)?.classified ?? 0),
    }));
  }

  const totalBeforeClassified = Array.from(before.values()).reduce((a, b) => a + b.classified, 0);
  const totalAfterClassified = Array.from(after.values()).reduce((a, b) => a + b.classified, 0);
  const totalChunks = Array.from(after.values()).reduce((a, b) => a + b.chunkCount, 0);
  console.log(JSON.stringify({
    event: "reclassify.summary",
    workspaceId,
    totalChunks,
    totalBeforeClassified,
    totalAfterClassified,
    liftPct: totalChunks > 0 ? Number(((totalAfterClassified - totalBeforeClassified) / totalChunks * 100).toFixed(2)) : 0,
    newOrphanPct: totalChunks > 0 ? Number((((totalChunks - totalAfterClassified) / totalChunks) * 100).toFixed(2)) : 0,
  }));
}

main()
  .then(() => uncheckedPrisma.$disconnect())
  .catch((e) => { console.error(e); void uncheckedPrisma.$disconnect(); process.exit(1); });
