-- CreateTable
CREATE TABLE "Questionnaire" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourceFileName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Questionnaire_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionnaireItem" (
    "id" TEXT NOT NULL,
    "questionnaireId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "question" TEXT NOT NULL,
    "suggestedAnswer" TEXT NOT NULL DEFAULT '',
    "reviewStatus" TEXT NOT NULL DEFAULT 'ok',
    "conflictNote" TEXT,
    "confidence" TEXT NOT NULL DEFAULT 'medium',
    "sourcesJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionnaireItem_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "QuestionnaireJob" ADD COLUMN     "originalName" TEXT,
ADD COLUMN     "mimeType" TEXT,
ADD COLUMN     "fileBytes" BYTEA,
ADD COLUMN     "previewJson" JSONB,
ADD COLUMN     "questionnaireId" TEXT,
ADD COLUMN     "errorMessage" TEXT;

ALTER TABLE "QuestionnaireJob" ALTER COLUMN "status" SET DEFAULT 'pending_scan';

-- CreateIndex
CREATE INDEX "Questionnaire_workspaceId_idx" ON "Questionnaire"("workspaceId");

-- CreateIndex
CREATE INDEX "QuestionnaireItem_questionnaireId_idx" ON "QuestionnaireItem"("questionnaireId");

-- CreateIndex
CREATE INDEX "QuestionnaireJob_questionnaireId_idx" ON "QuestionnaireJob"("questionnaireId");

-- AddForeignKey
ALTER TABLE "Questionnaire" ADD CONSTRAINT "Questionnaire_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionnaireItem" ADD CONSTRAINT "QuestionnaireItem_questionnaireId_fkey" FOREIGN KEY ("questionnaireId") REFERENCES "Questionnaire"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionnaireJob" ADD CONSTRAINT "QuestionnaireJob_questionnaireId_fkey" FOREIGN KEY ("questionnaireId") REFERENCES "Questionnaire"("id") ON DELETE SET NULL ON UPDATE CASCADE;
