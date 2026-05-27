import { WorkspaceRole } from "@prisma/client";

/**
 * TrustDesk granular permissions.
 * These are mapped to WorkspaceRoles and used to enforce access control
 * in both the backend and frontend.
 */
export enum Permission {
  // Admin / Workspace Management
  MANAGE_MEMBERS = "MANAGE_MEMBERS",
  MANAGE_SETTINGS = "MANAGE_SETTINGS",
  MANAGE_WORKSPACE = "MANAGE_WORKSPACE", // High-risk: Archive, Reset
  VIEW_AUDIT = "VIEW_AUDIT",
  
  // Knowledge Base / Answer Governance
  MANAGE_TOPICS = "MANAGE_TOPICS",
  EDIT_ANSWERS = "EDIT_ANSWERS",
  APPROVE_ANSWERS = "APPROVE_ANSWERS",
  PROMOTE_DRAFTS = "PROMOTE_DRAFTS", // Convert AI suggestions to library
  ASSIGN_OWNERS = "ASSIGN_OWNERS",
  DELEGATE_WORK = "DELEGATE_WORK", // Assigning others to rows/answers
  REQUIRE_REVISION = "REQUIRE_REVISION",
  SUBMIT_FOR_APPROVAL = "SUBMIT_FOR_APPROVAL",
  SUGGEST_EDITS = "SUGGEST_EDITS",
  BULK_EDIT_LIBRARY = "BULK_EDIT_LIBRARY",
  
  // Questionnaire Operations
  IMPORT_QUESTIONNAIRES = "IMPORT_QUESTIONNAIRES",
  RUN_AI_OPERATIONS = "RUN_AI_OPERATIONS",
  ASSIGN_ROWS = "ASSIGN_ROWS",
  REVIEW_ROWS = "REVIEW_ROWS",
  BULK_REVIEW_QUESTIONNAIRE = "BULK_REVIEW_QUESTIONNAIRE",
  EXPORT_INTERNAL = "EXPORT_INTERNAL", // CSV, internal drafts
  EXPORT_EXTERNAL = "EXPORT_EXTERNAL", // Final customer XLSX
  EXPORT_DATA = "EXPORT_DATA", // Legacy/General export access
  
  // Content / Evidence / History
  VIEW_ANSWERS = "VIEW_ANSWERS",
  VIEW_EVIDENCE = "VIEW_EVIDENCE",
  VIEW_HISTORY = "VIEW_HISTORY",
  VIEW_ASSIGNED_ONLY = "VIEW_ASSIGNED_ONLY", // Restrictive visibility
  UPLOAD_EVIDENCE = "UPLOAD_EVIDENCE",
  MANAGE_DOCUMENTS = "MANAGE_DOCUMENTS",
  COMMENT = "COMMENT",
}

/**
 * Centralized Role -> Permission mapping.
 * Follows the TrustDesk Permission Matrix.
 */
export const RolePermissions: Record<WorkspaceRole, Permission[]> = {
  OWNER: Object.values(Permission),
  
  ADMIN: [
    Permission.MANAGE_MEMBERS,
    Permission.MANAGE_SETTINGS,
    Permission.MANAGE_WORKSPACE,
    Permission.VIEW_AUDIT,
    Permission.MANAGE_TOPICS,
    Permission.EDIT_ANSWERS,
    Permission.APPROVE_ANSWERS,
    Permission.PROMOTE_DRAFTS,
    Permission.VIEW_ASSIGNED_ONLY,
    Permission.ASSIGN_OWNERS,
    Permission.DELEGATE_WORK,
    Permission.REQUIRE_REVISION,
    Permission.SUBMIT_FOR_APPROVAL,
    Permission.SUGGEST_EDITS,
    Permission.BULK_EDIT_LIBRARY,
    Permission.IMPORT_QUESTIONNAIRES,
    Permission.RUN_AI_OPERATIONS,
    Permission.ASSIGN_ROWS,
    Permission.REVIEW_ROWS,
    Permission.BULK_REVIEW_QUESTIONNAIRE,
    Permission.EXPORT_INTERNAL,
    Permission.EXPORT_EXTERNAL,
    Permission.EXPORT_DATA,
    Permission.VIEW_ANSWERS,
    Permission.VIEW_EVIDENCE,
    Permission.VIEW_HISTORY,
    Permission.UPLOAD_EVIDENCE,
    Permission.MANAGE_DOCUMENTS,
    Permission.COMMENT,
  ],
  
  OPERATOR: [
    Permission.IMPORT_QUESTIONNAIRES,
    Permission.RUN_AI_OPERATIONS,
    Permission.EDIT_ANSWERS,
    Permission.ASSIGN_ROWS,
    Permission.REVIEW_ROWS,
    Permission.BULK_REVIEW_QUESTIONNAIRE,
    Permission.PROMOTE_DRAFTS,
    Permission.DELEGATE_WORK,
    Permission.EXPORT_INTERNAL,
    Permission.EXPORT_DATA,
    Permission.VIEW_ANSWERS,
    Permission.VIEW_EVIDENCE,
    Permission.VIEW_HISTORY,
    Permission.UPLOAD_EVIDENCE,
    Permission.MANAGE_DOCUMENTS,
    Permission.COMMENT,
    Permission.MANAGE_TOPICS,
  ],
  
  ANSWER_OWNER: [
    Permission.EDIT_ANSWERS,
    Permission.VIEW_EVIDENCE,
    Permission.VIEW_ANSWERS,
    Permission.VIEW_HISTORY,
    Permission.SUBMIT_FOR_APPROVAL,
    Permission.COMMENT,
    Permission.UPLOAD_EVIDENCE,
  ],
  
  APPROVER: [
    Permission.APPROVE_ANSWERS,
    Permission.REQUIRE_REVISION,
    Permission.VIEW_ANSWERS,
    Permission.VIEW_EVIDENCE,
    Permission.VIEW_HISTORY,
    Permission.COMMENT,
    Permission.EXPORT_EXTERNAL, 
    Permission.EXPORT_DATA,
  ],
  
  CONTRIBUTOR: [
    Permission.COMMENT,
    Permission.UPLOAD_EVIDENCE,
    Permission.SUGGEST_EDITS,
    Permission.VIEW_ANSWERS,
    Permission.VIEW_EVIDENCE,
    Permission.VIEW_HISTORY,
    Permission.REVIEW_ROWS,
    Permission.VIEW_ASSIGNED_ONLY,
  ],
  
  AUDITOR: [
    Permission.VIEW_ANSWERS,
    Permission.VIEW_EVIDENCE,
    Permission.VIEW_HISTORY,
    Permission.VIEW_AUDIT,
  ],
  
  // Legacy roles (Mapped to closest modern roles)
  EDITOR: [
    Permission.EDIT_ANSWERS,
    Permission.VIEW_ANSWERS,
    Permission.VIEW_EVIDENCE,
    Permission.VIEW_HISTORY,
    Permission.COMMENT,
    Permission.UPLOAD_EVIDENCE,
    Permission.SUBMIT_FOR_APPROVAL,
  ],
  
  VIEWER: [
    Permission.VIEW_ANSWERS,
    Permission.VIEW_EVIDENCE,
    Permission.VIEW_HISTORY,
  ],
};

/**
 * Resolves all permissions granted to a specific role.
 */
export function getPermissionsForRole(role: WorkspaceRole): Permission[] {
  return RolePermissions[role] || [];
}

/**
 * Checks if a role has a specific permission.
 */
export function hasPermission(role: WorkspaceRole, permission: Permission): boolean {
  return getPermissionsForRole(role).includes(permission);
}
