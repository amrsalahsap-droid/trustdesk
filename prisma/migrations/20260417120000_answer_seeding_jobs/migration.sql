-- CreateEnum
CREATE TYPE "AnswerSeedingJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AnswerSeedingTopicRunStatus" AS ENUM ('PENDING', 'SKIPPED_NO_EVIDENCE', 'SKIPPED_EXISTS', 'SUCCEEDED', 'FAILED');

-- Create KnowledgeTopic table if missing (needed for foreign key)
CREATE TABLE IF NOT EXISTS "KnowledgeTopic" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "ownerId" TEXT,
    "approverId" TEXT,
    "isRecommended" BOOLEAN NOT NULL DEFAULT false,
    "suggestionReason" TEXT,
    "reviewCadenceDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeTopic_pkey" PRIMARY KEY ("id")
);

-- CreateIndex for KnowledgeTopic
CREATE UNIQUE INDEX IF NOT EXISTS "KnowledgeTopic_workspaceId_key_key" ON "KnowledgeTopic"("workspaceId", "key");
CREATE INDEX IF NOT EXISTS "KnowledgeTopic_workspaceId_idx" ON "KnowledgeTopic"("workspaceId");
CREATE INDEX IF NOT EXISTS "KnowledgeTopic_key_idx" ON "KnowledgeTopic"("key");

-- AddForeignKey for KnowledgeTopic
ALTER TABLE "KnowledgeTopic" ADD CONSTRAINT "KnowledgeTopic_workspaceId_fkey" 
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "AnswerSeedingJob" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "status" "AnswerSeedingJobStatus" NOT NULL DEFAULT 'QUEUED',
    "triggerSourceDocumentId" TEXT,
    "triggerParseJobId" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "lastError" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnswerSeedingJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnswerSeedingTopicRun" (
    "id" TEXT NOT NULL,
    "seedingJobId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "status" "AnswerSeedingTopicRunStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "answerLibraryItemId" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnswerSeedingTopicRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnswerSeedingJob_workspaceId_createdAt_idx" ON "AnswerSeedingJob"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "AnswerSeedingJob_workspaceId_status_idx" ON "AnswerSeedingJob"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "AnswerSeedingTopicRun_seedingJobId_status_idx" ON "AnswerSeedingTopicRun"("seedingJobId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AnswerSeedingTopicRun_seedingJobId_topicId_key" ON "AnswerSeedingTopicRun"("seedingJobId", "topicId");

-- AddForeignKey
ALTER TABLE "AnswerSeedingJob" ADD CONSTRAINT "AnswerSeedingJob_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerSeedingTopicRun" ADD CONSTRAINT "AnswerSeedingTopicRun_seedingJobId_fkey" FOREIGN KEY ("seedingJobId") REFERENCES "AnswerSeedingJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerSeedingTopicRun" ADD CONSTRAINT "AnswerSeedingTopicRun_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "KnowledgeTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
