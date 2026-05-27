"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { AnswerDetailSlideOver } from "@/components/library/answer-detail-slide-over";
import {
  AnswerFormSlideOver,
  type WorkspaceMemberOption,
} from "@/components/library/answer-form-slide-over";
import { WorkspaceSetupRail } from "@/components/onboarding/workspace-setup-rail";
import { TopicCatalogGrid } from "@/components/library/topic-catalog-grid";
import { TopicExplorerList } from "@/components/library/topic-explorer-list";
import { LibraryCommandStrip } from "@/components/library/library-command-strip";
import { LibraryTopicDetailPanel } from "@/components/library/library-topic-detail-panel";
import { TopicFormSlideOver } from "@/components/library/topic-form-slide-over";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TopicWithStats } from "@/components/library/topic-card";
import { StatusBanner } from "@/components/ui/status-banner";
import { getApiErrorMessageFromBody } from "@/lib/api/error-handler";
import { filterTopicsByQuery } from "@/components/library/library-topic-utils";
import type { AnswerBlock } from "@/components/library/library-types";
import { BookIcon, GridIcon, ListIcon, PlusIcon, ShieldCheckIcon } from "@/components/icons";

import { SeedingReviewHero } from "@/components/library/seeding-review-hero";
import { TopicSuggestionInbox } from "@/components/library/topic-suggestion-inbox";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { isGovernanceQueueId, isLibraryCrossTopicGovernanceFilter } from "@/lib/knowledge/governance-shared";
import { Permission } from "@/lib/auth/permissions";
import {
  parseFiltersFromParams,
  serializeFiltersToParams,
  DEFAULT_FILTERS,
  type AnswerLibraryFilters
} from "@/lib/knowledge/filter-utils";
import {
  getRoleScopeConfig,
  getFocusedAnswerFilter,
  isApprover as checkIsApprover,
  isContributor as checkIsContributor,
  isOwner as checkIsOwner,
} from "@/lib/knowledge/library-role-scoping";


import { RouteGuard, UnauthorizedAlert } from "@/components/auth/RouteGuard";
import type { WorkspaceRole } from "@prisma/client";

export type { Topic, EvidenceSnippet, AnswerBlock } from "@/components/library/library-types";

const LAST_TOPIC_KEY = "library-last-topic-key";
const HERO_DISMISSED_KEY = "library-seeding-hero-dismissed";

export default function LibraryPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [topics, setTopics] = useState<TopicWithStats[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<TopicWithStats | null>(null);
  const [answers, setAnswers] = useState<AnswerBlock[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMemberOption[]>([]);
  const [topicsLoadError, setTopicsLoadError] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [isLoading, setIsLoading] = useState(true);
  const [topicSearchQuery, setTopicSearchQuery] = useState("");

  // Structured Filters
  const [filters, setFilters] = useState<AnswerLibraryFilters>(() =>
    parseFiltersFromParams(new URLSearchParams(typeof window !== "undefined" ? window.location.search : ""))
  );
  // Debounced search state
  const [debouncedSearch, setDebouncedSearch] = useState(filters.search);

  const [showSeedingHero, setShowSeedingHero] = useState(false);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAnswer, setEditingAnswer] = useState<AnswerBlock | null>(null);
  const [formDefaultTopicId, setFormDefaultTopicId] = useState<string | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<AnswerBlock | null>(null);
  const [detailRefreshKey, setDetailRefreshKey] = useState(0);
  const [editingTopic, setEditingTopic] = useState<TopicWithStats | null>(null);
  const [isTopicFormOpen, setIsTopicFormOpen] = useState(false);
  const [isTopicsLoading, setIsTopicsLoading] = useState(true);
  const [suggestionRefreshKey, setSuggestionRefreshKey] = useState(0);
  const [libraryRefreshKey, setLibraryRefreshKey] = useState(0);
  const [role, setRole] = useState<string>("VIEWER");
  const [isRoleLoaded, setIsRoleLoaded] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // Focused scoping: 'focused' (My Work) = only topics with answers assigned to me or needing attention
  // 'all' = full library catalog (secondary view)
  const [topicScope, setTopicScope] = useState<"focused" | "all">("focused");
  const [activeQueue, setActiveQueue] = useState<string | null>(null);

  // Role-based visibility helpers
  const isApprover = role === "APPROVER";
  const isOwner = role === "OWNER";
  const isContributor = role === "CONTRIBUTOR";
  const canAuthorContent = !isApprover; // Admin, Owner, Operator, Answer Owner, Editor, Contributor can author

  // Get role scoping configuration for centralized scoping behavior
  const roleScopeConfig = useMemo(() => getRoleScopeConfig(role), [role]);

  /** D10-DS-01: Handle 'review=true' param and Hero visibility */
  useEffect(() => {
    const review = searchParams?.get("review");
    if (review === "true") {
      setViewMode("list");
      setShowSeedingHero(true);
    }
  }, [searchParams]);

  // Handle debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(filters.search);
    }, 350);
    return () => clearTimeout(timer);
  }, [filters.search]);

  // Sync filters to URL
  useEffect(() => {
    const params = serializeFiltersToParams(filters);
    const review = searchParams?.get("review");
    if (review) params.set("review", review);
    const queue = searchParams?.get("queue");
    if (queue) params.set("queue", queue);

    const currentQuery = searchParams?.toString();
    const newQuery = params.toString();

    if (currentQuery === newQuery) return;

    const newUrl = `${pathname}?${newQuery}`;
    router.replace(newUrl, { scroll: false });
  }, [filters, pathname, router]); // Removed searchParams to avoid infinite loop

  useEffect(() => {
    const q = searchParams?.get("queue");
    if (q && isGovernanceQueueId(q)) {
      // For now, mapping legacy 'queue' to filters if possible, or just keeping it
      // if it's a special cross-topic view.
      setSelectedTopic(null);
      setViewMode("list");
      setActiveQueue(q);
    }
  }, [searchParams]);

  useEffect(() => {
    const isDismissed = localStorage.getItem(HERO_DISMISSED_KEY);
    if (isDismissed === "true") {
      setShowSeedingHero(false);
    }
  }, []);

  // Focused scoping: 'focused' (My Work) = only topics with answers assigned to me or needing attention
  // 'all' = full library catalog (secondary view)
  // Note: Only Approver and Contributor use focused scoping; Owner/Admin see full library
  const filteredTopics = useMemo(() => {
    return filterTopicsByQuery(topics, topicSearchQuery);
  }, [topics, topicSearchQuery]);

  // Role-specific empty state when in focused scope (only for Approver, Contributor)
  const focusedEmptyContent = (isApprover || isContributor) && topicScope === "focused" && topics.length === 0 ? (
    <Card className="flex flex-col items-center justify-center p-16 text-center shadow-md bg-gradient-to-b from-surface-panel to-surface-base">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-surface-border bg-white shadow-sm">
        <ShieldCheckIcon className="h-8 w-8 text-accent-primary" />
      </div>
      <h3 className="text-xl font-bold text-text-primary">
        {roleScopeConfig.emptyStateTitle}
      </h3>
      <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-text-muted">
        {roleScopeConfig.emptyStateDescription}
      </p>
      <div className="mt-8 flex items-center gap-4">
        <Button
          variant="outline"
          onClick={() => setTopicScope("all")}
        >
          {roleScopeConfig.broaderContextLabel}
        </Button>
      </div>
    </Card>
  ) : null;

  const allTopicsEmptyContent =
    !isApprover && topics.length > 0 && topics.every((t) => t.totalAnswers === 0) ? (
      <StatusBanner
        severity="warning"
        title="Most topics are still empty"
        message="Upload documents so answers can be recommended after indexing."
        action={
          <Link
            href="/app/documents"
            className="rounded-md bg-semantic-warning px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-semantic-warning/90 transition-all"
          >
            Upload Documents
          </Link>
        }
      />
    ) : null;

  useEffect(() => {
    async function fetchContext() {
      try {
        const res = await fetch("/api/auth/context", { credentials: "include", cache: "no-store" });
        const data = await res.json();
        if (!res.ok) {
          setIsRoleLoaded(true);
          return;
        }
        if (data.workspaceId) setWorkspaceId(data.workspaceId);
        else if (data.workspaceIds?.[0]) setWorkspaceId(data.workspaceIds[0]);
        if (data.role) {
          setRole(data.role);
          // Initialize topic scope immediately to avoid fetch race conditions
          const config = getRoleScopeConfig(data.role);
          setTopicScope(config.defaultTopicScope);
        }
        if (data.userId) setUserId(data.userId);
        setIsRoleLoaded(true);
      } catch (err) {
        console.error("Library: Failed to fetch context", err);
        setIsRoleLoaded(true);
      }
    }
    fetchContext();
  }, []);

  useEffect(() => {
    async function fetchMembers() {
      if (!workspaceId) return;
      try {
        const res = await fetch("/api/workspaces/members", {
          credentials: "include",
          cache: "no-store",
          headers: { "x-workspace-id": workspaceId },
        });
        const data = await res.json();
        if (Array.isArray(data.members)) setWorkspaceMembers(data.members);
      } catch (err) {
        console.error("Library: Failed to fetch workspace members", err);
      }
    }
    fetchMembers();
  }, [workspaceId]);

  const fetchTopics = useCallback(async () => {
    if (!workspaceId) return;
    setIsTopicsLoading(true);
    setTopicsLoadError(null);
    try {
      const url = new URL("/api/knowledge/topics", window.location.origin);
      
      // For Contributors in focused mode, request only their contribution topics
      if (isContributor && topicScope === "focused") {
        url.searchParams.set("scope", "my_contributions");
      } else if ((isApprover || isOwner) && topicScope === "focused") {
        url.searchParams.set("scope", "my_approvals");
      }

      const res = await fetch(url.toString(), {
        credentials: "include",
        cache: "no-store",
        headers: { "x-workspace-id": workspaceId },
      });
      const data = await res.json();
      if (!res.ok) {
        setTopicsLoadError(getApiErrorMessageFromBody(data));
        return;
      }
      if (Array.isArray(data.topics)) setTopics(data.topics);
    } catch {
      setTopicsLoadError("Could not load topics.");
    } finally {
      setIsTopicsLoading(false);
    }
  }, [workspaceId, isApprover, isOwner, isContributor, topicScope]);

  useEffect(() => {
    if (workspaceId && isRoleLoaded) void fetchTopics();
  }, [workspaceId, isRoleLoaded, topicScope, fetchTopics]);

  useEffect(() => {
    if (topics.length === 0 || selectedTopic) return;
    try {
      const raw = sessionStorage.getItem(LAST_TOPIC_KEY);
      if (!raw) return;
      const found = topics.find((t) => t.key === raw);
      if (found) setSelectedTopic(found);
    } catch {
      /* ignore */
    }
  }, [topics, selectedTopic]);

  useEffect(() => {
    if (!selectedTopic) return;
    try {
      sessionStorage.setItem(LAST_TOPIC_KEY, selectedTopic.key);
    } catch {
      /* ignore */
    }
  }, [selectedTopic]);

  const fetchAnswersAbortController = useRef<AbortController | null>(null);

  const fetchAnswers = useCallback(async (): Promise<AnswerBlock[] | undefined> => {
    const crossTopicMode = !selectedTopic && activeQueue;
    if (!workspaceId || (!selectedTopic && !crossTopicMode)) return undefined;
    setIsLoading(true);

    if (fetchAnswersAbortController.current) {
      fetchAnswersAbortController.current.abort();
    }
    const controller = new AbortController();
    fetchAnswersAbortController.current = controller;

    try {
      const url = new URL("/api/knowledge/answers", window.location.origin);
      if (selectedTopic) url.searchParams.set("topicKey", selectedTopic.key);

      // Pass structured filters to API
      if (filters.workflow.length > 0) url.searchParams.set("workflow", filters.workflow.join(","));
      if (filters.assignment.length > 0) url.searchParams.set("assignment", filters.assignment.join(","));
      if (filters.urgency.length > 0) url.searchParams.set("urgency", filters.urgency.join(","));
      if (filters.usage.length > 0) url.searchParams.set("usage", filters.usage.join(","));
      if (debouncedSearch) url.searchParams.set("search", debouncedSearch);

      // Role-scoped answer filtering: when in focused mode, apply the role's answer filter
      // This ensures Approvers only see assigned answers, Contributors see their work, etc.
      if (topicScope === "focused" && !activeQueue) {
        const answerFilter = getFocusedAnswerFilter(role);
        if (answerFilter) {
          url.searchParams.set("filter", answerFilter);
        }
      }

      // Handle legacy queue if present
      if (activeQueue) url.searchParams.set("queue", activeQueue);

      const res = await fetch(url.toString(), {
        credentials: "include",
        cache: "no-store",
        headers: { "x-workspace-id": workspaceId },
        signal: controller.signal,
      });
      const data = await res.json();
      if (data.items) {
        const mapped: AnswerBlock[] = data.items.map((item: any) => ({
          id: item.id as string,
          topic: item.topic as AnswerBlock["topic"],
          title: item.title as string,
          answer: (item.answer as string) || "No response content yet.",
          evidence: (item.evidence || []).map((ev: any) => ({
            docName: ev.chunk?.sourceDocument?.fileName || "Unknown Document",
            content: ev.chunk?.text || ev.quote || "",
            page: ev.chunk?.metadata?.page
          })),
          ownerId: (item.ownerId as string | null) ?? null,
          owner: (item.owner as string) ?? "",
          ownerUser: item.ownerUser as AnswerBlock["ownerUser"],
          approverId: (item.approverId as string | null) ?? null,
          approverUser: item.approverUser as AnswerBlock["approverUser"],
          governanceStatus: (item.governanceStatus as string | undefined) ?? undefined,
          approvalScope: (item.approvalScope as string | undefined) ?? undefined,
          exportSafe: item.exportSafe as boolean | undefined,
          nextReviewDueAt: (item.nextReviewDueAt as string | null | undefined) ?? null,
          expiresAt: (item.expiresAt as string | null | undefined) ?? null,
          reviewCadenceDays: (item.reviewCadenceDays as number | null | undefined) ?? null,
          updatedAt: item.updatedAt ? new Date(item.updatedAt as string).toLocaleDateString() : "—",
          lastVerified: item.lastVerified ? new Date(item.lastVerified as string).toLocaleDateString() : "Never",
          version: item.version as string,
          currentVersion: (item.currentVersion as number) || 1,
          status: item.status as string,
          confidenceScore: item.confidenceScore as number | null,
          hasEvidence: item.evidence?.length > 0 || ((item._count as { evidence?: number })?.evidence ?? 0) > 0,
          overrideReasonCategory: (item.overrideReasonCategory as string | null | undefined) ?? null,
          overrideComment: (item.overrideComment as string | null | undefined) ?? null,
          overrideScope: (item.overrideScope as string | null | undefined) ?? null,
        }));
        // Belt-and-braces client-side id-dedupe. The server already dedupes
        // and the DB now enforces uniqueness on seeded drafts, but any stray
        // duplicate in the response would still crash React with duplicate
        // keys — this keeps the UI resilient regardless.
        const seenIds = new Set<string>();
        const deduped = mapped.filter((answer) => {
          if (seenIds.has(answer.id)) return false;
          seenIds.add(answer.id);
          return true;
        });
        setAnswers(deduped);
        return deduped;
      }
      return undefined;
    } catch (err: any) {
      if (err.name === "AbortError") {
        return undefined; // Ignore aborted requests
      }
      console.error("Library: Failed to fetch answers", err);
      return undefined;
    } finally {
      if (fetchAnswersAbortController.current === controller) {
        setIsLoading(false);
      }
    }
  }, [workspaceId, selectedTopic, filters, debouncedSearch, isApprover, isOwner, isContributor, topicScope, activeQueue]);

  useEffect(() => {
    const crossTopicMode = !selectedTopic && activeQueue;
    if (workspaceId && viewMode === "list" && (selectedTopic || crossTopicMode)) void fetchAnswers();
  }, [workspaceId, selectedTopic, viewMode, fetchAnswers, filters, debouncedSearch, activeQueue]);

  const handleTopicOpen = (topic: TopicWithStats) => {
    setSelectedTopic(topic);
    setViewMode("list");
    setFilters(prev => ({ ...prev, search: "" }));
  };

  const handleFormSuccess = async (meta?: { editedAnswerId?: string }) => {
    const list = await fetchAnswers();
    void fetchTopics();
    setLibraryRefreshKey(prev => prev + 1);
    // Trigger detail drawer refetch when an answer was edited
    if (meta?.editedAnswerId) {
      setDetailRefreshKey(prev => prev + 1);
      if (list) {
        const reopened = list.find((a) => a.id === meta.editedAnswerId);
        if (reopened) setSelectedAnswer(reopened);
      }
    }
  };

  const openAddEntry = (topicId?: string | null) => {
    setEditingAnswer(null);
    setFormDefaultTopicId(topicId ?? selectedTopic?.id ?? null);
    setIsFormOpen(true);
  };

  const filteredAnswers = answers; // API handles search now

  return (
    <RouteGuard requiredPermissions={Permission.VIEW_ANSWERS}>
      <div className="space-y-8 animate-page-fade">
        <PageHeader
          title={isOwner ? "Answer Workspace" : "Answer Library"}
          description={isApprover
            ? "Review and approve verified security responses. Inspect evidence, provenance, and readiness before approval."
            : isOwner
              ? "Maintain and improve your assigned security answers. Ensure evidence is fresh and drafts are ready for approval."
              : "Centralize verified security responses. Power automated questionnaire completion with source-backed evidence."}
          variant="emphasized"
          actions={
            <div className="flex flex-wrap items-center gap-3">
              <div
                role="tablist"
                aria-label="View mode"
                className="inline-flex items-center rounded-md border border-surface-border bg-surface-base p-1 shadow-sm"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewMode === "grid"}
                  onClick={() => setViewMode("grid")}
                  className={`inline-flex items-center gap-1.5 rounded-[0.3rem] px-3 py-1.5 text-sm font-medium transition-colors ${viewMode === "grid"
                      ? "bg-surface-panel text-text-primary shadow-sm"
                      : "text-text-muted hover:text-text-primary"
                    }`}
                >
                  <GridIcon className="h-4 w-4" />
                  Catalog
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewMode === "list"}
                  onClick={() => {
                    setViewMode("list");
                    if (!selectedTopic && topics.length > 0) {
                      try {
                        const raw = sessionStorage.getItem(LAST_TOPIC_KEY);
                        const fromStore = raw ? topics.find((t) => t.key === raw) : null;
                        setSelectedTopic(fromStore ?? topics[0] ?? null);
                      } catch {
                        setSelectedTopic(topics[0] ?? null);
                      }
                    }
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-[0.3rem] px-3 py-1.5 text-sm font-medium transition-colors ${viewMode === "list"
                      ? "bg-surface-panel text-text-primary shadow-sm"
                      : "text-text-muted hover:text-text-primary"
                    }`}
                >
                  <ListIcon className="h-4 w-4" />
                  {isApprover ? "Review" : isOwner ? "Work" : "Review"}
                </button>
              </div>

              {/* Hide authoring controls for Approver */}
              {canAuthorContent && (
                <>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      // Logic for security scan would go here
                      console.log("Run Security Scan clicked");
                    }}
                    leftIcon={<ShieldCheckIcon className="h-4 w-4" />}
                  >
                    Run Security Scan
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditingTopic(null);
                      setIsTopicFormOpen(true);
                    }}
                    leftIcon={<PlusIcon className="h-4 w-4" />}
                  >
                    Add Topic
                  </Button>
                  <Button
                    onClick={() => openAddEntry(null)}
                    leftIcon={<PlusIcon className="h-4 w-4" />}
                  >
                    Add Entry
                  </Button>
                </>
              )}
            </div>
          }
        />

        <WorkspaceSetupRail context="library" />

        {/* Role scope toggle - visible only to roles with focused scoping (Approver, Contributor) */}
        {(isApprover || isContributor) && (
          <Card className="border-accent-primary/20 bg-accent-primary/5">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-primary/10">
                  <ShieldCheckIcon className="h-4 w-4 text-accent-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-text-primary">
                    {topicScope === "focused"
                      ? roleScopeConfig.focusedScopeLabel
                      : roleScopeConfig.broaderContextLabel}
                  </p>
                  <p className="text-xs text-text-muted">
                    {topicScope === "focused"
                      ? roleScopeConfig.focusedScopeDescription
                      : roleScopeConfig.allScopeDescription}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant={topicScope === "focused" ? "primary" : "outline"}
                  size="sm"
                  onClick={() => setTopicScope("focused")}
                >
                  {roleScopeConfig.focusedScopeLabel}
                </Button>
                <Button
                  variant={topicScope === "all" ? "primary" : "outline"}
                  size="sm"
                  onClick={() => setTopicScope("all")}
                >
                  {roleScopeConfig.broaderContextLabel}
                </Button>
              </div>
            </div>
          </Card>
        )}

        {topicsLoadError && (
          <StatusBanner
            severity="error"
            title="Could not load topics"
            message={topicsLoadError}
          />
        )}

        <LibraryCommandStrip
          topics={topics} // Pass all topics for global stats
          topicSearchQuery={topicSearchQuery}
          onTopicSearchQueryChange={setTopicSearchQuery}
          filteredTopicCount={filteredTopics.length}
        />

        {/* Topic suggestions - admin/operator only */}
        {canAuthorContent && (
          <TopicSuggestionInbox
            onReview={(suggestion) => {
              setEditingTopic(suggestion as any);
              setIsTopicFormOpen(true);
            }}
            onApproved={() => {
              void fetchTopics();
              setSuggestionRefreshKey(prev => prev + 1);
              setLibraryRefreshKey(prev => prev + 1);
            }}
            onDismissed={() => {
              void fetchTopics();
              setSuggestionRefreshKey(prev => prev + 1);
              setLibraryRefreshKey(prev => prev + 1);
            }}
            refreshKey={suggestionRefreshKey}
          />
        )}

        {viewMode === "grid" ? (
          <>
            {/* Governance Queue Bar — role-aware actionable counts */}


            {/* D10-DS-01: Seeded Suggestions Hero */}
            {showSeedingHero && topics.some(t => t.totalAnswers - t.approvedAnswers > 0) && (
              <div className="animate-in fade-in slide-in-from-top-4 duration-700">
                <SeedingReviewHero
                  draftCount={topics.reduce((acc, t) => acc + (t.totalAnswers - t.approvedAnswers), 0)}
                  topicCount={topics.filter(t => (t.totalAnswers - t.approvedAnswers) > 0).length}
                  onStartReview={() => {
                    setViewMode("list");
                    // Try to pick the first topic with drafts
                    const firstWithDrafts = topics.find(t => (t.totalAnswers - t.approvedAnswers) > 0);
                    if (firstWithDrafts) setSelectedTopic(firstWithDrafts);
                  }}
                  onDismiss={() => {
                    setShowSeedingHero(false);
                    localStorage.setItem(HERO_DISMISSED_KEY, "true");
                  }}
                />
              </div>
            )}
            <div className="space-y-6">
              {isTopicsLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="h-[200px] rounded-2xl border border-surface-border bg-white p-6 space-y-4">
                      <div className="flex items-start justify-between">
                        <Skeleton className="h-10 w-10 rounded-xl" />
                        <Skeleton className="h-4 w-24 rounded" />
                      </div>
                      <Skeleton className="h-6 w-[70%] rounded" />
                      <Skeleton className="h-4 w-full rounded" />
                      <div className="flex gap-2 pt-2">
                        <Skeleton className="h-6 w-16 rounded-full" />
                        <Skeleton className="h-6 w-16 rounded-full" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : topics.length === 0 && !topicsLoadError ? (
                <Card className="flex flex-col items-center justify-center p-16 text-center shadow-md bg-gradient-to-b from-surface-panel to-surface-base">
                  <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-surface-border bg-white shadow-sm">
                    <BookIcon className="h-8 w-8 text-accent-primary" />
                  </div>
                  <h3 className="text-xl font-bold text-text-primary">Create your governed answer library</h3>
                  <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-text-muted">
                    Approved answers and evidence-backed templates will appear here after you upload source documents or review questionnaire responses.
                  </p>
                  <p className="mt-2 text-xs text-text-muted italic">
                    A governed library ensures your sales and security teams always use the most accurate, fresh, and approved responses.
                  </p>
                  <div className="mt-8 flex items-center gap-4">
                    <Link href="/app/documents">
                      <Button variant="primary" className="px-8">Upload Documents</Button>
                    </Link>
                  </div>
                </Card>
              ) : (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
                  {focusedEmptyContent}
                  {allTopicsEmptyContent}
                  <div className="mt-6">
                    <TopicCatalogGrid
                      topics={filteredTopics}
                      onTopicOpen={handleTopicOpen}
                      onAddEntry={canAuthorContent ? (topic) => {
                        setSelectedTopic(topic);
                        openAddEntry(topic.id);
                      } : undefined}
                    />
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
            <Card noPadding className="hidden shrink-0 shadow-sm lg:sticky lg:top-14 lg:block lg:max-h-[calc(100vh-8rem)] lg:w-80 lg:overflow-hidden xl:w-[22rem]">
              <TopicExplorerList
                topics={topics}
                selectedTopic={selectedTopic}
                onSelectTopic={(t) => {
                  setSelectedTopic(t);
                  setFilters(prev => ({ ...prev, search: "" }));
                }}
                topicSearchQuery={topicSearchQuery}
                onTopicSearchQueryChange={setTopicSearchQuery}
                role={role}
                userId={userId}
                topicScope={topicScope}
              />

            </Card>

            <div className="min-w-0 flex-1 space-y-4">
              <div className="lg:hidden">
                <label htmlFor="library-mobile-topic" className="mb-1.5 block text-sm font-medium text-text-secondary">
                  Topic
                </label>
                <select
                  id="library-mobile-topic"
                  value={selectedTopic?.key ?? ""}
                  onChange={(e) => {
                    const t = topics.find((x) => x.key === e.target.value);
                    if (t) {
                      setSelectedTopic(t);
                      setFilters(prev => ({ ...prev, search: "" }));
                    }
                  }}
                  className="h-10 w-full rounded-md border border-surface-border bg-surface-panel px-3 text-sm text-text-primary"
                >
                  <option value="">Select a topic…</option>
                  {filterTopicsByQuery(topics, topicSearchQuery).map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <LibraryTopicDetailPanel
                topic={selectedTopic}
                answers={answers}
                filteredAnswers={filteredAnswers}
                isLoading={isLoading}
                filters={filters}
                onFiltersChange={setFilters}
                onBackToCatalog={() => {
                  setViewMode("grid");
                  setSelectedTopic(null);
                }}
                onAddEntry={canAuthorContent ? () => openAddEntry(selectedTopic?.id ?? null) : undefined}
                onOpenAnswer={(block) => setSelectedAnswer(block)}
                onEditAnswer={(item) => {
                  setEditingAnswer(item);
                  setFormDefaultTopicId(null);
                  setIsFormOpen(true);
                }}
                onSubmitForReview={async (item) => {
                  try {
                    const res = await fetch(`/api/knowledge/answers/${item.id}/workflow`, {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        "x-workspace-id": workspaceId || "",
                      },
                      body: JSON.stringify({ action: "submitForApproval", comment: "Submitted for review from row" }),
                    });
                    if (!res.ok) {
                      const data = await res.json().catch(() => ({}));
                      throw new Error(data.error || "Submit for review failed");
                    }
                    await fetchAnswers();
                  } catch (err) {
                    console.error("Submit for review failed:", err);
                    alert(err instanceof Error ? err.message : "Submit for review failed");
                  }
                }}
                workspaceMembers={workspaceMembers}
                onRefresh={fetchAnswers}
                currentUserId={userId}
                role={role}
                topicScope={topicScope}
                onTopicScopeChange={(s) => setTopicScope(s)}
              />
            </div>
          </div>
        )}


        <AnswerDetailSlideOver
          answer={selectedAnswer}
          onClose={() => setSelectedAnswer(null)}
          onEdit={() => {
            if (selectedAnswer) {
              setEditingAnswer(selectedAnswer);
              setSelectedAnswer(null);
              setFormDefaultTopicId(null);
              setIsFormOpen(true);
            }
          }}
          onSuccess={() => {
            void fetchTopics();
            void fetchAnswers();
          }}
          workspaceId={workspaceId || ""}
          workspaceMembers={workspaceMembers}
          refreshKey={detailRefreshKey}
        />

        <AnswerFormSlideOver
          isOpen={isFormOpen}
          onClose={() => {
            setIsFormOpen(false);
            setFormDefaultTopicId(null);
          }}
          onSuccess={handleFormSuccess}
          topics={topics}
          workspaceId={workspaceId || ""}
          workspaceMembers={workspaceMembers}
          initialData={editingAnswer}
          defaultTopicId={formDefaultTopicId}
        />

        <TopicFormSlideOver
          isOpen={isTopicFormOpen}
          onClose={() => {
            setIsTopicFormOpen(false);
            setEditingTopic(null);
          }}
          onSuccess={() => {
            void fetchTopics();
            setSuggestionRefreshKey(prev => prev + 1);
            setLibraryRefreshKey(prev => prev + 1);
          }}
          workspaceId={workspaceId || ""}
          workspaceMembers={workspaceMembers}
          initialData={editingTopic}
        />
      </div>
    </RouteGuard>
  );
}
