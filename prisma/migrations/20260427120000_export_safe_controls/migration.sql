-- Preserve existing export-eligible answers after splitting exportSafe from approveForExport.
UPDATE "AnswerLibraryItem"
SET "exportSafe" = true
WHERE "governanceStatus" = 'APPROVED_FOR_EXPORT'
  AND "approvalScope" = 'EXPORT_ALLOWED';

ALTER TABLE "Workspace" ADD COLUMN "questionnaireExportStrictBuyerMode" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Workspace" ADD COLUMN "requireApproverExportSafeConfirmation" BOOLEAN NOT NULL DEFAULT true;
