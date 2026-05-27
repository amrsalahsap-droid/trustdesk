"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Topic, AnswerBlock } from "@/components/library/library-types";
import { getApiErrorMessageFromBody } from "@/lib/api/error-handler";
import { isApprovedGovernance } from "@/lib/knowledge/answer-version-record";
import {
  OVERRIDE_REASON_CATEGORIES,
  OVERRIDE_REASON_LABELS,
  OVERRIDE_SCOPE_LABELS,
} from "@/lib/knowledge/override-reason";
import { CloseIcon } from "@/components/icons";
import { AnswerShell, ANSWER_SHELL_Z } from "@/components/library/answer/answer-shell";
import { AnswerLongFormEditor } from "@/components/library/answer/answer-long-form-editor";
import { AnswerStickyFormFooter } from "@/components/library/answer/answer-sticky-form-footer";
import { usePermissions } from "@/lib/auth/use-permissions";
import { canEditAnswerContent, canAssignGovernance, isWorkspaceAdmin } from "@/lib/auth/governance-actions";
import { Permission } from "@/lib/auth/permissions";
import type { WorkspaceRole } from "@prisma/client";

/** Workspace member row for owner assignment (from GET /api/workspaces/members). */
export type WorkspaceMemberOption = {
  userId: string;
  name: string;
  email: string;
  role: string;
};

type KnowledgeStatus = "DRAFT" | "APPROVED" | "ARCHIVED";

type OverrideScopeForm = "QUESTIONNAIRE_ONLY" | "REQUEST_CANONICAL_UPDATE";

type FormState = {
  title: string;
  topicId: string;
  answer: string;
  ownerId: string;
  approverId: string;
  status: KnowledgeStatus;
  overrideReasonCategory: string;
  overrideComment: string;
  overrideScope: OverrideScopeForm;
};

type FieldErrors = Partial<
  Record<"topicId" | "title" | "answer" | "overrideReasonCategory" | "overrideComment" | "overrideScope", string>
>;

function emptyForm(defaultTopicId: string | null): FormState {
  return {
    title: "",
    topicId: defaultTopicId ?? "",
    answer: "",
    ownerId: "",
    approverId: "",
    status: "APPROVED",
    overrideReasonCategory: "",
    overrideComment: "",
    overrideScope: "QUESTIONNAIRE_ONLY",
  };
}

function fromAnswerBlock(block: AnswerBlock): FormState {
  const s = (block.status || "DRAFT").toUpperCase();
  const status: KnowledgeStatus =
    s === "APPROVED" || s === "ARCHIVED" || s === "DRAFT" ? (s as KnowledgeStatus) : "DRAFT";
  return {
    title: block.title,
    topicId: block.topic?.id || "",
    answer: block.answer,
    ownerId: block.ownerId ?? "",
    approverId: (block as any).approverId ?? "",
    status,
    overrideReasonCategory: block.overrideReasonCategory ?? "",
    overrideComment: block.overrideComment ?? "",
    overrideScope: (block.overrideScope as OverrideScopeForm) ?? "QUESTIONNAIRE_ONLY",
  };
}

function formsEqual(a: FormState, b: FormState) {
  return (
    a.title === b.title &&
    a.topicId === b.topicId &&
    a.answer === b.answer &&
    a.ownerId === b.ownerId &&
    a.approverId === b.approverId &&
    a.status === b.status &&
    a.overrideReasonCategory === b.overrideReasonCategory &&
    a.overrideComment === b.overrideComment &&
    a.overrideScope === b.overrideScope
  );
}

interface AnswerFormSlideOverProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (meta?: { editedAnswerId?: string }) => void;
  topics: Topic[];
  workspaceId: string;
  workspaceMembers?: WorkspaceMemberOption[];
  initialData?: AnswerBlock | null;
  defaultTopicId?: string | null;
}

export function AnswerFormSlideOver({
  isOpen,
  onClose,
  onSuccess,
  topics,
  workspaceId,
  workspaceMembers = [],
  initialData,
  defaultTopicId = null,
}: AnswerFormSlideOverProps) {
  const isEditMode = !!initialData;

  const [formData, setFormData] = useState<FormState>(() => emptyForm(defaultTopicId));
  const [baseline, setBaseline] = useState<FormState>(() => emptyForm(defaultTopicId));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { context: auth, hasPermission } = usePermissions();

  const canEditContent = useMemo(() => {
    if (!auth) return false;
    return canEditAnswerContent(
      { userId: auth.userId, role: auth.role as WorkspaceRole, permissions: auth.permissions as Permission[] },
      initialData?.ownerId ?? null
    );
  }, [auth, initialData]);

  const canAssign = useMemo(() => {
    if (!auth) return false;
    return canAssignGovernance({
      userId: auth.userId,
      role: auth.role as WorkspaceRole,
      permissions: auth.permissions as Permission[]
    });
  }, [auth]);

  const canManageStatus = useMemo(() => {
    if (!auth) return false;
    return isWorkspaceAdmin(auth.role as WorkspaceRole) || hasPermission(Permission.APPROVE_ANSWERS);
  }, [auth, hasPermission]);

  useEffect(() => {
    if (!isOpen) return;
    const snap = initialData ? fromAnswerBlock(initialData) : emptyForm(defaultTopicId);
    setFormData(snap);
    setBaseline(snap);
    setFieldErrors({});
    setError(null);
  }, [isOpen, initialData, defaultTopicId]);

  const dirty = useMemo(() => !formsEqual(formData, baseline), [formData, baseline]);

  const tryClose = useCallback(() => {
    if (!dirty) {
      onClose();
      return;
    }
    if (window.confirm("Discard unsaved changes?")) {
      onClose();
    }
  }, [dirty, onClose]);

  const validate = (): boolean => {
    const next: FieldErrors = {};
    if (!formData.topicId.trim()) next.topicId = "Select a topic.";
    if (!formData.title.trim()) next.title = "Add a question or title.";
    if (!formData.answer.trim()) next.answer = "Enter the official response.";

    const libraryEditNeedsOverride =
      isEditMode &&
      initialData &&
      isApprovedGovernance(initialData.governanceStatus ?? null) &&
      (formData.title !== baseline.title ||
        formData.answer !== baseline.answer ||
        formData.topicId !== baseline.topicId);

    if (libraryEditNeedsOverride) {
      if (!formData.overrideReasonCategory.trim()) {
        next.overrideReasonCategory = "Select a reason for editing approved content.";
      }
      if (!formData.overrideScope) {
        next.overrideScope = "Select scope.";
      }
      if (
        formData.overrideReasonCategory === "OTHER_WITH_COMMENT" &&
        !formData.overrideComment.trim()
      ) {
        next.overrideComment = "Comment is required for this category.";
      }
    }

    setFieldErrors(next);
    const firstKey = Object.keys(next)[0] as keyof FieldErrors | undefined;
    if (firstKey) {
      const el = document.getElementById(`answer-field-${firstKey}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    return Object.keys(next).length === 0;
  };

  const handleStatusChange = (next: KnowledgeStatus) => {
    const prev = formData.status;
    if (next === "APPROVED" && prev === "DRAFT") {
      if (!window.confirm("Mark this answer as official approved library content?")) {
        return;
      }
    }
    if (next === "ARCHIVED" && prev === "APPROVED") {
      if (!window.confirm("Archive this answer? It will no longer appear as active knowledge.")) {
        return;
      }
    }
    setFormData((fd) => ({ ...fd, status: next }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const url = isEditMode ? `/api/knowledge/answers/${initialData!.id}` : "/api/knowledge/answers";

      const ownerPayload = !formData.ownerId
        ? { ownerId: null, owner: null }
        : {
          ownerId: formData.ownerId,
          owner: workspaceMembers.find((m) => m.userId === formData.ownerId)?.name ?? null,
        };

      const libraryEditNeedsOverride =
        isEditMode &&
        initialData &&
        isApprovedGovernance(initialData.governanceStatus ?? null) &&
        (formData.title !== baseline.title ||
          formData.answer !== baseline.answer ||
          formData.topicId !== baseline.topicId);

      const payload: Record<string, unknown> = {
        title: formData.title,
        topicId: formData.topicId,
        answer: formData.answer,
        status: formData.status,
        ...ownerPayload,
        approverId: formData.approverId || null,
      };

      if (
        isEditMode &&
        (libraryEditNeedsOverride ||
          formData.overrideReasonCategory.trim() ||
          formData.overrideComment.trim())
      ) {
        if (formData.overrideReasonCategory.trim() && formData.overrideScope) {
          payload.overrideReasonCategory = formData.overrideReasonCategory;
          payload.overrideScope = formData.overrideScope;
          payload.overrideComment = formData.overrideComment.trim() || null;
        }
      }

      const res = await fetch(url, {
        method: isEditMode ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          "x-workspace-id": workspaceId,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(getApiErrorMessageFromBody(data) || "Failed to save answer");
      }

      onSuccess(isEditMode ? { editedAnswerId: initialData!.id } : undefined);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGenerateAI = async () => {
    if (!formData.title) return;
    setIsGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/knowledge/answers/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-workspace-id": workspaceId,
        },
        body: JSON.stringify({ query: formData.title }),
      });
      if (!res.ok) throw new Error("AI Generation failed");
      const data = await res.json();
      setFormData((prev) => ({ ...prev, answer: data.answer }));
    } catch (err) {
      setError("AI generation failed. Please try again or draft manually.");
      console.error("AI:Generation:Failed", err);
    } finally {
      setIsGenerating(false);
    }
  };

  if (!isOpen) return null;

  const submitLabel = isEditMode ? "Save changes" : "Save to library";

  const libraryEditNeedsOverride =
    isEditMode &&
    initialData &&
    isApprovedGovernance(initialData.governanceStatus ?? null) &&
    (formData.title !== baseline.title ||
      formData.answer !== baseline.answer ||
      formData.topicId !== baseline.topicId);

  return (
    <AnswerShell zIndex={ANSWER_SHELL_Z.form} onBackdropClick={tryClose}>
      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
        <div className="border-b border-white/10 p-6">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-text-primary">{isEditMode ? "Edit answer" : "Add answer"}</h2>
              <p className="mt-1 text-sm text-text-muted">
                {isEditMode
                  ? "Update the official response and governance fields. Changes are versioned."
                  : "Create a verified response for questionnaires and audits."}
              </p>
            </div>
            <button
              type="button"
              onClick={tryClose}
              className="shrink-0 rounded-full p-1.5 text-text-muted transition-colors hover:bg-white/5 hover:text-text-primary"
            >
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="custom-scrollbar flex-1 overflow-y-auto p-6">
          {formData.status === "DRAFT" ? (
            <div className="mb-6 rounded-lg border border-semantic-warning-border bg-semantic-warning-bg px-4 py-3 text-xs text-semantic-warning">
              Draft — not treated as approved library content until you mark it approved.
            </div>
          ) : null}

          {error ? (
            <div className="mb-6 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400">{error}</div>
          ) : null}

          <div className="grid gap-8 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:items-start">
            <div className="space-y-6">
              <section className="space-y-4">
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-text-muted">Identity</h3>
                <div className="space-y-2">
                  <label htmlFor="answer-field-topicId" className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
                    Topic <span className="text-accent-primary">*</span>
                  </label>
                  <select
                    id="answer-field-topicId"
                    required
                    disabled={!canEditContent}
                    value={formData.topicId}
                    onChange={(e) => {
                      setFormData({ ...formData, topicId: e.target.value });
                      setFieldErrors((fe) => ({ ...fe, topicId: undefined }));
                    }}
                    className="h-10 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-text-primary focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="">Select a topic…</option>
                    {topics.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.topicId ? <p className="text-xs font-medium text-red-400">{fieldErrors.topicId}</p> : null}
                </div>

                <div className="space-y-2">
                  <label htmlFor="answer-field-title" className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
                    Question / title <span className="text-accent-primary">*</span>
                  </label>
                  <input
                    id="answer-field-title"
                    type="text"
                    required
                    disabled={!canEditContent}
                    placeholder="e.g. How do you manage encryption keys?"
                    value={formData.title}
                    onChange={(e) => {
                      setFormData({ ...formData, title: e.target.value });
                      setFieldErrors((fe) => ({ ...fe, title: undefined }));
                    }}
                    className="h-10 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-text-primary placeholder:text-text-muted/50 focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-invalid={fieldErrors.title ? "true" : undefined}
                  />
                  <p className="text-[10px] leading-relaxed text-text-muted">
                    This is the label auditors and questionnaires see.
                  </p>
                  {fieldErrors.title ? <p className="text-xs font-medium text-red-400">{fieldErrors.title}</p> : null}
                </div>
              </section>

              <section className="space-y-4">
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-text-muted">Governance</h3>
                <div className="space-y-2">
                  <label htmlFor="answer-owner" className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
                    Responsible owner
                  </label>
                  <select
                    id="answer-owner"
                    disabled={!canAssign}
                    value={formData.ownerId}
                    onChange={(e) => setFormData({ ...formData, ownerId: e.target.value })}
                    className="h-10 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-text-primary focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="">Unassigned</option>
                    {workspaceMembers.map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {m.name} ({m.role})
                      </option>
                    ))}
                  </select>
                  <p className="text-[9px] leading-relaxed text-text-muted">Only members of this workspace can be assigned.</p>
                </div>

                <div className="space-y-2">
                  <label htmlFor="answer-approver" className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
                    Approver
                  </label>
                  <select
                    id="answer-approver"
                    disabled={!canAssign}
                    value={formData.approverId}
                    onChange={(e) => setFormData({ ...formData, approverId: e.target.value })}
                    className="h-10 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-text-primary focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="">Unassigned</option>
                    {workspaceMembers.map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {m.name} ({m.role})
                      </option>
                    ))}
                  </select>
                  <p className="text-[9px] leading-relaxed text-text-muted">The user authorized to finalize this response.</p>
                </div>

                <div className="space-y-2">
                  <label htmlFor="answer-status" className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
                    Knowledge status
                  </label>
                  <select
                    id="answer-status"
                    disabled={!canManageStatus}
                    value={formData.status}
                    onChange={(e) => handleStatusChange(e.target.value as KnowledgeStatus)}
                    className="h-10 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-text-primary focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="DRAFT">Draft</option>
                    <option value="APPROVED">Approved</option>
                    <option value="ARCHIVED">Archived</option>
                  </select>
                  <p className="text-[10px] leading-relaxed text-text-muted">
                    {formData.status === "DRAFT"
                      ? "Draft: work in progress, not finalized for auditors."
                      : formData.status === "APPROVED"
                        ? "Approved: official library content."
                        : "Archived: retired from active use."}
                  </p>
                </div>
              </section>

              {libraryEditNeedsOverride ? (
                <section className="space-y-4 rounded-lg border border-accent-primary/25 bg-accent-primary/5 p-4">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-accent-primary">
                    Edit rationale (required)
                  </h3>
                  <p className="text-[10px] leading-relaxed text-text-muted">
                    This answer is in an approved governance state. Document why you are changing title, topic, or body
                    so auditors can follow the intent.
                  </p>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
                      Category <span className="text-accent-primary">*</span>
                    </label>
                    <select
                      value={formData.overrideReasonCategory}
                      onChange={(e) =>
                        setFormData((fd) => ({ ...fd, overrideReasonCategory: e.target.value }))
                      }
                      className="h-10 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-text-primary focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
                    >
                      <option value="">Select…</option>
                      {OVERRIDE_REASON_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {OVERRIDE_REASON_LABELS[c]}
                        </option>
                      ))}
                    </select>
                    {fieldErrors.overrideReasonCategory ? (
                      <p className="text-xs font-medium text-red-400">{fieldErrors.overrideReasonCategory}</p>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
                      Scope <span className="text-accent-primary">*</span>
                    </span>
                    <div className="space-y-2 text-xs text-text-secondary">
                      {(["QUESTIONNAIRE_ONLY", "REQUEST_CANONICAL_UPDATE"] as const).map((s) => (
                        <label key={s} className="flex cursor-pointer items-start gap-2">
                          <input
                            type="radio"
                            name="lib-override-scope"
                            checked={formData.overrideScope === s}
                            onChange={() => setFormData((fd) => ({ ...fd, overrideScope: s }))}
                            className="mt-1"
                          />
                          <span>{OVERRIDE_SCOPE_LABELS[s]}</span>
                        </label>
                      ))}
                    </div>
                    {fieldErrors.overrideScope ? (
                      <p className="text-xs font-medium text-red-400">{fieldErrors.overrideScope}</p>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
                      Comment {formData.overrideReasonCategory === "OTHER_WITH_COMMENT" ? "(required)" : "(optional)"}
                    </label>
                    <textarea
                      value={formData.overrideComment}
                      onChange={(e) => setFormData((fd) => ({ ...fd, overrideComment: e.target.value }))}
                      rows={3}
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-text-primary focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
                    />
                    {fieldErrors.overrideComment ? (
                      <p className="text-xs font-medium text-red-400">{fieldErrors.overrideComment}</p>
                    ) : null}
                  </div>
                </section>
              ) : null}
            </div>

            <div className="min-h-0 lg:sticky lg:top-0">
              <AnswerLongFormEditor
                value={formData.answer}
                disabled={!canEditContent}
                onChange={(answer) => {
                  setFormData((fd) => ({ ...fd, answer }));
                  setFieldErrors((fe) => ({ ...fe, answer: undefined }));
                }}
                onDraftWithAi={handleGenerateAI}
                aiBusy={isGenerating}
                aiDisabled={!formData.title || !canEditContent}
                error={fieldErrors.answer}
              />
            </div>
          </div>
        </div>

        <AnswerStickyFormFooter
          onCancel={tryClose}
          submitLabel={submitLabel}
          isSubmitting={isSubmitting}
        />
      </form>
    </AnswerShell>
  );
}
