-- Clear legacy rows that cannot satisfy new required columns / FKs
DELETE FROM "SourceDocument";

-- CreateEnum
CREATE TYPE "SourceDocumentUploadStatus" AS ENUM ('PENDING', 'UPLOADED', 'FAILED', 'DELETED');

-- AlterTable
ALTER TABLE "SourceDocument" ADD COLUMN "uploadedById" TEXT NOT NULL;
ALTER TABLE "SourceDocument" ADD COLUMN "originalName" TEXT NOT NULL;
ALTER TABLE "SourceDocument" ADD COLUMN "mimeType" TEXT NOT NULL;
ALTER TABLE "SourceDocument" ADD COLUMN "fileSizeBytes" INTEGER NOT NULL;
ALTER TABLE "SourceDocument" ADD COLUMN "storageBucket" TEXT NOT NULL;
ALTER TABLE "SourceDocument" ADD COLUMN "uploadStatus" "SourceDocumentUploadStatus" NOT NULL DEFAULT 'PENDING';

-- CreateIndex
CREATE UNIQUE INDEX "SourceDocument_storageKey_key" ON "SourceDocument"("storageKey");

-- CreateIndex
CREATE INDEX "SourceDocument_uploadedById_idx" ON "SourceDocument"("uploadedById");

-- AddForeignKey
ALTER TABLE "SourceDocument" ADD CONSTRAINT "SourceDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
