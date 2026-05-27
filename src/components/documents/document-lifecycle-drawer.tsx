"use client";

import { useEffect, useState } from "react";
import { DocumentLifecycle, formatBytes, formatRelativeUpdated, inferredSourceRole } from "@/lib/documents/document-display";
import { StatusSignal } from "@/components/ui/status-signal";
import { 
  CloseIcon, 
  FileIcon, 
  ClockIcon, 
  AlertCircleIcon, 
  CheckIcon, 
  SparklesIcon, 
  UserIcon,
  TopicIcon,
  LayersIcon,
  RefreshIcon,
  TrashIcon,
  FileTextIcon,
  ActivityIcon
} from "@/components/icons";
import { AnswerShell, ANSWER_SHELL_Z } from "@/components/library/answer/answer-shell";
import { cn } from "@/lib/utils";
import { getFriendlyDocumentError } from "@/lib/documents/document-errors";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { MetricTile } from "@/components/ui/metric-tile";
import { ProgressBar } from "@/components/ui/progress-bar";

interface DocumentLifecycleDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  document: any; // SourceDocumentRow
  lifecycle: DocumentLifecycle;
  workspaceId?: string;
}

export function DocumentLifecycleDrawer({ isOpen, onClose, document: doc, lifecycle, workspaceId }: DocumentLifecycleDrawerProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"insight" | "history">("insight");
  const [details, setDetails] = useState<any>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!isOpen || !doc?.id) return;

    void fetchDetails();

    // Standardized Polling: Refresh every 3s if doc is still processing or stale
    const pollInterval = setInterval(() => {
      const isProcessing = 
        doc.uploadStatus === "PENDING" || 
        lifecycle.parse.status === "QUEUED" || 
        lifecycle.parse.status === "PROCESSING" ||
        lifecycle.parse.isStale ||
        lifecycle.seeding.status === "QUEUED" ||
        lifecycle.seeding.status === "RUNNING" ||
        lifecycle.seeding.isStale;

      if (isProcessing) {
        void fetchDetails();
      }
    }, 3000);

    return () => clearInterval(pollInterval);
  }, [isOpen, doc?.id, doc.uploadStatus, lifecycle.parse.status, lifecycle.parse.isStale, lifecycle.seeding.status, lifecycle.seeding.isStale]);

  const fetchDetails = async () => {
    setIsLoadingDetails(true);
    try {
      const res = await fetch(`/api/documents/${doc.id}`, {
        headers: workspaceId ? { "x-workspace-id": workspaceId } : {},
      });
      if (!res.ok) throw new Error("Failed to fetch details");
      const data = await res.json();
      setDetails(data.document);
    } catch (err) {
      console.error("Failed to fetch doc details", err);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  if (!isOpen) return null;

  const errorDetail = getFriendlyDocumentError(lifecycle);
  const stats = details?.stats || { chunkCount: 0, topicCount: 0, evidenceReadiness: 0 };
  const history = details?.document?.history || [];
  const fullText = details?.document?.content?.fullText || "";
  const textPreview = fullText.slice(0, 3000) + (fullText.length > 3000 ? "..." : "");

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      const res = await fetch(`/api/documents/${doc.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "retry" }),
      });
      if (!res.ok) throw new Error("Retry failed");
      toast({ severity: "success", title: "Analysis Restarted", message: "Retry initiated for the document." });
      onClose();
    } catch (err) {
      toast({ severity: "error", title: "Action Failed", message: "Failed to re-trigger analysis." });
    } finally {
      setIsRetrying(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to remove this document?")) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/documents/${doc.id}/actions`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
      toast({ severity: "success", title: "Document Removed", message: "The file has been safely removed from the library." });
      onClose();
    } catch (err) {
      toast({ severity: "error", title: "Action Failed", message: "Failed to remove document." });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AnswerShell zIndex={ANSWER_SHELL_Z.form} onBackdropClick={onClose}>
      <div className="flex h-full flex-col bg-surface-panel shadow-2xl">
        {/* Header Section */}
        <div className="relative border-b border-surface-border bg-gradient-to-br from-white to-surface-base px-8 py-8">
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-primary/10 text-accent-primary">
                  <FileIcon className="h-6 w-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-2xl font-bold tracking-tight text-text-primary">{doc.originalName}</h2>
                    {doc.version > 1 && (
                      <span className="rounded-full bg-accent-primary/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent-primary">
                        v{doc.version}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-sm font-medium text-text-muted">
                    <span>{formatBytes(doc.fileSizeBytes)}</span>
                    <span className="text-surface-border">•</span>
                    <span className="uppercase text-accent-primary/70">{doc.mimeType.split("/")[1] || "File"}</span>
                    <span className="text-surface-border">•</span>
                    <span className="flex items-center gap-1.5">
                      <UserIcon className="h-3.5 w-3.5" />
                      {doc.uploadedBy.name || doc.uploadedBy.email}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-full text-text-muted hover:bg-surface-hover hover:text-text-primary transition-all shadow-sm border border-transparent hover:border-surface-border"
            >
              <CloseIcon className="h-6 w-6" />
            </button>
          </div>

          <div className="mt-8 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <StatusSignal status={lifecycle.activeVariant === "ok" ? "doc_ready" : lifecycle.activeVariant === "error" ? "doc_failed" : "doc_processing"} />
              <div className="flex items-center gap-1.5 text-xs text-text-muted">
                <ClockIcon className="h-3.5 w-3.5" />
                <span>Updated {formatRelativeUpdated(doc.updatedAt) ?? "recently"}</span>
              </div>
            </div>
            {/* Tab Control */}
            <div className="flex items-center gap-1 rounded-xl bg-surface-base p-1 shadow-inner border border-surface-border">
               <TabButton 
                active={activeTab === "insight"} 
                onClick={() => setActiveTab("insight")} 
                label="Insights" 
                icon={<SparklesIcon className="h-3 w-3" />} 
               />
               <TabButton 
                active={activeTab === "history"} 
                onClick={() => setActiveTab("history")} 
                label="Versions" 
                icon={<ActivityIcon className="h-3 w-3" />} 
               />
            </div>
          </div>
        </div>

        {/* Action Bar for Failures */}
        {errorDetail && (
          <div className="mx-8 mt-8 rounded-2xl border border-semantic-error-border bg-gradient-to-r from-semantic-error-bg/30 to-semantic-error-bg/10 p-5 shadow-sm">
            <div className="flex gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-semantic-error/10 text-semantic-error">
                <AlertCircleIcon className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <h4 className="text-base font-bold text-semantic-error">Step Failure: {errorDetail.reason}</h4>
                <p className="mt-1 text-sm leading-relaxed text-text-secondary">
                  {errorDetail.advice}
                </p>
                <div className="mt-5 flex gap-3">
                  <Button 
                    onClick={handleRetry} 
                    isLoading={isRetrying}
                    leftIcon={<RefreshIcon className="h-4 w-4" />}
                    className="bg-semantic-error hover:bg-semantic-error/90"
                  >
                    Retry {errorDetail.stage}
                  </Button>
                  <Button 
                    variant="ghost" 
                    onClick={handleDelete}
                    isLoading={isDeleting}
                    className="text-semantic-error hover:bg-semantic-error-bg hover:text-semantic-error"
                  >
                    Delete File
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Scrollable Content Area */}
        <div className="custom-scrollbar flex-1 overflow-y-auto p-8">
          {activeTab === "insight" ? (
            <div className="space-y-12">
              {/* Section: Operational Metrics */}
              <section>
                <h3 className="mb-6 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-text-muted">
                  <ActivityIcon className="h-4 w-4" />
                  Content Analysis
                </h3>
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                  <MetricTile 
                    label="Extraction Units" 
                    value={isLoadingDetails ? "..." : stats.chunkCount} 
                    subtitle="Total Chunks"
                    icon={<LayersIcon className="h-4 w-4" />}
                  />
                  <MetricTile 
                    label="Topics Identified" 
                    value={isLoadingDetails ? "..." : stats.topicCount} 
                    subtitle="Knowledge Keys"
                    icon={<TopicIcon className="h-4 w-4" />}
                  />
                  <div className="rounded-xl border border-surface-border bg-surface-panel p-5 shadow-sm">
                    <p className="text-xs font-medium uppercase tracking-wide text-text-muted">Evidence Readiness</p>
                    <div className="mt-4 flex items-end gap-3 font-mono">
                      <p className="text-3xl font-bold text-text-primary">{Math.round(stats.evidenceReadiness * 100)}%</p>
                      <p className="mb-1 text-xs text-text-muted">utilization</p>
                    </div>
                    <div className="mt-4">
                      <ProgressBar value={stats.evidenceReadiness * 100} size="sm" />
                    </div>
                  </div>
                </div>
              </section>

              {/* Section: Lifecycle Timeline */}
              <section>
                <h3 className="mb-8 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-text-muted">
                  <SparklesIcon className="h-4 w-4" />
                  Processing Lifecycle
                </h3>
                <div className="relative pl-10 space-y-12">
                  <div className="absolute left-4 top-2 h-[calc(100%-16px)] w-px bg-surface-border" />

                  <TimelineStep
                    title="Secure Persistence"
                    description="Uploaded to workspace encrypted storage"
                    status={lifecycle.upload.label}
                    variant={lifecycle.upload.variant}
                    icon={CheckIcon}
                    timestamp={doc.createdAt}
                  >
                    <p className="text-xs leading-relaxed text-text-secondary">
                      Verified as <span className="font-bold text-semantic-success">AES-256 Encrypted</span> in the workspace vault.
                    </p>
                  </TimelineStep>

                  <TimelineStep
                    title="Structural Extraction"
                    description="Parsing document layout and content"
                    status={lifecycle.parse.label}
                    variant={lifecycle.parse.variant}
                    icon={lifecycle.parse.status === "PROCESSING" ? ClockIcon : lifecycle.parse.status === "COMPLETED" ? CheckIcon : AlertCircleIcon}
                    isActive={lifecycle.currentStage === "Parse"}
                    error={lifecycle.parse.error}
                    failureCode={(details?.document?.parseJobs?.[0] as any)?.failureCode}
                    retryCount={(details?.document?.parseJobs?.[0] as any)?.retryCount}
                  >
                    {lifecycle.parse.status === "COMPLETED" && (
                      <p className="text-xs leading-relaxed text-text-secondary">
                        Structural analysis complete. Identified <span className="font-bold text-text-primary">{stats.chunkCount} logical segments</span>.
                      </p>
                    )}
                    {lifecycle.parse.isStale && (
                      <div className="mt-2 text-xs text-text-muted italic border-l-2 border-semantic-warning/30 pl-3">
                        Processing is taking longer than expected. This could be due to file complexity or a temporary system interruption.
                      </div>
                    )}
                  </TimelineStep>

                  <TimelineStep
                    title="Intelligence Seeding"
                    description="Mapping findings to library knowledge"
                    status={lifecycle.seeding.label}
                    variant={lifecycle.seeding.variant}
                    icon={SparklesIcon}
                    isActive={lifecycle.currentStage === "Seeding"}
                    isLast
                    error={lifecycle.seeding.error}
                    failureCode={(details?.answerSeedingJobs?.[0] as any)?.failureCode}
                  >
                    {lifecycle.seeding.status === "COMPLETED" || lifecycle.seeding.status === "PARTIAL" ? (
                      <div className="space-y-2">
                        <p className="text-xs leading-relaxed text-text-secondary">
                            Successfully mapped to <span className="font-bold text-text-primary">{stats.topicCount} workspace topics</span>.
                        </p>
                        <p className="text-[10px] text-text-muted italic">
                          This document is now grounding {stats.usedChunkCount} library responses.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-xs italic text-text-muted">
                          {lifecycle.parse.status === "COMPLETED" 
                            ? "Waiting for intelligence task to start..." 
                            : "Waiting for parse completion..."}
                        </p>
                        {lifecycle.seeding.isStale && (
                          <div className="mt-2 text-xs text-text-muted italic border-l-2 border-semantic-warning/30 pl-3">
                            Knowledge training is taking longer than expected.
                          </div>
                        )}
                      </div>
                    )}
                  </TimelineStep>
                </div>
              </section>

              {/* Section: Text Preview */}
              <section>
                <h3 className="mb-6 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-text-muted">
                  <FileTextIcon className="h-4 w-4" />
                  Extracted Text Preview
                </h3>
                <div className="group relative overflow-hidden rounded-2xl border border-surface-border bg-surface-base shadow-inner">
                  <div className="absolute right-4 top-4 opacity-0 transition-opacity group-hover:opacity-100">
                      <span className="rounded bg-surface-panel px-2 py-1 text-[10px] font-bold text-text-muted shadow-sm uppercase">Read-only Buffer</span>
                  </div>
                  <div className="max-h-[400px] overflow-y-auto p-6 font-mono text-[13px] leading-relaxed text-text-secondary scrollbar-thin">
                      {isLoadingDetails ? (
                        <div className="flex animate-pulse flex-col gap-3">
                          <div className="h-3 w-3/4 rounded bg-surface-border" />
                          <div className="h-3 w-1/2 rounded bg-surface-border" />
                          <div className="h-3 w-5/6 rounded bg-surface-border" />
                        </div>
                      ) : textPreview ? (
                        <pre className="whitespace-pre-wrap selection:bg-accent-primary/20">{textPreview}</pre>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                          <p className="text-sm font-medium text-text-muted italic">No text available for preview yet.</p>
                          <p className="mt-1 text-xs text-text-muted/60">This could be due to parsing status or file type.</p>
                        </div>
                      )}
                  </div>
                </div>
              </section>
            </div>
          ) : (
            <div className="space-y-8">
               <section>
                  <h3 className="mb-6 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-text-muted">
                    <ActivityIcon className="h-4 w-4" />
                    Document Version History
                  </h3>
                  <div className="rounded-2xl border border-surface-border bg-white overflow-hidden shadow-sm">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-surface-border bg-surface-base/50">
                          <th className="px-6 py-4 font-bold text-text-primary">Version</th>
                          <th className="px-6 py-4 font-bold text-text-primary">Uploaded At</th>
                          <th className="px-6 py-4 font-bold text-text-primary">Uploader</th>
                          <th className="px-6 py-4 font-bold text-text-primary">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-surface-border">
                        {isLoadingDetails ? (
                           <tr>
                             <td colSpan={4} className="px-6 py-12 text-center text-text-muted italic animate-pulse">
                               Searching archives...
                             </td>
                           </tr>
                        ) : history.map((v: any) => (
                           <tr key={v.id} className={cn("transition-colors", v.isLatest ? "bg-accent-primary/[0.03]" : "hover:bg-surface-base/30")}>
                             <td className="px-6 py-4">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-text-primary">v{v.version}</span>
                                  {v.isLatest && (
                                    <span className="rounded-full bg-semantic-success/10 px-2 py-0.5 text-[9px] font-bold uppercase text-semantic-success">Active</span>
                                  )}
                                </div>
                             </td>
                             <td className="px-6 py-4 text-text-secondary">
                                {new Date(v.createdAt).toLocaleDateString()} at {new Date(v.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                             </td>
                             <td className="px-6 py-4 text-text-secondary">
                                {v.uploadedBy.name || v.uploadedBy.email}
                             </td>
                             <td className="px-6 py-4">
                               <StatusSignal variant="subtle" status={{ label: v.uploadStatus, severity: v.uploadStatus === "UPLOADED" ? "success" : v.uploadStatus === "FAILED" ? "error" : "neutral" }} />
                             </td>
                           </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-8 text-xs text-text-muted leading-relaxed max-w-[480px]">
                    Versioning ensures that historical policy evidence is never lost. 
                    <span className="font-bold text-accent-primary ml-1">Note:</span> only the active version (v{doc.version}) is currently utilized by the automated Answer Seeding engine.
                  </p>
               </section>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="border-t border-surface-border bg-white px-8 py-6">
           <div className="flex items-center justify-between">
              <div className="max-w-[320px]">
                <p className="text-xs font-medium text-text-secondary leading-normal text-balance">
                  This document serves as <span className="font-bold text-accent-primary">grounding truth</span> for your trust operations. Lifecycle steps ensure high-fidelity automation.
                </p>
              </div>
              <div className="flex items-center gap-3">
                 {!errorDetail && (
                   <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={handleDelete}
                    className="text-text-muted hover:bg-semantic-error-bg hover:text-semantic-error"
                    isLoading={isDeleting}
                    leftIcon={<TrashIcon className="h-4 w-4" />}
                   >
                     Remove Reference
                   </Button>
                 )}
                 <Button variant="secondary" size="sm" onClick={onClose}>
                    Close Drawer
                 </Button>
              </div>
           </div>
        </div>
      </div>
    </AnswerShell>
  );
}

function TabButton({ active, onClick, label, icon }: { active: boolean; onClick: () => void; label: string; icon: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-lg px-4 py-1.5 text-xs font-bold tracking-wide transition-all",
        active 
          ? "bg-white text-accent-primary shadow-sm" 
          : "text-text-muted hover:bg-surface-hover hover:text-text-primary"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function TimelineStep({ 
  title, 
  description, 
  status, 
  variant, 
  children, 
  icon: Icon,
  isActive,
  isLast,
  timestamp,
  error,
  failureCode,
  retryCount
}: { 
  title: string; 
  description: string; 
  status: string; 
  variant: any; 
  children: React.ReactNode;
  icon: any;
  isActive?: boolean;
  isLast?: boolean;
  timestamp?: string;
  error?: string | null;
  failureCode?: string | null;
  retryCount?: number;
}) {
  const isOk = variant === "ok";
  const isErr = variant === "error";
  const isWarning = variant === "warning";
  
  return (
    <div className="relative">
      <div className={cn(
        "absolute -left-10 flex h-8 w-8 items-center justify-center rounded-xl bg-white border transition-all duration-300 shadow-sm z-10",
        isOk ? "border-semantic-success/50 bg-semantic-success-bg text-semantic-success shadow-semantic-success/5" :
        isErr ? "border-semantic-error/50 bg-semantic-error-bg text-semantic-error shadow-semantic-error/5" :
        isWarning ? "border-semantic-warning/50 bg-semantic-warning-bg text-semantic-warning shadow-semantic-warning/5" :
        isActive ? "border-accent-primary bg-accent-primary/5 text-accent-primary animate-pulse-subtle ring-4 ring-accent-primary/5" :
        "border-surface-border bg-surface-panel text-text-muted"
      )}>
        <Icon className={cn("h-4 w-4", isActive && "animate-spin-slow")} />
      </div>
      
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h4 className={cn("text-base font-bold tracking-tight", isActive ? "text-accent-primary" : "text-text-primary")}>{title}</h4>
            {timestamp && <span className="text-[10px] font-bold uppercase text-text-muted/60 bg-surface-base px-1.5 py-0.5 rounded tracking-tighter shadow-sm">{new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
          </div>
          <p className="mt-0.5 text-xs font-medium text-text-muted">{description}</p>
        </div>
        <StatusSignal variant="subtle" status={{ label: status, severity: variant === "ok" ? "success" : variant === "error" ? "error" : variant === "warning" ? "warning" : "neutral" }} />
      </div>

      <div className={cn(
        "mt-4 rounded-xl border border-surface-border bg-surface-base/30 p-5 transition-all",
        isActive && "border-accent-primary/20 bg-accent-primary/[0.02]"
      )}>
        {children}
        {error && (
            <div className="mt-4 rounded-lg bg-semantic-error/5 border border-semantic-error/10 p-3">
              <div className="flex flex-col gap-1">
                <p className="text-[11px] leading-relaxed text-semantic-error/80 font-mono italic">
                   <span className="font-bold uppercase not-italic mr-2">Debug Trace:</span> {error}
                </p>
                {failureCode && (
                  <p className="text-[10px] items-center flex gap-1.5 font-bold text-text-muted">
                    <span className="px-1.5 py-0.5 rounded bg-surface-panel border border-surface-border uppercase tracking-tight">Code: {failureCode}</span>
                    {retryCount !== undefined && <span className="px-1.5 py-0.5 rounded bg-surface-panel border border-surface-border uppercase tracking-tight">Attempts: {retryCount}</span>}
                  </p>
                )}
              </div>
            </div>
        )}
      </div>
    </div>
  );
}
