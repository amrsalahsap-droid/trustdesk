import Link from "next/link";
import { WorkspaceSetupRail } from "@/components/onboarding/workspace-setup-rail";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { MetricTile } from "@/components/ui/metric-tile";
import { OperationalList } from "@/components/ui/operational-list";
import { PageHeader } from "@/components/ui/page-header";
import { ProgressBar } from "@/components/ui/progress-bar";
import { StatusBadge } from "@/components/ui/status-badge";
import { 
  AlertCircleIcon, 
  ClipboardIcon, 
  FileIcon, 
  WarningIcon, 
  PlusIcon, 
  ShieldCheckIcon,
  ChevronRightIcon,
  SparklesIcon
} from "@/components/icons";
import { prisma } from "@/lib/db/prisma";
import { buildAuthContextRSC } from "@/lib/auth/build-context";
import { EmptyState } from "@/components/ui/empty-state";
import { Permission } from "@/lib/auth/permissions";
import { guardPermission } from "@/lib/auth/guard";
import { isOperatorLike } from "@/lib/auth/governance-actions";
import { getGovernanceMetricsSnapshot } from "@/lib/knowledge/governance-metrics";

export default async function DashboardPage() {
  const ctx = await buildAuthContextRSC();
  
  // Guard: Dashboard requires MANAGE_TOPICS permission
  guardPermission(ctx, Permission.MANAGE_TOPICS);
  const { workspaceId } = ctx;
  
  // 1. Fetch Workspace Info
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { name: true, isDemo: true },
  });

  // 2. Fetch Real Data
  const dbQuestionnaires = await prisma.questionnaire.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { items: true }
      },
      items: {
        where: { reviewed: true },
        select: { id: true }
      }
    }
  });

  const [dbRecentDocs, dbUnresolvedItems] = await Promise.all([
    prisma.sourceDocument.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      take: 5
    }),
    prisma.questionnaireItem.findMany({
      where: { 
        workspaceId,
        questionnaireId: { in: dbQuestionnaires.map(q => q.id) },
        reviewed: false,
        type: "question_row"
      },
      include: {
        questionnaire: {
          select: { title: true }
        }
      },
      orderBy: { createdAt: "desc" },
      take: 5
    })
  ]);


  const dbUnresolvedCount = await prisma.questionnaireItem.count({
    where: { 
      workspaceId,
      questionnaireId: { in: dbQuestionnaires.map(q => q.id) },
      reviewed: false,
      type: "question_row"
    }
  });


  // Derived Metrics
  const questionnairesCount = dbQuestionnaires.length;
  const docsCount = dbRecentDocs.length;
  const totalItemsAcrossAll = dbQuestionnaires.reduce((acc, q) => acc + q._count.items, 0);
  const totalReviewedAcrossAll = dbQuestionnaires.reduce((acc, q) => acc + q.items.length, 0);
  const coveragePercent = totalItemsAcrossAll > 0 
    ? Math.round((totalReviewedAcrossAll / totalItemsAcrossAll) * 100) 
    : 0;

  const governanceMetrics = ctx.permissions.includes(Permission.VIEW_ANSWERS)
    ? await getGovernanceMetricsSnapshot(workspaceId)
    : null;

  // Use shared helper for operator-like check
  const isAdminLike = isOperatorLike(ctx.role);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-page-fade">
      <PageHeader
        title={`${workspace?.name ?? "Workspace"} Dashboard`}
        description="Monitor questionnaire velocity, coverage, and recent activity."
        variant="emphasized"
        actions={
          <div className="flex items-center gap-3">
            <Link href="/app/questionnaires/new">
              <Button leftIcon={<PlusIcon className="h-4 w-4" />}>
                Start Questionnaire
              </Button>
            </Link>
            <Link href="/app/documents">
              <Button variant="outline">Upload Data</Button>
            </Link>
          </div>
        }
      />

      {workspace?.isDemo && (
        <div className="rounded-2xl border border-accent-primary/20 bg-white p-8 shadow-sm ring-1 ring-accent-primary/5 animate-in fade-in slide-in-from-top-4 duration-700">
          <div className="flex items-start gap-6">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent-primary/[0.04] text-accent-primary shadow-inner ring-1 ring-accent-primary/10">
              <SparklesIcon className="h-7 w-7 animate-pulse" />
            </div>
            <div className="space-y-3">
              <h3 className="text-lg font-bold text-text-primary flex items-center gap-2">
                Welcome to your <span className="text-accent-primary">TrustDesk Demo</span>
              </h3>
              <p className="text-sm text-text-muted leading-relaxed max-w-3xl">
                We&apos;ve pre-seeded this workspace with realistic security questionnaires, documents, and recommended answers. 
                Explore how TrustDesk identifies <span className="font-semibold text-rose-500">contradictions</span>, 
                detects <span className="font-semibold text-amber-500">evidence gaps</span>, and accelerates 
                your path to <span className="font-semibold text-emerald-500">export readiness</span>.
              </p>
              <div className="flex flex-wrap items-center gap-4 pt-2">
                <Link 
                  href="/app/questionnaires" 
                  className="group flex items-center gap-2 text-xs font-bold text-accent-primary hover:text-accent-primary-hover"
                >
                  Go to Questionnaire Review
                  <ChevronRightIcon className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link 
                  href="/app/governance" 
                  className="group flex items-center gap-2 text-xs font-bold text-accent-primary hover:text-accent-primary-hover"
                >
                  Explore Governance Hub
                  <ChevronRightIcon className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {!workspace?.isDemo && questionnairesCount === 0 && docsCount === 0 && (
        <div className="rounded-2xl border border-accent-primary/20 bg-white p-8 shadow-sm ring-1 ring-accent-primary/5 animate-in fade-in slide-in-from-top-4 duration-700">
          <div className="flex items-start gap-6">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-accent-primary/[0.04] text-accent-primary shadow-inner ring-1 ring-accent-primary/10">
              <SparklesIcon className="h-8 w-8" />
            </div>
            <div className="space-y-4">
              <div className="space-y-1">
                <h3 className="text-xl font-bold text-text-primary">
                  Welcome to TrustDesk: Your Guided Onboarding
                </h3>
                <p className="text-sm text-text-muted leading-relaxed max-w-3xl">
                  TrustDesk has analyzed your domain and prepared a foundational Trust Profile. 
                  Now, let&apos;s build your evidence base and start automating your security responses.
                </p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-2">
                <div className="space-y-3">
                  <h4 className="text-sm font-bold text-text-primary flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-accent-primary" />
                    Step 1: Build Knowledge Base
                  </h4>
                  <p className="text-xs text-text-muted leading-relaxed">
                    Upload your security policies, SOC 2 reports, and compliance documents. 
                    TrustDesk indexes this evidence to provide grounded citations for every answer.
                  </p>
                  <Link href="/app/documents">
                    <Button variant="outline" size="sm" className="mt-2">Upload Evidence</Button>
                  </Link>
                </div>
                
                <div className="space-y-3">
                  <h4 className="text-sm font-bold text-text-primary flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-accent-primary" />
                    Step 2: Automate Response
                  </h4>
                  <p className="text-xs text-text-muted leading-relaxed">
                    Upload a new security questionnaire (Excel, Word, or PDF). 
                    Automated responses will be prepared using your verified knowledge base.
                  </p>
                  <Link href="/app/questionnaires/new">
                    <Button size="sm" className="mt-2" leftIcon={<PlusIcon className="h-3.5 w-3.5" />}>
                      Start Questionnaire
                    </Button>
                  </Link>
                </div>
              </div>

              <div className="pt-6 border-t border-accent-primary/10 flex items-center gap-4">
                <p className="text-[11px] text-text-muted italic">
                  Why this matters: A strong knowledge base reduces manual review time by up to 80% and ensures response consistency.
                </p>
                <Link 
                  href="/app/library" 
                  className="group ml-auto flex items-center gap-2 text-xs font-bold text-accent-primary hover:text-accent-primary-hover"
                >
                  Explore Your Recommended Library
                  <ChevronRightIcon className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      <WorkspaceSetupRail context="dashboard" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricTile
          label="Active questionnaires"
          value={questionnairesCount}
          hint="Total engagements"
          icon={<ClipboardIcon className="h-4 w-4" />}
          href="/app/questionnaires"
          linkLabel="View all"
          visualWeight="primary"
        />
        <MetricTile
          label="Answer coverage"
          value={`${coveragePercent}%`}
          hint="Across all questionnaires"
          trend={coveragePercent > 0 ? { direction: "up", label: "Real coverage" } : undefined}
          href="/app/library"
          linkLabel="View library"
          visualWeight="primary"
          emphasis={coveragePercent >= 80 ? "success" : coveragePercent >= 50 ? "default" : "warning"}
        />
        <MetricTile
          label="Unresolved issues"
          value={dbUnresolvedCount}
          hint="Items needing review"
          icon={<AlertCircleIcon className="h-4 w-4" />}
          emphasis={dbUnresolvedCount > 0 ? "critical" : "default"}
          href={dbUnresolvedCount > 0 ? "/app/questionnaires" : undefined}
          linkLabel={dbUnresolvedCount > 0 ? "Resolve now" : undefined}
          visualWeight={dbUnresolvedCount > 0 ? "primary" : "secondary"}
        />
        <MetricTile
          label="Knowledge assets"
          value={docsCount}
          hint="Recent source documents"
          icon={<FileIcon className="h-4 w-4" />}
          href="/app/documents"
          linkLabel="Manage docs"
          visualWeight="secondary"
        />
      </div>

      {governanceMetrics && (
        <div className="space-y-8 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-surface-border">
            <h2 className="text-sm font-semibold text-text-secondary tracking-tight">Governance Health</h2>
            <Link href="/app/governance" className="text-xs font-medium text-accent-primary hover:underline">
              View Governance Hub →
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
            <MetricTile
              label="Pending approvals"
              value={governanceMetrics.pendingApprovals}
              hint="Library answers in review"
              icon={<ShieldCheckIcon className="h-4 w-4" />}
              emphasis={governanceMetrics.pendingApprovals > 0 ? "warning" : "default"}
              href="/app/governance?queue=drafts_awaiting_approval"
              linkLabel="Open queue"
              visualWeight="secondary"
            />
            <MetricTile
              label="Open contradictions"
              value={governanceMetrics.openContradictionResultsHighOrCritical}
              hint="Critical/high on questionnaires (blocks export)"
              icon={<AlertCircleIcon className="h-4 w-4" />}
              emphasis={
                governanceMetrics.openContradictionResultsHighOrCritical > 0 ? "critical" : "default"
              }
              href="/app/governance#contradiction-governance"
              linkLabel={governanceMetrics.openContradictionResultsHighOrCritical > 0 ? "Resolve now" : "Governance"}
              visualWeight={governanceMetrics.openContradictionResultsHighOrCritical > 0 ? "primary" : "secondary"}
            />
            <MetricTile
              label="Governed answers"
              value={governanceMetrics.totalGovernedAnswers}
              hint="Non-archived library items"
              href="/app/library"
              linkLabel="Library"
              visualWeight="secondary"
            />
            <MetricTile
              label="Expired / overdue"
              value={governanceMetrics.expired}
              hint="Freshness and governance"
              emphasis={governanceMetrics.expired > 0 ? "critical" : "default"}
              href="/app/governance?queue=freshness_expired"
              linkLabel={governanceMetrics.expired > 0 ? "Review now" : "Open queue"}
              visualWeight={governanceMetrics.expired > 0 ? "primary" : "secondary"}
            />
            {isAdminLike ? (
              <MetricTile
                label="Unowned answers"
                value={governanceMetrics.unowned}
                hint="Assign owners to improve coverage"
                emphasis={governanceMetrics.unowned > 0 ? "warning" : "default"}
                href="/app/governance?queue=unowned"
                linkLabel="Open queue"
                visualWeight="secondary"
              />
            ) : (
              <MetricTile
                label="Approved for export"
                value={governanceMetrics.approvedForExport}
                hint="Export-safe library answers"
                href="/app/library"
                linkLabel="Library"
                visualWeight="secondary"
              />
            )}
          </div>
        </div>
      )}

      {dbUnresolvedCount > 0 && (
        <div className="flex flex-col gap-3 rounded-2xl border border-semantic-warning-border bg-semantic-warning-bg px-6 py-4 sm:flex-row sm:items-center sm:justify-between shadow-sm">
          <div className="flex items-start gap-3 sm:items-center">
            <WarningIcon className="mt-0.5 h-5 w-5 shrink-0 text-semantic-warning sm:mt-0" />
            <p className="text-sm text-semantic-warning">
              <span className="font-bold">{dbUnresolvedCount}</span>{" "}
              {dbUnresolvedCount === 1 ? "item needs" : "items need"} review before you can ship answers with confidence.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3 sm:pl-0">
            <Link href="#dashboard-issues" className="text-xs font-bold text-semantic-warning hover:underline uppercase tracking-wider">
              Jump to list
            </Link>
          </div>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)] pt-4">
        <Card noPadding className="rounded-2xl shadow-sm border-surface-border overflow-hidden">
          <CardHeader
            className="p-6 border-b border-surface-border bg-surface-base/30"
            title="Active questionnaires"
            description="Track completion across active engagements."
            actions={
              <Link href="/app/questionnaires" className="text-xs font-bold text-accent-primary hover:underline uppercase tracking-wider">
                View all
              </Link>
            }
          />
          {questionnairesCount === 0 ? (
            <div className="p-12">
              <EmptyState
                icon={<ClipboardIcon />}
                title="No questionnaires started"
                description="Upload your first customer questionnaire to begin your automated compliance review."
                action={{
                  label: "Start Questionnaire",
                  href: "/app/questionnaires/new"
                }}
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-surface-border bg-surface-base">
                    <th className="px-6 py-3 text-xs font-bold uppercase tracking-wider text-text-muted">Name</th>
                    <th className="px-6 py-3 text-xs font-bold uppercase tracking-wider text-text-muted">Created</th>
                    <th className="px-6 py-3 text-xs font-bold uppercase tracking-wider text-text-muted">Progress</th>
                    <th className="px-6 py-3 text-right text-xs font-bold uppercase tracking-wider text-text-muted">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {dbQuestionnaires.map((q) => {
                    const progress = q._count.items > 0 ? Math.round((q.items.length / q._count.items) * 100) : 0;
                    return (
                      <tr key={q.id} className="transition-colors hover:bg-surface-hover">
                        <td className="px-6 py-4 font-medium text-text-primary">
                          <Link href={`/app/questionnaires/${q.id}/review`} className="hover:text-accent-primary">
                            {q.title}
                          </Link>
                        </td>
                        <td className="px-6 py-4 text-text-secondary">
                          {q.createdAt.toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <ProgressBar value={progress} className="w-24 h-1.5" />
                            <span className="text-xs font-bold tabular-nums text-text-muted">{progress}%</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Link
                            href={`/app/questionnaires/${q.id}/review`}
                            className="text-xs font-bold text-accent-primary hover:underline uppercase tracking-wider"
                          >
                            Review
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card noPadding className="rounded-2xl shadow-sm border-surface-border overflow-hidden">
          <CardHeader 
            className="p-6 border-b border-surface-border bg-surface-base/30"
            title="Operations" 
            description="Knowledge base and unresolved tasks." 
          />
          <div className="divide-y divide-surface-border">
            <section>
              <div className="border-b border-surface-border bg-surface-base/50 px-6 py-3">
                <h4 className="text-xs font-bold uppercase tracking-[0.15em] text-text-muted/80">Recent documents</h4>
              </div>
              {docsCount === 0 ? (
                <div className="py-12 px-6 text-center">
                  <p className="text-sm text-text-muted mb-6">No source documents uploaded yet.</p>
                  <Link href="/app/documents">
                    <Button variant="outline" size="sm" className="w-full">Upload Data</Button>
                  </Link>
                </div>
              ) : (
                <OperationalList
                  items={dbRecentDocs.map(d => ({ ...d, id: d.id, name: d.originalName, type: d.mimeType.split("/")[1]?.toUpperCase() ?? "FILE" }))}
                  emptyMessage="No recent uploads"
                  renderRow={(d) => {
                    return (
                      <div className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-surface-hover transition-colors">
                        <div className="flex min-w-0 items-start gap-3">
                          <FileIcon className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-text-primary">{d.name}</p>
                            <p className="text-[11px] font-bold text-text-muted/60 uppercase tracking-wider">{d.type}</p>
                          </div>
                        </div>
                        <StatusBadge variant="ok" label="Ready" />
                      </div>
                    );
                  }}
                />
              )}
            </section>

            <section id="dashboard-issues" className="border-l-4 border-l-semantic-warning">
              <div className="border-b border-surface-border bg-semantic-warning-bg/40 px-6 py-3 pl-5">
                <h4 className="text-xs font-bold uppercase tracking-[0.15em] text-semantic-warning">
                  Unresolved work{dbUnresolvedCount > 0 ? ` (${dbUnresolvedCount})` : ""}
                </h4>
              </div>
              <OperationalList
                items={dbUnresolvedItems.map(item => ({ ...item, typeLabel: item.type === "question_row" ? "New question" : item.type }))}
                emptyMessage="No open issues"
                renderRow={(issue) => (
                  <div className="flex items-center justify-between gap-4 px-6 py-4 pl-5 hover:bg-surface-hover transition-colors">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">{issue.question}</p>
                      <Link
                        href={`/app/questionnaires/${issue.questionnaireId}/review`}
                        className="text-[11px] font-bold text-accent-primary hover:underline uppercase tracking-wider"
                      >
                        {issue.questionnaire.title}
                      </Link>
                    </div>
                    <StatusBadge variant="warning" label="Review" />
                  </div>
                )}
              />
            </section>
          </div>
        </Card>
      </div>
    </div>
  );
}
