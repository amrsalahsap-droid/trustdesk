-- Structured override rationale for answers and questionnaire rows
CREATE TYPE "OverrideReasonCategory" AS ENUM (
  'BUYER_REQUESTED_DETAIL',
  'LEGAL_REQUIRED_CHANGE',
  'PRODUCT_LIMITATION_DISCLOSURE',
  'TEMPORARY_EXCEPTION',
  'WORDING_CLARIFICATION',
  'OTHER_WITH_COMMENT'
);

CREATE TYPE "OverrideScope" AS ENUM (
  'QUESTIONNAIRE_ONLY',
  'REQUEST_CANONICAL_UPDATE'
);

ALTER TABLE "AnswerLibraryItem" ADD COLUMN "overrideReasonCategory" "OverrideReasonCategory";
ALTER TABLE "AnswerLibraryItem" ADD COLUMN "overrideComment" TEXT;
ALTER TABLE "AnswerLibraryItem" ADD COLUMN "overrideAt" TIMESTAMP(3);
ALTER TABLE "AnswerLibraryItem" ADD COLUMN "overrideByUserId" TEXT;
ALTER TABLE "AnswerLibraryItem" ADD COLUMN "overrideScope" "OverrideScope";

UPDATE "AnswerLibraryItem"
SET "overrideComment" = "overrideReason"
WHERE "overrideReason" IS NOT NULL AND TRIM("overrideReason") <> '';

ALTER TABLE "QuestionnaireItem" ADD COLUMN "overrideReasonCategory" "OverrideReasonCategory";
ALTER TABLE "QuestionnaireItem" ADD COLUMN "overrideComment" TEXT;
ALTER TABLE "QuestionnaireItem" ADD COLUMN "overrideAt" TIMESTAMP(3);
ALTER TABLE "QuestionnaireItem" ADD COLUMN "overrideByUserId" TEXT;
ALTER TABLE "QuestionnaireItem" ADD COLUMN "overrideScope" "OverrideScope";

CREATE INDEX "AnswerLibraryItem_workspaceId_overrideReasonCategory_idx" ON "AnswerLibraryItem"("workspaceId", "overrideReasonCategory");
CREATE INDEX "QuestionnaireItem_workspaceId_overrideReasonCategory_idx" ON "QuestionnaireItem"("workspaceId", "overrideReasonCategory");

ALTER TABLE "AnswerLibraryItem" ADD CONSTRAINT "AnswerLibraryItem_overrideByUserId_fkey" FOREIGN KEY ("overrideByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QuestionnaireItem" ADD CONSTRAINT "QuestionnaireItem_overrideByUserId_fkey" FOREIGN KEY ("overrideByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
