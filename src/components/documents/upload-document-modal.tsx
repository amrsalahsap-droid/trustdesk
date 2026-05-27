"use client";

import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { UploadZone } from "@/components/ui/upload-zone";
import { StatusBadge } from "@/components/ui/status-badge";
import { 
  CloseIcon, 
  FileIcon, 
  ShieldCheckIcon, 
  FolderIcon, 
  CloudIcon, 
  ActivityIcon,
  FileTextIcon,
  WarningIcon,
  CheckIcon,
  PlusIcon
} from "@/components/icons";
import {
  SOURCE_DOCUMENT_FRIENDLY_TYPES,
  SOURCE_DOCUMENT_MAX_SIZE_LABEL,
  validateSourceDocumentFileClient,
} from "@/lib/storage/validate-upload";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";

interface UploadDocumentModalProps {
  workspaceId: string;
  onClose: () => void;
  onUploadCompleteFinished: () => void;
}

type QueueStatus = "queued" | "uploading" | "uploaded" | "error";

interface QueueItem {
  id: string;
  file: File;
  status: QueueStatus;
  message?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

export function UploadDocumentModal({ workspaceId, onClose, onUploadCompleteFinished }: UploadDocumentModalProps) {
  const { toast } = useToast();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [validationMessages, setValidationMessages] = useState<string[]>([]);
  const [batchBusy, setBatchBusy] = useState(false);
  const [showSuccessHandoff, setShowSuccessHandoff] = useState(false);
  const chainRef = useRef(Promise.resolve());

  const processBatch = useCallback(
    async (batch: QueueItem[]) => {
      if (batch.length === 0) return;
      setBatchBusy(true);
      let anySuccess = false;
      try {
        for (const entry of batch) {
          const id = entry.id;
          setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status: "uploading", message: undefined } : i)));

          const formData = new FormData();
          formData.append("file", entry.file);

          try {
            const res = await fetch("/api/documents", {
              method: "POST",
              headers: { "x-workspace-id": workspaceId },
              body: formData,
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
              const msg =
                typeof data?.error?.message === "string" ? data.error.message : `Upload failed (${res.status})`;
              throw new Error(msg);
            }
            setItems((prev) =>
              prev.map((i) =>
                i.id === id
                  ? {
                      ...i,
                      status: "uploaded",
                      message: data.document?.isReused ? "Updated existing document" : undefined,
                    }
                  : i,
              ),
            );
            anySuccess = true;
          } catch (err) {
            const message = err instanceof Error ? err.message : "Upload failed";
            setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status: "error", message } : i)));
          }
        }
      } finally {
        setBatchBusy(false);
        if (anySuccess) {
          onUploadCompleteFinished();
          
          const currentItems = await new Promise<QueueItem[]>((resolve) => {
            setItems((prev) => {
              resolve(prev);
              return prev;
            });
          });

          const allUploaded = currentItems.every((i) => i.status === "uploaded");
          if (allUploaded && currentItems.length > 0) {
            setShowSuccessHandoff(true);
            toast({
              severity: "success",
              title: "Upload Successful",
              message: "All selected documents have been processed."
            });
          }
        }
      }
    },
    [workspaceId, onUploadCompleteFinished, toast],
  );

  const enqueueBatch = useCallback(
    (batch: QueueItem[]) => {
      if (batch.length === 0) return;
      chainRef.current = chainRef.current
        .then(() => processBatch(batch))
        .catch(() => { /* keep chain alive */ });
    },
    [processBatch],
  );

  function handleIncomingFiles(fileList: File[]) {
    if (batchBusy) return;
    setValidationMessages([]);
    const errors: string[] = [];
    const toAdd: QueueItem[] = [];

    for (const file of fileList) {
      const r = validateSourceDocumentFileClient(file);
      if (!r.ok) errors.push(`${file.name}: ${r.message}`);
      else toAdd.push({ id: crypto.randomUUID(), file, status: "queued" });
    }

    if (errors.length) setValidationMessages(errors);
    if (toAdd.length === 0) return;

    setItems((prev) => [...prev, ...toAdd]);
  }

  function handleFinalUpload() {
    const queuedItems = items.filter(i => i.status === "queued" || i.status === "error");
    if (queuedItems.length === 0) return;
    enqueueBatch(queuedItems);
  }

  function removeItem(id: string) {
    setItems((prev) => {
      const target = prev.find((i) => i.id === id);
      if (!target || target.status === "uploading") return prev;
      return prev.filter((i) => i.id !== id);
    });
  }

  function retryItem(item: QueueItem) {
    if (item.status !== "error") return;
    const next: QueueItem = { ...item, status: "queued", message: undefined };
    setItems((prev) => prev.map((i) => (i.id === item.id ? next : i)));
  }

  const uploadedCount = items.filter((i) => i.status === "uploaded").length;
  const failedCount = items.filter((i) => i.status === "error").length;
  const canUpload = items.some(i => i.status === "queued" || i.status === "error") && !batchBusy;

  function getFileIcon(mime: string) {
    if (mime.includes("pdf")) return <FileIcon className="h-5 w-5 text-semantic-error" />;
    if (mime.includes("word") || mime.includes("officedocument")) return <FileTextIcon className="h-5 w-5 text-accent-primary" />;
    return <FileIcon className="h-5 w-5 text-text-muted" />;
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-overlay-backdrop backdrop-blur-sm"
        aria-hidden
        onClick={() => { if (!batchBusy) onClose(); }}
      />

      <div
        className="relative flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-surface-border bg-surface-panel shadow-2xl animate-in fade-in zoom-in-95 duration-300"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between border-b border-surface-border px-8 py-6">
          <div className="space-y-1">
            <h2 className="text-xl font-bold tracking-tight text-text-primary">
              Upload source documents
            </h2>
            <p className="text-sm text-text-muted leading-relaxed max-w-[90%]">
              Upload policies, architecture docs, prior questionnaires, and security materials to build your workspace knowledge base.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={batchBusy}
            className="rounded-full p-2 text-text-muted transition-all hover:bg-surface-hover hover:text-text-primary disabled:opacity-40"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-6">
          {/* Compact Info Items */}
          {!showSuccessHandoff && items.length === 0 && (
            <div className="grid grid-cols-2 gap-4 mb-8">
              <div className="flex items-center gap-3 rounded-xl border border-surface-border bg-surface-base/30 p-4 transition-colors hover:bg-surface-base/50">
                <FolderIcon className="h-5 w-5 text-accent-primary" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-text-primary">Supported</p>
                  <p className="text-[10px] text-text-muted uppercase">PDF, DOCX, TXT</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-surface-border bg-surface-base/30 p-4 transition-colors hover:bg-surface-base/50">
                <ActivityIcon className="h-5 w-5 text-semantic-ok" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-text-primary">Max Size</p>
                  <p className="text-[10px] text-text-muted uppercase">25 MiB Each</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-surface-border bg-surface-base/30 p-4 transition-colors hover:bg-surface-base/50">
                <PlusIcon className="h-5 w-5 text-accent-secondary" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-text-primary">Batch</p>
                  <p className="text-[10px] text-text-muted uppercase">Multi-file support</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-surface-border bg-surface-base/30 p-4 transition-colors hover:bg-surface-base/50">
                <ShieldCheckIcon className="h-5 w-5 text-semantic-warning" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-text-primary">Privacy</p>
                  <p className="text-[10px] text-text-muted uppercase">Workspace only</p>
                </div>
              </div>
            </div>
          )}

          {/* Success Handoff */}
          {showSuccessHandoff ? (
            <div className="flex flex-col items-center justify-center py-10 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-semantic-ok-bg text-semantic-ok shadow-inner mb-6">
                <CheckIcon className="h-10 w-10" />
              </div>
              <h3 className="text-lg font-bold text-text-primary mb-2">Upload Complete</h3>
              <p className="text-sm text-text-muted max-w-sm mb-8">
                {items.length} {items.length === 1 ? "document has" : "documents have"} been uploaded securely. 
                They are now queued for parsing and will appear in your library shortly.
              </p>
              <div className="w-full space-y-3">
                <Button variant="primary" className="w-full" onClick={onClose}>
                  Go to documents library
                </Button>
                <button 
                  onClick={() => {
                    setItems([]);
                    setShowSuccessHandoff(false);
                  }}
                  className="text-sm font-medium text-accent-primary hover:underline transition-all"
                >
                  Upload more files
                </button>
              </div>
            </div>
          ) : (
            <>
              <UploadZone
                mode="dropzoneOnly"
                onFiles={handleIncomingFiles}
                disabled={batchBusy}
                accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                hint="Click or drag files to get started"
              />

              {validationMessages.length > 0 && (
                <div className="mt-6 rounded-xl border border-semantic-error-border bg-semantic-error-bg/30 p-4 animate-in fade-in duration-300">
                  <div className="flex items-center gap-2 text-semantic-error mb-2">
                    <WarningIcon className="h-4 w-4" />
                    <p className="text-sm font-bold">Validation Errors</p>
                  </div>
                  <ul className="space-y-1 text-xs text-semantic-error/80 list-inside list-disc">
                    {validationMessages.map((m, i) => <li key={i} className="truncate">{m}</li>)}
                  </ul>
                </div>
              )}

              {/* Items List */}
              {items.length > 0 && (
                <div className="mt-8 space-y-4">
                  <div className="flex items-center justify-between border-b border-surface-border pb-2">
                    <p className="text-xs font-bold uppercase tracking-wider text-text-muted">
                      Document Queue ({items.length})
                    </p>
                    {batchBusy && (
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 animate-spin rounded-full border-2 border-accent-primary border-t-transparent" />
                        <span className="text-[10px] font-medium text-accent-primary">Processing batch...</span>
                      </div>
                    )}
                  </div>
                  <ul className="max-h-[300px] space-y-3 overflow-y-auto pr-2 custom-scrollbar">
                    {items.map((item) => (
                      <li key={item.id} className="group relative rounded-xl border border-surface-border bg-surface-base/30 p-4 transition-all hover:bg-surface-base/50">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex min-w-0 flex-1 items-start gap-3">
                            <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-panel border border-surface-border shadow-sm group-hover:scale-110 transition-transform">
                              {getFileIcon(item.file.type)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-text-primary">{item.file.name}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-[10px] font-medium uppercase text-text-muted bg-surface-hover px-1.5 py-0.5 rounded">
                                  {item.file.name.split('.').pop()}
                                </span>
                                <span className="text-xs text-text-muted">{formatBytes(item.file.size)}</span>
                              </div>
                              {item.status === "uploading" && (
                                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-border">
                                  <div className="h-full w-full animate-pipeline-stripes rounded-full bg-accent-primary bg-[length:20px_20px]" />
                                </div>
                              )}
                              {item.message && (
                                <p className={cn(
                                  "mt-2 text-xs font-medium leading-relaxed",
                                  item.status === "error" ? "text-semantic-error" : "text-accent-primary"
                                )}>
                                  {item.message}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-2">
                            {item.status === "queued" && <StatusBadge variant="neutral" label="Queued" />}
                            {item.status === "uploading" && <StatusBadge variant="processing" label="Uploading" />}
                            {item.status === "uploaded" && <StatusBadge variant="ok" label="Done" />}
                            {item.status === "error" && <StatusBadge variant="error" label="Failed" />}
                            
                            {!batchBusy && item.status !== "uploaded" && (
                              <button
                                onClick={() => removeItem(item.id)}
                                className="rounded p-1 text-text-muted hover:bg-semantic-error-bg hover:text-semantic-error transition-colors"
                              >
                                <CloseIcon className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!showSuccessHandoff && (
          <div className="flex flex-col gap-4 border-t border-surface-border bg-surface-base/30 px-8 py-6">
            <div className="flex items-start gap-3">
              <CloudIcon className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" />
              <p className="text-xs text-text-muted leading-relaxed">
                Files are uploaded securely, queued for parsing, and added to your document library for review. Content is private to this workspace.
              </p>
            </div>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={batchBusy}
                className="px-6 py-2.5 text-sm font-semibold text-text-secondary transition-all hover:text-text-primary disabled:opacity-40"
              >
                Cancel
              </button>
              <Button
                variant="primary"
                onClick={handleFinalUpload}
                disabled={!canUpload}
                isLoading={batchBusy}
                className="px-8"
              >
                Upload documents
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
