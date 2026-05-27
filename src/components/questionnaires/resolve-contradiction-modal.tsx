"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import type { CheckedCanonicalContradiction } from "@/components/questionnaires/canonical-contradiction-banner";
import {
  OVERRIDE_REASON_CATEGORIES,
  OVERRIDE_REASON_LABELS,
} from "@/lib/knowledge/override-reason";
import type { OverrideReasonCategoryValue } from "@/lib/knowledge/override-reason";

type ResolveAction = "KEEP_ROW" | "EDIT_ROW_ALIGN" | "REQUEST_CANONICAL_UPDATE" | "FALSE_POSITIVE";

export interface ResolveContradictionModalProps {
  isOpen: boolean;
  onClose: () => void;
  questionnaireId: string;
  itemId: string;
  workspaceId: string;
  contradiction: CheckedCanonicalContradiction;
  /** Seed for EDIT_ROW_ALIGN editor. */
  initialFinalAnswer: string;
  onResolved: () => void;
}

export function ResolveContradictionModal({
  isOpen,
  onClose,
  questionnaireId,
  itemId,
  workspaceId,
  contradiction,
  initialFinalAnswer,
  onResolved,
}: ResolveContradictionModalProps) {
  const [action, setAction] = useState<ResolveAction | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");
  const [overrideReasonCategory, setOverrideReasonCategory] = useState<OverrideReasonCategoryValue | "">("");
  const [overrideComment, setOverrideComment] = useState("");
  const [finalAnswer, setFinalAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setFinalAnswer(initialFinalAnswer);
    }
  }, [isOpen, initialFinalAnswer]);

  const resultId = contradiction.persistence?.resultId;
  const primary = contradiction.hits[0];
  const canonShort = contradiction.canonicalAnswerId
    ? `${contradiction.canonicalAnswerId.slice(0, 8)}…`
    : "—";

  const resetForm = () => {
    setAction(null);
    setResolutionNote("");
    setOverrideReasonCategory("");
    setOverrideComment("");
    setFinalAnswer("");
    setError(null);
  };

  const handleClose = () => {
    if (!submitting) {
      resetForm();
      onClose();
    }
  };

  const submit = async () => {
    if (!resultId || !action) {
      setError("Missing result id or action.");
      return;
    }
    if (action === "FALSE_POSITIVE" && !resolutionNote.trim()) {
      setError("Explanation is required.");
      return;
    }
    if ((action === "KEEP_ROW" || action === "REQUEST_CANONICAL_UPDATE") && !overrideReasonCategory) {
      setError("Select a reason.");
      return;
    }
    if (
      overrideReasonCategory === "OTHER_WITH_COMMENT" &&
      (action === "KEEP_ROW" || action === "REQUEST_CANONICAL_UPDATE") &&
      !overrideComment.trim()
    ) {
      setError('A comment is required for "Other".');
      return;
    }
    if (action === "EDIT_ROW_ALIGN" && !finalAnswer.trim()) {
      setError("Enter an updated answer.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (workspaceId) headers["x-workspace-id"] = workspaceId;

      const body: Record<string, unknown> = {
        action,
        resultId,
      };

      if (action === "FALSE_POSITIVE") {
        body.resolutionNote = resolutionNote.trim();
      } else if (action === "KEEP_ROW" || action === "REQUEST_CANONICAL_UPDATE") {
        body.overrideReasonCategory = overrideReasonCategory || undefined;
        body.overrideComment = overrideComment.trim() || null;
        body.resolutionNote = resolutionNote.trim() || null;
      } else if (action === "EDIT_ROW_ALIGN") {
        body.finalAnswer = finalAnswer;
        body.resolutionNote = resolutionNote.trim() || null;
      }

      const res = await fetch(
        `/api/questionnaires/${questionnaireId}/items/${itemId}/contradiction/resolve`,
        { method: "POST", headers, body: JSON.stringify(body) },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error?.message || `Request failed (${res.status})`);
        return;
      }
      onResolved();
      resetForm();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Resolve library mismatch">
      <div className="space-y-4 text-[13px] text-text-primary">
        <p className="text-text-secondary leading-relaxed">
          {contradiction.reason ||
            contradiction.message ||
            "This row disagrees with the approved canonical answer for the linked topic."}
        </p>
        <div className="rounded-md border border-surface-border bg-surface-panel/40 px-3 py-2 text-[11px] text-text-muted">
          Canonical answer {canonShort}
          {contradiction.canonicalVersionNumber != null
            ? ` · version ${contradiction.canonicalVersionNumber}`
            : null}
          {primary?.ruleId ? ` · rule ${primary.ruleId}` : null}
        </div>

        {!action ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <Button type="button" variant="outline" className="h-auto py-3 text-left" onClick={() => setAction("KEEP_ROW")}>
              Keep row (override)
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-auto py-3 text-left"
              onClick={() => setAction("EDIT_ROW_ALIGN")}
            >
              Edit row to align
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-auto py-3 text-left"
              onClick={() => setAction("REQUEST_CANONICAL_UPDATE")}
            >
              Request canonical update
            </Button>
            <Button type="button" variant="outline" className="h-auto py-3 text-left" onClick={() => setAction("FALSE_POSITIVE")}>
              False positive
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <Button type="button" variant="ghost" size="sm" className="-ml-2 h-8 px-2" onClick={() => setAction(null)}>
              ← Back
            </Button>

            {(action === "KEEP_ROW" || action === "REQUEST_CANONICAL_UPDATE") && (
              <div className="space-y-2">
                <label className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Reason</label>
                <select
                  className="w-full rounded-md border border-surface-border bg-white px-3 py-2 text-[13px]"
                  value={overrideReasonCategory}
                  onChange={(e) => setOverrideReasonCategory(e.target.value as OverrideReasonCategoryValue)}
                >
                  <option value="">Select…</option>
                  {OVERRIDE_REASON_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {OVERRIDE_REASON_LABELS[c]}
                    </option>
                  ))}
                </select>
                <label className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Comment</label>
                <textarea
                  className="min-h-[88px] w-full rounded-md border border-surface-border bg-white px-3 py-2 text-[13px]"
                  value={overrideComment}
                  onChange={(e) => setOverrideComment(e.target.value)}
                  placeholder={action === "KEEP_ROW" ? "Justify keeping the row as written" : "Describe the library change you need"}
                />
              </div>
            )}

            {action === "FALSE_POSITIVE" && (
              <div className="space-y-2">
                <label className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Explanation (required)</label>
                <textarea
                  className="min-h-[100px] w-full rounded-md border border-surface-border bg-white px-3 py-2 text-[13px]"
                  value={resolutionNote}
                  onChange={(e) => setResolutionNote(e.target.value)}
                  placeholder="Why is this not a real contradiction?"
                />
              </div>
            )}

            {action === "EDIT_ROW_ALIGN" && (
              <div className="space-y-2">
                <label className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Updated answer</label>
                <textarea
                  className="min-h-[120px] w-full rounded-md border border-surface-border bg-white px-3 py-2 text-[13px]"
                  value={finalAnswer}
                  onChange={(e) => setFinalAnswer(e.target.value)}
                  placeholder="Align the row text with the approved canonical policy"
                />
                <label className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Note (optional)</label>
                <input
                  className="w-full rounded-md border border-surface-border bg-white px-3 py-2 text-[13px]"
                  value={resolutionNote}
                  onChange={(e) => setResolutionNote(e.target.value)}
                />
              </div>
            )}

            {error ? <p className="text-[12px] text-semantic-danger">{error}</p> : null}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={handleClose} disabled={submitting}>
                Cancel
              </Button>
              <Button type="button" onClick={submit} disabled={submitting}>
                {submitting ? "Saving…" : "Submit"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
