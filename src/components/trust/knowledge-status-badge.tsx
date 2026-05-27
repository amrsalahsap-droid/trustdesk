import { StatusSignal } from "@/components/ui/status-signal";

interface KnowledgeStatusBadgeProps {
  status: string | null | undefined;
}

/** Knowledge lifecycle status for answers (draft / approved / archived). */
export function KnowledgeStatusBadge({ status }: KnowledgeStatusBadgeProps) {
  const statusKey = {
    "APPROVED": "ans_approved",
    "ARCHIVED": "ans_archived",
    "DRAFT": "ans_draft",
  }[status?.toUpperCase() || "DRAFT"] as any || "ans_draft";

  return <StatusSignal status={statusKey} />;
}
