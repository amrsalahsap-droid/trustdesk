-- AlterTable
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Workspace" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "WorkspaceMembership" ALTER COLUMN "updatedAt" DROP DEFAULT;
