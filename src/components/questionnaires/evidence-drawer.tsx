import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import {
  CloseIcon,
  CheckIcon,
  WarningIcon,
  MagicIcon,
  BookIcon,
  TopicIcon,
  ArrowRightIcon,
  ArrowLeftIcon,
  AlertCircleIcon,
  SparklesIcon,
  ShieldCheckIcon,
  FileIcon,
  LinkIcon
} from "@/components/icons";
import type { ReviewCanonicalContradictionDTO, ReviewQuestionDTO } from "@/lib/questionnaires/types";

type CheckedReviewContradiction = Extract<ReviewCanonicalContradictionDTO, { status: "checked" }>;
import {
  OVERRIDE_REASON_CATEGORIES,
  OVERRIDE_REASON_LABELS,
  OVERRIDE_SCOPE_LABELS,
  questionnaireRequiresOverrideRationale,
} from "@/lib/knowledge/override-reason";
import {
  TONE_TEXT_CLASS,
  getUnresolvedReasonMeta,
} from "@/lib/questionnaires/unresolved-reasons";
import { cn } from "@/lib/utils";
import { TopicBadge } from "./topic-badge";
import { StatusSignal } from "@/components/ui/status-signal";
import { getConfidenceSignalKey, getStatusTheme } from "@/lib/questionnaires/signals";
import {
  CanonicalContradictionDrawerBanner,
  CanonicalContradictionResolvedStrip,
  isActiveCanonicalContradiction,
} from "@/components/questionnaires/canonical-contradiction-banner";
import { ResolveContradictionModal } from "@/components/questionnaires/resolve-contradiction-modal";
import { AnswerSourcePicker } from "@/components/questionnaires/answer-source-picker";

interface EvidenceDrawerProps {
  question: ReviewQuestionDTO | null;
  onClose: () => void;
  onUpdate: (id: string, data: Partial<ReviewQuestionDTO>) => void;
  /**
   * Legacy single-button handler kept for rows where there is only one answer source
   * (e.g. no importedAnswer) and the old "Accept" flow is unambiguous. Prefer
   * `onUseImportedAnswer` / `onUseSuggestedAnswer` for rows with both sources.
   */
  onAccept: (id: string) => void;
  /** Explicit selection: commit the uploaded/manual answer as the row's final answer. */
  onUseImportedAnswer?: (id: string) => void;
  /** Explicit selection: commit the AI suggestion as the row's final answer. */
  onUseSuggestedAnswer?: (id: string) => void;
  onReject: (id: string) => void;
  onRegenerate: (id: string) => void;
  isUpdating?: boolean;
  onNext?: () => void;
  onPrevious?: () => void;
  /** Required for answer workflow when approving in-review library rows. */
  workspaceId?: string;
  questionnaireId?: string;
  /** After contradiction resolve API succeeds, reload review payload (e.g. refetch questions). */
  onContradictionResolved?: () => void;
}

export function EvidenceDrawer({
  question,
  onClose,
  onUpdate,
  onAccept,
  onUseImportedAnswer,
  onUseSuggestedAnswer,
  onReject,
  onRegenerate,
  isUpdating,
  onNext,
  onPrevious,
  workspaceId = "",
  questionnaireId = "",
  onContradictionResolved,
}: EvidenceDrawerProps) {
  const [editing, setEditing] = useState(false);
  const [localAnswer, setLocalAnswer] = useState("");
  const [isApproving, setIsApproving] = useState(false); // D10-US-05
  const [refreshKey, setRefreshKey] = useState(0);
  const [overrideReasonCategory, setOverrideReasonCategory] = useState("");
  const [overrideScope, setOverrideScope] = useState<"QUESTIONNAIRE_ONLY" | "REQUEST_CANONICAL_UPDATE">(
    "QUESTIONNAIRE_ONLY",
  );
  const [overrideComment, setOverrideComment] = useState("");
  const [resolveModalOpen, setResolveModalOpen] = useState(false);

  useEffect(() => {
    if (question) {
      setLocalAnswer(question.finalAnswer || question.suggestedAnswer || "");
      setEditing(false);
      setOverrideReasonCategory(question.overrideReasonCategory ?? "");
      setOverrideScope(
        question.overrideScope === "REQUEST_CANONICAL_UPDATE" ? "REQUEST_CANONICAL_UPDATE" : "QUESTIONNAIRE_ONLY",
      );
      setOverrideComment(question.overrideComment ?? "");
    }
  }, [question, refreshKey]);

  // Identity trace for the review-row-identity-diagnostic plan. Behind
  // window.__tdDiag so production is unaffected. Keyed on id + text so
  // any change to what the drawer is actually rendering fires one log.
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      (window as unknown as { __tdDiag?: boolean }).__tdDiag &&
      question
    ) {
      console.warn("review.drawer", {
        drawerId: question.id,
        drawerRowNumber: question.rowNumber ?? null,
        drawerQuestionPreview: (question.question ?? "").slice(0, 40),
      });
    }
  }, [question?.id, question?.question]);

  // Dev-only visibility for the "High confidence + placeholder answer + no
  // reasoning" invalid state. The drawer never changes what it renders; this
  // hook just writes to the browser console so we can correlate a user-
  // reported screenshot with the persisted fields in one glance.
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    if (!question) return;
    const wouldShowPlaceholderAnswer = !question.finalAnswer && !question.suggestedAnswer;
    const firstSummarySegment = (question.reviewSummary || "").split(" | ")[0];
    const wouldShowCompositeFallback = !firstSummarySegment;
    if (question.confidence === "high" && (wouldShowPlaceholderAnswer || wouldShowCompositeFallback)) {
      // eslint-disable-next-line no-console
      console.warn("ui.drawer:displayed-fallback", {
        questionId: question.id,
        rowNumber: question.rowNumber,
        topicId: question.topicId,
        topicName: question.topicName,
        suggestedAnswerId: question.suggestedAnswerId,
        wouldShowPlaceholderAnswer,
        wouldShowCompositeFallback,
        confidence: question.confidence,
      });
    }
  }, [question]);

  if (!question) return null;

  const isReviewed = question.reviewed;
  const isConflict = question.status === "conflict";
  const checkedCanon: CheckedReviewContradiction | undefined =
    question.canonicalContradiction?.status === "checked"
      ? (question.canonicalContradiction as CheckedReviewContradiction)
      : undefined;
  const hasCanonMismatch =
    checkedCanon?.contradictionFound === true && !isReviewed;
  const canonIsActive = isActiveCanonicalContradiction(checkedCanon);
  const resolvedCanonStatus = checkedCanon?.persistence?.resolutionStatus;
  const showResolvedCanonStrip =
    hasCanonMismatch &&
    !!resolvedCanonStatus &&
    resolvedCanonStatus !== "PENDING";
  const resolveResultId = checkedCanon?.persistence?.resultId;

  const getGapGuidance = () => {
    const meta = getUnresolvedReasonMeta(question.unresolvedReason);
    if (meta) {
      return {
        title: meta.drawerTitle,
        message: meta.drawerMessage(question.topicName),
        action: meta.drawerAction,
        color: TONE_TEXT_CLASS[meta.tone],
      };
    }
    // Unknown / null reason: keep the existing soft fallback copy so rows
    // that genuinely haven't been analysed yet still read sensibly.
    return {
      title: "Unresolved Row",
      message:
        question.suggestionStatus === "Draft candidate available"
          ? "We found a relevant candidate in your draft documents, but it hasn't been approved for use yet."
          : "No high-confidence verified match was found in your library.",
      action: "Review and manually finalize the response.",
      color: "text-semantic-warning",
    };
  };

  const gap = getGapGuidance();

  /** D10-US-05: Promote a draft suggestion to approved library content */
  const handleQuickApprove = async (answerId: string, text: string) => {
    if (!window.confirm("Approve this suggestion globally for the Answer Library? It will become a verified 'Gospel' match for future questionnaires.")) return;

    setIsApproving(true);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (workspaceId) headers["x-workspace-id"] = workspaceId;

      let res = await fetch(`/api/knowledge/answers/${answerId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          status: "APPROVED",
          changeReason: `Verified during questionnaire review (${question.question.slice(0, 30)}...)`,
        }),
      });

      if (res.status === 409 && workspaceId) {
        const errBody = await res.json().catch(() => ({}));
        if ((errBody as { code?: string }).code === "USE_WORKFLOW") {
          res = await fetch(`/api/knowledge/answers/${answerId}/workflow`, {
            method: "POST",
            headers,
            body: JSON.stringify({
              action: "approveInternal",
              comment: `Verified during questionnaire review (${question.question.slice(0, 80)})`,
            }),
          });
        }
      }

      if (res.ok) {
        onUpdate(question.id, {
          suggestedAnswer: text,
          finalAnswer: text,
          reviewed: true,
          status: "ok",
          suggestionStatus: "Auto-filled"
        });
        setRefreshKey(k => k + 1);
      } else {
        alert("Failed to approve globally. Please try again.");
      }
    } catch (err) {
      console.error("QuickApprove:Failed", err);
    } finally {
      setIsApproving(false);
    }
  };

  const saveWouldNeedOverride = questionnaireRequiresOverrideRationale({
    finalAnswerNext: localAnswer,
    finalAnswerPrev: question.finalAnswer,
    suggestedAnswer: question.suggestedAnswer,
    reviewedNext: true,
    reviewedPrev: question.reviewed,
    verificationStatusNext: undefined,
  });

  const handleSave = () => {
    if (saveWouldNeedOverride) {
      if (!overrideReasonCategory) {
        window.alert("Select a reason for deviating from the suggested answer.");
        return;
      }
      if (overrideReasonCategory === "OTHER_WITH_COMMENT" && !overrideComment.trim()) {
        window.alert("A comment is required when you pick “Other”.");
        return;
      }
      const selection = localAnswer.trim().length > 0 ? "edited" : null;
      onUpdate(question.id, {
        finalAnswer: localAnswer,
        finalAnswerSelection: selection,
        reviewed: true,
        reviewStatus: "ok",
        overrideReasonCategory,
        overrideScope,
        overrideComment: overrideComment.trim() || undefined,
      });
    } else {
      const selection = localAnswer.trim().length > 0 ? "edited" : null;
      onUpdate(question.id, {
        finalAnswer: localAnswer,
        finalAnswerSelection: selection,
        reviewed: true,
        reviewStatus: "ok",
      });
    }
    setEditing(false);
  };

  return (
    <aside className="fixed inset-y-0 right-0 z-50 flex w-[520px] flex-col border-l border-surface-border bg-white shadow-2xl transition-all duration-400 ease-in-out">
      {/* Header */}
      <header className="flex h-14 items-center justify-between border-b border-surface-border bg-surface-panel/50 px-6">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-bold uppercase tracking-widest text-text-primary">Evidence & Reasoning</h2>
          {(() => {
            const theme = getStatusTheme(question.verificationStatus);
            if (question.verificationStatus === "UNREVIEWED") return null;
            return (
              <div className={cn(
                "rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider border",
                theme.className
              )}>
                {theme.label}
              </div>
            );
          })()}
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 text-text-muted">
          <CloseIcon className="h-5 w-5" />
        </Button>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-8 space-y-10 custom-scrollbar">
        {/* Status Banners */}
        {isConflict && !isReviewed && (
          <div className="flex items-start gap-4 rounded-xl border border-semantic-warning-border bg-semantic-warning/[0.03] p-5 shadow-sm">
            <div className="mt-0.5 rounded-full bg-semantic-warning/10 p-1.5 ring-4 ring-semantic-warning/[0.02]">
              <WarningIcon className="h-4 w-4 text-semantic-warning" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-bold text-semantic-warning">Evidence conflict</p>
              <p className="text-xs leading-relaxed text-text-secondary">
                {question.conflictNote || "Multiple source documents provided conflicting information for this question. Manual verification is required."}
              </p>
            </div>
          </div>
        )}

        {hasCanonMismatch && canonIsActive && checkedCanon && isActiveCanonicalContradiction(checkedCanon) ? (
          <CanonicalContradictionDrawerBanner
            contradiction={checkedCanon}
            rowAnswerFallback={question.finalAnswer || question.suggestedAnswer || ""}
            onResolveClick={
              questionnaireId && resolveResultId ? () => setResolveModalOpen(true) : undefined
            }
          />
        ) : null}
        {checkedCanon?.semanticJudge ? (
          <div className="flex items-start gap-3 rounded-xl border border-semantic-info/25 bg-semantic-info/[0.04] p-4">
            <div className="mt-0.5 rounded-full bg-semantic-info/10 p-1.5">
              <SparklesIcon className="h-4 w-4 text-semantic-info" />
            </div>
            <div className="min-w-0 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wide text-semantic-info">Semantic assist</p>
              <p className="text-xs leading-relaxed text-text-secondary">
                {checkedCanon.semanticJudge.reason}
                {checkedCanon.semanticJudge.reason !== "judge_unavailable" ? (
                  <span className="ml-1 text-text-muted">
                    (confidence {Math.round(checkedCanon.semanticJudge.confidence * 100)}%)
                  </span>
                ) : null}
              </p>
              {checkedCanon.semanticJudge.supportingExcerpts.length > 0 ? (
                <ul className="space-y-1.5 border-t border-surface-border/30 pt-2 text-[11px] text-text-secondary">
                  {checkedCanon.semanticJudge.supportingExcerpts.map((ex, i) => (
                    <li key={i} className="italic">
                      <span className="font-semibold not-italic text-text-muted">{ex.source}:</span>{" "}
                      {ex.text}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        ) : null}
        {showResolvedCanonStrip && resolvedCanonStatus ? (
          <CanonicalContradictionResolvedStrip resolutionStatus={resolvedCanonStatus} />
        ) : null}
        {questionnaireId && checkedCanon && canonIsActive && resolveResultId ? (
          <ResolveContradictionModal
            isOpen={resolveModalOpen}
            onClose={() => setResolveModalOpen(false)}
            questionnaireId={questionnaireId}
            itemId={question.id}
            workspaceId={workspaceId}
            contradiction={checkedCanon}
            initialFinalAnswer={question.finalAnswer || question.suggestedAnswer || ""}
            onResolved={() => {
              onContradictionResolved?.();
            }}
          />
        ) : null}

        {question.status === "unresolved" && !isReviewed && (
          <div className={cn(
            "flex items-start gap-4 rounded-xl border p-5 shadow-sm transition-all animate-in slide-in-from-top-1",
            gap.color === "text-accent-primary" ? "border-accent-primary/20 bg-accent-primary/[0.04]" :
            gap.color === "text-semantic-info" ? "border-semantic-info/20 bg-semantic-info/[0.04]" :
            "border-semantic-warning/20 bg-semantic-warning/[0.04]"
          )}>
            <div className={cn(
              "mt-0.5 rounded-full p-1.5 ring-4",
              gap.color === "text-accent-primary" ? "bg-accent-primary/10 ring-accent-primary/[0.01]" :
              gap.color === "text-semantic-info" ? "bg-semantic-info/10 ring-semantic-info/[0.01]" :
              "bg-semantic-warning/10 ring-semantic-warning/[0.01]"
            )}>
              <AlertCircleIcon className={cn("h-4 w-4", gap.color)} />
            </div>
            <div className="space-y-1">
              <p className={cn("text-xs font-black uppercase tracking-widest", gap.color)}>{gap.title}</p>
              <p className="text-[12px] leading-relaxed text-text-secondary/90">
                {gap.message}
              </p>
              <div className="mt-2 flex items-center gap-1.5 border-t border-surface-border/20 pt-2">
                <span className="text-[9px] font-bold text-text-muted/60 uppercase tracking-tight">Next Step:</span>
                <span className="text-[11px] font-semibold text-text-secondary">{gap.action}</span>
              </div>
            </div>
          </div>
        )}

        {/* Question Section */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-text-muted/60">
            <BookIcon className="h-3.5 w-3.5" />
            Subject Question
          </div>
          <h3 className="text-base font-bold leading-relaxed text-text-primary tracking-tight">
            {question.question}
          </h3>
          <div className="flex items-center gap-3">
            {/* Metadata moved to Answer Section (D11-DS-02) */}
          </div>
        </section>

        {/* Answer Section */}
        <section className="space-y-4">
            <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-text-muted/50">
              <MagicIcon className="h-3.5 w-3.5" />
              {isReviewed 
                ? "Official Handoff Version"
                : question.suggestedAnswer
                  ? question.suggestedAnswerId
                    ? "Verified Library Suggestion"
                    : "AI Draft — Review Required"
                  : "Response Draft"
              }
            </div>
            {isReviewed ? (
              <StatusSignal status="ans_approved" variant="badge" />
            ) : question.suggestedAnswer ? (
              <StatusSignal status="q_verified" variant="badge" />
            ) : question.suggestionStatus === "Draft candidate available" ? (
              <StatusSignal status="q_draft_discovery" variant="badge" />
            ) : null}
            {!editing && (
              <Button variant="ghost" size="sm" onClick={() => setEditing(true)} className="h-auto p-0 text-accent-primary hover:bg-transparent hover:underline text-xs font-bold">
                Edit manually
              </Button>
            )}
          </div>

          {question.sources.length > 0 && !editing && (
            <div className="flex items-center gap-2.5 rounded-lg border border-semantic-success/20 bg-semantic-success/[0.03] px-3 py-2 animate-in fade-in slide-in-from-top-1 duration-500">
              <ShieldCheckIcon className="h-4 w-4 text-semantic-success" />
              <div className="flex items-center gap-2">
                <p className="text-[11px] font-bold text-semantic-success uppercase tracking-wider">
                  Grounded Answer Verified
                </p>
                <span className="h-1 w-1 rounded-full bg-semantic-success/40" />
                <p className="text-[10px] font-medium text-text-secondary">
                  {question.sources.length > 1
                    ? `Backed by ${question.sources.length} supporting snippets`
                    : "Backed by direct document citation"}
                </p>
              </div>
            </div>
          )}

          {question.suggestedAnswer && !question.suggestedAnswerId && (
            <div className="flex items-center gap-2 rounded-lg border border-accent-primary/20 bg-accent-primary/[0.03] px-3 py-2 text-[11px] font-medium text-accent-primary/80">
              <SparklesIcon className="h-3.5 w-3.5 shrink-0" />
              Prepared from approved library sub-controls. Review before accepting.
            </div>
          )}

          {!question.finalAnswer && !question.suggestedAnswer && question.candidates?.some(c => !c.isApproved) && (
            <div className="rounded-xl border border-semantic-warning/20 bg-semantic-warning/[0.04] p-5 space-y-3 animate-in slide-in-from-top-2 duration-300 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="mt-0.5 rounded-full bg-semantic-warning/10 p-1.5 ring-4 ring-semantic-warning/[0.02]">
                  <SparklesIcon className="h-4 w-4 text-semantic-warning" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-bold text-semantic-warning">Unverified Draft Fallback Available</p>
                  <p className="text-xs leading-relaxed text-text-secondary">
                    Matched a draft candidate synthesized from your documents. Verify and use it below.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pl-12">
                {(() => {
                  const draft = (question.candidates || []).find(c => !c.isApproved);
                  if (!draft) return null;
                  return (
                    <>
                      <Button
                        size="sm"
                        variant="primary"
                        className="h-8 text-[11px] font-bold shadow-sm"
                        onClick={() => {
                          onUpdate(question.id, {
                            finalAnswer: draft.answer,
                            suggestionStatus: "Draft candidate selected",
                            reviewed: false
                          });
                          setEditing(true);
                        }}
                      >
                        Fill from Draft
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-[11px] font-bold text-semantic-warning hover:bg-semantic-warning/5"
                        onClick={() => handleQuickApprove(draft.id, draft.answer)}
                        disabled={isApproving}
                      >
                        <MagicIcon className="mr-1.5 h-3 w-3" />
                        {isApproving ? "Approving..." : "Quick Approve for Library"}
                      </Button>
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          {editing ? (
            <div className="space-y-4">
              <textarea
                value={localAnswer}
                onChange={(e) => setLocalAnswer(e.target.value)}
                className="w-full rounded-2xl border-accent-primary/30 bg-surface-base p-7 text-[15px] leading-7 text-text-primary focus-ring content-start min-h-[240px] resize-none shadow-inner"
                placeholder="Type the definitive answer..."
              />
              {saveWouldNeedOverride ? (
                <div className="space-y-4 rounded-xl border border-accent-primary/20 bg-accent-primary/[0.04] p-5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-accent-primary">
                    Deviation rationale
                  </p>
                  <p className="text-[11px] leading-relaxed text-text-secondary">
                    Your final text differs from the suggested answer. Pick a category and scope so this stays auditable.
                  </p>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Category</label>
                    <select
                      value={overrideReasonCategory}
                      onChange={(e) => setOverrideReasonCategory(e.target.value)}
                      className="w-full rounded-lg border border-surface-border bg-white px-3 py-2 text-sm text-text-primary"
                    >
                      <option value="">Select…</option>
                      {OVERRIDE_REASON_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {OVERRIDE_REASON_LABELS[c]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2 text-[12px] text-text-secondary">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Scope</span>
                    {(["QUESTIONNAIRE_ONLY", "REQUEST_CANONICAL_UPDATE"] as const).map((s) => (
                      <label key={s} className="flex cursor-pointer items-start gap-2">
                        <input
                          type="radio"
                          name="q-override-scope"
                          checked={overrideScope === s}
                          onChange={() => setOverrideScope(s)}
                          className="mt-0.5"
                        />
                        <span>{OVERRIDE_SCOPE_LABELS[s]}</span>
                      </label>
                    ))}
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
                      Comment {overrideReasonCategory === "OTHER_WITH_COMMENT" ? "(required)" : "(optional)"}
                    </label>
                    <textarea
                      value={overrideComment}
                      onChange={(e) => setOverrideComment(e.target.value)}
                      rows={3}
                      className="w-full rounded-lg border border-surface-border bg-white px-3 py-2 text-sm text-text-primary"
                    />
                  </div>
                </div>
              ) : null}
              <div className="flex items-center gap-3">
                <Button size="sm" onClick={handleSave}>Save Final Version</Button>
                <Button variant="ghost" size="sm" onClick={() => {
                  setEditing(false);
                  setLocalAnswer(question.finalAnswer || question.suggestedAnswer);
                }}>Cancel</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Answer source picker — surfaces imported vs AI vs final explicitly so
                  the reviewer cannot silently overwrite an uploaded manual answer by
                  clicking a generic Accept. The picker calls the split handlers; the
                  legacy Accept button in the footer is now only used for rows with a
                  single unambiguous source. */}
              {!isReviewed ? (
                <AnswerSourcePicker
                  question={question}
                  isUpdating={isUpdating}
                  onUseImported={() =>
                    onUseImportedAnswer
                      ? onUseImportedAnswer(question.id)
                      : onAccept(question.id)
                  }
                  onUseSuggested={() =>
                    onUseSuggestedAnswer
                      ? onUseSuggestedAnswer(question.id)
                      : onAccept(question.id)
                  }
                  onStartEditing={() => setEditing(true)}
                />
              ) : null}

              <div className={cn(
                "group relative rounded-2xl border p-8 shadow-sm transition-all",
                isReviewed 
                  ? "border-semantic-success/40 bg-semantic-success/[0.02] ring-1 ring-semantic-success/10" 
                  : question.suggestedAnswer 
                  ? "border-accent-primary/20 bg-accent-primary/[0.015]" 
                  : "border-surface-border bg-surface-base/50 shadow-inner"
              )}>
                {isReviewed && (
                  <div className="absolute -top-2.5 right-6 flex items-center gap-1.5 rounded-full bg-semantic-success px-2.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-white shadow-lg">
                    <ShieldCheckIcon className="h-3 w-3" />
                    Official Handoff Version
                  </div>
                )}
                <p className={cn(
                  "text-[15px] leading-7 whitespace-pre-wrap selection:bg-accent-primary/20 font-medium transition-all duration-500",
                  (!question.finalAnswer && !question.suggestedAnswer) ? "text-text-muted italic" : "text-text-primary",
                  isUpdating && "opacity-40 blur-sm grayscale"
                )}>
                  {question.finalAnswer || question.suggestedAnswer || "Internal analysis pending (see fallbacks below)..."}
                </p>
                {isUpdating && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/10 backdrop-blur-[1px] rounded-2xl animate-in fade-in duration-500">
                    <div className="flex items-center gap-3 bg-white px-5 py-3 rounded-2xl shadow-2xl ring-1 ring-accent-primary/20 scale-110">
                       <div className="h-3 w-3 rounded-full bg-accent-primary animate-pulse" />
                       <span className="text-xs font-black uppercase tracking-widest text-accent-primary">Applying New Tone...</span>
                    </div>
                    <p className="mt-4 text-[10px] font-bold text-text-muted uppercase tracking-tighter opacity-60">Regenerating answer style</p>
                  </div>
                )}
                
                {/* Regeneration Action (D16-EN-03) */}
                {question.provenance?.synthesisUsed && !isReviewed && (
                  <button 
                    onClick={() => onRegenerate(question.id)}
                    className="absolute bottom-4 right-4 flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-accent-primary shadow-sm ring-1 ring-accent-primary/10 transition-all hover:bg-accent-primary hover:text-white"
                  >
                    <SparklesIcon className="h-3 w-3" />
                    Regenerate Style
                  </button>
                )}
              </div>

              {/* Metadata Insight Bar (D11-DS-02) */}
              <div className="flex items-center gap-6 px-1">
                <div className="flex flex-col gap-1.5">
                  <span className="text-[9px] font-black uppercase tracking-[0.2em] text-text-muted/40">Topic</span>
                  <TopicBadge topicId={question.topicId} topicName={question.topicName} />
                </div>
                <div className="h-8 w-px bg-surface-border/60" />
                <div className="flex flex-col gap-1.5">
                  <span className="text-[9px] font-black uppercase tracking-[0.2em] text-text-muted/40">Confidence</span>
                  <StatusSignal
                    status={getConfidenceSignalKey(question.confidence)}
                    variant={question.confidence === "high" ? "solid" : "badge"}
                  />
                </div>
                {isReviewed && (
                  <>
                    <div className="h-8 w-px bg-surface-border/60" />
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[9px] font-black uppercase tracking-[0.2em] text-text-muted/40">Status</span>
                      {(() => {
                        const theme = getStatusTheme(question.verificationStatus);
                        return <StatusSignal status={{ label: theme.label, severity: theme.tone }} variant="badge" />;
                      })()}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Answer Ownership Governance */}
        {(question.answerOwner || question.answerApprover) && (
          <section className="space-y-2">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-text-muted/60">
              <ShieldCheckIcon className="h-3.5 w-3.5" />
              Answer Governance
            </div>
            <div className="flex flex-wrap gap-2">
              {question.answerOwner && (
                <div className="flex items-center gap-1.5 rounded-md border border-accent-primary/10 bg-accent-primary/5 px-2 py-1">
                  <span className="text-[9px] font-bold uppercase tracking-tight text-text-muted">Owner</span>
                  <span className="text-xs font-semibold text-text-primary">
                    {question.answerOwner.name || question.answerOwner.email}
                  </span>
                </div>
              )}
              {question.answerApprover && (
                <div className="flex items-center gap-1.5 rounded-md border border-semantic-info/10 bg-semantic-info/5 px-2 py-1">
                  <span className="text-[9px] font-bold uppercase tracking-tight text-text-muted">Approver</span>
                  <span className="text-xs font-semibold text-text-primary">
                    {question.answerApprover.name || question.answerApprover.email}
                  </span>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Reasoning section (D9-EN-06) */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-text-muted/60">
            <SparklesIcon className="h-3.5 w-3.5" />
            AI Reasoning
          </div>

          <div className="rounded-xl border border-surface-border bg-surface-base/30 p-5">
            {(() => {
              const segments = (question.reviewSummary || "").split(" | ");
              const human = segments[0];
              const reasoning = segments[1];
              const debug = segments[2];

              const matchScore = debug?.match(/Final:(\d+)%/)?.[1] || "0";
              const score = parseInt(matchScore);

              return (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-xs leading-relaxed text-text-primary font-bold">
                      {human || "Matched based on composite similarity."}
                    </p>
                    {reasoning && (
                      <p className="text-[11px] leading-relaxed text-text-secondary italic bg-accent-primary/[0.03] border-l-2 border-accent-primary/20 pl-3 py-1">
                        {reasoning}
                      </p>
                    )}
                  </div>

                  {/* Trust Meter */}
                  {score > 0 && (
                    <div className="py-3 border-y border-surface-border/50">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[9px] font-bold uppercase tracking-widest text-text-muted">Calculated Trust Level</span>
                        <span className={cn(
                          "text-[10px] font-black tabular-nums",
                          score >= 90 ? "text-semantic-success" : score >= 70 ? "text-accent-primary" : "text-text-muted"
                        )}>{score}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-surface-border/50 rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "h-full transition-all duration-1000 ease-out",
                            score >= 90 ? "bg-semantic-success" : score >= 70 ? "bg-accent-primary" : "bg-text-muted"
                          )}
                          style={{ width: `${score}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Quality Improvement Hints (D16-EN-03) */}
                  {(score < 90 || question.confidence !== "high") && (
                    <div className="mt-4 rounded-lg bg-semantic-info/[0.03] border border-semantic-info/10 p-3">
                      <h5 className="text-[9px] font-black uppercase tracking-widest text-semantic-info/70 mb-1.5">Improvement Suggestions</h5>
                      <ul className="space-y-1">
                        {question.confidence === "low" && (
                          <li className="flex items-start gap-2 text-[10px] text-text-secondary">
                            <div className="h-1 w-1 rounded-full bg-semantic-info mt-1.5" />
                            Map this row to a more specific security topic to narrow the search space.
                          </li>
                        )}
                        {!question.provenance?.sourceAnswerIds?.length && (
                          <li className="flex items-start gap-2 text-[10px] text-text-secondary">
                            <div className="h-1 w-1 rounded-full bg-semantic-info mt-1.5" />
                            Add an approved answer for "{question.topicName}" to the Library for future reuse.
                          </li>
                        )}
                        {question.provenance?.evidenceCount === 1 && (
                          <li className="flex items-start gap-2 text-[10px] text-text-secondary">
                            <div className="h-1 w-1 rounded-full bg-semantic-info mt-1.5" />
                            Upload more source documents (SOC2, Policies) to provide stronger evidence context.
                          </li>
                        )}
                      </ul>
                    </div>
                  )}

                  {debug && (
                    <details className="group">
                      <summary className="list-none cursor-pointer flex items-center justify-between text-[9px] font-black uppercase tracking-widest text-text-muted/50 hover:text-text-muted transition-colors">
                        Advanced Reasoning Signals
                        <ArrowRightIcon className="h-3 w-3 group-open:rotate-90 transition-transform" />
                      </summary>
                      <div className="mt-2 rounded bg-surface-base border border-surface-border/50 p-2 font-mono text-[10px] text-text-muted/70 leading-relaxed overflow-x-auto whitespace-nowrap">
                        {debug}
                      </div>
                    </details>
                  )}
                </div>
              );
            })()}
          </div>
        </section>

        {/* Provenance Details (D16-EN-01) */}
        {question.provenance && (
          <section className="space-y-3">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-text-muted/60">
              <LinkIcon className="h-3.5 w-3.5" />
              Answer Provenance
            </div>
            <div className="rounded-xl border border-surface-border bg-surface-base/20 p-4">
              <details className="group">
                <summary className="list-none cursor-pointer flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-lg shadow-sm",
                      question.provenance.answerOrigin === "approved_reuse" ? "bg-semantic-success/10 text-semantic-success border border-semantic-success/20" :
                      question.provenance.answerOrigin === "subcontrol_synthesis" ? "bg-accent-primary/10 text-accent-primary border border-accent-primary/20" :
                      question.provenance.answerOrigin === "evidence_derived" ? "bg-semantic-info/10 text-semantic-info border border-semantic-info/20" : "bg-surface-border/20 text-text-muted"
                    )}>
                      {question.provenance.answerOrigin === "approved_reuse" ? <BookIcon className="h-3 w-3" /> :
                       question.provenance.answerOrigin === "subcontrol_synthesis" ? <SparklesIcon className="h-3 w-3" /> :
                       <FileIcon className="h-3 w-3" />}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black uppercase tracking-widest text-text-primary">
                        {question.provenance.answerOrigin === "approved_reuse" ? "Direct Library Reuse" :
                         question.provenance.answerOrigin === "subcontrol_synthesis" ? "AI Control Synthesis" :
                         question.provenance.answerOrigin === "evidence_derived" ? "Document Evidence Derived" : "Unknown Origin"}
                      </span>
                      <span className="text-[8px] font-bold uppercase tracking-tight text-text-muted/60">Suggestion Foundation</span>
                    </div>
                  </div>
                  <ArrowRightIcon className="h-3.5 w-3.5 group-open:rotate-90 transition-transform text-text-muted" />
                </summary>
                
                <div className="mt-4 space-y-4 animate-in fade-in slide-in-from-top-1">
                  {/* Origin specifics */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <span className="text-[9px] font-black text-text-muted/50 uppercase tracking-tight">Synthesis Used</span>
                      <p className="text-[10px] font-bold text-text-secondary">{question.provenance.synthesisUsed ? "Yes" : "No"}</p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[9px] font-black text-text-muted/50 uppercase tracking-tight">Verifier Verdict</span>
                      <p className={cn(
                        "text-[10px] font-bold",
                        question.provenance.verifierVerdict === "pass" ? "text-semantic-success" : 
                        question.provenance.verifierVerdict === "fail" ? "text-semantic-error" : "text-text-muted"
                      )}>
                        {question.provenance.verifierVerdict?.toUpperCase() || "NOT RUN"}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[9px] font-black text-text-muted/50 uppercase tracking-tight">Evidence Snippets</span>
                      <p className="text-[10px] font-bold text-text-secondary">{question.provenance.evidenceCount || question.sources.length || 0}</p>
                    </div>
                  </div>

                  {/* Sources list */}
                  <div className="space-y-3 border-t border-surface-border/40 pt-3">
                    {question.provenance.sourceAnswerIds && question.provenance.sourceAnswerIds.length > 0 && (
                      <div className="space-y-1.5">
                        <span className="text-[9px] font-black text-text-muted/50 uppercase tracking-tight">Contributing Library Answers</span>
                        <div className="flex flex-wrap gap-1.5">
                          {question.provenance.sourceAnswerIds.map(id => (
                            <span key={id} className="inline-flex items-center rounded bg-surface-border/40 px-1.5 py-0.5 text-[9px] font-medium text-text-secondary">
                              ID: {id.slice(-6)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {question.provenance.sourceSubControlKeys && question.provenance.sourceSubControlKeys.length > 0 && (
                      <div className="space-y-1.5">
                        <span className="text-[9px] font-black text-text-muted/50 uppercase tracking-tight">Sub-Controls Involved</span>
                        <div className="flex flex-wrap gap-1.5">
                          {question.provenance.sourceSubControlKeys.map(key => (
                            <span key={key} className="inline-flex items-center rounded bg-accent-primary/5 border border-accent-primary/10 px-1.5 py-0.5 text-[9px] font-bold text-accent-primary">
                              {key}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {question.provenance.sourceDocumentIds && question.provenance.sourceDocumentIds.length > 0 && (
                      <div className="space-y-1.5">
                        <span className="text-[9px] font-black text-text-muted/50 uppercase tracking-tight">Source Documents</span>
                        <div className="flex flex-wrap gap-1.5">
                          {question.provenance.sourceDocumentIds.map(id => (
                            <span key={id} className="inline-flex items-center rounded bg-semantic-info/5 border border-semantic-info/10 px-1.5 py-0.5 text-[9px] font-bold text-semantic-info">
                              DOC: {id.slice(-6)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </details>
            </div>
          </section>
        )}

        {/* Evidence Section */}
        <section className="space-y-5">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-text-muted/60">
            <ArrowRightIcon className="h-3.5 w-3.5 rotate-90" />
            Supporting Evidence
          </div>

          <div className="space-y-4">
            {question.sources.length > 0 ? (
              question.sources.map((source, idx) => (
                <div
                  key={idx}
                  className="relative rounded-xl border border-surface-border bg-white p-5 transition-shadow hover:shadow-md"
                >
                  <div className="flex items-center justify-between mb-3 border-b border-surface-border/50 pb-2">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2 text-[9px] font-bold text-accent-primary uppercase tracking-widest">
                        <FileIcon className="h-3 w-3" />
                        {source.documentName}
                      </div>
                      {source.heading && (
                        <div className="flex items-center gap-1.5 text-[10px] font-medium text-text-muted">
                          <ArrowRightIcon className="h-2.5 w-2.5" />
                          <span className="line-clamp-1">{source.heading}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <p className="text-xs leading-relaxed text-text-secondary italic line-clamp-6">
                    "{source.quote}"
                  </p>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed border-surface-border rounded-xl bg-surface-base/30">
                <p className="text-xs font-medium text-text-muted italic">No extracted evidence linked to this item.</p>
              </div>
            )}
          </div>
        </section>

        {/* AI Reasoning */}
        {question.reviewSummary && (
          <section className="space-y-4">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-text-muted/60">
              <MagicIcon className="h-3.5 w-3.5" />
              AI Classification Logic
            </div>
            <div className="rounded-xl border border-accent-primary/10 bg-accent-primary/[0.02] p-5">
              <p className="text-xs leading-relaxed text-text-secondary/90">
                {question.reviewSummary}
              </p>
            </div>
          </section>
        )}

        {/* Alternative Suggestions */}
        {question.candidates && question.candidates.length > 1 && (
          <section className="space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-text-muted/60">
                <MagicIcon className="h-3.5 w-3.5" />
                Alternative Suggestions
              </div>
              <span className="text-[9px] font-medium text-text-muted/50">Top Candidates</span>
            </div>

            <div className="space-y-4">
              {question.candidates
                .filter(c => c.score > 0.3)
                .slice(0, 3) // AC: at most 3 alternatives
                .map((candidate, idx) => (
                  <div
                    key={candidate.id}
                    className={cn(
                      "group/card relative rounded-xl border border-surface-border bg-surface-base/30 p-4 transition-all hover:border-accent-primary/30 hover:bg-white",
                      question.finalAnswer === candidate.answer && "border-accent-primary/50 bg-accent-primary/[0.02]"
                    )}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="flex h-5 items-center rounded-full bg-accent-primary/5 px-2 text-[9px] font-bold text-accent-primary">
                          {Math.round(candidate.score * 100)}% Match
                        </span>
                        {candidate.isApproved && (
                          <span className="text-[9px] font-bold text-semantic-success uppercase tracking-wider">Approved</span>
                        )}
                      </div>
                      {question.finalAnswer !== candidate.answer && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-[10px] font-bold text-accent-primary opacity-0 group-hover/card:opacity-100 transition-opacity"
                          onClick={() => onUpdate(question.id, {
                            finalAnswer: candidate.answer,
                            suggestionStatus: "Alternative selected",
                            reviewed: false
                          })}
                        >
                          Use this suggestion
                        </Button>
                      )}
                    </div>
                    <p className="line-clamp-3 text-xs leading-relaxed text-text-secondary">
                      {candidate.answer}
                    </p>
                  </div>
                ))}
            </div>
          </section>
        )}
      </div>

      {/* Footer Actions */}
      <footer className="border-t border-surface-border bg-surface-panel/30 p-6 shadow-[0_-4px_10px_rgba(0,0,0,0.02)]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 mr-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={onPrevious}
              disabled={!onPrevious}
              className="h-10 w-10 text-text-muted hover:text-accent-primary disabled:opacity-30 transition-all border border-transparent hover:border-surface-border"
              title="Previous Row (k)"
            >
              <ArrowLeftIcon className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onNext}
              disabled={!onNext}
              className="h-10 w-10 text-text-muted hover:text-accent-primary disabled:opacity-30 transition-all border border-transparent hover:border-surface-border"
              title="Next Row (j)"
            >
              <ArrowRightIcon className="h-5 w-5" />
            </Button>
          </div>

          {!isReviewed ? (
            <>
              {(() => {
                // When both imported and AI are present and differ, the reviewer must
                // explicitly pick via the AnswerSourcePicker above — the footer Accept
                // is disabled so no one can silently codify an AI overwrite of the
                // uploaded manual answer.
                const imported = (question.importedAnswer ?? "").trim();
                const suggested = (question.suggestedAnswer ?? "").trim();
                const selection = question.finalAnswerSelection ?? null;
                const ambiguous =
                  imported.length > 0 && suggested.length > 0 && imported !== suggested;
                const acceptDisabled = 
                  (ambiguous && selection === null) || 
                  (suggested.length === 0 && (imported.length === 0 || selection !== "imported"));
                const acceptTitle = acceptDisabled
                  ? (suggested.length === 0 && imported.length === 0)
                    ? "No answer available to accept. Use 'Edit manually' to provide an answer."
                    : ambiguous && selection === null
                      ? "You must explicitly choose the Imported or AI source above before accepting."
                      : undefined
                  : undefined;
                
                let acceptText = "Accept Suggestion";
                if (selection === "imported") acceptText = "Accept Imported Answer";
                else if (selection === "suggested") {
                  acceptText = question.suggestedAnswerId ? "Accept Library Answer" : "Accept AI Synthesis";
                } else if (selection === "edited") acceptText = "Accept Edited Version";
                else if (acceptDisabled) acceptText = "Choice Required";
                return (
                  <>
                    <Button
                      variant="primary"
                      onClick={() => onAccept(question.id)}
                      className="flex-[2] h-11 text-xs font-bold"
                      disabled={acceptDisabled}
                      title={acceptTitle}
                      leftIcon={<CheckIcon className="h-5 w-5" />}
                    >
                      {acceptText}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => onReject(question.id)}
                      className="flex-1 text-semantic-error hover:bg-semantic-error/5 hover:border-semantic-error/30"
                    >
                      Reject
                    </Button>
                    <Button variant="outline" onClick={() => setEditing(true)}>
                      Override
                    </Button>
                  </>
                );
              })()}
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => setEditing(true)}
                className="flex-1"
              >
                Update Reviewed Version
              </Button>
              {question.verificationStatus === "REJECTED" && (
                <Button
                   variant="primary"
                   onClick={() => onAccept(question.id)}
                   className="flex-1"
                >
                  Accept AI Suggestion
                </Button>
              )}
            </>
          )}
        </div>
      </footer>
    </aside>
  );
}
