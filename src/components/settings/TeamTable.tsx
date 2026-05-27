"use client";

import { DataTable, Column } from "@/components/ui/data-table";
import { StatusBadge, StatusVariant } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { EditIcon, TrashIcon, ShieldCheckIcon, LinkIcon, RefreshIcon } from "@/components/icons";
import { PermissionGuard } from "@/components/auth/permission-guard";
import { Permission } from "@/lib/auth/permissions";
import { format } from "date-fns";
import { useToast } from "@/components/ui/toast";

interface Member {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: string;
  status: string;
  createdAt: string | Date;
  invitedBy?: string;
  inviteToken?: string;
  isInvitation?: boolean;
  mailSent?: boolean;
  mailError?: string | null;
}

interface TeamTableProps {
  members: Member[];
  onEdit: (member: Member) => void;
  onRemove: (member: Member) => void;
  onResend: (member: Member) => void;
}

const STATUS_MAPPING: Record<string, { variant: StatusVariant; label: string }> = {
  ACTIVE: { variant: "ok", label: "Active" },
  INVITED: { variant: "processing", label: "Invited" },
  SUSPENDED: { variant: "warning", label: "Suspended" },
  REMOVED: { variant: "error", label: "Removed" },
  DISABLED: { variant: "error", label: "Disabled" },
  EXPIRED: { variant: "neutral", label: "Expired" },
  REVOKED: { variant: "neutral", label: "Revoked" },
};

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Owner",
  ADMIN: "Workspace Admin",
  OPERATOR: "Response Manager",
  ANSWER_OWNER: "Answer Owner",
  APPROVER: "Approver",
  CONTRIBUTOR: "Contributor / SME",
  AUDITOR: "Auditor",
  VIEWER: "Viewer",
  EDITOR: "Editor",
};

export function TeamTable({ members, onEdit, onRemove, onResend }: TeamTableProps) {
  const { toast } = useToast();
  const columns: Column<Member>[] = [
    {
      key: "user",
      header: "Member",
      render: (m) => (
        <div className="flex flex-col">
          <span className="font-bold text-text-primary">{m.name || "Pending..." }</span>
          <span className="text-xs text-text-muted">{m.email}</span>
        </div>
      ),
    },
    {
      key: "role",
      header: "Role",
      render: (m) => (
        <div className="flex items-center gap-2">
          <ShieldCheckIcon className="h-3.5 w-3.5 text-accent-primary" />
          <span className="text-sm font-medium text-text-secondary">
            {ROLE_LABELS[m.role] || m.role}
          </span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (m) => {
        if (m.isInvitation) {
          if (m.status === "REVOKED") return <StatusBadge variant="neutral" label="Revoked" />;
          if (m.status === "EXPIRED") return <StatusBadge variant="neutral" label="Expired" />;
          
          if (m.mailSent === false) {
            return (
              <div className="flex flex-col gap-1">
                <StatusBadge variant="error" label="Mail Failed" />
                {m.mailError && (
                  <span className="text-[9px] text-semantic-error leading-none max-w-[100px] truncate" title={m.mailError}>
                    {m.mailError}
                  </span>
                )}
              </div>
            );
          }
          if (m.mailSent === true) {
             return <StatusBadge variant="processing" label="Delivered" />;
          }
          return <StatusBadge variant="processing" label="Invited" />;
        }
        
        const config = STATUS_MAPPING[m.status] || { variant: "neutral", label: m.status };
        return <StatusBadge variant={config.variant} label={config.label} />;
      },
    },
    {
      key: "createdAt",
      header: "Joined",
      render: (m) => (
        <div className="flex flex-col text-[11px] leading-tight text-text-muted">
          <span>{format(new Date(m.createdAt), "MMM d, yyyy")}</span>
          {m.invitedBy && (
            <span className="opacity-75 italic truncate max-w-[120px]">
              by {m.invitedBy}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "w-24 text-right",
      render: (m) => (
        <PermissionGuard permission={Permission.MANAGE_MEMBERS}>
          <div className="flex items-center justify-end gap-1">
            {m.status === "INVITED" && m.inviteToken && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-accent-primary hover:bg-accent-primary/10"
                  onClick={async () => {
                    try {
                      const url = `${window.location.origin}/auth/invite/${m.inviteToken}`;
                      await navigator.clipboard.writeText(url);
                      toast({ severity: "success", title: "Invitation link copied", message: "You can now share it manually." });
                    } catch (err) {
                      toast({ severity: "error", title: "Failed to copy link" });
                    }
                  }}
                  title="Copy Invitation Link"
                >
                  <LinkIcon className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-accent-primary hover:bg-accent-primary/10"
                  onClick={() => onResend(m)}
                  title="Resend Invitation Email"
                >
                  <RefreshIcon className="h-4 w-4" />
                </Button>
              </>
            )}
            {!m.isInvitation && (
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 w-8 p-0 hover:bg-surface-base" 
                onClick={() => onEdit(m)}
                title="Edit Role/Status"
              >
                <EditIcon className="h-4 w-4 text-text-muted hover:text-accent-primary transition-colors" />
              </Button>
            )}
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-8 w-8 p-0 text-semantic-error hover:bg-semantic-error/10 hover:text-semantic-error" 
              onClick={() => onRemove(m)}
              title="Remove from Workspace"
            >
              <TrashIcon className="h-4 w-4" />
            </Button>
          </div>
        </PermissionGuard>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={members}
      rowKey={(m) => m.id}
      embedded
    />
  );
}
