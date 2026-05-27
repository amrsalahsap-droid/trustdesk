-- Allow workspace policy: owner may approve their own answers when true.
ALTER TABLE "Workspace" ADD COLUMN "allowOwnerSelfApprove" BOOLEAN NOT NULL DEFAULT false;
