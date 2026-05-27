-- Create AnswerLibraryItemVersion table if not exists (missing from earlier migrations)
CREATE TABLE IF NOT EXISTS "AnswerLibraryItemVersion" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "answerId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "title" TEXT,
    "answer" TEXT,
    "status" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnswerLibraryItemVersion_pkey" PRIMARY KEY ("id")
);

-- Add indexes for the table if they don't exist
CREATE INDEX IF NOT EXISTS "AnswerLibraryItemVersion_workspaceId_idx" ON "AnswerLibraryItemVersion"("workspaceId");
CREATE INDEX IF NOT EXISTS "AnswerLibraryItemVersion_answerId_idx" ON "AnswerLibraryItemVersion"("answerId");

-- Unique version numbers per answer (concurrency guard for D5-US-03)
CREATE UNIQUE INDEX "AnswerLibraryItemVersion_answerId_versionNumber_key" ON "AnswerLibraryItemVersion"("answerId", "versionNumber");
