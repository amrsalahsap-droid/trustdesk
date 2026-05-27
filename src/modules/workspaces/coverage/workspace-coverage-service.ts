import { uncheckedPrisma } from "@/lib/db/prisma";
import { SUBCONTROLS_BY_TOPIC_KEY } from "@/modules/knowledge/topics/subcontrol-taxonomy";

export interface TopicCoverageRow {
  topicId: string;
  topicKey: string;
  topicName: string;
  approvedCount: number;
  draftCount: number;
  archivedCount: number;
  subControlCoverage: Array<{
    key: string;
    label: string;
    approvedCount: number;
    draftCount: number;
  }>;
  missingSubControls: string[];
}

export interface WorkspaceCoverageReport {
  workspaceId: string;
  documentCount: number;
  chunkCount: number;
  classifiedChunkCount: number;
  orphanChunkCount: number;
  orphanChunkPct: number;
  uniqueTopicsWithChunks: number;
  topicsWithApprovedAnswers: number;
  totalApprovedAnswers: number;
  totalDraftAnswers: number;
  missingSubControlCount: number;
  topics: TopicCoverageRow[];
  unusedDocuments: Array<{ id: string; fileName: string; chunkCount: number; classifiedChunks: number }>;
}

/**
 * Computes the "can the value engine deliver?" snapshot for one workspace.
 * Intentionally read-only and cheap so the UI can poll it.
 */
export async function buildWorkspaceCoverageReport(workspaceId: string): Promise<WorkspaceCoverageReport> {
  const documents = await uncheckedPrisma.sourceDocument.findMany({
    where: { workspaceId },
    select: {
      id: true,
      fileName: true,
      chunks: { select: { id: true } },
    },
  });

  const chunkIds = documents.flatMap((d) => d.chunks.map((c) => c.id));
  const chunkCount = chunkIds.length;

  const classifications = chunkIds.length > 0
    ? await uncheckedPrisma.sourceChunkTopic.findMany({
        where: { workspaceId, chunkId: { in: chunkIds } },
        select: { chunkId: true, topicId: true },
      })
    : [];
  const classifiedChunkIdSet = new Set(classifications.map((c) => c.chunkId));
  const classifiedChunkCount = classifiedChunkIdSet.size;
  const orphanChunkCount = chunkCount - classifiedChunkCount;
  const orphanChunkPct = chunkCount > 0 ? Number(((orphanChunkCount / chunkCount) * 100).toFixed(2)) : 0;

  const unusedDocuments = documents
    .map((d) => {
      const classifiedChunks = d.chunks.filter((c) => classifiedChunkIdSet.has(c.id)).length;
      return {
        id: d.id,
        fileName: d.fileName,
        chunkCount: d.chunks.length,
        classifiedChunks,
      };
    })
    .filter((d) => d.chunkCount > 0 && d.classifiedChunks === 0)
    .sort((a, b) => b.chunkCount - a.chunkCount);

  const topicsWithChunkHits = new Set(classifications.map((c) => c.topicId));

  const topics = await uncheckedPrisma.knowledgeTopic.findMany({
    where: { workspaceId: { in: [workspaceId, "SYSTEM_WORKSPACE"] } },
    select: { id: true, key: true, name: true, workspaceId: true },
  });
  // Prefer workspace-scoped overrides over SYSTEM_WORKSPACE when key collides.
  const topicByKey = new Map<string, { id: string; key: string; name: string }>();
  for (const t of topics) {
    const existing = topicByKey.get(t.key);
    if (!existing || t.workspaceId === workspaceId) {
      topicByKey.set(t.key, { id: t.id, key: t.key, name: t.name });
    }
  }
  const canonicalTopics = Array.from(topicByKey.values());

  const answers = await uncheckedPrisma.answerLibraryItem.findMany({
    where: { workspaceId, topicId: { in: canonicalTopics.map((t) => t.id) } },
    select: { id: true, topicId: true, status: true, subControlKey: true },
  });

  const topicRows: TopicCoverageRow[] = canonicalTopics.map((t) => {
    const topicAnswers = answers.filter((a) => a.topicId === t.id);
    const approved = topicAnswers.filter((a) => a.status === "APPROVED");
    const drafts = topicAnswers.filter((a) => a.status === "DRAFT");
    const archived = topicAnswers.filter((a) => a.status === "ARCHIVED");

    const taxonomy = SUBCONTROLS_BY_TOPIC_KEY[t.key] ?? [];
    const subControlCoverage = taxonomy.map((sc) => ({
      key: sc.key,
      label: sc.label,
      approvedCount: approved.filter((a) => a.subControlKey === sc.key).length,
      draftCount: drafts.filter((a) => a.subControlKey === sc.key).length,
    }));
    const missingSubControls = subControlCoverage
      .filter((c) => c.approvedCount === 0 && c.draftCount === 0)
      .map((c) => c.key);

    return {
      topicId: t.id,
      topicKey: t.key,
      topicName: t.name,
      approvedCount: approved.length,
      draftCount: drafts.length,
      archivedCount: archived.length,
      subControlCoverage,
      missingSubControls,
    };
  });

  topicRows.sort((a, b) => {
    // Surface topics that have evidence but no approved answer first — they
    // are the fastest wins for the reviewer.
    const aNeedsReview = (topicsWithChunkHits.has(a.topicId) ? 1 : 0) + (a.draftCount > 0 && a.approvedCount === 0 ? 1 : 0);
    const bNeedsReview = (topicsWithChunkHits.has(b.topicId) ? 1 : 0) + (b.draftCount > 0 && b.approvedCount === 0 ? 1 : 0);
    if (aNeedsReview !== bNeedsReview) return bNeedsReview - aNeedsReview;
    return a.topicName.localeCompare(b.topicName);
  });

  const topicsWithApprovedAnswers = topicRows.filter((t) => t.approvedCount > 0).length;
  const totalApprovedAnswers = topicRows.reduce((acc, t) => acc + t.approvedCount, 0);
  const totalDraftAnswers = topicRows.reduce((acc, t) => acc + t.draftCount, 0);
  const missingSubControlCount = topicRows.reduce((acc, t) => acc + t.missingSubControls.length, 0);

  return {
    workspaceId,
    documentCount: documents.length,
    chunkCount,
    classifiedChunkCount,
    orphanChunkCount,
    orphanChunkPct,
    uniqueTopicsWithChunks: topicsWithChunkHits.size,
    topicsWithApprovedAnswers,
    totalApprovedAnswers,
    totalDraftAnswers,
    missingSubControlCount,
    topics: topicRows,
    unusedDocuments,
  };
}
