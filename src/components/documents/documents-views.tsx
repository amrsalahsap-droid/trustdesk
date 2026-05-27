import { DataTable } from "@/components/ui/data-table";
import { StatusSignal } from "@/components/ui/status-signal";
import { FileIcon } from "@/components/icons";
import { getFriendlyParseError } from "@/lib/utils/parse-errors";
import type { SourceDocumentRow } from "@/lib/documents/document-display";
import {
  formatBytes,
  formatFileType,
  formatRelativeUpdated,
  getUnifiedStatus,
  inferredSourceRole,
  processingSubline,
} from "@/lib/documents/document-display";


function TagsPlaceholder() {
  return (
    <button
      type="button"
      disabled
      className="cursor-not-allowed rounded border border-dashed border-surface-border bg-surface-base px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-muted"
      title="Tags coming soon"
    >
      Add tags
    </button>
  );
}

import { useState } from "react";
import { DocumentLifecycleDrawer } from "./document-lifecycle-drawer";
import { PipelineTracker } from "./pipeline-tracker";
import { ReadinessGauge } from "./readiness-gauge";
import { getDocumentLifecycle, calculateReadiness } from "@/lib/documents/document-display";

import { DotsVerticalIcon, RefreshIcon, TrashIcon, EyeIcon, WarningIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

function DocumentActions({ doc, onRefresh }: { doc: SourceDocumentRow, onRefresh?: () => void }) {
  const { toast } = useToast();
  const lifecycle = getDocumentLifecycle(doc);
  const isFailed = lifecycle.activeVariant === "error";
  const [loading, setLoading] = useState<string | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
 
  const handleAction = async (type: "retry" | "delete") => {
    setLoading(type);
    try {
      const res = await fetch(`/api/documents/${doc.id}/actions`, {
        method: type === "retry" ? "POST" : "DELETE",
        ...(type === "retry" && {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "retry" }),
        })
      });
      if (!res.ok) throw new Error(`${type} failed`);
      toast({ 
        severity: "success", 
        title: type === "retry" ? "Action Initiated" : "Document Removed", 
        message: type === "retry" ? "Retry initiated successfully." : "The document has been removed." 
      });
      if (type === "delete") setIsDeleteConfirmOpen(false);
      onRefresh?.();
    } catch (err) {
      toast({ 
        severity: "error", 
        title: "Action Failed", 
        message: err instanceof Error ? err.message : "An unknown error occurred." 
      });
    } finally {
      setLoading(null);
    }
  };
 
  return (
    <div className="flex items-center justify-end gap-1">
      {isFailed && (
        <button
          onClick={() => handleAction("retry")}
          disabled={!!loading}
          className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-accent-primary/10 hover:text-accent-primary disabled:opacity-50"
          title="Retry"
        >
          <RefreshIcon className={cn("h-3.5 w-3.5", loading === "retry" && "animate-spin")} />
        </button>
      )}
      <button
        onClick={() => setIsDeleteConfirmOpen(true)}
        disabled={!!loading}
        className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-semantic-error-bg hover:text-semantic-error disabled:opacity-50"
        title="Remove"
      >
        <TrashIcon className={cn("h-3.5 w-3.5", loading === "delete" && "animate-pulse")} />
      </button>
 
      <Modal 
        isOpen={isDeleteConfirmOpen} 
        onClose={() => setIsDeleteConfirmOpen(false)} 
        title="Confirm Deletion"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg border border-semantic-error-border bg-semantic-error-bg p-3 text-semantic-error">
            <WarningIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="text-xs font-medium leading-relaxed">
              Are you sure you want to remove <span className="font-bold underline">{doc.originalName}</span>? 
              This will permanently delete the file and all associated evidence analysis.
            </div>
          </div>
          
          <div className="flex justify-end gap-2">
            <Button 
              variant="outline" 
              onClick={() => setIsDeleteConfirmOpen(false)}
              disabled={!!loading}
            >
              Cancel
            </Button>
            <Button 
              variant="primary" 
              className="bg-semantic-error text-white hover:bg-semantic-error/90"
              onClick={() => handleAction("delete")}
              isLoading={loading === "delete"}
            >
              Delete Document
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export function DocumentsTableView({ 
  data, 
  onRefresh, 
  selectedIds, 
  onToggleSelection, 
  onToggleAllSelection,
  workspaceId
}: { 
  data: SourceDocumentRow[], 
  onRefresh?: () => void,
  workspaceId?: string,
  selectedIds: Set<string>,
  onToggleSelection: (id: string) => void,
  onToggleAllSelection: () => void
}) {
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  
  const selectedDoc = data.find(d => d.id === selectedDocId);
  const selectedLifecycle = selectedDoc ? getDocumentLifecycle(selectedDoc) : null;

  const columns = [
    {
      key: "selection",
      header: (
        <input 
          type="checkbox" 
          checked={data.length > 0 && selectedIds.size === data.length}
          onChange={onToggleAllSelection}
          className="h-4 w-4 rounded border-surface-border bg-surface-base text-accent-primary focus:ring-accent-primary"
        />
      ),
      className: "w-10",
      render: (d: SourceDocumentRow) => (
        <input 
          type="checkbox" 
          checked={selectedIds.has(d.id)}
          onChange={() => onToggleSelection(d.id)}
          className="h-4 w-4 rounded border-surface-border bg-surface-base text-accent-primary focus:ring-accent-primary"
        />
      ),
    },
    {
      key: "originalName",
      header: "Name",
      render: (d: SourceDocumentRow) => (
        <div 
          className="group flex min-w-0 max-w-[240px] cursor-pointer flex-col"
          onClick={() => setSelectedDocId(d.id)}
        >
          <div className="flex items-center gap-2">
            <span className={cn(
              "truncate font-medium transition-colors group-hover:text-accent-primary group-hover:underline underline-offset-4 decoration-accent-primary/30",
              selectedIds.has(d.id) ? "text-accent-primary" : "text-text-primary"
            )}>
              {d.originalName}
            </span>
            {d.version > 1 && (
              <span className="rounded bg-surface-base px-1 py-0.5 text-[9px] font-bold text-text-muted border border-surface-border">v{d.version}</span>
            )}
          </div>
          <span className="text-xs text-text-muted">{formatBytes(d.fileSizeBytes)}</span>
        </div>
      ),
    },
    {
      key: "type",
      header: "Type",
      className: "whitespace-nowrap",
      render: (d: SourceDocumentRow) => <span className="text-xs font-medium uppercase text-text-secondary">{formatFileType(d)}</span>,
    },
    {
      key: "pipeline",
      header: "Pipeline Progress",
      className: "min-w-[280px]",
      render: (d: SourceDocumentRow) => {
        const lifecycle = getDocumentLifecycle(d);
        return (
          <PipelineTracker 
            lifecycle={lifecycle} 
            onRetry={(stage) => handleAction(stage as any)}
          />
        );
      },
    },
    {
      key: "readiness",
      header: "Readiness",
      className: "w-32",
      render: (d: SourceDocumentRow) => <ReadinessGauge score={calculateReadiness(d)} size="sm" />,
    },
    {
      key: "role",
      header: "Source role",
      className: "hidden lg:table-cell max-w-[140px]",
      render: (d: SourceDocumentRow) => <span className="text-xs text-text-secondary">{inferredSourceRole(d)}</span>,
    },
    {
      key: "uploaded",
      header: "Uploaded",
      className: "hidden md:table-cell whitespace-nowrap",
      render: (d: SourceDocumentRow) => (
        <div className="flex flex-col">
          <span className="text-xs text-text-secondary">{d.uploadedBy.name || d.uploadedBy.email}</span>
          <span className="text-[10px] text-text-muted">{formatRelativeUpdated(d.createdAt) ?? new Date(d.createdAt).toLocaleString()}</span>
        </div>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "w-20",
      render: (d: SourceDocumentRow) => <DocumentActions doc={d} onRefresh={onRefresh} />,
    },
  ];

  return (
    <>
      <DataTable data={data} columns={columns} rowKey={(d) => d.id} embedded />
      {selectedDoc && selectedLifecycle && (
        <DocumentLifecycleDrawer 
          isOpen={true} 
          onClose={() => {
            setSelectedDocId(null);
            onRefresh?.();
          }} 
          document={selectedDoc}
          lifecycle={selectedLifecycle}
          workspaceId={workspaceId}
        />
      )}
    </>
  );
}

export function DocumentsListView({ 
  data, 
  onRefresh, 
  workspaceId,
  selectedIds, 
  onToggleSelection
}: { 
  data: SourceDocumentRow[], 
  onRefresh?: () => void,
  workspaceId?: string,
  selectedIds: Set<string>,
  onToggleSelection: (id: string) => void
}) {
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const selectedDoc = data.find(d => d.id === selectedDocId);
  const selectedLifecycle = selectedDoc ? getDocumentLifecycle(selectedDoc) : null;

  return (
    <>
      <ul className="divide-y divide-surface-border">
        {data.map((d) => {
          const { label, variant } = getUnifiedStatus(d);
          const sub = processingSubline(d);
          const isSelected = selectedIds.has(d.id);
          return (
            <li 
              key={d.id} 
              className={cn(
                "flex group items-center gap-3 px-4 py-3 transition-all sm:px-5",
                isSelected ? "bg-accent-primary/[0.03]" : "hover:bg-surface-hover"
              )}
            >
              <input 
                type="checkbox" 
                checked={isSelected}
                onChange={() => onToggleSelection(d.id)}
                className="h-4 w-4 rounded border-surface-border bg-surface-base text-accent-primary focus:ring-accent-primary"
              />

              <div 
                className="flex flex-1 min-w-0 items-center gap-3 cursor-pointer"
                onClick={() => setSelectedDocId(d.id)}
              >
                <FileIcon className={cn("h-4 w-4 shrink-0 transition-colors", isSelected ? "text-accent-primary" : "text-text-muted")} />
                <div className="min-w-0 flex-1 text-left">
                  <div className="flex items-center gap-2">
                    <p className={cn(
                      "truncate text-sm font-medium transition-colors",
                      isSelected ? "text-accent-primary" : "text-text-primary group-hover:text-accent-primary"
                    )}>
                      {d.originalName}
                    </p>
                    {d.version > 1 && (
                      <span className="rounded bg-surface-panel px-1 py-0.5 text-[9px] font-bold text-text-muted border border-surface-border">v{d.version}</span>
                    )}
                  </div>
                  <p className="text-xs text-text-muted">
                    {formatFileType(d)} · {formatBytes(d.fileSizeBytes)} · {inferredSourceRole(d)}
                  </p>
                  {sub && <p className="mt-0.5 text-xs text-text-secondary">{sub}</p>}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-4">
                <div className="hidden shrink-0 sm:block">
                  <TagsPlaceholder />
                </div>
                <div className="flex flex-col items-end gap-1">
                  <StatusSignal 
                    status={{ 
                      label, 
                      severity: variant === "ok" ? "success" : variant === "error" ? "error" : variant === "warning" ? "warning" : "info" 
                    }} 
                  />
                  <span className="text-[10px] text-text-muted">{formatRelativeUpdated(d.createdAt) ?? ""}</span>
                </div>
                <DocumentActions doc={d} onRefresh={onRefresh} />
              </div>
            </li>
          );
        })}
      </ul>
      {selectedDoc && selectedLifecycle && (
        <DocumentLifecycleDrawer 
          isOpen={true} 
          onClose={() => {
            setSelectedDocId(null);
            onRefresh?.();
          }} 
          document={selectedDoc}
          lifecycle={selectedLifecycle}
          workspaceId={workspaceId}
        />
      )}
    </>
  );
}

export function DocumentsCardsView({ 
  data, 
  onRefresh,
  workspaceId,
  selectedIds,
  onToggleSelection
}: { 
  data: SourceDocumentRow[], 
  onRefresh?: () => void,
  workspaceId?: string,
  selectedIds: Set<string>,
  onToggleSelection: (id: string) => void
}) {
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const selectedDoc = data.find(d => d.id === selectedDocId);
  const selectedLifecycle = selectedDoc ? getDocumentLifecycle(selectedDoc) : null;

  return (
    <>
      <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3">
        {data.map((d) => {
          const lifecycle = getDocumentLifecycle(d);
          const { label, variant, error } = getUnifiedStatus(d);
          const friendlyError = error ? getFriendlyParseError(error) : null;
          const readiness = calculateReadiness(d);
          const job = d.parseJobs?.[0];
          const rel = formatRelativeUpdated(job?.updatedAt ?? job?.createdAt);
          const isSelected = selectedIds.has(d.id);
          return (
            <div
              key={d.id}
              className={cn(
                "group relative flex flex-col rounded-2xl border p-5 shadow-sm transition-all duration-300",
                isSelected 
                  ? "border-accent-primary bg-accent-primary/[0.04] shadow-md ring-1 ring-accent-primary/20" 
                  : "border-surface-border bg-white hover:border-accent-primary/50 hover:bg-surface-base/[0.02] hover:shadow-lg"
              )}
            >
              {/* Card Selection Overlay */}
              <input 
                type="checkbox" 
                checked={isSelected}
                onChange={() => onToggleSelection(d.id)}
                className="absolute right-3 top-3 z-10 h-4 w-4 rounded border-surface-border bg-surface-base text-accent-primary focus:ring-accent-primary opacity-0 group-hover:opacity-100 checked:opacity-100 transition-opacity"
              />

              <div className="flex items-start justify-between gap-2 overflow-visible">
                <div 
                  className="flex flex-1 items-start gap-3 cursor-pointer min-w-0"
                  onClick={() => setSelectedDocId(d.id)}
                >
                  <FileIcon className={cn("mt-0.5 h-5 w-5 shrink-0 transition-colors", isSelected ? "text-accent-primary" : "text-text-muted")} />
                  <ReadinessGauge score={readiness} size="sm" />
                </div>
                <div className="opacity-0 group-hover:opacity-100 transition-opacity translate-x-1">
                   <DocumentActions doc={d} onRefresh={onRefresh} />
                </div>
              </div>
              
              <div 
                className="mt-4 cursor-pointer"
                onClick={() => setSelectedDocId(d.id)}
              >
                <div className="flex items-baseline gap-2">
                  <h3 className={cn(
                      "line-clamp-2 text-sm font-bold leading-snug transition-colors flex-1",
                      isSelected ? "text-accent-primary" : "text-text-primary group-hover:text-accent-primary"
                  )}>
                      {d.originalName}
                  </h3>
                  {d.version > 1 && (
                     <span className="shrink-0 rounded bg-white/50 px-1 py-0.5 text-[9px] font-bold text-text-muted border border-surface-border shadow-sm">v{d.version}</span>
                  )}
                </div>
                <p className="mt-1.5 text-xs font-medium text-text-muted">
                  {formatFileType(d)} · {formatBytes(d.fileSizeBytes)}
                </p>
                <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-text-muted/60">{inferredSourceRole(d)}</p>
              </div>

              <div className="mt-4">
                <PipelineTracker 
                   lifecycle={lifecycle} 
                   className="scale-90 origin-left"
                   onRetry={(stage) => handleAction(stage as any)}
                />
              </div>
              {friendlyError && <p className="mt-2 text-xs font-medium text-semantic-error">{friendlyError}</p>}
              <div className="mt-auto pt-5 border-t border-surface-border/50 flex items-center justify-between">
                <p className="text-[10px] font-bold text-text-muted uppercase tracking-tighter">
                  {d.uploadedBy.name || d.uploadedBy.email.split('@')[0]}
                </p>
                <p className="text-[10px] font-medium text-text-muted/50 italic">
                  {rel ? `Synced ${rel}` : "Pending"}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      {selectedDoc && selectedLifecycle && (
        <DocumentLifecycleDrawer 
          isOpen={true} 
          onClose={() => {
            setSelectedDocId(null);
            onRefresh?.();
          }} 
          document={selectedDoc}
          lifecycle={selectedLifecycle}
          workspaceId={workspaceId}
        />
      )}
    </>
  );
}
