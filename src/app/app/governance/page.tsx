"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { GovernanceQueueBar, type GovernanceCount } from "@/components/library/governance-queue-bar";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MetricTile } from "@/components/ui/metric-tile";
import { Skeleton } from "@/components/ui/skeleton";
import type { GovernanceMetricsSnapshot } from "@/lib/knowledge/governance-metrics";
import { isGovernanceQueueId } from "@/lib/knowledge/governance-shared";
import { isOperatorLike, isWorkspaceAdmin } from "@/lib/auth/governance-actions";
import type { WorkspaceRole } from "@prisma/client";
import { Permission } from "@/lib/auth/permissions";
import { RouteGuard, UnauthorizedAlert } from "@/components/auth/RouteGuard";
import { GovernanceActionCard } from "@/components/governance/governance-action-card";
import { 
  UserIcon, 
  ShieldCheckIcon, 
  AlertCircleIcon, 
  ClockIcon, 
  FileIcon,
  SparklesIcon,
  TrendUpIcon,
  CheckIcon
} from "@/components/icons";
import { cn } from "@/lib/utils";

export default function GovernanceHubPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [role, setRole] = useState<string>("VIEWER");
  const [metrics, setMetrics] = useState<GovernanceMetricsSnapshot | null>(null);
  const [counts, setCounts] = useState<GovernanceCount | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (wid: string) => {
    setLoading(true);
    try {
      const [mRes, cRes] = await Promise.all([
        fetch("/api/workspaces/governance/metrics", {
          credentials: "include",
          cache: "no-store",
          headers: { "x-workspace-id": wid },
        }),
        fetch("/api/workspaces/governance/counts", {
          credentials: "include",
          cache: "no-store",
          headers: { "x-workspace-id": wid },
        }),
      ]);
      if (mRes.ok) {
        const m = (await mRes.json()) as GovernanceMetricsSnapshot;
        setMetrics(m);
      } else {
        setMetrics(null);
      }
      if (cRes.ok) {
        setCounts((await cRes.json()) as GovernanceCount);
      } else {
        setCounts(null);
      }
      if (!mRes.ok && !cRes.ok) {
        setLoadError("Could not load governance data.");
      }
    } catch {
      setLoadError("Could not load governance data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/auth/context", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((d: { workspaceId?: string; role?: string }) => {
        if (cancelled || !d.workspaceId) return;
        setWorkspaceId(d.workspaceId);
        setRole(d.role ?? "VIEWER");
        void refresh(d.workspaceId);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  // Role-based visibility helpers
  const isAdminLike = isOperatorLike(role as WorkspaceRole);
  const isApprover = role === "APPROVER";
  const canSeeAdminControls = isAdminLike || isWorkspaceAdmin(role as WorkspaceRole);
  
  // Approver-specific approval counts
  const myPendingApprovals = counts?.my_approvals ?? 0;
  const myRevisionRequired = counts?.my_revision_required ?? 0;
  const myStaleReviews = counts?.my_stale_owned ?? 0;
  const overdueApprovals = counts?.overdue_approvals ?? 0;
  const needsAttention = myPendingApprovals + myRevisionRequired + overdueApprovals;
  
  return (
    <RouteGuard requiredPermissions={[Permission.VIEW_ANSWERS, Permission.APPROVE_ANSWERS]}>
      <div className="space-y-8 pb-20 animate-page-fade">
        <UnauthorizedAlert />
      <PageHeader
        title={isApprover ? "Approval Workspace" : "Governance Workspace"}
        description={isApprover 
          ? "Review, approve, and manage answer quality for internal use and export."
          : "Operational control center for answer ownership, approvals, and export safety."}
        variant="emphasized"
        actions={
          <div className="flex items-center gap-3">
            <Button variant="outline" asChild>
              <Link href="/app/library">Open Answer Library</Link>
            </Button>
            {canSeeAdminControls && (
              <>
                {(counts?.export_blocked ?? 0) > 0 ? (
                  <>
                    <Button variant="outline" onClick={() => workspaceId && refresh(workspaceId)}>
                      Refresh Posture
                    </Button>
                    <Button variant="primary" asChild>
                      <Link href="/app/library?queue=export_blocked">Resolve Blockers</Link>
                    </Button>
                  </>
                ) : (
                  <Button variant="primary" onClick={() => workspaceId && refresh(workspaceId)}>
                    Refresh Posture
                  </Button>
                )}
              </>
            )}
          </div>
        }
      />

      {loadError && (
        <p className="rounded-lg border border-semantic-error-border bg-semantic-error-bg px-4 py-2 text-sm text-semantic-error">
          {loadError}
        </p>
      )}

      {/* Loading Skeletons */}
      {loading && !metrics && (
        <div className="space-y-12">
          <section className="space-y-4">
            <Skeleton className="h-4 w-32 rounded" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-48 rounded-2xl" />
              ))}
            </div>
          </section>
          <section className="space-y-4">
            <Skeleton className="h-4 w-32 rounded" />
            <Skeleton className="h-[400px] rounded-2xl" />
          </section>
        </div>
      )}

      {/* 1. Approver Priority Section - Approval Queue */}
      {!loading && isApprover && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-black uppercase tracking-[0.2em] text-text-muted/60">
              Awaiting My Decision
            </h2>
            {needsAttention === 0 && (
              <span className="text-[11px] font-bold text-semantic-success flex items-center gap-1.5">
                <CheckIcon className="h-3.5 w-3.5" />
                All approvals handled
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <GovernanceActionCard
              title="My Pending Approvals"
              count={myPendingApprovals}
              description="Answers assigned to you for review and approval decision."
              actionLabel="Review Now"
              href="/app/library?queue=my_approvals"
              emphasis={myPendingApprovals > 0 ? "warning" : "default"}
              icon={<ShieldCheckIcon className="h-4 w-4" />}
            />
            <GovernanceActionCard
              title="Needs Revision"
              count={myRevisionRequired}
              description="Answers you reviewed and sent back for improvement."
              actionLabel="Check Status"
              href="/app/library?queue=my_revision_required"
              emphasis={myRevisionRequired > 0 ? "error" : "default"}
              icon={<AlertCircleIcon className="h-4 w-4" />}
            />
            <GovernanceActionCard
              title="Overdue Approvals"
              count={overdueApprovals}
              description="Reviews in queue for more than 7 days requiring attention."
              actionLabel="Review Urgent"
              href="/app/library?queue=overdue_approvals"
              emphasis={overdueApprovals > 0 ? "error" : "default"}
              icon={<ClockIcon className="h-4 w-4" />}
            />
          </div>
        </section>
      )}

      {/* 1b. Admin/Operator Urgent Governance Actions */}
      {!loading && canSeeAdminControls && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-black uppercase tracking-[0.2em] text-text-muted/60">Urgent Actions</h2>
            {metrics && metrics.pendingApprovals === 0 && metrics.unowned === 0 && metrics.missingApprover === 0 && (
               <span className="text-[11px] font-bold text-semantic-success flex items-center gap-1.5">
                 <CheckIcon className="h-3.5 w-3.5" />
                 Governance health is optimal
               </span>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <GovernanceActionCard
              title="Unowned Answers"
              count={metrics?.unowned ?? 0}
              description="Answers without a designated owner cannot be verified or refreshed."
              actionLabel="Assign Owners"
              href="/app/library?queue=unowned"
              emphasis={metrics?.unowned && metrics.unowned > 0 ? "error" : "default"}
              icon={<UserIcon className="h-4 w-4" />}
            />
            <GovernanceActionCard
              title="Missing Approvers"
              count={metrics?.missingApprover ?? 0}
              description="Answers without an approver bypass the four-eyes review principle."
              actionLabel="Assign Approvers"
              href="/app/library?queue=no_approver"
              emphasis={metrics?.missingApprover && metrics.missingApprover > 0 ? "warning" : "default"}
              icon={<ShieldCheckIcon className="h-4 w-4" />}
            />
            <GovernanceActionCard
              title="Pending Approvals"
              count={metrics?.pendingApprovals ?? 0}
              description="Answers submitted for review that are currently blocking library updates."
              actionLabel="Review All"
              href="/app/library?queue=drafts_awaiting_approval"
              emphasis={metrics?.pendingApprovals && metrics.pendingApprovals > 0 ? "warning" : "default"}
              icon={<ClockIcon className="h-4 w-4" />}
            />
          </div>
        </section>
      )}

      {/* 2. Export Readiness Workspace */}
      <section className="space-y-4">
        <h2 className="text-xs font-black uppercase tracking-[0.2em] text-text-muted/60">Export Readiness</h2>
        <Card interactive className="overflow-hidden border-accent-primary/10 shadow-sm ring-1 ring-accent-primary/5">
          <div className="grid grid-cols-1 lg:grid-cols-12">
            <div className="lg:col-span-4 bg-slate-50/40 p-8 border-b lg:border-b-0 lg:border-r border-surface-border">
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-bold text-text-primary">Workspace Export Posture</h3>
                  <p className="text-xs text-text-muted mt-1 leading-relaxed">
                    Percentage of library content safe for external buyer questionnaires.
                  </p>
                </div>
                
                {metrics && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-text-secondary">Readiness Score</span>
                      <span className="text-accent-primary">
                        {metrics.totalGovernedAnswers > 0 
                          ? Math.round((metrics.approvedForExport / metrics.totalGovernedAnswers) * 100) 
                          : 0}%
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-surface-base overflow-hidden">
                      <div 
                        className="h-full bg-accent-primary transition-all duration-1000" 
                        style={{ width: `${metrics.totalGovernedAnswers > 0 ? (metrics.approvedForExport / metrics.totalGovernedAnswers) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div className="space-y-1">
                    <span className="text-[10px] font-black uppercase tracking-wide text-text-muted/60">Export Safe</span>
                    <p className="text-xl font-black text-text-primary tabular-nums">{metrics?.approvedForExport ?? 0}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-black uppercase tracking-wide text-text-muted/60">Internal Only</span>
                    <p className="text-xl font-black text-text-muted tabular-nums">{metrics?.approvedInternal ?? 0}</p>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="lg:col-span-8 p-8 flex flex-col justify-center">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-semantic-warning">
                    <AlertCircleIcon className="h-4 w-4" />
                    <span className="text-xs font-bold uppercase tracking-wider">Export Blockers</span>
                  </div>
                  <p className="text-sm text-text-secondary leading-relaxed">
                    {counts?.export_blocked ?? 0} answers are explicitly blocked or restricted from buyer exports due to sensitivity.
                  </p>
                  <Button variant="outline" size="sm" asChild className="mt-2">
                    <Link href="/app/library?queue=export_blocked">Resolve Blockers</Link>
                  </Button>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-accent-primary">
                    <SparklesIcon className="h-4 w-4" />
                    <span className="text-xs font-bold uppercase tracking-wider">Promotion Pipeline</span>
                  </div>
                  <p className="text-sm text-text-secondary leading-relaxed">
                    Promote high-quality internal answers to export-safe status to increase automation coverage.
                  </p>
                  <Button variant="primary" size="sm" asChild className="mt-2">
                    <Link href="/app/library?filter=approved_internal">Promote to Export</Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </section>

      {/* 3. Role-Aware Queues - Approver sees approval-focused queues first */}
      {workspaceId && (
        <section className="space-y-4">
          <GovernanceQueueBar
            workspaceId={workspaceId}
            role={role as WorkspaceRole}
            counts={counts}
            onQueueNavigate={(target) => {
              if (target === "questionnaire_export_mirrors") {
                router.push("/app/governance?section=questionnaire-mirrors");
                return;
              }
              router.push(`/app/library?queue=${encodeURIComponent(target)}`);
            }}
          />
        </section>
      )}

      {/* 3b. Canonical contradiction workload (secondary operational signal) */}
      {metrics && (
        <section id="contradiction-governance" className="space-y-4 scroll-mt-8">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xs font-black uppercase tracking-[0.2em] text-text-muted/60">
                Canonical contradictions
              </h2>
              <p className="text-[11px] text-text-muted mt-1 max-w-2xl leading-relaxed">
                Row vs library mismatches from the contradiction engine. Treat as a secondary signal until rules
                stabilize; use for workload visibility and trends.
              </p>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/app/questionnaires">Open questionnaires</Link>
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">
            {(
              [
                {
                  label: "Unresolved",
                  value: metrics.contradictionGovernance.unresolvedTotal,
                  hint: "Pending, stale, or acknowledged backlog",
                },
                {
                  label: "High severity (open)",
                  value: metrics.contradictionGovernance.highSeverityUnresolved,
                  hint: "Critical/high across full backlog",
                },
                {
                  label: "Export blockers",
                  value: metrics.openContradictionResultsHighOrCritical,
                  hint: "Critical/high, PENDING or STALE only",
                },
                {
                  label: "Dismissed (total)",
                  value: metrics.contradictionGovernance.dismissedTotal,
                  hint: "Marked false positive",
                },
                {
                  label: "Dismissed (30d)",
                  value: metrics.contradictionGovernance.dismissedLast30Days,
                  hint: "Throughput",
                },
                {
                  label: "Canonical update requests",
                  value: metrics.contradictionGovernance.canonicalUpdateRequestsOpen,
                  hint: "Awaiting library change",
                },
                {
                  label: "Detected / resolved (7d)",
                  value: `${metrics.contradictionGovernance.detectedLast7Days} / ${metrics.contradictionGovernance.resolvedLast7Days}`,
                  hint: "Material signal vs closures",
                },
              ] as const
            ).map((tile) => (
              <div
                key={tile.label}
                className="rounded-xl border border-surface-border bg-surface-panel/40 p-4"
              >
                <p className="text-[10px] font-bold uppercase tracking-wide text-text-muted">{tile.label}</p>
                <p className="mt-1 text-xl font-black tabular-nums text-text-primary">{tile.value}</p>
                <p className="mt-1 text-[10px] leading-snug text-text-muted">{tile.hint}</p>
              </div>
            ))}
          </div>

          <Card className="border-surface-border">
            <CardHeader
              className="pb-2"
              title="Breakdowns (unresolved backlog)"
              description="Top dimensions by open contradiction rows (topic, canonical answer owner/approver, questionnaire, severity)."
            />
            <CardContent className="grid gap-6 lg:grid-cols-2">
              {[
                {
                  title: "By topic",
                  rows: metrics.contradictionBreakdowns.byTopic.map((r) => ({
                    k: r.topicName ?? r.topicKey ?? r.topicId ?? "Unassigned",
                    c: r.count,
                  })),
                },
                {
                  title: "By severity",
                  rows: metrics.contradictionBreakdowns.bySeverity.map((r) => ({
                    k: r.severity,
                    c: r.count,
                  })),
                },
                {
                  title: "By questionnaire",
                  rows: metrics.contradictionBreakdowns.byQuestionnaire.map((r) => ({
                    k: r.title ?? r.questionnaireId,
                    c: r.count,
                  })),
                },
                {
                  title: "By canonical owner",
                  rows: metrics.contradictionBreakdowns.byOwner.map((r) => ({
                    k: r.displayName ?? r.email ?? r.userId ?? "Unassigned",
                    c: r.count,
                  })),
                },
                {
                  title: "By canonical approver",
                  rows: metrics.contradictionBreakdowns.byApprover.map((r) => ({
                    k: r.displayName ?? r.email ?? r.userId ?? "Unassigned",
                    c: r.count,
                  })),
                },
              ].map((block) => (
                <div key={block.title} className="space-y-2">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-text-muted">{block.title}</p>
                  {block.rows.length === 0 ? (
                    <p className="text-xs text-text-muted">No rows in this slice.</p>
                  ) : (
                    <div className="max-h-48 overflow-y-auto rounded-lg border border-surface-border/60">
                      <table className="w-full text-left text-xs">
                        <thead className="sticky top-0 bg-surface-panel text-text-muted">
                          <tr>
                            <th className="px-3 py-2 font-semibold">Label</th>
                            <th className="px-3 py-2 text-right font-semibold">Count</th>
                          </tr>
                        </thead>
                        <tbody>
                          {block.rows.map((row, idx) => (
                            <tr key={`${block.title}-${idx}-${row.k}`} className="border-t border-surface-border/40">
                              <td className="px-3 py-1.5 text-text-secondary">{row.k}</td>
                              <td className="px-3 py-1.5 text-right font-mono tabular-nums">{row.c}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      )}

      {/* 4. Health & Posture Trends */}
      {metrics && (
        <section className="space-y-4">
          <h2 className="text-xs font-black uppercase tracking-[0.2em] text-text-muted/60">Health & Posture</h2>
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-6">
            <div className="rounded-xl border border-surface-border bg-surface-panel/40 p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wide text-text-muted">Freshness</span>
                {metrics.reviewedThisMonth > 0 && (
                  <span className="text-[9px] font-bold text-semantic-success flex items-center gap-0.5">
                    <TrendUpIcon className="h-2.5 w-2.5" />
                    +{metrics.reviewedThisMonth}
                  </span>
                )}
              </div>
              <p className="text-2xl font-black text-text-primary">{metrics.totalGovernedAnswers - metrics.expired}</p>
              <p className="text-[10px] text-text-muted mt-1">Healthy answers</p>
            </div>

            <div className="rounded-xl border border-surface-border bg-surface-panel/40 p-4">
               <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wide text-text-muted">Expired</span>
                {metrics.newlyExpiredThisMonth > 0 && (
                  <span className="text-[9px] font-bold text-semantic-error flex items-center gap-0.5">
                    +{metrics.newlyExpiredThisMonth}
                  </span>
                )}
              </div>
              <p className="text-2xl font-black text-semantic-error">{metrics.expired}</p>
              <p className="text-[10px] text-text-muted mt-1">Review overdue</p>
            </div>

            <div className="rounded-xl border border-surface-border bg-surface-panel/40 p-4">
              <span className="text-[10px] font-bold uppercase tracking-wide text-text-muted block mb-2">Evidence Coverage</span>
              <p className="text-2xl font-black text-text-primary">
                {metrics.totalGovernedAnswers > 0 
                  ? Math.round(((metrics.totalGovernedAnswers - metrics.missingEvidence) / metrics.totalGovernedAnswers) * 100) 
                  : 0}%
              </p>
              <p className="text-[10px] text-text-muted mt-1">{metrics.missingEvidence} missing evidence</p>
            </div>

            <div className="rounded-xl border border-surface-border bg-surface-panel/40 p-4">
              <span className="text-[10px] font-bold uppercase tracking-wide text-text-muted block mb-2">Overrides</span>
              <p className="text-2xl font-black text-text-primary">{metrics.overriddenThisMonth}</p>
              <p className="text-[10px] text-text-muted mt-1">This month</p>
            </div>

            <div className="rounded-xl border border-surface-border bg-surface-panel/40 p-4">
              <span className="text-[10px] font-bold uppercase tracking-wide text-text-muted block mb-2">Posture Trend</span>
              <div className="flex items-center gap-1.5 mt-1">
                <div className="flex h-8 items-end gap-0.5">
                   {[40, 60, 45, 70, 55, 80, 75].map((h, i) => (
                     <div key={i} className="w-1 bg-accent-primary/20 rounded-t-sm" style={{ height: `${h}%` }} />
                   ))}
                </div>
                <span className="text-[10px] font-bold text-semantic-success">+12%</span>
              </div>
              <p className="text-[10px] text-text-muted mt-1">30-day velocity</p>
            </div>

            <div
              className={cn(
                "rounded-xl border bg-surface-panel/40 p-4 xl:col-span-1",
                (metrics.openContradictionResultsHighOrCritical ?? 0) > 0
                  ? "border-semantic-error-border"
                  : "border-surface-border",
              )}
            >
              <span className="text-[10px] font-bold uppercase tracking-wide text-text-muted block mb-2">
                Questionnaire contradictions
              </span>
              <p
                className={cn(
                  "text-2xl font-black tabular-nums",
                  (metrics.openContradictionResultsHighOrCritical ?? 0) > 0
                    ? "text-semantic-error"
                    : "text-text-primary",
                )}
              >
                {metrics.openContradictionResultsHighOrCritical}
              </p>
              <p className="text-[10px] text-text-muted mt-1">Critical/high unresolved (blocks export)</p>
              <p className="mt-2 text-[10px] text-text-muted">
                Medium open:{" "}
                <span className="font-bold text-text-secondary">{metrics.openContradictionResultsMedium}</span>
              </p>
              <Button variant="outline" size="sm" asChild className="mt-3 w-full">
                <Link href="/app/governance#contradiction-governance">Contradiction details</Link>
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* 5. Legacy / System Alerts - Admin/Operator only */}
      {canSeeAdminControls && counts && counts.stale_legacy_lastVerified > 0 && (
        <Card className="border-semantic-warning-border bg-semantic-warning/5">
          <CardContent className="py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-semantic-warning/20 text-semantic-warning">
                <AlertCircleIcon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-bold text-text-primary">Legacy Refresh Required</p>
                <p className="text-xs text-text-muted">
                  {counts.stale_legacy_lastVerified} answers have not been verified in over 90 days according to legacy records.
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" asChild>
               <Link href="/app/library?queue=stale_legacy_lastVerified">Review Legacy Items</Link>
            </Button>
          </CardContent>
        </Card>
      )}
      </div>
    </RouteGuard>
  );
}
