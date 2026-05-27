-- CreateEnum
CREATE TYPE "QuestionnaireExportUnansweredPolicy" AS ENUM ('IGNORE', 'WARN', 'BLOCK');

-- AlterTable
ALTER TABLE "Workspace"
  ADD COLUMN "questionnaireExportUnansweredPolicy" "QuestionnaireExportUnansweredPolicy" NOT NULL DEFAULT 'WARN',
  ADD COLUMN "questionnaireExportMinReviewedPercent" INTEGER;
