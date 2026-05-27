"use client";

import { useState } from "react";
import type { Topic } from "@/components/library/library-types";
import { getApiErrorMessageFromBody } from "@/lib/api/error-handler";
import type { WorkspaceMemberOption } from "@/components/library/answer-form-slide-over";

interface AddAnswerSlideOverProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  topics: Topic[];
  workspaceId: string;
  workspaceMembers?: WorkspaceMemberOption[];
}

export function AddAnswerSlideOver({
  isOpen,
  onClose,
  onSuccess,
  topics,
  workspaceId,
  workspaceMembers = [],
}: AddAnswerSlideOverProps) {
  const [formData, setFormData] = useState({
    title: "",
    topicId: "",
    answer: "",
    ownerId: "",
    status: "APPROVED" as "DRAFT" | "APPROVED" | "ARCHIVED",
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.topicId || !formData.answer) {
      setError("Please fill in all required fields.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const ownerPayload = !formData.ownerId
        ? { ownerId: null, owner: null }
        : {
            ownerId: formData.ownerId,
            owner:
              workspaceMembers.find((m) => m.userId === formData.ownerId)?.name ?? null,
          };

      const res = await fetch("/api/knowledge/answers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-workspace-id": workspaceId,
        },
        body: JSON.stringify({
          title: formData.title,
          topicId: formData.topicId,
          answer: formData.answer,
          status: formData.status,
          ...ownerPayload,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(getApiErrorMessageFromBody(data) || "Failed to save answer");
      }

      onSuccess();
      onClose();
      // Reset form
      setFormData({
        title: "",
        topicId: "",
        answer: "",
        ownerId: "",
        status: "APPROVED",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end overflow-hidden">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm animate-in fade-in duration-300"
        onClick={onClose} 
      />

      {/* Slide-over Panel */}
      <div className="glass-panel relative h-[100dvh] max-h-[100dvh] w-full max-w-xl border-l border-white/10 animate-in slide-in-from-right duration-500 ease-out shadow-2xl bg-surface-base/95 overflow-hidden">
        <form onSubmit={handleSubmit} className="grid grid-rows-[auto_1fr_auto] h-full max-h-[100dvh] overflow-hidden">
          {/* Header */}
          <div className="border-b border-white/10 p-6">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xl font-bold text-text-primary">Add New Answer</h2>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full p-1.5 text-text-muted hover:bg-white/5 hover:text-text-primary transition-colors"
              >
                <CloseIcon className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-text-muted">Create a verified security response for your company library.</p>
          </div>

          {/* Form Content */}
          <div className="overflow-y-auto p-6 space-y-6 custom-scrollbar min-h-0">
            {error && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-500">
                {error}
              </div>
            )}

            {/* Topic Selection */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-text-muted ml-0.5">
                Topic <span className="text-accent-primary">*</span>
              </label>
              <select
                required
                value={formData.topicId}
                onChange={(e) => setFormData({ ...formData, topicId: e.target.value })}
                className="w-full h-10 rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-text-primary focus:border-accent-primary focus:ring-1 focus:ring-accent-primary transition-all outline-none appearance-none"
              >
                <option value="" className="bg-surface-base">Select a security domain...</option>
                {topics.map((t) => (
                  <option key={t.id} value={t.id} className="bg-surface-base">
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Title / Question */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-text-muted ml-0.5">
                Question / Title <span className="text-accent-primary">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. How do you manage encryption keys?"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full h-10 rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-text-primary placeholder:text-text-muted/50 focus:border-accent-primary focus:ring-1 focus:ring-accent-primary transition-all outline-none"
              />
            </div>

            {/* Answer Body */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-text-muted ml-0.5">
                Official Response <span className="text-accent-primary">*</span>
              </label>
              <textarea
                required
                rows={8}
                placeholder="Provide the verified technical response..."
                value={formData.answer}
                onChange={(e) => setFormData({ ...formData, answer: e.target.value })}
                className="w-full rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-text-primary placeholder:text-text-muted/50 focus:border-accent-primary focus:ring-1 focus:ring-accent-primary transition-all outline-none resize-none"
              />
            </div>

            {/* Owner & Status */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-text-muted ml-0.5">
                  Responsible owner
                </label>
                <select
                  value={formData.ownerId}
                  onChange={(e) => setFormData({ ...formData, ownerId: e.target.value })}
                  className="w-full h-10 rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-text-primary focus:border-accent-primary focus:ring-1 focus:ring-accent-primary transition-all outline-none appearance-none"
                >
                  <option value="" className="bg-surface-base">
                    Unassigned
                  </option>
                  {workspaceMembers.map((m) => (
                    <option key={m.userId} value={m.userId} className="bg-surface-base">
                      {m.name} ({m.role})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-text-muted ml-0.5">
                  Initial Status
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                  className="w-full h-10 rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-text-primary focus:border-accent-primary focus:ring-1 focus:ring-accent-primary transition-all outline-none appearance-none"
                >
                  <option value="DRAFT" className="bg-surface-base">Draft</option>
                  <option value="APPROVED" className="bg-surface-base">Approved</option>
                </select>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="shrink-0 border-t border-white/10 px-6 pt-5 pb-10 flex items-center justify-end gap-3 bg-surface-panel/50">
             <button
              type="button"
              className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-text-secondary hover:bg-white/5 transition-colors"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 rounded-lg bg-accent-primary px-6 py-2 text-sm font-semibold text-white shadow-xl shadow-accent-primary/20 hover:bg-accent-primary-hover transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100"
            >
              {isSubmitting ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : null}
              <span>Save to Library</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}
