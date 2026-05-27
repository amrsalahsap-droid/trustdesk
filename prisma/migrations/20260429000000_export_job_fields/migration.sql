-- Add missing columns to ExportJob table that exist in schema but not in DB

ALTER TABLE "ExportJob" ADD COLUMN IF NOT EXISTS "questionnaireId" TEXT;
ALTER TABLE "ExportJob" ADD COLUMN IF NOT EXISTS "fileName" TEXT;
ALTER TABLE "ExportJob" ADD COLUMN IF NOT EXISTS "storageKey" TEXT;
ALTER TABLE "ExportJob" ADD COLUMN IF NOT EXISTS "storageBucket" TEXT;
ALTER TABLE "ExportJob" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "ExportJob" ADD COLUMN IF NOT EXISTS "exportedById" TEXT;
ALTER TABLE "ExportJob" ADD COLUMN IF NOT EXISTS "exportedAt" TIMESTAMP(3);
ALTER TABLE "ExportJob" ADD COLUMN IF NOT EXISTS "rowCount" INTEGER;
ALTER TABLE "ExportJob" ADD COLUMN IF NOT EXISTS "exportSafeCoverage" DOUBLE PRECISION;
ALTER TABLE "ExportJob" ADD COLUMN IF NOT EXISTS "unresolvedWarnings" JSONB;
ALTER TABLE "ExportJob" ADD COLUMN IF NOT EXISTS "downloadUrl" TEXT;
ALTER TABLE "ExportJob" ADD COLUMN IF NOT EXISTS "fileSize" INTEGER;
ALTER TABLE "ExportJob" ADD COLUMN IF NOT EXISTS "processingStartedAt" TIMESTAMP(3);
ALTER TABLE "ExportJob" ADD COLUMN IF NOT EXISTS "processingCompletedAt" TIMESTAMP(3);
ALTER TABLE "ExportJob" ADD COLUMN IF NOT EXISTS "errorMessage" TEXT;
ALTER TABLE "ExportJob" ADD COLUMN IF NOT EXISTS "metadata" JSONB;

-- Add foreign key constraints
ALTER TABLE "ExportJob" ADD CONSTRAINT "ExportJob_questionnaireId_fkey" 
    FOREIGN KEY ("questionnaireId") REFERENCES "Questionnaire"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ExportJob" ADD CONSTRAINT "ExportJob_exportedById_fkey" 
    FOREIGN KEY ("exportedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add indexes
CREATE INDEX IF NOT EXISTS "ExportJob_questionnaireId_idx" ON "ExportJob"("questionnaireId");
CREATE INDEX IF NOT EXISTS "ExportJob_exportedById_idx" ON "ExportJob"("exportedById");
CREATE INDEX IF NOT EXISTS "ExportJob_status_idx" ON "ExportJob"("status");
CREATE INDEX IF NOT EXISTS "ExportJob_exportedAt_idx" ON "ExportJob"("exportedAt");
