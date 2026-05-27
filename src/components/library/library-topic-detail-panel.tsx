"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { LibraryAnswerRow } from "@/components/library/library-answer-row";
import { PlusIcon, SparklesIcon, UploadIcon, ArrowLeftIcon, SearchIcon, ShieldCheckIcon } from "@/components/icons";
import { PermissionGuard } from "@/components/auth/permission-guard";
import { Permission } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";
import type { AnswerBlock } from "@/components/library/library-types";
import type { TopicWithStats } from "@/components/library/topic-card";
import { useToast } from "@/components/ui/toast";
import {
  EXPORT_SAFETY_TIERS,
  EXPORT_SAFETY_LABELS,
  EXPORT_SAFETY_SHORT_LABELS,
  type ExportSafetyTier,
} from "@/lib/knowledge/answer-export-safety";
import { GOVERNANCE_QUEUE_IDS, isLibraryCrossTopicGovernanceFilter } from "@/lib/knowledge/governance-shared";
import {
  FILTER_GROUPS,
  DEFAULT_FILTERS,
  getActiveFilterCount,
  type AnswerLibraryFilters
} from "@/lib/knowledge/filter-utils";
import { CloseIcon, FilterIcon } from "@/components/icons";

interface LibraryTopicDetailPanelProps {
  topic: TopicWithStats | null;
  answers: AnswerBlock[];
  filteredAnswers: AnswerBlock[];
  isLoading: boolean;
  filters: AnswerLibraryFilters;
  onFiltersChange: (filters: AnswerLibraryFilters) => void;
  onBackToCatalog: () => void;
  onAddEntry?: () => void;
  onOpenAnswer: (answer: AnswerBlock) => void;
  onEditAnswer?: (answer: AnswerBlock) => void;
  onSubmitForReview?: (answer: AnswerBlock) => void;
  workspaceMembers: any[];
  onRefresh?: () => void;
  currentUserId?: string | null;
  role?: string;
  topicScope?: "focused" | "all";
  onTopicScopeChange?: (scope: "focused" | "all") => void;
  governanceFilter?: string; // For cross-topic governance view empty states
}

const LibraryToolbar = ({
  filters,
  onFiltersChange,
  onAddEntry,
  onRefresh,
  isLoading,
}: {
  filters: AnswerLibraryFilters;
  onFiltersChange: (filters: AnswerLibraryFilters) => void;
  onAddEntry?: () => void;
  onRefresh?: () => void;
  isLoading: boolean;
}) => {
  const activeCount = getActiveFilterCount(filters);

  const toggleFilter = (groupId: keyof Omit<AnswerLibraryFilters, "search">, optionId: string) => {
    const current = filters[groupId] as string[];
    const next = current.includes(optionId)
      ? current.filter((id) => id !== optionId)
      : [...current, optionId];
    onFiltersChange({ ...filters, [groupId]: next });
  };

  const clearAll = () => {
    onFiltersChange({ ...DEFAULT_FILTERS, search: filters.search });
  };

  return (
    <div className="flex flex-col gap-4 border-b border-gray-100 bg-white/50 p-4 backdrop-blur-sm">
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search title, content, or source document..."
            className="h-10 w-full rounded-lg border border-gray-200 bg-white pl-10 pr-4 text-sm outline-none transition-all focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
            value={filters.search}
            onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
          />
        </div>

        {onAddEntry && (
          <button
            onClick={onAddEntry}
            className="flex h-10 items-center gap-2 rounded-lg bg-primary-600 px-4 text-sm font-medium text-white transition-colors hover:bg-primary-700 active:scale-95"
          >
            <PlusIcon className="h-4 w-4" />
            New Answer
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
        {FILTER_GROUPS.map((group) => (
          <div key={group.id} className="flex flex-col gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
              {group.label}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {group.options.map((option) => {
                const isActive = (filters[group.id] as string[]).includes(option.id);
                return (
                  <button
                    key={option.id}
                    onClick={() => toggleFilter(group.id as any, option.id)}
                    className={cn(
                      "flex h-7 items-center rounded-full px-3 text-xs font-medium transition-all",
                      isActive
                        ? "bg-primary-50 text-primary-700 ring-1 ring-inset ring-primary-600/20"
                        : "bg-gray-50 text-gray-600 hover:bg-gray-100",
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {activeCount > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-transparent select-none">
              Actions
            </span>
            <button
              onClick={clearAll}
              className="flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-red-600 transition-all hover:bg-red-50"
            >
              <CloseIcon className="h-3 w-3" />
              Clear all
            </button>
          </div>
        )}
      </div>

      {activeCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-gray-50 pt-3">
          <span className="text-xs font-medium text-gray-500">Active filters:</span>
          {FILTER_GROUPS.flatMap((group) =>
            (filters[group.id] as string[]).map((optionId) => {
              const label = group.options.find((o) => o.id === optionId)?.label || optionId;
              return (
                <div
                  key={`${group.id}-${optionId}`}
                  className="flex items-center gap-1 rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700"
                >
                  <span className="text-gray-400">{group.label}:</span>
                  {label}
                  <button
                    onClick={() => toggleFilter(group.id as any, optionId)}
                    className="ml-0.5 text-gray-400 hover:text-gray-600"
                  >
                    <CloseIcon className="h-3 w-3" />
                  </button>
                </div>
              );
            }),
          )}
          <span className="ml-auto text-[11px] text-gray-400">
            {isLoading ? "Refreshing..." : `${activeCount} filter${activeCount === 1 ? "" : "s"} applied`}
          </span>
        </div>
      )}
    </div>
  );
};

export function LibraryTopicDetailPanel({
  topic,
  answers,
  filteredAnswers,
  isLoading,
  filters,
  onFiltersChange,
  onBackToCatalog,
  onAddEntry,
  onOpenAnswer,
  onEditAnswer,
  onSubmitForReview,
  workspaceMembers,
  onRefresh,
  currentUserId,
  role,
  topicScope,
  onTopicScopeChange,
  governanceFilter,
}: LibraryTopicDetailPanelProps) {
  const [submittingAnswerId, setSubmittingAnswerId] = useState<string | null>(null);

  const handleSubmitForReview = async (item: AnswerBlock) => {
    if (!onSubmitForReview) return;
    setSubmittingAnswerId(item.id);
    try {
      await onSubmitForReview(item);
    } finally {
      setSubmittingAnswerId(null);
    }
  };
  const isCrossTopicGovernanceView = !topic;
  const isApprover = role === "APPROVER";
  const isOwner = role === "OWNER";
  const isContributor = role === "CONTRIBUTOR";
  const { toast } = useToast();
  const [isSeeding, setIsSeeding] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);

  const toggleSelect = (id: string, selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleBulkAction = async (action: string, value?: string) => {
    if (selectedIds.size === 0 || isBulkUpdating) return;
    setIsBulkUpdating(true);
    try {
      const res = await fetch("/api/knowledge/answers/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answerIds: Array.from(selectedIds),
          action,
          value,
        }),
      });
      if (res.ok) {
        toast({
          severity: "success",
          title: "Bulk update complete",
          message: `Successfully updated ${selectedIds.size} items.`,
        });
        setSelectedIds(new Set());
        onRefresh?.();
      } else {
        const data = await res.json();
        toast({
          severity: "error",
          title: "Bulk update failed",
          message: data.error || "An error occurred during bulk update.",
        });
      }
    } catch (err) {
      console.error("Bulk update failed", err);
      toast({
        severity: "error",
        title: "Communication error",
        message: "Failed to connect to the bulk update service.",
      });
    } finally {
      setIsBulkUpdating(false);
    }
  };

  if (!topic && !isCrossTopicGovernanceView) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-surface-border bg-surface-panel/40 px-6 py-20 text-center">
        <p className="text-sm font-medium text-text-primary">Select a topic to view its answers</p>
        <p className="mt-1 text-sm text-text-muted">Choose a topic from the sidebar to start reviewing.</p>
      </div>
    );
  }

  if (isCrossTopicGovernanceView) {
    return (
      <Card noPadding className="shadow-sm">
        <div className="px-6 pt-6 sm:px-7">
          <CardHeader
            title="Governance Queue"
            description={`${answers.length} ${answers.length === 1 ? "answer" : "answers"} across all topics`}
            actions={
              <button
                type="button"
                onClick={() => {
                  onBackToCatalog();
                }}
                className="inline-flex items-center gap-1.5 rounded-md border border-surface-border bg-surface-panel px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
              >
                <ArrowLeftIcon className="h-3.5 w-3.5" />
                Back to catalog
              </button>
            }
          />
        </div>

        <LibraryToolbar
          filters={filters}
          onFiltersChange={onFiltersChange}
          onAddEntry={onAddEntry}
          onRefresh={onRefresh}
          isLoading={isLoading}
        />

        {isLoading ? (
          <div className="flex h-48 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent-primary border-t-transparent" />
          </div>
        ) : filteredAnswers.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-sm font-semibold text-text-primary">No answers match this filter</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-text-muted">
              {/* Cross-topic governance filter messages */}
              {(governanceFilter ?? "") === "my_owned" && "You have no owned answers yet. Ask an admin to assign you as owner on some answers."}
              {(governanceFilter ?? "") === "my_approvals" && "You have no answers awaiting your approval right now."}
              {(governanceFilter ?? "") === "unowned" && "All answers have owners assigned — great governance health!"}
              {(governanceFilter ?? "") === "no_approver" && "All answers have approvers assigned."}
              {(governanceFilter ?? "") === "freshness_expired" && "No answers are past their next review date or marked expired."}
              {(governanceFilter ?? "") === "freshness_due_soon" && "No answers have a review due within the next 14 days."}
              {(governanceFilter ?? "") === "freshness_needs_review" && "Nothing is waiting on review, revision, or freshness renewal."}
              {(governanceFilter ?? "").startsWith("exportSafety_") && "No answers match this export-safety tier in your workspace."}
              {(governanceFilter ?? "") === "my_stale_owned" && "You have no owned answers that are overdue for review."}
              {(governanceFilter ?? "") === "my_revision_required" && "You have no answers waiting on your revision."}
              {(governanceFilter ?? "") === "drafts_awaiting_approval" && "Nothing is currently in review for the workspace."}
              {(governanceFilter ?? "") === "export_blocked" && "No answers match this export-risk filter."}
              {(governanceFilter ?? "") === "override_canonical_review" && "No overrides are requesting canonical library updates."}
              {(governanceFilter ?? "") === "operator_library_blockers" && "No library answers are in a blocking governance state."}

              {/* Contributor focused-mode message (when no governance filter but in focused scope) */}
              {!governanceFilter && isContributor && topicScope === "focused" && (
                <>
                  No answers in this topic currently require your contribution. This topic may have answers, but none with your previous edits or evidence uploads.
                </>
              )}
            </p>

            {/* Show option to switch to broader context for Contributors */}
            {!governanceFilter && isContributor && topicScope === "focused" && onTopicScopeChange && (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => onTopicScopeChange("all")}
                  className="inline-flex items-center gap-1.5 rounded-md border border-surface-border bg-surface-panel px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
                >
                  View all topic answers (read-only)
                </button>
              </div>
            )}
          </div>
        ) : (
          <div>
            {filteredAnswers.map((item) => (
              <LibraryAnswerRow
                key={item.id}
                block={item}
                onOpen={() => onOpenAnswer(item)}
                onEdit={() => onEditAnswer?.(item)}
                onSubmitForReview={() => handleSubmitForReview(item)}
                selected={selectedIds.has(item.id)}
                onSelectChange={toggleSelect}
                role={role}
                isSubmitting={submittingAnswerId === item.id}
              />
            ))}
          </div>
        )}

        {selectedIds.size > 0 && (
          <BulkActionBar
            selectedCount={selectedIds.size}
            onAction={handleBulkAction}
            isUpdating={isBulkUpdating}
            workspaceMembers={workspaceMembers}
            onCancel={() => setSelectedIds(new Set())}
            role={role}
            currentUserId={currentUserId}
          />
        )}
      </Card>
    );
  }

  // topic is non-null below
  if (!topic) return null;

  const draftish = topic.totalAnswers - topic.approvedAnswers;
  const hasEvidenceButNoAnswers = topic.totalAnswers === 0 && (topic.health?.sourceChunks ?? 0) > 0;

  const handleSeed = async () => {
    if (!topic || isSeeding) return;
    setIsSeeding(true);
    try {
      const res = await fetch(`/api/knowledge/topics/${topic.id}/seed`, {
        method: "POST",
        headers: { "x-workspace-id": (topic as TopicWithStats & { workspaceId?: string }).workspaceId || "" },
      });
      const data = await res.json();
      if (res.ok) {
        toast({
          severity: "success",
          title: "Seeding complete",
          message: "AI has successfully synthesized initial drafts from evidence.",
        });
        window.location.reload();
      } else {
        toast({
          severity: "error",
          title: "Seeding failed",
          message: data.error || "An unexpected error occurred while generating drafts.",
        });
      }
    } catch (err) {
      console.error("Seeding failed", err);
      toast({
        severity: "error",
        title: "Communication error",
        message: "Failed to connect to the seeding service. Check your network connection.",
      });
    } finally {
      setIsSeeding(false);
    }
  };

  return (

    <Card noPadding className="shadow-sm">
      <div className="px-6 pt-6 sm:px-7">
        <CardHeader
          title={topic.name}
          description={
            (() => {
              // In focused mode, show scoped counts specific to the user's role
              if (topicScope === "focused") {
                if (isApprover) {
                  return `${filteredAnswers.length} assigned to you in this topic`;
                }
                if (isContributor) {
                  return `${filteredAnswers.length} ${filteredAnswers.length === 1 ? "answer" : "answers"} with your contributions`;
                }
              }
              // Default: show generic counts (for all-topic mode or roles without focused scoping)
              return topic.description || `${topic.totalAnswers} ${topic.totalAnswers === 1 ? "answer" : "answers"} · ${topic.approvedAnswers} approved${draftish > 0 ? ` · ${draftish} draft${draftish === 1 ? "" : "s"}` : ""}`;
            })()
          }
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {(isApprover || isOwner || isContributor) && (
                <div className="mr-2 flex items-center rounded-md border border-surface-border bg-surface-base p-0.5 shadow-sm">
                  <button
                    type="button"
                    onClick={() => onTopicScopeChange?.("focused")}
                    className={cn(
                      "rounded px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-all",
                      topicScope === "focused"
                        ? "bg-accent-primary text-white shadow-sm"
                        : "text-text-muted hover:text-text-primary"
                    )}
                  >
                    {isContributor ? "My Contributions" : isOwner ? "My Work" : "My Assigned"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onTopicScopeChange?.("all")}
                    className={cn(
                      "rounded px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-all",
                      topicScope === "all"
                        ? "bg-accent-primary text-white shadow-sm"
                        : "text-text-muted hover:text-text-primary"
                    )}
                  >
                    {isContributor ? "All (Read-Only)" : "All Topic"}
                  </button>
                </div>
              )}
              <button
                type="button"
                onClick={onBackToCatalog}
                className="inline-flex items-center gap-1.5 rounded-md border border-surface-border bg-surface-panel px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
              >
                <ArrowLeftIcon className="h-3.5 w-3.5" />
                All topics
              </button>
              <PermissionGuard permission={Permission.EDIT_ANSWERS}>
                <Link
                  href={`/app/documents?upload=true&topicId=${topic.id}`}
                  className="inline-flex items-center gap-1.5 rounded-md border border-surface-border bg-surface-panel px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
                >
                  <UploadIcon className="h-3.5 w-3.5" />
                  Upload evidence
                </Link>
                <button
                  type="button"
                  onClick={onAddEntry}
                  className="inline-flex items-center gap-1.5 rounded-md bg-accent-primary px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-accent-primary-hover"
                >
                  <PlusIcon className="h-3.5 w-3.5" />
                  Add entry
                </button>
              </PermissionGuard>
            </div>
          }
        />
      </div>

      <LibraryToolbar
        filters={filters}
        onFiltersChange={onFiltersChange}
        onAddEntry={onAddEntry}
        onRefresh={onRefresh}
        isLoading={isLoading}
      />

      {isLoading ? (
        <div className="flex h-48 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent-primary border-t-transparent" />
        </div>
      ) : answers.length === 0 ? (
        <div className="px-6 py-14 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-surface-border bg-surface-base">
            {governanceFilter ? (
              <ShieldCheckIcon className="h-6 w-6 text-accent-primary" />
            ) : (
              <SparklesIcon className="h-6 w-6 text-accent-primary" />
            )}
          </div>
          <p className="text-base font-semibold text-text-primary">
            {governanceFilter === "my_approvals"
              ? "All caught up!"
              : governanceFilter === "my_owned"
                ? "No assigned answers"
                : governanceFilter
                  ? "Queue is empty"
                  : hasEvidenceButNoAnswers 
                    ? "Evidence found, but no draft answers yet" 
                    : "No answers in this topic yet"}
          </p>
          <div className="mx-auto mt-2 max-w-md">
            {!governanceFilter ? (
              <>
                {topic?.health?.seedingError && topic.totalAnswers === 0 && (
                  <div className="mb-3 rounded-md border border-semantic-warning-border bg-semantic-warning-bg/50 px-3 py-2 text-left text-xs leading-relaxed text-semantic-warning">
                    <span className="mb-1 block font-semibold uppercase tracking-wide">AI generation guard</span>
                    {topic.health.seedingError.replace("Quality rejection: ", "")}
                  </div>
                )}
                <p className="text-sm leading-relaxed text-text-muted">
                  {hasEvidenceButNoAnswers
                    ? `We found ${topic?.health?.sourceChunks ?? 0} document fragments related to ${topic?.name ?? "this topic"}. Have the AI generate initial draft answers from this evidence.`
                    : "Add an entry manually or upload documents so suggested answers can appear here after indexing."}
                </p>
              </>
            ) : (
              <p className="text-sm leading-relaxed text-text-muted">
                {governanceFilter === "my_approvals"
                  ? topic 
                    ? "No more answers awaiting your approval in this topic." 
                    : "You have no answers awaiting your approval right now."
                  : governanceFilter === "my_owned"
                    ? topic 
                      ? "No assigned answers in this topic." 
                      : "You have no answers in your assigned topics."
                    : "There are no answers matching this governance queue."}
              </p>
            )}
          </div>
          {!governanceFilter && (
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              {hasEvidenceButNoAnswers ? (
                <button
                  type="button"
                  onClick={handleSeed}
                  disabled={isSeeding}
                  className="inline-flex items-center gap-2 rounded-md bg-accent-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-accent-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <SparklesIcon className="h-4 w-4" />
                  {isSeeding ? "Generating drafts…" : "Seed from evidence"}
                </button>
              ) : (
                <PermissionGuard permission={Permission.EDIT_ANSWERS}>
                  <button
                    type="button"
                    onClick={onAddEntry}
                    className="inline-flex items-center gap-1.5 rounded-md border border-surface-border bg-surface-panel px-3 py-2 text-sm font-medium text-text-primary shadow-sm transition-colors hover:bg-surface-hover"
                  >
                    <PlusIcon className="h-4 w-4" />
                    Add entry
                  </button>
                  <Link
                    href={`/app/documents?upload=true&topicId=${topic?.id ?? ""}`}
                    className="inline-flex items-center gap-1.5 rounded-md bg-accent-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-accent-primary-hover"
                  >
                    <UploadIcon className="h-4 w-4" />
                    Upload evidence
                  </Link>
                </PermissionGuard>
              )}
            </div>
          )}
        </div>
      ) : (
        <div>
          {filteredAnswers.map((item) => {
            // Determine if this answer should be shown as "context only" (read-only) in broader view
            // For Approvers: in "all" scope, non-assigned answers are context-only
            // For Contributors: in "all" scope, answers they haven't contributed to are context-only
            const isContextOnly = (() => {
              if (topicScope !== "all") return false; // Only in broader view

              if (isApprover) {
                return item.approverId !== currentUserId;
              }

              if (isContributor) {
                // In all-topic mode, answers without contribution signals are context-only
                return !item.contributionSignals?.hasContributed;
              }

              return false;
            })();

            return (
              <LibraryAnswerRow
                key={item.id}
                block={item}
                onOpen={() => onOpenAnswer(item)}
                onEdit={() => onEditAnswer?.(item)}
                onSubmitForReview={() => handleSubmitForReview(item)}
                selected={selectedIds.has(item.id)}
                onSelectChange={toggleSelect}
                contextOnly={isContextOnly}
                isSubmitting={submittingAnswerId === item.id}
                role={role}
              />
            );
          })}
          {selectedIds.size > 0 && (
            <BulkActionBar
              selectedCount={selectedIds.size}
              onAction={handleBulkAction}
              isUpdating={isBulkUpdating}
              workspaceMembers={workspaceMembers}
              onCancel={() => setSelectedIds(new Set())}
              role={role}
              currentUserId={currentUserId}
            />
          )}
          {filteredAnswers.length === 0 && (
            <div className="flex h-32 items-center justify-center text-sm text-text-muted">
              No matches found for &ldquo;{filters.search}&rdquo;
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

interface BulkActionBarProps {
  selectedCount: number;
  onAction: (action: string, value?: string) => void;
  isUpdating: boolean;
  workspaceMembers: any[];
  onCancel: () => void;
  role?: string;
  currentUserId?: string | null;
}

function BulkActionBar({
  selectedCount,
  onAction,
  isUpdating,
  workspaceMembers,
  onCancel,
  role,
  currentUserId,
}: BulkActionBarProps) {
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const isOwner = role === "OWNER";

  return (
    <div className="fixed bottom-8 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 rounded-2xl border border-accent-primary/20 bg-surface-panel p-4 shadow-2xl animate-in slide-in-from-bottom-8 duration-300">
      <div className="flex items-center gap-3 border-r border-surface-border pr-4">
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-primary text-[11px] font-bold text-white shadow-sm">
          {selectedCount}
        </div>
        <span className="text-sm font-semibold text-text-primary">Selected</span>
        <button
          onClick={onCancel}
          className="text-xs font-medium text-text-muted hover:text-text-primary hover:underline"
        >
          Cancel
        </button>
      </div>

      <div className="flex items-center gap-2">
        {activeAction === "assign_owner" ? (
          <div className="flex items-center gap-2">
            <select
              className="h-8 rounded-md border border-surface-border bg-surface-base px-2 text-xs text-text-primary focus:border-accent-primary focus:outline-none"
              onChange={(e) => onAction("assign_owner", e.target.value)}
              disabled={isUpdating}
            >
              <option value="">Select owner...</option>
              {workspaceMembers.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.user?.name || m.user?.email}
                </option>
              ))}
            </select>
            <button
              onClick={() => setActiveAction(null)}
              className="text-xs font-medium text-text-muted"
            >
              Back
            </button>
          </div>
        ) : activeAction === "assign_approver" ? (
          <div className="flex items-center gap-2">
            <select
              className="h-8 rounded-md border border-surface-border bg-surface-base px-2 text-xs text-text-primary focus:border-accent-primary focus:outline-none"
              onChange={(e) => onAction("assign_approver", e.target.value)}
              disabled={isUpdating}
            >
              <option value="">Select approver...</option>
              {workspaceMembers.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.user?.name || m.user?.email}
                </option>
              ))}
            </select>
            <button
              onClick={() => setActiveAction(null)}
              className="text-xs font-medium text-text-muted"
            >
              Back
            </button>
          </div>
        ) : (
          <>
            {isOwner && (
              <button
                onClick={() => onAction("assign_owner", currentUserId || undefined)}
                className="rounded-md px-3 py-1.5 text-xs font-bold text-accent-primary hover:bg-accent-primary/5"
              >
                Claim selected
              </button>
            )}
            <PermissionGuard permission={Permission.ASSIGN_OWNERS}>
              <button
                onClick={() => setActiveAction("assign_owner")}
                className="rounded-md px-3 py-1.5 text-xs font-semibold text-text-secondary hover:bg-surface-hover hover:text-text-primary"
              >
                Assign owner
              </button>
              <button
                onClick={() => setActiveAction("assign_approver")}
                className="rounded-md px-3 py-1.5 text-xs font-semibold text-text-secondary hover:bg-surface-hover hover:text-text-primary"
              >
                Assign approver
              </button>
            </PermissionGuard>

            {isOwner && (
              <button
                onClick={() => onAction("mark_for_review")}
                className="rounded-md bg-accent-primary px-4 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-accent-primary-hover"
              >
                Submit for approval
              </button>
            )}

            <PermissionGuard permission={Permission.APPROVE_ANSWERS}>
              <button
                onClick={() => onAction("approve_internal")}
                className="rounded-md px-3 py-1.5 text-xs font-semibold text-text-secondary hover:bg-surface-hover hover:text-text-primary"
              >
                Approve internal
              </button>
              <button
                onClick={() => onAction("approve_for_export")}
                className="rounded-md bg-accent-primary px-4 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-accent-primary-hover disabled:opacity-50"
                disabled={isUpdating}
              >
                {isUpdating ? "Updating..." : "Approve for export"}
              </button>
            </PermissionGuard>
            <div className="h-6 w-px bg-surface-border mx-1" />
            <PermissionGuard permission={Permission.REQUIRE_REVISION}>
              <button
                onClick={() => onAction("request_revision")}
                className="rounded-md px-3 py-1.5 text-xs font-semibold text-semantic-warning hover:bg-semantic-warning/10"
              >
                Request revision
              </button>
            </PermissionGuard>
          </>
        )}
      </div>
    </div>
  );
}

