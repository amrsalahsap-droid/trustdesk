-- Answer Library dedupe fingerprint: enforce "one active seeded draft per
-- (workspace, topic, evidence set, answer text)" at the DB level so concurrent
-- seeding callers (post-parse, discovery, manual, retry) cannot race past the
-- service-layer findFirst+create check and insert duplicate DRAFT rows.

-- CreateEnum
CREATE TYPE "AnswerGenerationScope" AS ENUM ('MANUAL', 'SEEDED');

-- Add missing columns if needed (topicId and status referenced by index)
ALTER TABLE "AnswerLibraryItem" ADD COLUMN IF NOT EXISTS "topicId" TEXT;
ALTER TABLE "AnswerLibraryItem" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'DRAFT';

-- Create AnswerStatus enum if missing
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AnswerStatus') THEN
        CREATE TYPE "AnswerStatus" AS ENUM ('DRAFT', 'APPROVED', 'ARCHIVED');
    END IF;
END $$;

-- AlterTable: add dedupe columns. generationScope defaults to MANUAL so that
-- existing rows stay outside the partial unique index until the cleanup
-- script explicitly promotes them to SEEDED after computing fingerprints.
ALTER TABLE "AnswerLibraryItem"
  ADD COLUMN "generationScope" "AnswerGenerationScope" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "evidenceFingerprint" TEXT,
  ADD COLUMN "contentHash" TEXT;

-- Supporting composite index for fingerprint lookups and scope filters.
CREATE INDEX "AnswerLibraryItem_workspaceId_topicId_generationScope_idx"
  ON "AnswerLibraryItem" ("workspaceId", "topicId", "generationScope");

-- Partial unique index is the real guard: blocks a second non-archived SEEDED
-- row with the same (workspace, topic, evidenceFingerprint, contentHash).
-- Archived rows are excluded so a re-seed after archive stays possible, and
-- MANUAL rows are excluded so human-authored answers are never blocked.
CREATE UNIQUE INDEX "AnswerLibraryItem_seeded_dedupe_key"
  ON "AnswerLibraryItem" ("workspaceId", "topicId", "evidenceFingerprint", "contentHash")
  WHERE "generationScope" = 'SEEDED' AND "status" <> 'ARCHIVED';

-- Create AnswerEvidence table if missing (needed for dedupe operations)
CREATE TABLE IF NOT EXISTS "AnswerEvidence" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "answerId" TEXT NOT NULL,
    "chunkId" TEXT NOT NULL,
    "quote" TEXT,
    "startIndex" INTEGER,
    "endIndex" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnswerEvidence_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AnswerEvidence_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AnswerEvidence_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "AnswerLibraryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Create supporting indexes for AnswerEvidence
CREATE INDEX IF NOT EXISTS "AnswerEvidence_workspaceId_idx" ON "AnswerEvidence"("workspaceId");
CREATE INDEX IF NOT EXISTS "AnswerEvidence_answerId_idx" ON "AnswerEvidence"("answerId");
CREATE INDEX IF NOT EXISTS "AnswerEvidence_chunkId_idx" ON "AnswerEvidence"("chunkId");

-- Evidence-level dedupe: a single answer must not carry two evidence rows for
-- the same chunk. Collapse pre-existing collisions before enforcing uniqueness
-- so the migration succeeds on dirty data.
DELETE FROM "AnswerEvidence" a
USING "AnswerEvidence" b
WHERE a."answerId" = b."answerId"
  AND a."chunkId" = b."chunkId"
  AND a."id" > b."id";

CREATE UNIQUE INDEX "AnswerEvidence_answerId_chunkId_key"
  ON "AnswerEvidence" ("answerId", "chunkId");
