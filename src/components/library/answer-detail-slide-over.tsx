"use client";

import { useEffect, useState } from "react";
import type { AnswerBlock, AnswerDetailItem, EvidenceSnippet } from "@/components/library/library-types";
import type { WorkspaceMemberOption } from "@/components/library/answer-form-slide-over";
import { AnswerShell, ANSWER_SHELL_Z } from "@/components/library/answer/answer-shell";
import { AlertCircleIcon } from "@/components/icons";
import { PermissionGuard } from "@/components/auth/permission-guard";
import { AnswerGovernanceInfo } from "@/components/library/AnswerGovernanceInfo";
// Note: Workflow actions are now unified in StickyApprovalFooter
// The duplicate AnswerWorkflowActions inline section has been removed 
import type {
  AnswerApprovalScope,
  AnswerGovernanceStatus,
  AnswerStatus,
} from "@prisma/client";
import { getAnswerExportSafetyTier } from "@/lib/knowledge/answer-export-safety";
import { Permission } from "@/lib/auth/permissions";
import { OVERRIDE_REASON_LABELS } from "@/lib/knowledge/override-reason";
import { useWorkflowActions } from "@/lib/knowledge/use-workflow-actions";

import { ApprovalDrawerHeader } from "@/components/library/answer/approval-drawer/ApprovalDrawerHeader";
import { ApprovalSummaryBlock } from "@/components/library/answer/approval-drawer/ApprovalSummaryBlock";
import { EvidenceSection } from "@/components/library/answer/approval-drawer/EvidenceSection";
import { GovernanceSection } from "@/components/library/answer/approval-drawer/GovernanceSection";
import { WorkflowHistorySection } from "@/components/library/answer/approval-drawer/WorkflowHistorySection";
import { StickyApprovalFooter } from "@/components/library/answer/approval-drawer/StickyApprovalFooter";

interface AnswerDetailSlideOverProps {
  answer: AnswerBlock | null;
  onClose: () => void;
  onEdit: (answer: AnswerBlock) => void;
  onSuccess?: () => void;
  workspaceId: string;
  workspaceMembers?: WorkspaceMemberOption[];
  refreshKey?: number;
}

function mapEvidenceFromDetail(detail: AnswerDetailItem): EvidenceSnippet[] {
  if (!detail.evidence?.length) return [];
  return detail.evidence.map((e) => ({
    docName: e.chunk.sourceDocument.filename,
    content: e.chunk.text,
    page: e.chunk.metadata?.page ?? e.chunk.chunkIndex + 1,
  }));
}

export function AnswerDetailSlideOver({ answer, onClose, onEdit, onSuccess, workspaceId, workspaceMembers = [], refreshKey }: AnswerDetailSlideOverProps) {
  const [detail, setDetail] = useState<AnswerDetailItem | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [auth, setAuth] = useState<{ userId: string; role: string; permissions: Permission[] } | null>(null);

  const workflow = useWorkflowActions(
    detail 
      ? {
          id: detail.id,
          governanceStatus: detail.governanceStatus,
          status: detail.status,
          ownerId: detail.ownerId,
          approverId: detail.approverId,
        }
      : null,
    auth
      ? {
          userId: auth.userId,
          role: auth.role,
          permissions: auth.permissions,
        }
      : null,
    workspaceId,
    () => {
      void refetchDetail();
      onSuccess?.();
    }
  );

  // Workflow action handlers using unified workflow hook
  const handleSubmitForReview = () => workflow.executeAction("submitForApproval");
  const handleApproveInternal = () => workflow.executeAction("approveInternal");
  const handleApproveForExport = () => workflow.executeAction("approveForExport");
  const handleRequestRevision = () => workflow.executeAction("requestRevision");
  const handleReject = async () => {
    const confirmed = window.confirm("Reject this answer? It will be archived and hidden from the main library.");
    if (!confirmed) return;
    await workflow.executeAction("reject");
    onClose();
  };
  const handleArchive = async () => {
    const confirmed = window.confirm("Archive this answer? It will be removed from the main library.");
    if (!confirmed) return;
    await workflow.executeAction("archive");
    onClose();
  };

  const [detailTab, setDetailTab] = useState<"overview" | "history">("overview");

  useEffect(() => {
    setDetailTab("overview");
  }, [answer?.id]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/auth/context", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((d: { userId?: string; role?: string; permissions?: Permission[] }) => {
        if (cancelled || !d.userId) return;
        setAuth({
          userId: d.userId,
          role: d.role ?? "VIEWER",
          permissions: Array.isArray(d.permissions) ? d.permissions : [],
        });
      })
      .catch(() => { });
    return () => {
      cancelled = true;
    };
  }, []);

  const refetchDetail = async () => {
    if (!answer?.id || !workspaceId) return;
    const res = await fetch(`/api/knowledge/answers/${answer.id}`, {
      headers: { "x-workspace-id": workspaceId },
    });
    const data: { item?: AnswerDetailItem } = await res.json();
    if (res.ok && data.item) setDetail(data.item);
  };

  useEffect(() => {
    if (!answer || !answer.id || !workspaceId) {
      setDetail(null);
      return;
    }
    const answerId = answer.id;
    setDetail(null);
    setIsLoading(true);
    let cancelled = false;
    async function fetchDetail() {
      try {
        const res = await fetch(`/api/knowledge/answers/${answerId}`, {
          headers: { "x-workspace-id": workspaceId },
        });
        const data: { item?: AnswerDetailItem } = await res.json();
        if (cancelled) return;
        if (res.ok && data.item) {
          setDetail(data.item);
        } else {
          setDetail(null);
        }
      } catch (err) {
        console.error("Detail: Failed to fetch answer details", err);
        if (!cancelled) setDetail(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void fetchDetail();
    return () => {
      cancelled = true;
    };
  }, [answer?.id, workspaceId, refreshKey]);

  const handleInlineUpdate = async (data: { ownerId?: string | null; approverId?: string | null }) => {
    if (!answer) return;
    const res = await fetch(`/api/knowledge/answers/${answer.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-workspace-id": workspaceId,
      },
      body: JSON.stringify({ ...data, changeReason: "Ownership updated" }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.item) {
        setDetail(data.item);
      }
      onSuccess?.();
    }
  };


  if (!answer) return null;

  const display = detail ?? null;
  const title = display?.title ?? answer.title;
  const body = display?.answer ?? answer.answer;
  const status = display?.status ?? answer.status ?? "DRAFT";
  const currentVersion = display?.currentVersion ?? answer.currentVersion ?? 1;
  const topicName = display?.topic?.name ?? answer.topic?.name ?? "Topic";
  const ownerLabel = display?.ownerUser?.name ?? display?.owner ?? answer.ownerUser?.name ?? answer.owner ?? "Unassigned";
  const approverLabel = display?.approverUser?.name ?? (answer as any).approverUser?.name ?? undefined;
  const updatedAtRaw = display?.updatedAt ?? answer.updatedAt;
  const confidenceScore = display?.confidenceScore ?? answer.confidenceScore ?? null;
  const governance = (display?.governanceStatus ?? "DRAFT") as AnswerGovernanceStatus;
  
  // Determine drawer mode based on governance status
  const getDrawerMode = (): import("@/components/library/answer/approval-drawer/StickyApprovalFooter").DrawerMode => {
    if (status === "ARCHIVED") return "archived";
    if (governance === "APPROVED_INTERNAL" || governance === "APPROVED_FOR_EXPORT") return "approved";
    if (governance === "IN_REVIEW") return "review";
    return "view";
  };
  const drawerMode = getDrawerMode();

  const evidence = display ? mapEvidenceFromDetail(display) : (answer?.evidence || []);
  const versions = display?.versions || [];

  const tier = getAnswerExportSafetyTier({
    status: status as AnswerStatus,
    governanceStatus: governance,
    approvalScope: (display?.approvalScope ?? "INTERNAL_ONLY") as AnswerApprovalScope,
    exportSafe: display?.exportSafe === true,
    nextReviewDueAt: display?.nextReviewDueAt ? new Date(display.nextReviewDueAt) : null,
  });

  return (
    <AnswerShell zIndex={ANSWER_SHELL_Z.detail} onBackdropClick={onClose}>
      <div className="flex min-h-0 flex-1 flex-col h-full">
        <ApprovalDrawerHeader
          topicName={topicName}
          title={title}
          status={status as AnswerStatus}
          governanceStatus={governance}

          ownerLabel={ownerLabel}
          approverLabel={approverLabel}
          updatedAtRaw={updatedAtRaw}
          currentVersion={currentVersion}
          confidenceScore={confidenceScore}
          evidenceCount={evidence.length}
          onClose={onClose}
        />

        <div className="custom-scrollbar flex-1 overflow-y-auto bg-surface-panel/20">
          {isLoading && !detail ? (
            <div className="flex h-64 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent-primary border-t-transparent" />
            </div>
          ) : !detail && !isLoading ? (
            <div className="flex h-64 flex-col items-center justify-center text-center p-8">
              <AlertCircleIcon className="h-12 w-12 text-text-muted opacity-30 mb-4" />
              <h3 className="text-sm font-bold text-text-primary">Answer not found</h3>
              <p className="text-xs text-text-muted max-w-xs mt-1">This item may have been removed or you lack permission to view it.</p>
            </div>
          ) : (
            <div className="p-6 space-y-6 pb-12 max-w-4xl mx-auto">
              {/* Status Summary Block */}
              <ApprovalSummaryBlock
                status={status as AnswerStatus}
                governanceStatus={governance}
                confidenceScore={confidenceScore}
                currentVersion={currentVersion}
                isModified={currentVersion > 1}
                overrideReason={display?.overrideReasonCategory ? (OVERRIDE_REASON_LABELS as any)[display.overrideReasonCategory] : undefined}
              />


              {/* Official Answer Section */}
              <section className="space-y-4">
                <h3 className="text-sm font-bold uppercase tracking-wider text-text-primary">Official Library Answer</h3>
                <div className="rounded-2xl border border-surface-border bg-surface-base p-6 shadow-sm ring-1 ring-black/5">
                  <div className="max-w-none">
                    <p className="text-[17px] leading-relaxed text-text-primary whitespace-pre-wrap font-medium">
                      {body || "No response content entered yet."}
                    </p>
                  </div>
                </div>
              </section>

              {/* Workflow actions are now unified in StickyApprovalFooter at bottom */}

              {/* Governance & Metadata Section */}
              <GovernanceSection
                ownerLabel={ownerLabel}
                approverLabel={approverLabel || "Unassigned"}
                approvalScope={(display?.approvalScope ?? "INTERNAL_ONLY") as AnswerApprovalScope}
                governanceStatus={governance}
                reviewCadence={display?.reviewCadenceDays}
                nextReviewAt={display?.nextReviewDueAt}
                exportEligible={tier === "approved_for_export"}
                overrideReason={display?.overrideReasonCategory ? (OVERRIDE_REASON_LABELS as any)[display.overrideReasonCategory] : undefined}
                overrideComment={display?.overrideComment ?? undefined}
                canManage={auth?.role === "ADMIN" || auth?.role === "OWNER" || auth?.permissions.includes(Permission.ASSIGN_OWNERS)}
                currentOwnerId={display?.ownerId ?? answer.ownerId}
                currentApproverId={display?.approverId ?? (answer as any).approverId}
                members={(workspaceMembers || []).filter(m => !!m.userId).map(m => ({
                  userId: m.userId!,
                  name: m.name,
                  email: m.email,
                }))}
                onUpdate={handleInlineUpdate}
              />



              {/* Evidence Section */}
              <EvidenceSection
                evidence={evidence}
                confidenceScore={confidenceScore}
              />

              {/* History & Audit Section */}
              <WorkflowHistorySection
                answerId={display!.id}
                workspaceId={workspaceId}
                versions={versions}
                currentVersion={currentVersion}
                updatedAtRaw={updatedAtRaw}
              />
            </div>
          )}
        </div>

        {/* Feedback display for workflow actions */}
        {(workflow.lastError || workflow.lastSuccess) && (
          <div className={`px-6 py-3 mx-6 mb-4 rounded-lg text-sm ${
            workflow.lastError 
              ? "bg-semantic-error/10 text-semantic-error border border-semantic-error/20" 
              : "bg-semantic-success/10 text-semantic-success border border-semantic-success/20"
          }`}>
            {workflow.lastError || workflow.lastSuccess}
          </div>
        )}

        <StickyApprovalFooter
          onClose={onClose}
          onEdit={() => onEdit(answer)}
          onSubmitForReview={handleSubmitForReview}
          onApproveInternal={handleApproveInternal}
          onApproveForExport={handleApproveForExport}
          onRequestRevision={handleRequestRevision}
          onReject={handleReject}
          onArchive={handleArchive}
          isLoading={workflow.isAnyLoading}
          mode={drawerMode}
          ownerId={answer.ownerId}
          approverId={answer.approverId}
          userId={auth?.userId}
          governanceStatus={governance}
          role={auth?.role}
          permissions={auth?.permissions || []}
        />
      </div>





    </AnswerShell>
  );
}

