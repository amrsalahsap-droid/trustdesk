-- CreateEnum
CREATE TYPE "ImportedAnswerSource" AS ENUM (
  'raw_import',
  'final_answer_legacy',
  'suggested_answer_legacy',
  'unknown'
);

-- CreateEnum
CREATE TYPE "FinalAnswerSelection" AS ENUM (
  'imported',
  'suggested',
  'edited',
  'canonical_aligned'
);

-- AlterTable
ALTER TABLE "QuestionnaireItem"
  ADD COLUMN "importedAnswer" TEXT,
  ADD COLUMN "importedAnswerSource" "ImportedAnswerSource",
  ADD COLUMN "finalAnswerSelection" "FinalAnswerSelection",
  ADD COLUMN "finalAnswerSelectedAt" TIMESTAMP(3),
  ADD COLUMN "finalAnswerSelectedByUserId" TEXT;
