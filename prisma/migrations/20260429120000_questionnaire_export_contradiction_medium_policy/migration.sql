-- CreateEnum
CREATE TYPE "QuestionnaireExportContradictionMediumPolicy" AS ENUM ('WARN', 'BLOCK');

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN "questionnaireExportContradictionMediumPolicy" "QuestionnaireExportContradictionMediumPolicy" NOT NULL DEFAULT 'WARN';
