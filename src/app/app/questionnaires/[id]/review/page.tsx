"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { WarningIcon, CheckIcon, DownloadIcon, ArrowRightIcon, MagicIcon, SparklesIcon, RefreshIcon } from "@/components/icons";
import type { ReviewQuestionDTO, ReviewStatus } from "@/lib/questionnaires/types";
import { ReviewTable } from "@/components/questionnaires/review-table";
import { UnresolvedItemsList } from "@/components/questionnaires/unresolved-items-list";
import { EvidenceDrawer } from "@/components/questionnaires/evidence-drawer";
import { StatusBanner } from "@/components/ui/status-banner";
import { Modal } from "@/components/ui/modal";
import { ListIcon, GridIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { RESPONSE_TONES, type ResponseTone } from "@/lib/ai/tones";
import { PermissionGuard } from "@/components/auth/permission-guard";
import { Permission } from "@/lib/auth/permissions";
import { resolveDeepLinkActiveId } from "./deep-link";

type FilterKey = 
  | "all" | "pending" | "overridden" | "ambiguous" | "conflict" | "reviewed" 
  | "conf_high" | "conf_medium" | "conf_low"
  | "status_suggested" | "status_needs_review" | "status_accepted"
  | "origin_reuse" | "origin_synthesis" | "origin_evidence"
  | "missing_topic" | "no_approved_answer" | "low_confidence" | "no_evidence";

const FILTER_LABELS: Record<FilterKey, string> = {
  all: "All Items",
  pending: "Pending",
  overridden: "Overridden",
  ambiguous: "Ambiguous",
  conflict: "Conflicts",
  reviewed: "Reviewed",
  conf_high: "High Confidence",
  conf_medium: "Medium Confidence",
  conf_low: "Low Confidence",
  status_suggested: "Suggested Only",
  status_needs_review: "Needs Review",
  status_accepted: "Accepted Only",
  origin_reuse: "Library Reused",
  origin_synthesis: "AI Synthesized",
  origin_evidence: "Evidence Derived",
  missing_topic: "Missing Topics",
  no_approved_answer: "No Content",
  low_confidence: "Low Confidence",
  no_evidence: "No Evidence",
};

export default function ReviewPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const id = typeof params?.id === "string" ? params.id : "";
  const deepLinkItemId = searchParams?.get("itemId") ?? null;
  const deepLinkAppliedRef = useRef(false);

  const [title, setTitle] = useState<string>("");
  const [metadata, setMetadata] = useState<{
    suggestNewAnswer: boolean;
    outputColumnName?: string;
  } | null>(null);
  const [questions, setQuestions] = useState<ReviewQuestionDTO[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentTone, setCurrentTone] = useState<ResponseTone>("concise");
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());
  const [workspaceId, setWorkspaceId] = useState<string>("");

  const [filter, setFilter] = useState<FilterKey>("all");
  const [viewMode, setViewMode] = useState<"table" | "list">("table");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);

  // Tone Change Confirmation State
  const [isToneModalOpen, setIsToneModalOpen] = useState(false);
  const [pendingTone, setPendingTone] = useState<ResponseTone | null>(null);

  const fetchSummary = async (wsId?: string) => {
    const targetWs = wsId || workspaceId;
    try {
      const res = await fetch(`/api/questionnaires/${id}/summary`, { 
        headers: targetWs ? { "x-workspace-id": targetWs } : {},
        cache: "no-store" 
      });
      if (res.ok) {
        const data = await res.json();
        setSummary(data);
      }
    } catch (err) {
      console.error("Failed to fetch summary:", err);
    }
  };

  const fetchData = async () => {
    if (!id) return;
    setLoading(true);
    setLoadError(null);
    try {
      const cr = await fetch("/api/auth/context");
      const cd = await cr.json();
      const ws = cd.workspaceId ?? cd.workspaceIds?.[0] ?? "";
      setWorkspaceId(ws);
      
      const res = await fetch(`/api/questionnaires/${id}/review`, {
        headers: { "x-workspace-id": ws },
        cache: "no-store",
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error?.message || "Failed to load");
      
      setTitle(data.questionnaire?.title || "Questionnaire");
      setMetadata({
        suggestNewAnswer: data.questionnaire?.suggestNewAnswer ?? false,
        outputColumnName: data.questionnaire?.outputColumnName,
      });
      setCurrentTone((data.questionnaire?.tone as ResponseTone) || "concise");
      setQuestions(data.questions || []);
      setSummary(data.summary || null);
      
      if (ws) fetchSummary(ws);
    } catch (err: any) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [id]);

  // Deep-link support for `/app/questionnaires/[id]/review?itemId=...`:
  // Applied once after questions load so the drawer opens on the targeted row and
  // the row is scrolled into view. Guarded so subsequent question reloads (triggered
  // by row updates) do not re-scroll the user away from wherever they navigated to.
  useEffect(() => {
    if (deepLinkAppliedRef.current) return;
    const resolved = resolveDeepLinkActiveId(deepLinkItemId, questions);
    if (!resolved) return;
    deepLinkAppliedRef.current = true;
    setActiveId(resolved);
    if (typeof window !== "undefined") {
      // Let the row mount before scrolling; `requestAnimationFrame` handles the
      // table/list render, then a tiny deferred call covers the grouped-table path
      // where the row can still be animating in.
      requestAnimationFrame(() => {
        const el = document.querySelector<HTMLElement>(`[data-item-id="${resolved}"]`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }
  }, [deepLinkItemId, questions]);

  const reloadQuestions = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/questionnaires/${id}/review`, {
        headers: { "x-workspace-id": workspaceId || "" },
        cache: "no-store",
      });
      const data = await res.json();
      if (res.ok) {
        setQuestions(data.questions || []);
      }
    } catch {
      /* ignore soft refresh errors */
    }
  }, [id, workspaceId]);

  const filteredQuestions = useMemo(() => {
    let result = questions;
    switch (filter) {
      case "pending": result = questions.filter((q) => !q.reviewed && q.status !== "conflict"); break;
      case "overridden": result = questions.filter((q) => !!q.overrideReasonCategory); break;
      case "ambiguous": result = questions.filter((q) => q.isAmbiguous && !q.reviewed); break;
      case "conflict": result = questions.filter((q) => q.status === "conflict" && !q.reviewed); break;
      case "reviewed": result = questions.filter((q) => q.reviewed); break;
      case "conf_high": result = questions.filter((q) => q.confidence === "high"); break;
      case "conf_medium": result = questions.filter((q) => q.confidence === "medium"); break;
      case "conf_low": result = questions.filter((q) => q.confidence === "low"); break;
      case "status_suggested": result = questions.filter((q) => q.verificationStatus === "SUGGESTED"); break;
      case "status_needs_review": result = questions.filter((q) => q.verificationStatus === "NEEDS_REVIEW"); break;
      case "status_accepted": result = questions.filter((q) => q.verificationStatus === "ACCEPTED"); break;
      case "origin_reuse": result = questions.filter((q) => q.provenance?.answerOrigin === "approved_reuse"); break;
      case "origin_synthesis": result = questions.filter((q) => q.provenance?.answerOrigin === "subcontrol_synthesis"); break;
      case "origin_evidence": result = questions.filter((q) => q.provenance?.answerOrigin === "evidence_derived"); break;
      case "missing_topic": result = questions.filter((q) => !q.reviewed && q.unresolvedReason === "missing_topic"); break;
      case "no_approved_answer": result = questions.filter((q) => !q.reviewed && q.unresolvedReason === "no_approved_answer"); break;
      case "low_confidence": result = questions.filter((q) => !q.reviewed && q.unresolvedReason === "low_confidence"); break;
      case "no_evidence": result = questions.filter((q) => !q.reviewed && q.unresolvedReason === "no_evidence"); break;
    }

    // --- Smart Triage Sorting ---
    return [...result].sort((a, b) => {
      const getWeight = (q: (typeof questions)[0]) => {
        if (q.reviewed) return 0;
        let w = 0;
        if (q.verificationStatus === "AMBIGUOUS_MATCH") w += 100;
        if (q.verificationStatus === "UNRESOLVED") w += 80;
        if (q.verificationStatus === "NEEDS_REVIEW") w += 60;
        if (q.verificationStatus === "SUGGESTED") w += 40;
        
        if (q.confidence === "low") w += 20;
        if (q.confidence === "medium") w += 10;
        
        return w;
      };
      return getWeight(b) - getWeight(a);
    });
  }, [questions, filter]);

  const [summary, setSummary] = useState<any>(null);
  const counts = useMemo(() => {
    const sb = summary?.statusBreakdown || {};
    const pending = (sb.UNREVIEWED || 0) + (sb.UNRESOLVED || 0);
    const reviewed = (sb.ACCEPTED || 0) + (sb.EDITED || 0) + (sb.MANUAL_OVERRIDE || 0) + (sb.REJECTED || 0);
    return {
      all: questions.length,
      pending,
      reviewed,
      ambiguous: (sb.AMBIGUOUS_MATCH || 0),
      conflict: (sb.CONFLICT || 0),
    };
  }, [questions, summary]);

  const gapCounts = useMemo(() => {
    return summary?.gaps || {
      missing_topic: 0,
      no_approved_answer: 0,
      low_confidence: 0,
      no_evidence: 0,
    };
  }, [summary]);

  const uncategorizedCount = useMemo(() => {
    const categorizedGaps = Object.values(gapCounts).reduce((acc, val) => acc + (val as number), 0);
    return Math.max(0, counts.pending - categorizedGaps);
  }, [counts.pending, gapCounts]);

  const synthesizedCount = useMemo(() =>
    questions.filter((q) =>
      !q.reviewed &&
      q.type === "question_row" &&
      (q.suggestedAnswer?.length ?? 0) > 0 &&
      !q.suggestedAnswerId
    ).length,
    [questions]
  );

  const handleUpdateRow = async (itemId: string, data: Partial<ReviewQuestionDTO>) => {
    try {
      const res = await fetch(`/api/questionnaires/${id}/items/${itemId}`, {
        method: "PATCH",
        headers: { 
          "Content-Type": "application/json",
          ...(workspaceId ? { "x-workspace-id": workspaceId } : {})
        },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const resData = await res.json();
        const updatedItem = resData.item;
        
        // Map Prisma model back to DTO format expected by UI
        const mapped: ReviewQuestionDTO = {
          ...updatedItem,
          sources: updatedItem.sourcesJson || [],
          candidates: updatedItem.candidatesJson || [],
          provenance: updatedItem.provenanceJson || undefined,
        };
        setQuestions((prev) =>
          prev.map((q) =>
            q.id === itemId
              ? { ...mapped, canonicalContradiction: q.canonicalContradiction }
              : q,
          ),
        );
        fetchSummary(); // Refresh counts
      } else {
        const errBody = await res.json().catch(() => ({}));
        const msg =
          errBody?.error?.message ||
          (Array.isArray(errBody?.error?.issues) ? errBody.error.issues.map((i: { message?: string }) => i.message).filter(Boolean).join(" ") : null) ||
          `Update failed (${res.status})`;
        toast({
          severity: "error",
          title: "Could not save row",
          message: String(msg),
        });
      }
    } catch (err) {
      console.error("Failed to update row:", err);
      toast({
        severity: "error",
        title: "Could not save row",
        message: err instanceof Error ? err.message : "Network error",
      });
    }
  };

  const handleAcceptRow = async (itemId: string) => {
    const q = questions.find((item) => item.id === itemId);
    if (!q || !q.suggestedAnswer?.trim()) {
      toast({
        severity: "warning",
        title: "No suggestion",
        message: "This row does not have a valid suggestion to accept. Please edit it manually.",
      });
      return;
    }
    // Legacy single-Accept: only path left for it is "row has suggestedAnswer and
    // either no imported, or imported matches suggested". The drawer disables this
    // button otherwise (see AnswerSourcePicker). We default the selection to
    // "suggested" so the server's PATCH validator records the explicit choice.
    await handleUpdateRow(itemId, {
      finalAnswer: q.suggestedAnswer,
      finalAnswerSelection: "suggested",
      reviewed: true,
      verificationStatus: "ACCEPTED",
    });
  };

  const handleUseImportedAnswer = async (itemId: string) => {
    const q = questions.find((item) => item.id === itemId);
    if (!q || !q.importedAnswer) return;
    await handleUpdateRow(itemId, {
      finalAnswer: q.importedAnswer,
      finalAnswerSelection: "imported",
      reviewed: true,
      verificationStatus: "ACCEPTED",
    });
  };

  const handleUseSuggestedAnswer = async (itemId: string) => {
    const q = questions.find((item) => item.id === itemId);
    if (!q || !q.suggestedAnswer) return;
    await handleUpdateRow(itemId, {
      finalAnswer: q.suggestedAnswer,
      finalAnswerSelection: "suggested",
      reviewed: true,
      verificationStatus: "ACCEPTED",
    });
  };

  const handleRegenerateRow = async (questionId: string, toneOverride?: string) => {
    try {
      setUpdatingIds(prev => new Set(prev).add(questionId));
      const res = await fetch(`/api/questionnaires/${id}/items/${questionId}/regenerate`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...(workspaceId ? { "x-workspace-id": workspaceId } : {})
        },
        body: JSON.stringify({ tone: toneOverride || currentTone }),
      });
      
      const data = await res.json();
      if (res.ok) {
        setQuestions(prev => prev.map(q => 
          q.id === questionId ? { ...q, suggestedAnswer: data.suggestedAnswer, provenance: data.provenance } : q
        ));
        toast({
          severity: "success",
          title: "Answer Regenerated",
          message: "The AI suggestion has been updated with the new style.",
        });
      } else {
        throw new Error(data.error?.message || "Failed to regenerate");
      }
    } catch (err: any) {
      toast({
        severity: "error",
        title: "Regeneration Failed",
        message: err.message,
      });
    } finally {
      setUpdatingIds(prev => {
        const next = new Set(prev);
        next.delete(questionId);
        return next;
      });
    }
  };
 
  const handleRejectRow = async (itemId: string) => {
    await handleUpdateRow(itemId, {
      finalAnswer: "",
      finalAnswerSelection: null,
      reviewed: true,
      verificationStatus: "REJECTED",
    });
  };
 
  const handleToneChange = async (newTone: ResponseTone) => {
    if (newTone === currentTone) return;

    // Check if we need to show a confirmation message
    const approvedCount = questions.filter(q => q.verificationStatus === "ACCEPTED" && q.reviewed).length;
    
    if (approvedCount > 0) {
      setPendingTone(newTone);
      setIsToneModalOpen(true);
      return;
    }

    executeToneChange(newTone);
  };

  const executeToneChange = async (newTone: ResponseTone) => {
    setIsRegenerating(true);
    setCurrentTone(newTone);
    setIsToneModalOpen(false);
    
    try {
      const res = await fetch(`/api/questionnaires/${id}/regenerate`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...(workspaceId ? { "x-workspace-id": workspaceId } : {})
        },
        body: JSON.stringify({ tone: newTone }),
      });
      
      if (res.ok) {
        toast({
          severity: "success",
          title: "Style Updated",
          message: `Regenerating answers in ${RESPONSE_TONES[newTone].label} style...`,
        });
        await fetchData(); // Refresh with new suggestions
      } else {
        throw new Error("Failed to update tone");
      }
    } catch (err) {
      toast({
        severity: "error",
        title: "Update Failed",
        message: "Could not apply the selected style.",
      });
    } finally {
      setIsRegenerating(false);
      setPendingTone(null);
    }
  };
 
  const handleBulkAction = async (action: "accept" | "mark_reviewed" | "reject") => {
    if (selectedIds.size === 0) return;
    try {
      const res = await fetch(`/api/questionnaires/${id}/review/bulk`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...(workspaceId ? { "x-workspace-id": workspaceId } : {})
        },
        body: JSON.stringify({ itemIds: Array.from(selectedIds), action }),
      });
      const data = await res.json();
      
      if (res.ok) {
        if (data.updatedCount === 0 && action === "accept") {
          toast({
            severity: "warning",
            title: "Safety Filter Applied",
            message: data.message || "No rows were updated. Unresolved rows (with gaps) cannot be bulk-accepted for safety.",
          });
        } else if (data.updatedCount > 0) {
          toast({
            severity: "success",
            title: "Bulk Action Complete",
            message: `Successfully processed ${data.updatedCount} rows.`,
          });
        }
        await fetchData(); // Refresh all
        setSelectedIds(new Set());
        fetchSummary(); // Double check counts
      }
    } catch (err) {
      console.error("Bulk action failed:", err);
    }
  };

  const toggleSelectAll = () => {
    const selectable = filteredQuestions.filter((q) => q.type === "question_row");
    if (selectedIds.size === selectable.length && selectable.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectable.map((q) => q.id)));
    }
  };

  const toggleSelectEligible = () => {
    const eligible = questions.filter((q) => 
      q.type === "question_row" && 
      q.confidence === "high" && 
      !q.reviewed && 
      !q.unresolvedReason
    );
    setSelectedIds(new Set(eligible.map((q) => q.id)));
  };

  const toggleSelectRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleNextRow = () => {
    const currentIndex = filteredQuestions.findIndex(q => q.id === activeId);
    if (currentIndex < filteredQuestions.length - 1) {
      setActiveId(filteredQuestions[currentIndex + 1].id);
    }
  };

  const handlePreviousRow = () => {
    const currentIndex = filteredQuestions.findIndex(q => q.id === activeId);
    if (currentIndex > 0) {
      setActiveId(filteredQuestions[currentIndex - 1].id);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === "j") {
        handleNextRow();
      } else if (e.key === "k") {
        handlePreviousRow();
      } else if (e.key === "Escape") {
        setActiveId(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeId, filteredQuestions]);

  const activeQuestion = useMemo(() => {
    const picked = questions.find((q) => q.id === activeId) || null;
    return picked;
  }, [questions, activeId]);

  if (loading) return (
    <div className="flex h-96 flex-col items-center justify-center gap-4 animate-page-fade">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-accent-primary border-t-transparent shadow-sm" />
      <p className="text-sm font-medium text-text-muted">Loading review workspace...</p>
    </div>
  );

  if (loadError) return (
    <div className="p-8">
      <StatusBanner severity="error" title="Failed to load questionnaire" message={loadError} />
    </div>
  );

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] animate-page-fade overflow-hidden">
      {/* Tone Change Confirmation Modal */}
      <Modal 
        isOpen={isToneModalOpen} 
        onClose={() => setIsToneModalOpen(false)} 
        title="Confirm Style Change"
      >
        <div className="space-y-4">
          <div className="flex gap-4 rounded-xl bg-semantic-warning/5 p-4 border border-semantic-warning/20">
            <div className="mt-1 h-8 w-8 shrink-0 flex items-center justify-center rounded-full bg-semantic-warning/10 text-semantic-warning">
              <WarningIcon className="h-4 w-4" />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-bold text-semantic-warning">Approved answers will be reverted.</p>
              <p className="text-xs leading-relaxed text-text-secondary">
                You have <span className="font-bold text-text-primary">{questions.filter(q => q.verificationStatus === "ACCEPTED" && q.reviewed).length} approved rows</span>. 
                Changing the style will reset these rows back to "Unreviewed" so you can verify the new wording before exporting.
              </p>
            </div>
          </div>
          
          <p className="text-xs text-text-muted italic px-1">
            Manual edits (custom wording) will not be affected.
          </p>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setIsToneModalOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => pendingTone && executeToneChange(pendingTone)}>
              Change Style & Revert
            </Button>
          </div>
        </div>
      </Modal>

      {/* Top Header */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-10">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 text-[10px] font-medium text-text-muted">
            <Link href="/app/questionnaires" className="hover:text-text-primary transition-colors">Questionnaires</Link>
            <span className="text-text-muted/50">/</span>
            <span className="text-text-secondary">Workspace</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-black tracking-tight text-text-primary">{title}</h1>
            {metadata && (
              <div className={cn(
                "group relative flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider",
                metadata.suggestNewAnswer 
                  ? "bg-accent-primary/10 text-accent-primary border border-accent-primary/20" 
                  : "bg-surface-border/50 text-text-muted border border-surface-border"
              )}>
                <span className="flex h-1 w-1 rounded-full bg-current opacity-70" />
                Target: {metadata.suggestNewAnswer ? `New Column (${metadata.outputColumnName || "Suggested Answer"})` : "Existing Column"}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Tone Selector */}
          <PermissionGuard permission={Permission.RUN_AI_OPERATIONS}>
            <div className="flex items-center gap-3 mr-4 bg-surface-base/50 p-1.5 rounded-xl border border-surface-border/60">
               {isRegenerating ? (
                 <div className="flex items-center gap-1.5 pl-1.5">
                   <RefreshIcon className="h-3 w-3 animate-spin text-accent-primary" />
                   <span className="text-[9px] font-black uppercase tracking-widest text-accent-primary">Applying...</span>
                 </div>
               ) : (
                 <span className="text-[9px] font-black uppercase tracking-widest text-text-muted/60 pl-1.5">Style</span>
               )}
               <select
                 value={currentTone}
                 onChange={(e) => handleToneChange(e.target.value as ResponseTone)}
                 disabled={isRegenerating}
                 className={cn(
                   "h-7 rounded-lg border border-surface-border bg-white px-2 text-[11px] font-bold text-text-primary focus-ring disabled:bg-surface-base transition-all min-w-[120px]",
                   isRegenerating && "border-accent-primary/30 ring-2 ring-accent-primary/5"
                 )}
               >
                 {Object.entries(RESPONSE_TONES).map(([key, tone]) => (
                   <option key={key} value={key}>{tone.label}</option>
                 ))}
               </select>
            </div>
          </PermissionGuard>

          <PermissionGuard permissions={[Permission.EXPORT_INTERNAL, Permission.EXPORT_EXTERNAL]}>
            {(() => {
              const questionRowCount = questions.filter((q) => q.type === "question_row").length;
              const exportReady = questionRowCount > 0 && counts.reviewed === questionRowCount;
              return (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => router.push(`/app/questionnaires/${id}/export`)}
                  leftIcon={<DownloadIcon className="h-3.5 w-3.5" />}
                  className={cn(
                    "h-8 text-[11px] font-bold",
                    exportReady && "shadow-lg shadow-accent-primary/20 ring-2 ring-accent-primary/20",
                  )}
                >
                  {exportReady ? "Export Results" : "Export"}
                </Button>
              );
            })()}
          </PermissionGuard>
        </div>
      </div>

      {/* Smart Triage Hints (D16-EN-04) */}
      <div className="mx-10 mb-4 flex items-center gap-3 rounded-xl border border-accent-primary/10 bg-accent-primary/[0.02] p-2.5 shadow-sm animate-in fade-in slide-in-from-top-2 duration-500">
         <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-primary/10 ring-4 ring-accent-primary/5">
           <MagicIcon className="h-4 w-4 text-accent-primary" />
         </div>
         <div className="flex-1">
           <p className="text-[12px] font-medium text-text-primary leading-relaxed">
             <span className="text-[10px] font-black uppercase tracking-widest text-accent-primary mr-2">Triage Hint</span>
             {counts.ambiguous > 0 
               ? `Resolve the ${counts.ambiguous} ambiguous matches first to clarify your compliance posture.` 
               : summary?.gaps?.missing_topic > 0
               ? `Map the ${summary.gaps.missing_topic} rows with missing topics to unlock recommended content.`
               : summary?.confidenceBreakdown?.low > 0
               ? `Review the ${summary.confidenceBreakdown.low} low-confidence rows to strengthen your Answer Library.`
               : "All rows are high-confidence suggestions or verified matches."}
           </p>
         </div>
         <Button 
           variant="ghost" 
           size="xs" 
           onClick={() => {
             if (counts.ambiguous > 0) setFilter("ambiguous");
             else if (summary?.gaps?.missing_topic > 0) setFilter("missing_topic");
             else if (summary?.confidenceBreakdown?.low > 0) setFilter("low_confidence");
           }}
           className="h-7 text-[9px] font-black uppercase tracking-widest text-accent-primary hover:bg-accent-primary/5"
         >
           Jump to Action
         </Button>
      </div>

      {/* D9-DS-01: Progress & Stats */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 px-10">
        <div className="flex flex-col gap-2 rounded-xl border border-surface-border bg-white p-4 shadow-sm transition-all hover:shadow-md group">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-black uppercase tracking-widest text-text-muted/60">Work Progress</span>
              <div className="flex items-center gap-1">
                <div className="h-1 w-1 rounded-full bg-semantic-success animate-pulse" />
                <span className="text-[9px] font-bold text-semantic-success uppercase">{((counts.reviewed / (counts.all || 1)) * 100).toFixed(0)}%</span>
              </div>
            </div>
            <div className="flex items-end justify-between">
               <span className="text-xl font-black text-text-primary leading-none">
                 {counts.reviewed} <span className="text-sm font-bold text-text-muted/40">/ {counts.all}</span>
               </span>
               <span className="text-[9px] font-bold text-text-muted/60 uppercase tracking-tight">Verified</span>
            </div>
            <div className="h-1 w-full bg-surface-border/40 rounded-full overflow-hidden mt-1">
              <div 
                className="h-full bg-semantic-success transition-all duration-1000 ease-out" 
                style={{ width: `${(counts.reviewed / (counts.all || 1)) * 100}%` }}
              />
            </div>
        </div>

        <div className="flex flex-col gap-2 rounded-xl border border-surface-border bg-white p-4 shadow-sm transition-all hover:shadow-md group">
            <span className="text-[9px] font-black uppercase tracking-widest text-text-muted/60">Recommendation Coverage</span>
            <div className="flex items-end justify-between">
               {(() => {
                 const libraryCount = summary?.libraryBackedCount || 0;
                 const synthCount = summary?.synthesizedCount || 0;
                 const totalCovered = libraryCount + synthCount;
                 const totalRows = counts.all || 1;
                 const coverage = Math.round((totalCovered / totalRows) * 100);
                 return (
                   <>
                     <span className="text-xl font-black text-text-primary leading-none">{coverage}%</span>
                     <div className="flex flex-col items-end">
                       <span className="text-[9px] font-bold text-text-muted/80">{totalCovered} Suggestions</span>
                       <span className="text-[8px] font-medium text-text-muted/40 uppercase tracking-tighter">
                         {libraryCount} Lib • {synthCount} Synth
                       </span>
                     </div>
                   </>
                 );
               })()}
            </div>
            <div className="relative h-1 w-full rounded-full bg-surface-border/40 overflow-hidden mt-1">
               <div 
                 className="absolute left-0 top-0 h-full bg-semantic-success transition-all duration-1000 ease-out z-10" 
                 style={{ width: `${((summary?.libraryBackedCount || 0) / (counts.all || 1)) * 100}%` }}
               />
               <div 
                 className="absolute left-0 top-0 h-full bg-accent-primary transition-all duration-1000 ease-out" 
                 style={{ width: `${(((summary?.libraryBackedCount || 0) + (summary?.synthesizedCount || 0)) / (counts.all || 1)) * 100}%` }}
               />
            </div>
        </div>

        <div className="flex flex-col gap-2 rounded-xl border border-surface-border bg-white p-4 shadow-sm transition-all hover:shadow-md">
            <span className="text-[9px] font-black uppercase tracking-widest text-text-muted/60">Ambiguity Queue</span>
            <div className="flex items-end justify-between">
               <span className={cn(
                 "text-xl font-black leading-none",
                 counts.ambiguous > 0 ? "text-semantic-warning" : "text-text-primary"
               )}>
                 {counts.ambiguous} <span className="text-sm font-bold text-text-muted/40">Items</span>
               </span>
               {counts.ambiguous > 0 && (
                 <Button 
                   variant="ghost" 
                   size="xs" 
                   onClick={() => setFilter("ambiguous")}
                   className="h-5 px-1.5 text-[8px] font-black uppercase tracking-widest text-accent-primary bg-accent-primary/5"
                 >
                   Review
                 </Button>
               )}
            </div>
            <p className="text-[9px] font-medium text-text-muted leading-none">
              {counts.ambiguous > 0 ? "Competing interpretations detected." : "No ambiguities found."}
            </p>
        </div>

        <div className="flex flex-col gap-2 rounded-xl border border-surface-border bg-white p-4 shadow-sm transition-all hover:shadow-md">
           <div className="flex items-center justify-between">
             <span className="text-[9px] font-black uppercase tracking-widest text-text-muted/60">Gap Analysis</span>
             <span className="text-[8px] font-black text-accent-primary/50 uppercase tracking-widest leading-none">Triage</span>
           </div>
           
           <div className="grid grid-cols-4 gap-1 mt-0.5">
             {[
               { id: "missing_topic", label: "Topic", count: summary?.gaps?.missing_topic || 0 },
               { id: "no_approved_answer", label: "Answer", count: summary?.gaps?.no_approved_answer || 0 },
               { id: "low_confidence", label: "Conf.", count: summary?.confidenceBreakdown?.low || 0 },
               { id: "ambiguous", label: "Amb.", count: counts.ambiguous || 0 },
             ].map((gap) => (
               <button
                 key={gap.id}
                 onClick={() => setFilter(gap.id as any)}
                 className={cn(
                   "flex flex-col items-center gap-0.5 rounded-lg border py-1 transition-all",
                   filter === gap.id 
                    ? "bg-accent-primary/5 border-accent-primary" 
                    : "border-surface-border hover:border-text-muted/40"
                 )}
               >
                 <span className="text-[10px] font-bold text-text-primary leading-none">{gap.count}</span>
                 <span className="text-[7px] font-black uppercase tracking-tighter text-text-muted/60">{gap.label}</span>
               </button>
             ))}
           </div>
        </div>
      </div>

      <div className="flex flex-1 gap-8 overflow-hidden px-10">
        <div className="flex flex-1 flex-col gap-4 overflow-hidden">
          {/* Main Toolbar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center rounded-lg border border-surface-border bg-white p-1 shadow-sm">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setViewMode("table")}
                  className={cn("h-8 px-3 text-xs font-bold", viewMode === "table" ? "bg-surface-base text-accent-primary" : "text-text-muted")}
                  leftIcon={<GridIcon className="h-3.5 w-3.5" />}
                >
                  Table
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setViewMode("list")}
                  className={cn("h-8 px-3 text-xs font-bold", viewMode === "list" ? "bg-surface-base text-accent-primary" : "text-text-muted")}
                  leftIcon={<ListIcon className="h-3.5 w-3.5" />}
                >
                  List
                </Button>
              </div>

              <div className="h-6 w-px bg-surface-border/60" />

              <div className="flex items-center gap-2">
                {Object.entries(FILTER_LABELS).slice(0, 5).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setFilter(key as any)}
                    className={cn(
                      "rounded-full px-4 py-1.5 text-[11px] font-black uppercase tracking-widest transition-all",
                      filter === key 
                        ? "bg-accent-primary text-white shadow-md shadow-accent-primary/20" 
                        : "bg-white text-text-muted border border-surface-border hover:border-text-muted/30"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {selectedIds.size > 0 ? (
              <PermissionGuard permission={Permission.BULK_REVIEW_QUESTIONNAIRE}>
                <div className="flex items-center gap-3 animate-in fade-in slide-in-from-right-4 duration-300">
                  <span className="text-xs font-semibold text-text-muted mr-1">{selectedIds.size} selected</span>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleBulkAction("accept")}
                    leftIcon={<CheckIcon className="h-3.5 w-3.5" />}
                    title="Accept suggestions for selected rows. Risky/Unresolved rows will be skipped automatically."
                  >
                    Accept Selected
                  </Button>
                  <Button
                     variant="outline"
                     size="sm"
                     onClick={() => handleBulkAction("needs_review")}
                     className="text-[11px] font-bold h-8"
                  >
                     Move to Review
                  </Button>
                  <Button
                     variant="outline"
                     size="sm"
                     onClick={() => handleBulkAction("reject")}
                     className="text-[11px] font-bold text-semantic-error hover:bg-semantic-error/5 hover:border-semantic-error/30 h-8"
                  >
                    Reject Selected
                  </Button>
                </div>
              </PermissionGuard>
            ) : (
              <div className="flex items-center gap-2">
                {(() => {
                  const eligibleCount = questions.filter(q => 
                    q.type === "question_row" && 
                    q.confidence === "high" && 
                    !q.reviewed && 
                    !q.unresolvedReason
                  ).length;
                  
                  if (eligibleCount === 0) return null;
                  
                  return (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={toggleSelectEligible}
                      className="border-accent-primary/20 text-accent-primary bg-accent-primary/5 hover:bg-accent-primary/10"
                      leftIcon={<MagicIcon className="h-3.5 w-3.5" />}
                    >
                      Select {eligibleCount} Clear Matches
                    </Button>
                  );
                })()}
                {synthesizedCount > 0 && (
                  <button
                    onClick={() => setFilter("low_confidence")}
                    className="flex items-center gap-1.5 rounded-lg border border-accent-primary/20 bg-accent-primary/[0.04] px-3 py-1.5 text-[11px] font-bold text-accent-primary/80 hover:bg-accent-primary/[0.08] transition-colors"
                    title="These rows have prepared answers ready for your review"
                  >
                    <SparklesIcon className="h-3.5 w-3.5" />
                    {synthesizedCount} prepared answer{synthesizedCount !== 1 ? "s" : ""} — review one by one
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Conflict Banner */}
          {counts.conflict > 0 && filter !== "conflict" && (
            <StatusBanner
              severity="warning"
              title={`${counts.conflict} Conflicts Detected`}
              message="AI analysis found contradictory evidence. Manual resolution is required for these items."
              action={
                <Button 
                  size="sm"
                  onClick={() => setFilter("conflict")}
                  className="bg-white text-semantic-warning hover:bg-white/90 shadow-sm"
                >
                  Resolve Now
                </Button>
              }
            />
          )}

          {/* Workspace Content */}
          <Card noPadding className="flex-1 overflow-hidden shadow-md">
            {viewMode === "table" ? (
              <ReviewTable
                questions={filteredQuestions}
                activeId={activeId}
                selectedIds={selectedIds}
                onSelectRow={toggleSelectRow}
                onSelectAll={toggleSelectAll}
                onActivateRow={setActiveId}
                onAcceptRow={handleAcceptRow}
                filter={filter}
                isUpdating={isRegenerating}
                updatingIds={updatingIds}
              />
            ) : (
              <div className="h-full bg-surface-base/30 p-4">
                <UnresolvedItemsList
                  questions={filteredQuestions}
                  activeId={activeId}
                  selectedIds={selectedIds}
                  onSelectRow={toggleSelectRow}
                  onActivateRow={setActiveId}
                  onAcceptRow={handleAcceptRow}
                />
              </div>
            )}
          </Card>
        </div>

        {/* Evidence Drawer */}
        <div className={cn(
          "h-full transition-all duration-400 ease-in-out",
          activeId ? "w-[520px] translate-x-0" : "w-0 translate-x-12 opacity-0 pointer-events-none"
        )}>
          {activeId && (
             <div className="h-full border-l border-surface-border bg-white shadow-[-10px_0_30px_rgba(0,0,0,0.04)]">
               <EvidenceDrawer
                 question={activeQuestion}
                 onClose={() => setActiveId(null)}
                 onUpdate={handleUpdateRow}
                 onAccept={handleAcceptRow}
                 onUseImportedAnswer={handleUseImportedAnswer}
                 onUseSuggestedAnswer={handleUseSuggestedAnswer}
                 onReject={handleRejectRow}
                 onRegenerate={handleRegenerateRow}
                 isUpdating={isRegenerating || (activeId ? updatingIds.has(activeId) : false)}
                 onNext={filteredQuestions.findIndex(q => q.id === activeId) < filteredQuestions.length - 1 ? handleNextRow : undefined}
                 onPrevious={filteredQuestions.findIndex(q => q.id === activeId) > 0 ? handlePreviousRow : undefined}
                 workspaceId={workspaceId}
                 questionnaireId={id}
                 onContradictionResolved={reloadQuestions}
               />
             </div>
          )}
        </div>
      </div>
    </div>
  );
}
