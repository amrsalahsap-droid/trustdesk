"use client";

import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { AlertTriangleIcon, TrashIcon, LockIcon, RefreshCwIcon, ArchiveIcon } from "@/components/icons";
import { PermissionGuard } from "@/components/auth/permission-guard";
import { Permission } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";

export function DangerZoneSection() {
  const [isConfirming, setIsConfirming] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const { toast } = useToast();

  const handleAction = async (actionId: string) => {
    setActiveAction(actionId);
    setIsConfirming(true);
  };

  const executeAction = async () => {
    if (!activeAction) return;
    
    setIsExecuting(true);
    try {
      const res = await fetch("/api/workspaces/danger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: activeAction }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || "Failed to perform action");
      }

      toast({
        title: "Success",
        message: "Action completed successfully.",
        severity: "success",
      });
      
      setIsConfirming(false);
      setActiveAction(null);
      
      if (activeAction === "archive") {
        window.location.reload();
      }
    } catch (err) {
      toast({
        title: "Action Failed",
        message: err instanceof Error ? err.message : "An unexpected error occurred.",
        severity: "error",
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const confirmationMessages: Record<string, { title: string; message: string }> = {
    archive: {
      title: "Archive Workspace?",
      message: "This will make the workspace read-only for all members. You will need to contact an owner to reactivate it.",
    },
    "revoke-invites": {
      title: "Revoke All Invitations?",
      message: "All currently pending invitation links will immediately stop working. You will need to re-invite users individually.",
    },
    "reset-export-defaults": {
      title: "Reset All Export Settings?",
      message: "This will overwrite all current export formatting, typography, and content inclusion defaults. This cannot be undone.",
    },
  };

  const activeConf = activeAction ? confirmationMessages[activeAction] : null;

  return (
    <div className="space-y-6">
      <div className="mb-8">
        <h2 className="text-xl font-bold text-semantic-error">Danger Zone</h2>
        <p className="text-sm text-text-muted">High-impact actions that can lead to data loss or workspace suspension.</p>
      </div>

      <div className="space-y-4">
        <PermissionGuard check={(ctx) => ctx.role === "OWNER"}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-semantic-error/20 bg-semantic-error/[0.02]">
            <div>
              <h4 className="text-sm font-semibold text-text-primary">Archive Workspace</h4>
              <p className="text-xs text-text-muted mt-1 max-w-md">
                Make this workspace read-only for all members. This action is reversible by an owner.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="border-semantic-error/20 hover:bg-semantic-error/10 text-semantic-error shrink-0"
              onClick={() => handleAction("archive")}
            >
              <ArchiveIcon className="h-4 w-4 mr-2 opacity-70" />
              Archive Workspace
            </Button>
          </div>
        </PermissionGuard>

        <PermissionGuard permission={Permission.MANAGE_SETTINGS}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-white/5 bg-white/[0.02]">
            <div>
              <h4 className="text-sm font-semibold text-text-primary">Revoke Pending Invites</h4>
              <p className="text-xs text-text-muted mt-1 max-w-md">
                Cancel all outstanding team invitations that haven't been accepted yet.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="border-white/10 hover:bg-white/5 text-text-primary shrink-0"
              onClick={() => handleAction("revoke-invites")}
            >
              <LockIcon className="h-4 w-4 mr-2 opacity-70" />
              Revoke All
            </Button>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-white/5 bg-white/[0.02]">
            <div>
              <h4 className="text-sm font-semibold text-text-primary">Reset Export Defaults</h4>
              <p className="text-xs text-text-muted mt-1 max-w-md">
                Clear all custom export settings and return to the system defaults.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="border-white/10 hover:bg-white/5 text-text-primary shrink-0"
              onClick={() => handleAction("reset-export-defaults")}
            >
              <RefreshCwIcon className="h-4 w-4 mr-2 opacity-70" />
              Reset Defaults
            </Button>
          </div>
        </PermissionGuard>
      </div>

      <Modal 
        isOpen={isConfirming} 
        onClose={() => !isExecuting && setIsConfirming(false)}
        title={activeConf?.title || "Confirm Action"}
      >
        <div className="p-6 space-y-6">
          <div className="flex items-start gap-4 p-4 bg-semantic-error/5 border border-semantic-error/10 rounded-xl">
            <div className="h-8 w-8 shrink-0 rounded-full bg-semantic-error/10 flex items-center justify-center text-semantic-error">
              <AlertTriangleIcon className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-bold text-text-primary">Warning: Destructive Action</p>
              <p className="text-xs text-text-muted leading-relaxed">
                {activeConf?.message}
              </p>
            </div>
          </div>

          <p className="text-xs text-text-muted text-center px-4">
            By proceeding, you acknowledge that this action will be recorded in the workspace audit log and may impact all team members.
          </p>

          <div className="flex items-center gap-3 pt-2">
            <Button 
              variant="outline" 
              className="flex-1" 
              onClick={() => setIsConfirming(false)}
              disabled={isExecuting}
            >
              Cancel
            </Button>
            <Button 
              variant="danger" 
              className="flex-1" 
              onClick={executeAction}
              loading={isExecuting}
              leftIcon={<TrashIcon className="h-4 w-4" />}
            >
              Confirm & Execute
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
