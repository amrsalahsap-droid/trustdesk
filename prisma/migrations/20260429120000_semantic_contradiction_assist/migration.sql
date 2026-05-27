-- AlterTable
ALTER TABLE "KnowledgeTopic" ADD COLUMN "contradictionSemanticAssistEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ContradictionResult" ADD COLUMN "semanticJudgeJson" JSONB;
