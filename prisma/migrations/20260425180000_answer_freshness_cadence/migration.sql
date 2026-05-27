-- Answer freshness: cadence defaults and indexes

ALTER TABLE "Workspace" ADD COLUMN "defaultAnswerReviewCadenceDays" INTEGER NOT NULL DEFAULT 90;
ALTER TABLE "Workspace" ADD COLUMN "flagAnswerOnEvidenceChange" BOOLEAN NOT NULL DEFAULT false;

-- ALTER TABLE "KnowledgeTopic" ADD COLUMN "reviewCadenceDays" INTEGER;

ALTER TABLE "AnswerLibraryItem" ADD COLUMN "reviewCadenceDays" INTEGER;

CREATE INDEX "AnswerLibraryItem_workspaceId_nextReviewDueAt_idx" ON "AnswerLibraryItem"("workspaceId", "nextReviewDueAt");
CREATE INDEX "AnswerLibraryItem_workspaceId_governanceStatus_idx" ON "AnswerLibraryItem"("workspaceId", "governanceStatus");

-- Backfill next review deadline for approved library answers missing one
UPDATE "AnswerLibraryItem" AS ali
SET "nextReviewDueAt" = COALESCE(ali."lastReviewedAt", ali."approvedAt", ali."updatedAt")
  + (COALESCE(w."defaultAnswerReviewCadenceDays", 90) * interval '1 day')
FROM "Workspace" AS w
WHERE w."id" = ali."workspaceId"
  AND ali."governanceStatus" IN ('APPROVED_INTERNAL', 'APPROVED_FOR_EXPORT')
  AND ali."nextReviewDueAt" IS NULL
  AND ali."status" = 'APPROVED';
