"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { getApiErrorMessageFromBody } from "@/lib/api/error-handler";
import { 
  CloseIcon, 
  WarningIcon, 
  AlertCircleIcon, 
  SparklesIcon, 
  CheckIcon,
  FileTextIcon,
  BookIcon,
  MagicIcon
} from "@/components/icons";
import { AnswerShell, ANSWER_SHELL_Z } from "@/components/library/answer/answer-shell";
import { AnswerStickyFormFooter } from "@/components/library/answer/answer-sticky-form-footer";
import { slugify } from "@/lib/utils/slug";
import type { WorkspaceMemberOption } from "@/components/library/answer-form-slide-over";
import type { AnswerBlock } from "@/components/library/library-types";
import { getSubControls, type SubControl } from "@/modules/knowledge/topics/subcontrol-taxonomy";

type KnowledgeTopicStatus = "ACTIVE" | "DRAFT" | "ARCHIVED";

type FormState = {
  name: string;
  description: string;
  key: string;
  ownerId: string;
  approverId: string;
  /** "" = inherit workspace default; otherwise 90 | 180 | 365 */
  reviewCadenceDays: string;
  status: KnowledgeTopicStatus;
  subControlGovernance: Record<string, { ownerId: string; approverId: string }>;
};

type OverlapMatch = {
  item: {
    id: string;
    key: string;
    name: string;
    description: string;
    workspaceId: string | null;
  };
  score: number;
  isStrongOverlap: boolean;
  isPotentialOverlap: boolean;
};

interface TopicFormSlideOverProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (topicId: string) => void;
  workspaceId: string;
  workspaceMembers?: WorkspaceMemberOption[];
  initialData?: any | null; 
}

export function TopicFormSlideOver({
  isOpen,
  onClose,
  onSuccess,
  workspaceId,
  workspaceMembers = [],
  initialData,
}: TopicFormSlideOverProps) {
  const isEditMode = !!initialData;
  const isSuggestion = initialData?.status === "SUGGESTED";

  const [formData, setFormData] = useState<FormState>({
    name: "",
    description: "",
    key: "",
    ownerId: "",
    approverId: "",
    reviewCadenceDays: "",
    status: "ACTIVE",
    subControlGovernance: {},
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forceSubmit, setForceSubmit] = useState(false);
  const [collisionTopic, setCollisionTopic] = useState<OverlapMatch | null>(null);
  const [govInsight, setGovInsight] = useState<any>(null);

  // Discovery Preview State
  const [isLoadingDraft, setIsLoadingDraft] = useState(false);
  const [draftAnswer, setDraftAnswer] = useState<AnswerBlock | null>(null);

  // Overlap detection state
  const [overlaps, setOverlaps] = useState<OverlapMatch[]>([]);
  const [isCheckingOverlap, setIsCheckingOverlap] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (initialData) {
      setFormData({
        name: initialData.name || "",
        description: initialData.description || "",
        key: initialData.key || "",
        ownerId: initialData.ownerId || "",
        approverId: initialData.approverId || "",
        reviewCadenceDays:
          initialData.reviewCadenceDays != null ? String(initialData.reviewCadenceDays) : "",
        status: (initialData.status as KnowledgeTopicStatus) || "ACTIVE",
        subControlGovernance: (initialData.subControlGovernances || []).reduce((acc: any, g: any) => {
          acc[g.subControlKey] = { ownerId: g.ownerId || "", approverId: g.approverId || "" };
          return acc;
        }, {}),
      });

      // D10-EN-06: Fetch Discovery Evidence & Answers
      if (initialData.status === "SUGGESTED") {
        fetchDiscoveryPreview(initialData.key);
      }
    } else {
      setFormData({
        name: "",
        description: "",
        key: "",
        ownerId: "",
        approverId: "",
        reviewCadenceDays: "",
        status: "ACTIVE",
        subControlGovernance: {},
      });
      setDraftAnswer(null);
    }
    setOverlaps([]);
    setError(null);
    setForceSubmit(false);
    setCollisionTopic(null);
    setGovInsight(null);
  }, [isOpen, initialData]);

  const fetchDiscoveryPreview = async (key: string) => {
    setIsLoadingDraft(true);
    try {
      const res = await fetch(`/api/knowledge/answers?topicKey=${key}`, {
        headers: { "x-workspace-id": workspaceId }
      });
      const data = await res.json();
      if (data.items && data.items.length > 0) {
        setDraftAnswer(data.items[0]);
      } else {
        setDraftAnswer(null);
      }
    } catch (err) {
      console.error("Failed to fetch discovery preview", err);
    } finally {
      setIsLoadingDraft(false);
    }
  };

  // Handle auto-slugification of key
  const handleNameChange = (name: string) => {
    setFormData(prev => ({
      ...prev,
      name,
      key: isEditMode ? prev.key : slugify(name)
    }));
  };

  // Debounced overlap check
  useEffect(() => {
    if (isEditMode || !formData.name || formData.name.length < 3) {
      setOverlaps([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsCheckingOverlap(true);
      try {
        const params = new URLSearchParams({
          checkName: formData.name,
          checkDescription: formData.description
        });
        const res = await fetch(`/api/knowledge/topics?${params.toString()}`, {
          headers: { "x-workspace-id": workspaceId }
        });
        const data = await res.json();
        if (data.overlaps) {
          setOverlaps(data.overlaps);
          setGovInsight(data.governanceInsight);
        }
      } catch (err) {
        console.error("Topic overlap check failed", err);
      } finally {
        setIsCheckingOverlap(false);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [formData.name, formData.description, isEditMode, workspaceId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      // D10-EN-03: When approving a suggestion, force status to ACTIVE
      const submissionData = {
        ...formData,
        status: initialData?.status === "SUGGESTED" ? "ACTIVE" : formData.status,
        reviewCadenceDays: formData.reviewCadenceDays === "" ? null : Number(formData.reviewCadenceDays),
        force: forceSubmit,
      };

      const res = await fetch(`/api/knowledge/topics`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-workspace-id": workspaceId,
        },
        body: JSON.stringify(submissionData),
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409 && data.error?.collision) {
          setCollisionTopic(data.error.collision);
          throw new Error("Duplicate topic detected. See below for details.");
        }
        throw new Error(getApiErrorMessageFromBody(data) || "Failed to save topic");
      }

      const topicId = data.topic.id;

      // 2. Persist Sub-control Governance Defaults
      const subEntries = Object.entries(formData.subControlGovernance);
      if (subEntries.length > 0) {
        await Promise.all(
          subEntries.map(([key, gov]) =>
            fetch(`/api/knowledge/topics/${topicId}/subcontrols/${key}/governance`, {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                "x-workspace-id": workspaceId,
              },
              body: JSON.stringify(gov),
            })
          )
        );
      }

      onSuccess(topicId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const strongOverlap = overlaps.filter(o => o.isStrongOverlap);
  const potentialOverlap = overlaps.filter(o => o.isPotentialOverlap && !o.isStrongOverlap);

  return (
    <AnswerShell zIndex={ANSWER_SHELL_Z.form} onBackdropClick={onClose}>
      <form 
        onSubmit={handleSubmit} 
        className="grid grid-rows-[auto_1fr_auto] h-full max-h-[100dvh] overflow-hidden bg-surface-base"
      >
        <div className="border-b border-surface-border p-6 bg-surface-base">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-text-primary">
                {initialData?.status === "SUGGESTED" 
                  ? "Review suggested topic" 
                  : isEditMode 
                    ? "Edit knowledge topic" 
                    : "New custom topic"}
              </h2>
              <p className="mt-1 text-sm text-text-muted">
                {initialData?.status === "SUGGESTED"
                  ? "Verify this AI-discovered theme before adding it to your library."
                  : isEditMode 
                    ? "Update this topic's guidance and governance."
                    : "Define a new domain for your Answer Library and Document matching."}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1.5 text-text-muted hover:bg-surface-panel hover:text-text-primary transition-colors"
            >
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="custom-scrollbar overflow-y-auto p-6 space-y-8 min-h-0">
          {initialData?.status === "SUGGESTED" && (
            <div className="space-y-4">
              <div className="rounded-xl bg-accent-primary/5 border border-accent-primary/20 p-4 space-y-3">
                <div className="flex items-center gap-2 text-accent-primary">
                  <SparklesIcon className="h-4 w-4" />
                  <span className="text-xs font-bold uppercase tracking-tight">Discovery Justification</span>
                </div>
                <p className="text-sm text-text-primary leading-relaxed italic">
                  "{initialData.suggestionReason || "Automated theme detected based on your documentation."}"
                </p>
              </div>

              <section className="space-y-3">
                <div className="flex items-center justify-between">
                   <h3 className="text-[11px] font-bold uppercase tracking-wider text-text-muted">Discovery Evidence</h3>
                   <div className="flex items-center gap-1.5 rounded-full bg-surface-panel px-2.5 py-1 text-[10px] font-semibold text-text-secondary border border-surface-border shadow-sm">
                      <FileTextIcon className="h-3 w-3" />
                      {initialData?.health?.sourceChunks ?? 0} supporting fragments
                   </div>
                </div>

                {isLoadingDraft ? (
                   <div className="space-y-3">
                      <div className="h-24 w-full animate-pulse rounded-xl bg-surface-panel/50" />
                      <div className="h-12 w-full animate-pulse rounded-xl bg-surface-panel/30" />
                   </div>
                ) : draftAnswer ? (
                   <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-500">
                      <div className="rounded-xl border border-surface-border bg-white p-4 shadow-sm space-y-3">
                         <div className="flex items-center gap-2 text-text-secondary">
                            <MagicIcon className="h-3.5 w-3.5 text-accent-primary" />
                            <span className="text-[10px] font-bold uppercase tracking-tight">Answer Candidate (Draft)</span>
                         </div>
                         <p className="text-xs leading-relaxed text-text-primary line-clamp-4">
                            {draftAnswer.answer}
                         </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                         {Array.from(new Set(draftAnswer.evidence?.map(e => (e as any).docName) || [])).slice(0, 3).map((doc, idx) => (
                            <div key={idx} className="flex items-center gap-1.5 rounded-lg border border-surface-border bg-surface-panel px-2 py-1 text-[10px] font-medium text-text-muted">
                               <BookIcon className="h-3 w-3 opacity-60" />
                               {doc as string}
                            </div>
                         ))}
                         {(draftAnswer.evidence?.length ?? 0) > 3 && (
                            <div className="flex items-center rounded-lg border border-surface-border bg-surface-panel px-2 py-1 text-[10px] font-medium text-text-muted">
                               +{(draftAnswer.evidence?.length ?? 0) - 3} more
                            </div>
                         )}
                      </div>
                   </div>
                ) : (
                   <div className="rounded-xl border border-semantic-warning/20 bg-semantic-warning/5 p-4 flex gap-3">
                      <AlertCircleIcon className="mt-0.5 h-4 w-4 text-semantic-warning shrink-0" />
                      <div>
                         <p className="text-xs font-bold text-semantic-warning">Draft generation skipped</p>
                         <p className="mt-1 text-[11px] leading-normal text-text-muted">
                            {(initialData?.health?.sourceChunks ?? 0) > 0 
                               ? `Semantic density for ${initialData?.health?.sourceChunks} fragments is currently too low to synthesize a high-confidence answer safely. Please define initial guidance manually.`
                               : "No direct document evidence found. This theme was identified through metadata patterns or business trends."}
                         </p>
                      </div>
                   </div>
                )}
              </section>
              
              <div className="h-px bg-surface-border opacity-50 mx-2" />
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-semantic-error-border bg-semantic-error-bg p-3 text-xs text-semantic-error font-medium">
              {error}
            </div>
          )}

          {/* Governance Warnings & Blocks */}
          {!isEditMode && (
            <div className="space-y-3">
              {/* Service-led Insight (New) */}
              {govInsight && (
                <div className={cn(
                    "rounded-xl border p-4 shadow-sm animate-in fade-in slide-in-from-top-2",
                    govInsight.overlapType === 'KEY_COLLISION' ? "border-accent-primary/20 bg-accent-primary/5" : "border-semantic-warning-border bg-semantic-warning-bg"
                )}>
                  <div className="flex gap-3">
                    <AlertCircleIcon className={cn("h-5 w-5 shrink-0", govInsight.overlapType === 'KEY_COLLISION' ? "text-accent-primary" : "text-semantic-warning")} />
                    <div className="space-y-1">
                      <p className={cn("text-sm font-bold", govInsight.overlapType === 'KEY_COLLISION' ? "text-accent-primary" : "text-semantic-warning")}>
                        {govInsight.overlapType === 'KEY_COLLISION' ? "Identifier Conflict" : "Content Overlap"}
                      </p>
                      <p className="text-xs opacity-80 leading-relaxed">
                        {govInsight.overlapType === 'KEY_COLLISION' 
                          ? `This identifier is already used by "${govInsight.targetName}". Saving will ${govInsight.recommendedAction === 'GLOBAL_OVERRIDE' ? 'override the global version' : 'overwrite your local copy'}.`
                          : `Very similar to "${govInsight.targetName}". We recommend reuse to prevent clutter.`}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <button
                        type="button"
                        onClick={() => { onClose(); /* Navigation logic could go here */ }}
                        className="rounded-lg bg-black/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-tight hover:bg-black/20 transition-colors"
                    >
                        View existing topic
                    </button>
                    {govInsight.overlapType === 'SEMANTIC_DUPLICATE' && (
                        <button
                            type="button"
                            onClick={() => setForceSubmit(true)}
                            className="rounded-lg border border-black/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-tight hover:bg-black/5"
                        >
                            Ignore & create anyway
                        </button>
                    )}
                  </div>
                </div>
              )}

              {/* Server-side Block (409) */}
              {collisionTopic && !govInsight && (
                <div className="rounded-xl border border-semantic-error-border bg-semantic-error-bg p-4 shadow-sm animate-in fade-in slide-in-from-top-2">
                  <div className="flex gap-3">
                    <AlertCircleIcon className="h-5 w-5 shrink-0 text-semantic-error" />
                    <div className="space-y-1">
                      <p className="text-sm font-bold text-semantic-error">Creation Blocked</p>
                      <p className="text-xs text-semantic-error/80 leading-relaxed">
                        This topic is near-identical to an existing one. We recommend using the existing topic.
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-4 rounded-lg bg-black/5 p-3 border border-white/5">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-text-primary truncate">{collisionTopic.item.name}</p>
                      <p className="text-[10px] text-text-muted truncate">{collisionTopic.item.description}</p>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <input 
                        type="checkbox" 
                        checked={forceSubmit}
                        onChange={(e) => setForceSubmit(e.target.checked)}
                        className="h-4 w-4 rounded border-semantic-error-border text-semantic-error focus:ring-semantic-error"
                      />
                      <span className="text-[10px] font-bold text-semantic-error uppercase tracking-tighter">Force create duplicate</span>
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="max-w-xl space-y-6">
            <section className="space-y-4">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-text-muted">Identity & Structure</h3>
              
              <div className="space-y-2">
                <label htmlFor="topic-name" className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
                   {isSuggestion ? "Final Topic Name" : "Topic name"} <span className="text-accent-primary">*</span>
                </label>
                <input
                  id="topic-name"
                  type="text"
                  required
                  autoFocus={!isSuggestion}
                  placeholder="e.g. Identity & Access Management"
                  value={formData.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className="h-10 w-full rounded-xl border border-surface-border bg-surface-base px-4 text-sm text-text-primary placeholder:text-text-muted/50 focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary transition-all"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="topic-description" className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
                  Formal Description <span className="text-accent-primary">*</span>
                </label>
                <textarea
                  id="topic-description"
                  required
                  rows={4}
                  placeholder="Explain exactly what this topic covers."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full rounded-xl border border-surface-border bg-surface-base p-4 text-sm text-text-primary placeholder:text-text-muted/50 focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary transition-all resize-none"
                />
              </div>

              <div className="space-y-2 opacity-80">
                <label htmlFor="topic-key" className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
                  Canonical Key (Primary ID)
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-muted font-mono tracking-tighter">topics:</span>
                  <input
                    id="topic-key"
                    type="text"
                    required
                    readOnly={isEditMode || isSuggestion}
                    value={formData.key}
                    onChange={(e) => setFormData({ ...formData, key: slugify(e.target.value) })}
                    className="h-10 flex-1 rounded-xl border border-surface-border bg-surface-panel px-4 text-xs font-mono text-text-muted focus:outline-none"
                  />
                  {/* Shadowing Label */}
                  {strongOverlap.some(o => o.item.key === formData.key) && (
                    <div className="flex items-center gap-1.5 rounded-full bg-accent-primary/10 px-2 py-0.5 text-[9px] font-bold text-accent-primary uppercase tracking-tighter border border-accent-primary/20">
                      {strongOverlap.find(o => o.item.key === formData.key)?.item.workspaceId ? "Local Overwrite" : "Global Override"}
                    </div>
                  )}
                </div>
                <p className="text-[9px] text-text-muted">
                  {strongOverlap.some(o => o.item.key === formData.key) 
                    ? "Warning: You are about to shadow or overwrite an existing topic configuration."
                    : "Immutable internal identifier used for matching and shadowing."}
                </p>
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-text-muted">Governance</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label htmlFor="topic-owner" className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
                    Responsible Owner
                  </label>
                  <select
                    id="topic-owner"
                    value={formData.ownerId}
                    onChange={(e) => setFormData({ ...formData, ownerId: e.target.value })}
                    className="h-10 w-full rounded-xl border border-surface-border bg-surface-base px-3 text-sm text-text-primary focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
                  >
                    <option value="">Unassigned</option>
                    {workspaceMembers.map(m => (
                      <option key={m.userId} value={m.userId}>{m.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label htmlFor="topic-approver" className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
                    Approver
                  </label>
                  <select
                    id="topic-approver"
                    value={formData.approverId}
                    onChange={(e) => setFormData({ ...formData, approverId: e.target.value })}
                    className="h-10 w-full rounded-xl border border-surface-border bg-surface-base px-3 text-sm text-text-primary focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
                  >
                    <option value="">Unassigned</option>
                    {workspaceMembers.map(m => (
                      <option key={m.userId} value={m.userId}>{m.name}</option>
                    ))}
                  </select>
                </div>

                <div className="col-span-2 space-y-2">
                  <label
                    htmlFor="topic-review-cadence"
                    className="text-[10px] font-bold uppercase tracking-widest text-text-muted"
                  >
                    Review cadence (topic default)
                  </label>
                  <select
                    id="topic-review-cadence"
                    value={formData.reviewCadenceDays}
                    onChange={(e) => setFormData({ ...formData, reviewCadenceDays: e.target.value })}
                    className="h-10 w-full rounded-xl border border-surface-border bg-surface-base px-3 text-sm text-text-primary focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
                  >
                    <option value="">Inherit workspace default</option>
                    <option value="90">Every 90 days</option>
                    <option value="180">Every 180 days</option>
                    <option value="365">Every 365 days</option>
                  </select>
                  <p className="text-[9px] text-text-muted">
                    Applies to answers in this topic unless an answer sets its own override.
                  </p>
                </div>

                <div className="space-y-2">
                  <label htmlFor="topic-status" className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
                    Display Status
                  </label>
                  <select
                    id="topic-status"
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as KnowledgeTopicStatus })}
                    className="h-10 w-full rounded-xl border border-surface-border bg-surface-base px-3 text-sm text-text-primary focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="DRAFT">Draft</option>
                    <option value="ARCHIVED">Archived</option>
                  </select>
                </div>
              </div>
            </section>

            {/* Sub-control Granular Defaults */}
            {getSubControls(formData.key).length > 0 && (
              <section className="space-y-4 pt-4 border-t border-surface-border">
                <div className="flex items-center justify-between">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-text-muted">Sub-control Defaults</h3>
                  <span className="text-[10px] text-text-muted italic">Auto-fills seeded drafts</span>
                </div>
                
                <div className="space-y-4">
                  {getSubControls(formData.key).map((sub: SubControl) => (
                    <div key={sub.key} className="rounded-xl border border-surface-border bg-surface-panel/30 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-text-primary">{sub.label}</span>
                        <span className="text-[9px] font-mono text-text-muted">{sub.key}</span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold uppercase text-text-muted">Owner</label>
                          <select
                            value={formData.subControlGovernance[sub.key]?.ownerId || ""}
                            onChange={(e) => {
                              const val = e.target.value;
                              setFormData(prev => ({
                                ...prev,
                                subControlGovernance: {
                                  ...prev.subControlGovernance,
                                  [sub.key]: { ...(prev.subControlGovernance[sub.key] || { approverId: "" }), ownerId: val }
                                }
                              }));
                            }}
                            className="h-8 w-full rounded-lg border border-surface-border bg-surface-base px-2 text-[11px] text-text-primary focus:border-accent-primary focus:outline-none"
                          >
                            <option value="">Inherit from Topic</option>
                            {workspaceMembers.map(m => (
                              <option key={m.userId} value={m.userId}>{m.name}</option>
                            ))}
                          </select>
                        </div>
                        
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold uppercase text-text-muted">Approver</label>
                          <select
                            value={formData.subControlGovernance[sub.key]?.approverId || ""}
                            onChange={(e) => {
                              const val = e.target.value;
                              setFormData(prev => ({
                                ...prev,
                                subControlGovernance: {
                                  ...prev.subControlGovernance,
                                  [sub.key]: { ...(prev.subControlGovernance[sub.key] || { ownerId: "" }), approverId: val }
                                }
                              }));
                            }}
                            className="h-8 w-full rounded-lg border border-surface-border bg-surface-base px-2 text-[11px] text-text-primary focus:border-accent-primary focus:outline-none"
                          >
                            <option value="">Inherit from Topic</option>
                            {workspaceMembers.map(m => (
                              <option key={m.userId} value={m.userId}>{m.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>

        <div className="shrink-0 border-t border-surface-border px-6 pt-5 pb-10 bg-surface-panel/50">
          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-surface-border bg-surface-base px-6 py-2.5 text-sm font-bold text-text-primary hover:bg-surface-panel transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !formData.name || !formData.description}
              className="rounded-xl bg-accent-primary px-8 py-2.5 text-sm font-bold text-white shadow-lg shadow-accent-primary/20 hover:bg-accent-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isSubmitting ? (
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Saving...
                </div>
              ) : initialData?.status === "SUGGESTED" ? (
                <div className="flex items-center gap-2">
                    <CheckIcon className="h-4 w-4" /> Approve & Activate
                </div>
              ) : (
                isEditMode ? "Save changes" : (strongOverlap.some(o => o.item.key === formData.key) ? "Overwrite Topic" : "Create topic")
              )}
            </button>
          </div>
        </div>
      </form>
    </AnswerShell>
  );
}
