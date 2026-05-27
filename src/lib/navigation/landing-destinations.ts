import type { WorkspaceRole } from "@prisma/client";

/**
 * Returns the most relevant landing destination for a specific workspace role.
 */
export function getLandingDestination(role: WorkspaceRole | string | undefined): string {
  if (!role) return "/app/library";
  switch (role) {
    case "OWNER":
    case "ADMIN":
      return "/app";
    
    case "OPERATOR":
      return "/app/questionnaires?status=active";
    
    case "ANSWER_OWNER":
      return "/app/library?queue=my_owned";
    
    case "APPROVER":
      return "/app/governance?queue=my_approvals";
    
    case "CONTRIBUTOR":
      return "/app/library?queue=my_contributions";
    
    case "AUDITOR":
      return "/app/audit";
    
    case "EDITOR":
      return "/app/library";
      
    case "VIEWER":
    default:
      return "/app/library";
  }
}
