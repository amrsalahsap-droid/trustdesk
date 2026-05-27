"use client";

import { Permission, RolePermissions } from "@/lib/auth/permissions";
import { WorkspaceRole } from "@prisma/client";
import { CheckIcon, CloseIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

const ROLES: WorkspaceRole[] = [
  "OWNER",
  "ADMIN",
  "OPERATOR",
  "APPROVER",
  "ANSWER_OWNER",
  "CONTRIBUTOR",
  "AUDITOR",
  "VIEWER"
];

const PERMISSION_GROUPS: { label: string; permissions: Permission[] }[] = [
  {
    label: "Workspace Management",
    permissions: [
      Permission.MANAGE_WORKSPACE,
      Permission.MANAGE_SETTINGS,
      Permission.MANAGE_MEMBERS,
      Permission.VIEW_AUDIT,
    ]
  },
  {
    label: "Answer Library & Governance",
    permissions: [
      Permission.MANAGE_TOPICS,
      Permission.EDIT_ANSWERS,
      Permission.APPROVE_ANSWERS,
      Permission.PROMOTE_DRAFTS,
      Permission.ASSIGN_OWNERS,
      Permission.DELEGATE_WORK,
      Permission.REQUIRE_REVISION,
      Permission.SUBMIT_FOR_APPROVAL,
      Permission.BULK_EDIT_LIBRARY,
    ]
  },
  {
    label: "Questionnaire Operations",
    permissions: [
      Permission.IMPORT_QUESTIONNAIRES,
      Permission.RUN_AI_OPERATIONS,
      Permission.ASSIGN_ROWS,
      Permission.REVIEW_ROWS,
      Permission.BULK_REVIEW_QUESTIONNAIRE,
      Permission.EXPORT_INTERNAL,
      Permission.EXPORT_EXTERNAL,
    ]
  },
  {
    label: "Content & Evidence",
    permissions: [
      Permission.VIEW_ANSWERS,
      Permission.VIEW_EVIDENCE,
      Permission.VIEW_HISTORY,
      Permission.UPLOAD_EVIDENCE,
      Permission.MANAGE_DOCUMENTS,
      Permission.COMMENT,
    ]
  }
];

export function PermissionsReferenceSection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-text-primary">Role Permissions Matrix</h2>
        <p className="text-sm text-text-muted">A reference of what each role can perform within the workspace.</p>
      </div>

      <div className="rounded-xl border border-surface-border bg-surface-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead className="bg-surface-hover text-text-muted font-medium border-b border-surface-border">
              <tr>
                <th className="px-4 py-3 min-w-[200px]">Permission</th>
                {ROLES.map(role => (
                  <th key={role} className="px-4 py-3 text-center min-w-[100px]">
                    <span className="text-[10px] font-bold uppercase tracking-wider">{role.replace("_", " ")}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {PERMISSION_GROUPS.map((group, groupIdx) => (
                <React.Fragment key={group.label}>
                  <tr className="bg-surface-base/50">
                    <td colSpan={ROLES.length + 1} className="px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-text-muted bg-surface-hover/30">
                      {group.label}
                    </td>
                  </tr>
                  {group.permissions.map((perm) => (
                    <tr key={perm} className="hover:bg-surface-hover/50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-text-primary">{perm.replace(/_/g, " ")}</p>
                      </td>
                      {ROLES.map(role => {
                        const hasPerm = RolePermissions[role].includes(perm);
                        return (
                          <td key={role} className="px-4 py-3 text-center">
                            <div className="flex justify-center">
                              {hasPerm ? (
                                <div className="h-5 w-5 rounded-full bg-feedback-success/10 flex items-center justify-center text-feedback-success">
                                  <CheckIcon className="h-3 w-3" />
                                </div>
                              ) : (
                                <CloseIcon className="h-3 w-3 text-text-muted/30" />
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

import React from "react";
