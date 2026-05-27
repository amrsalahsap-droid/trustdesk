-- Create missing enums if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AnswerGovernanceStatus') THEN
        CREATE TYPE "AnswerGovernanceStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED_INTERNAL', 'APPROVED_FOR_EXPORT', 'REVISION_REQUIRED', 'REJECTED', 'EXPIRED', 'ARCHIVED');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AnswerApprovalScope') THEN
        CREATE TYPE "AnswerApprovalScope" AS ENUM ('INTERNAL_ONLY', 'EXPORT_ALLOWED');
    END IF;
END $$;

-- Add missing columns if they don't exist
ALTER TABLE "AnswerLibraryItem" ADD COLUMN IF NOT EXISTS "governanceStatus" "AnswerGovernanceStatus" NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "AnswerLibraryItem" ADD COLUMN IF NOT EXISTS "approvalScope" "AnswerApprovalScope" NOT NULL DEFAULT 'INTERNAL_ONLY';
ALTER TABLE "AnswerLibraryItem" ADD COLUMN IF NOT EXISTS "exportSafe" BOOLEAN NOT NULL DEFAULT false;

-- Legacy: status APPROVED with default governance DRAFT → treat as internally approved for matcher alignment.
UPDATE "AnswerLibraryItem"
SET "governanceStatus" = 'APPROVED_INTERNAL'::"AnswerGovernanceStatus",
    "approvalScope" = 'INTERNAL_ONLY'::"AnswerApprovalScope",
    "exportSafe" = false
WHERE "status" = 'APPROVED'
  AND "governanceStatus" = 'DRAFT'::"AnswerGovernanceStatus";
