-- Answer version audit trail + workspace policy for body edits while approved
ALTER TABLE "Workspace" ADD COLUMN "allowApprovedAnswerBodyEditWithoutReapproval" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "AnswerLibraryItemVersion" ADD COLUMN "title" TEXT;
ALTER TABLE "AnswerLibraryItemVersion" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "AnswerLibraryItemVersion" ADD COLUMN "approverId" TEXT;
ALTER TABLE "AnswerLibraryItemVersion" ADD COLUMN "evidenceSnapshotJson" JSONB;
ALTER TABLE "AnswerLibraryItemVersion" ADD COLUMN "changeDiffJson" JSONB;
ALTER TABLE "AnswerLibraryItemVersion" ADD COLUMN "resetApprovalRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AnswerLibraryItemVersion" ADD COLUMN "changeKind" TEXT;
