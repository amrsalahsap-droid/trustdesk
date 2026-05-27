import type { WorkspaceRole } from "@prisma/client";
import type { Permission } from "./permissions";

export type AuthIdentity = {
  userId: string;
};

export type AuthContext = {
  userId: string;
  workspaceId: string;
  membershipId: string;
  role: WorkspaceRole;
  permissions: Permission[];
};

export type MembershipResolution = {
  workspaceId: string;
  membershipId: string;
  role: WorkspaceRole;
  permissions: Permission[];
  isProfileComplete: boolean;
};
