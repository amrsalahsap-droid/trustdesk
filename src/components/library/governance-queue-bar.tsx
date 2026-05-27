"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { WorkspaceRole } from "@prisma/client";
import { UserIcon, ShieldCheckIcon, AlertCircleIcon, ClockIcon, FileIcon } from "@/components/icons";

export interface GovernanceCount {
  my_owned: number;
  my_approvals: number;
  my_stale_owned?: number;
  my_revision_required?: number;
  my_contributions?: number;
  overdue_approvals?: number;
  unowned: number;
  no_approver: number;
  stale_legacy_lastVerified: number;
  freshness: {
    expired: number;
    due_soon: number;
    needs_review: number;
  };
  drafts_awaiting_approval?: number;
  export_blocked?: number;
  override_canonical_review?: number;
  operatorLibraryBlockers?: number;
  operatorQuestionnaireExportMirrorBlocks?: number;
}

interface GovernanceQueueBarProps {
  workspaceId: string;
  /** Navigate when user clicks a queue tile (e.g. `/app/governance?queue=my_owned`). */
  onQueueNavigate: (queueId: string) => void;
  /** User's workspace role for role-aware queue filtering */
  role?: WorkspaceRole;
}

type QueueDef = {
  id: string;
  /** Target for navigation (defaults to `id`). */
  navigateAs?: string;
  label: string;
  description: string;
  icon: typeof UserIcon;
  colorClass: string;
  countClass: string;
  countKey: keyof GovernanceCount | `freshness.${"expired" | "due_soon" | "needs_review"}` | "operatorQuestionnaireExportMirrorBlocks";
};

function readCount(c: GovernanceCount | null, key: QueueDef["countKey"]): number {
  if (!c) return 0;
  if (key === "freshness.expired") return c.freshness.expired;
  if (key === "freshness.due_soon") return c.freshness.due_soon;
  if (key === "freshness.needs_review") return c.freshness.needs_review;
  return (c[key as keyof GovernanceCount] as number) ?? 0;
}

const PERSONAL_DEFS: QueueDef[] = [
  {
    id: "my_owned",
    label: "My answers",
    description: "Answers you own",
    icon: UserIcon,
    colorClass: "border-accent-primary/20 bg-accent-primary/5 text-accent-primary",
    countClass: "text-accent-primary",
    countKey: "my_owned",
  },
  {
    id: "my_approvals",
    label: "My pending approvals",
    description: "In review and assigned to you",
    icon: ShieldCheckIcon,
    colorClass: "border-semantic-info/20 bg-semantic-info/5 text-semantic-info",
    countClass: "text-semantic-info",
    countKey: "my_approvals",
  },
  {
    id: "my_stale_owned",
    label: "My stale reviews",
    description: "Owned answers past review or expired",
    icon: ClockIcon,
    colorClass: "border-semantic-warning-border bg-semantic-warning/10 text-semantic-warning-text",
    countClass: "text-semantic-warning",
    countKey: "my_stale_owned",
  },
  {
    id: "my_revision_required",
    label: "Revision requested",
    description: "Owned answers needing your update",
    icon: AlertCircleIcon,
    colorClass: "border-semantic-error-border bg-semantic-error-bg/30 text-semantic-error",
    countClass: "text-semantic-error",
    countKey: "my_revision_required",
  },
  {
    id: "my_contributions",
    label: "My contributions",
    description: "Answers you have modified",
    icon: FileIcon,
    colorClass: "border-surface-border bg-surface-base text-text-secondary",
    countClass: "text-text-primary",
    countKey: "my_contributions",
  },
];

const OPS_DEFS: QueueDef[] = [
  {
    id: "unowned",
    label: "Unowned",
    description: "No designated owner",
    icon: AlertCircleIcon,
    colorClass: "border-semantic-warning/20 bg-semantic-warning/5 text-semantic-warning",
    countClass: "text-semantic-warning",
    countKey: "unowned",
  },
  {
    id: "no_approver",
    label: "No approver",
    description: "Missing designated approver",
    icon: AlertCircleIcon,
    colorClass: "border-surface-border bg-surface-panel text-text-muted",
    countClass: "text-text-secondary",
    countKey: "no_approver",
  },
  {
    id: "drafts_awaiting_approval",
    label: "Awaiting approval",
    description: "Submitted and in review",
    icon: ShieldCheckIcon,
    colorClass: "border-accent-primary/20 bg-accent-primary/5 text-accent-primary",
    countClass: "text-accent-primary",
    countKey: "drafts_awaiting_approval",
  },
  {
    id: "export_blocked",
    label: "Export risk",
    description: "Restricted or not export-safe for buyers",
    icon: AlertCircleIcon,
    colorClass: "border-semantic-warning-border bg-semantic-warning/10 text-semantic-warning-text",
    countClass: "text-semantic-warning",
    countKey: "export_blocked",
  },
  {
    id: "overdue_approvals",
    label: "Overdue approvals",
    description: "In review for > 7 days",
    icon: ClockIcon,
    colorClass: "border-semantic-error-border bg-semantic-error-bg/20 text-semantic-error",
    countClass: "text-semantic-error",
    countKey: "overdue_approvals",
  },
  {
    id: "override_canonical_review",
    label: "Canonical review",
    description: "Overrides requesting library update",
    icon: FileIcon,
    colorClass: "border-accent-primary/30 bg-accent-primary/5 text-accent-primary",
    countClass: "text-accent-primary",
    countKey: "override_canonical_review",
  },
];

const FRESHNESS_DEFS: QueueDef[] = [
  {
    id: "freshness_expired",
    label: "Review overdue",
    description: "Expired governance or past next review date",
    icon: ClockIcon,
    colorClass: "border-semantic-error-border bg-semantic-error-bg/30 text-semantic-error",
    countClass: "text-semantic-error",
    countKey: "freshness.expired",
  },
  {
    id: "freshness_due_soon",
    label: "Due soon",
    description: "Next review within 14 days",
    icon: ClockIcon,
    colorClass: "border-semantic-warning-border bg-semantic-warning/10 text-semantic-warning-text",
    countClass: "text-semantic-warning",
    countKey: "freshness.due_soon",
  },
  {
    id: "freshness_needs_review",
    label: "Needs review",
    description: "In review, revision, expired, or overdue",
    icon: AlertCircleIcon,
    colorClass: "border-accent-primary/20 bg-accent-primary/5 text-accent-primary",
    countClass: "text-accent-primary",
    countKey: "freshness.needs_review",
  },
];

const OPERATOR_DEFS: QueueDef[] = [
  {
    id: "operator_library_blockers",
    label: "Library blockers",
    description: "In review, revision required, or expired",
    icon: AlertCircleIcon,
    colorClass: "border-semantic-error-border bg-semantic-error-bg/20 text-semantic-error",
    countClass: "text-semantic-error",
    countKey: "operatorLibraryBlockers",
  },
  {
    id: "operator_questionnaire_mirror",
    navigateAs: "questionnaire_export_mirrors",
    label: "Handoff mirror risk",
    description: "Reviewed rows mirroring non-export-safe answers",
    icon: FileIcon,
    colorClass: "border-semantic-warning-border bg-semantic-warning/10 text-semantic-warning-text",
    countClass: "text-semantic-warning",
    countKey: "operatorQuestionnaireExportMirrorBlocks",
  },
];

const OWNER_DEFS: QueueDef[] = [
  {
    id: "my_owned",
    label: "My answers",
    description: "Answers you own",
    icon: UserIcon,
    colorClass: "border-accent-primary/20 bg-accent-primary/5 text-accent-primary",
    countClass: "text-accent-primary",
    countKey: "my_owned",
  },
  {
    id: "my_stale_owned",
    label: "Needs attention",
    description: "Stale reviews or expiring governance",
    icon: ClockIcon,
    colorClass: "border-semantic-warning-border bg-semantic-warning/10 text-semantic-warning-text",
    countClass: "text-semantic-warning",
    countKey: "my_stale_owned",
  },
  {
    id: "my_revision_required",
    label: "Returned for revision",
    description: "Approver requested updates",
    icon: AlertCircleIcon,
    colorClass: "border-semantic-error-border bg-semantic-error-bg/30 text-semantic-error",
    countClass: "text-semantic-error",
    countKey: "my_revision_required",
  },
  {
    id: "unowned",
    label: "Unowned in scope",
    description: "Claim answers in your topics",
    icon: UserIcon,
    colorClass: "border-surface-border bg-surface-base text-text-secondary",
    countClass: "text-text-primary",
    countKey: "unowned",
  },
];

function QueueTileGrid({
  title,
  defs,
  counts,
  loading,
  onQueueNavigate,
}: {
  title: string;
  defs: QueueDef[];
  counts: GovernanceCount | null;
  loading: boolean;
  onQueueNavigate: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted/60">{title}</h3>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {defs.map((def) => {
          const count = readCount(counts, def.countKey);
          const Icon = def.icon;
          const hasItems = count > 0;
          const navId = def.navigateAs ?? def.id;

          return (
            <button
              key={def.id}
              type="button"
              onClick={() => (hasItems ? onQueueNavigate(navId) : undefined)}
              disabled={!hasItems}
              className={`group flex flex-col gap-2 rounded-xl border p-4 text-left transition-all ${
                hasItems
                  ? `${def.colorClass} cursor-pointer hover:shadow-md hover:scale-[1.01]`
                  : "border-surface-border bg-surface-base/30 cursor-not-allowed opacity-50"
              }`}
            >
              <div className="flex items-center justify-between">
                <Icon className={`h-4 w-4 ${hasItems ? "" : "text-text-muted/40"}`} />
                <span
                  className={`text-2xl font-black tabular-nums leading-none ${hasItems ? def.countClass : "text-text-muted/30"}`}
                >
                  {loading ? "—" : count}
                </span>
              </div>
              <div>
                <p className="text-[11px] font-bold text-text-primary leading-tight">{def.label}</p>
                <p className="mt-0.5 text-[10px] leading-snug text-text-muted line-clamp-2">{def.description}</p>
              </div>
              {hasItems && (
                <span className="text-[9px] font-bold uppercase tracking-wide opacity-0 transition-opacity group-hover:opacity-100">
                  Open →
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface GovernanceQueueBarProps {
  workspaceId: string;
  /** Navigate when user clicks a queue tile (e.g. `/app/governance?queue=my_owned`). */
  onQueueNavigate: (queueId: string) => void;
  /** User's workspace role for role-aware queue filtering */
  role?: WorkspaceRole;
  /** Optional key to trigger a refresh of counts */
  refreshKey?: number;
  /** Optional counts from parent (if not provided, component fetches its own) */
  counts?: GovernanceCount | null;
}

export function GovernanceQueueBar({ workspaceId, onQueueNavigate, role, refreshKey, counts: externalCounts }: GovernanceQueueBarProps) {
  const [internalCounts, setInternalCounts] = useState<GovernanceCount | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Use external counts if provided, otherwise use internal state
  const counts = externalCounts !== undefined ? externalCounts : internalCounts;
  
  // Role-based visibility helpers
  const isApprover = role === "APPROVER";
  const isOwner = role === "OWNER";
  const isAdminLike = role === "OWNER" || role === "ADMIN" || role === "OPERATOR";
  const canSeeAdminQueues = isAdminLike;

  useEffect(() => {
    // Skip fetching if external counts are provided
    if (externalCounts !== undefined) {
      setLoading(false);
      return;
    }
    
    if (!workspaceId) return;
    let cancelled = false;

    async function fetchCounts() {
      setLoading(true);
      try {
        const res = await fetch(`/api/knowledge/answers/governance-counts`, {

          headers: { "x-workspace-id": workspaceId },
          cache: "no-store",
        });
        if (!res.ok) {
          if (!cancelled) setInternalCounts(null);
          return;
        }
        const data = (await res.json()) as GovernanceCount;
        if (!cancelled) setInternalCounts(data);
      } catch {
        if (!cancelled) setInternalCounts(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void fetchCounts();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, refreshKey, externalCounts]);

  // Filter queues based on role
  const approverPersonalDefs = PERSONAL_DEFS.filter(d => 
    ["my_approvals", "my_revision_required"].includes(d.id)
  );
  const fullPersonalDefs = PERSONAL_DEFS;
  
  const hasAnyAction =
    !loading &&
    counts &&
    ((isApprover 
      ? approverPersonalDefs.some((d) => readCount(counts, d.countKey) > 0)
      : isOwner
        ? OWNER_DEFS.some((d) => readCount(counts, d.countKey) > 0)
        : fullPersonalDefs.some((d) => readCount(counts, d.countKey) > 0)) ||
      (canSeeAdminQueues && OPS_DEFS.some((d) => readCount(counts, d.countKey) > 0)) ||
      (canSeeAdminQueues && FRESHNESS_DEFS.some((d) => readCount(counts, d.countKey) > 0)) ||
      (canSeeAdminQueues && OPERATOR_DEFS.some((d) => readCount(counts, d.countKey) > 0)) ||
      (canSeeAdminQueues && (counts.stale_legacy_lastVerified ?? 0) > 0));

  if (loading && !counts) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[1, 2, 3, 4].map((j) => (
              <div
                key={j}
                className="h-24 animate-pulse rounded-xl border border-surface-border bg-surface-panel/50"
              />
            ))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-wide text-text-muted">Governance queues</h2>
        <div className="flex items-center gap-3">
          {!hasAnyAction && (
            <span className="text-[10px] font-semibold text-semantic-success">All clear ✓</span>
          )}
          <Link
            href="/app/governance"
            className="text-[10px] font-semibold text-accent-primary hover:underline"
          >
            Governance hub
          </Link>
        </div>
      </div>

      <QueueTileGrid
        title={isApprover ? "My Approval Work" : isOwner ? "My Focused Work" : "Your workload"}
        defs={isApprover ? approverPersonalDefs : isOwner ? OWNER_DEFS : fullPersonalDefs}
        counts={counts}
        loading={loading}
        onQueueNavigate={onQueueNavigate}
      />
      {canSeeAdminQueues && (
        <>
          <QueueTileGrid
            title="Workspace operations"
            defs={OPS_DEFS}
            counts={counts}
            loading={loading}
            onQueueNavigate={onQueueNavigate}
          />
          <QueueTileGrid
            title="Answer freshness"
            defs={FRESHNESS_DEFS}
            counts={counts}
            loading={loading}
            onQueueNavigate={onQueueNavigate}
          />
          <QueueTileGrid
            title="Operator / handoff"
            defs={OPERATOR_DEFS}
            counts={counts}
            loading={loading}
            onQueueNavigate={onQueueNavigate}
          />
        </>
      )}

      {canSeeAdminQueues && counts && counts.stale_legacy_lastVerified > 0 && (
        <p className="text-[10px] text-text-muted">
          {counts.stale_legacy_lastVerified} answer(s) have not been verified in 90+ days (legacy signal).{" "}
          <button
            type="button"
            className="font-semibold text-accent-primary hover:underline"
            onClick={() => onQueueNavigate("stale_legacy_lastVerified")}
          >
            View list
          </button>
        </p>
      )}
    </div>
  );
}

