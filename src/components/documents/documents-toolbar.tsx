"use client";

import { PlusIcon, SearchIcon, FilterIcon, RefreshIcon, TrashIcon, CloseIcon, ChevronRightIcon, WarningIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { PermissionGuard } from "@/components/auth/permission-guard";
import { Permission } from "@/lib/auth/permissions";

export type DocumentsViewMode = "table" | "list" | "cards";

interface DocumentsToolbarProps {
  viewMode: DocumentsViewMode;
  onViewModeChange: (mode: DocumentsViewMode) => void;
  onUpload: () => void;
  // Search & Filter
  searchQuery: string;
  onSearchChange: (q: string) => void;
  statusFilter: string;
  onStatusFilterChange: (s: string) => void;
  // Selection & Bulk
  selectedCount: number;
  onClearSelection: () => void;
  onBulkAction: (action: "retry-parse" | "retry-seeding" | "delete") => void;
}

const btnActive = "border-accent-primary/40 bg-accent-primary/10 text-accent-primary shadow-sm ring-1 ring-accent-primary/20";

export function DocumentsToolbar({
  viewMode,
  onViewModeChange,
  onUpload,
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  selectedCount,
  onClearSelection,
  onBulkAction,
}: DocumentsToolbarProps) {
  const [isBulkLoading, setIsBulkLoading] = useState<string | null>(null);
  const [isBulkDeleteConfirmOpen, setIsBulkDeleteConfirmOpen] = useState(false);

  const handleBulkAction = async (action: "retry-parse" | "retry-seeding" | "delete") => {
    if (action === "delete" && !isBulkDeleteConfirmOpen) {
      setIsBulkDeleteConfirmOpen(true);
      return;
    }
    
    setIsBulkLoading(action);
    await onBulkAction(action);
    setIsBulkLoading(null);
    setIsBulkDeleteConfirmOpen(false);
  };

  return (
    <div className="relative border-b border-surface-border bg-surface-panel/50 backdrop-blur-md">
      {/* Primary Toolbar */}
      <div className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex flex-1 items-center gap-3">
          {/* Search */}
          <div className="relative w-full max-w-xs transition-all focus-within:max-w-md">
            <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              placeholder="Search by file name..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="h-10 w-full rounded-xl border border-surface-border bg-surface-base pl-10 pr-4 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-primary/50 focus:outline-none focus:ring-4 focus:ring-accent-primary/5 transition-all"
            />
          </div>

          {/* Filter Link/Select (Tailwind simple version) */}
          <div className="flex items-center rounded-xl border border-surface-border bg-surface-base p-1">
            {(["all", "ready", "processing", "failed"] as const).map((f) => (
              <button
                key={f}
                onClick={() => onStatusFilterChange(f)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-all",
                  statusFilter === f 
                    ? "bg-accent-primary text-white shadow-md shadow-accent-primary/20" 
                    : "text-text-muted hover:bg-surface-hover hover:text-text-primary"
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* View Toggle */}
          <div className="flex items-center rounded-xl border border-surface-border bg-surface-base p-1">
            {(["table", "list", "cards"] as const).map((m) => (
              <button
                key={m}
                onClick={() => onViewModeChange(m)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-all",
                  viewMode === m ? "bg-accent-primary/10 text-accent-primary" : "text-text-muted hover:text-text-secondary"
                )}
              >
                {m}
              </button>
            ))}
          </div>

          <PermissionGuard permission={Permission.UPLOAD_EVIDENCE}>
            <button
              onClick={onUpload}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-accent-primary px-4 py-2 text-sm font-bold text-white shadow-lg shadow-accent-primary/25 transition-all hover:scale-[1.02] hover:bg-accent-primary-hover active:scale-[0.98]"
            >
              <PlusIcon className="h-4 w-4" />
              <span>Upload</span>
            </button>
          </PermissionGuard>
        </div>
      </div>

      {/* Stats Summary Sub-bar Removed in favor of Grid Header */}

      {/* Bulk Action Bar (Animated Slide-in Overlay) */}
      <PermissionGuard permission={Permission.MANAGE_DOCUMENTS}>
        <div className={cn(
          "absolute inset-0 z-10 flex items-center justify-between bg-accent-primary px-5 transition-all duration-300 ease-in-out",
          selectedCount > 0 ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-2 opacity-0"
        )}>
          <div className="flex items-center gap-4 text-white">
            <button 
              onClick={onClearSelection}
              className="rounded-full bg-white/20 p-1.5 hover:bg-white/30 transition-colors"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
            <span className="text-sm font-bold">
              {selectedCount} item{selectedCount === 1 ? "" : "s"} selected
            </span>
          </div>

          <div className="flex items-center gap-2">
            <BulkActionBtn 
               icon={RefreshIcon} 
               label="Retry Parse" 
               onClick={() => handleBulkAction("retry-parse")}
               isLoading={isBulkLoading === "retry-parse"}
            />
            <BulkActionBtn 
               icon={RefreshIcon} 
               label="Retry Seeding" 
               onClick={() => handleBulkAction("retry-seeding")}
               isLoading={isBulkLoading === "retry-seeding"}
            />
            <div className="mx-2 h-6 w-px bg-white/20" />
            <BulkActionBtn 
               icon={TrashIcon} 
               label="Delete All" 
               variant="danger" 
               onClick={() => handleBulkAction("delete")}
               isLoading={isBulkLoading === "delete"}
            />
          </div>
        </div>
      </PermissionGuard>

      <Modal 
        isOpen={isBulkDeleteConfirmOpen} 
        onClose={() => setIsBulkDeleteConfirmOpen(false)} 
        title="Confirm Bulk Deletion"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg border border-semantic-error-border bg-semantic-error-bg p-3 text-semantic-error">
            <WarningIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="text-xs font-medium leading-relaxed">
              Are you sure you want to delete <span className="font-bold underline">{selectedCount} items</span>? 
              This action cannot be undone and will remove all selected documents from your workspace knowledge base.
            </div>
          </div>
          
          <div className="flex justify-end gap-2">
            <Button 
              variant="neutral" 
              onClick={() => setIsBulkDeleteConfirmOpen(false)}
              disabled={!!isBulkLoading}
            >
              Cancel
            </Button>
            <Button 
              variant="primary" 
              className="bg-semantic-error text-white hover:bg-semantic-error/90"
              onClick={() => handleBulkAction("delete")}
              isLoading={isBulkLoading === "delete"}
            >
              Confirm Bulk Delete
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function BulkActionBtn({ 
    icon: Icon, 
    label, 
    onClick, 
    variant = "default",
    isLoading 
}: { 
    icon: any; 
    label: string; 
    onClick: () => void;
    variant?: "default" | "danger";
    isLoading?: boolean;
}) {
    return (
        <button
          onClick={onClick}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-bold transition-all hover:scale-105 active:scale-95",
            variant === "danger" 
                ? "bg-white text-semantic-error hover:bg-semantic-error-bg" 
                : "bg-white/20 text-white hover:bg-white/30"
          )}
        >
          <Icon className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
          {label}
        </button>
    );
}
