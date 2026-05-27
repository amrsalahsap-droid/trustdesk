"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { UploadDocumentModal } from "@/components/documents/upload-document-modal";
import { DocumentsToolbar, type DocumentsViewMode } from "@/components/documents/documents-toolbar";
import { DocumentsActivityBar } from "@/components/documents/documents-activity-bar";
import { DocumentsCardsView, DocumentsListView, DocumentsTableView } from "@/components/documents/documents-views";
import { Pagination } from "@/components/ui/pagination";
import { PlusIcon, UploadIcon, SearchIcon } from "@/components/icons";
import { 
  getDocumentLifecycle, 
  isDocumentInFlight, 
  calculateReadiness,
  type SourceDocumentRow 
} from "@/lib/documents/document-display";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { EmptyState } from "@/components/ui/empty-state";
import { DocumentsMetricGrid } from "@/components/documents/documents-metric-grid";
import { DocumentCoverageBanner } from "@/components/documents/document-coverage-banner";

const VIEW_STORAGE_KEY = "documents-view-mode-v2";

export default function DocumentsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [documents, setDocuments] = useState<SourceDocumentRow[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<DocumentsViewMode>("table");
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);
  const [wasProcessing, setWasProcessing] = useState(false);

  // Pagination & Filtering State
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [metrics, setMetrics] = useState({
    total: 0,
    ready: 0,
    processing: 0,
    failed: 0,
    readinessScore: 0,
    evidenceCount: 0,
  });

  // D10-EN-08: Automatic modal activation for deep-linked uploads
  useEffect(() => {
    if (searchParams.get("upload") === "true") {
      setIsModalOpen(true);
      // Clean up the URL so it doesn't re-open on refresh
      const newParams = new URLSearchParams(searchParams.toString());
      newParams.delete("upload");
      newParams.delete("topicId");
      const cleanUrl = `/app/documents${newParams.toString() ? `?${newParams.toString()}` : ""}`;
      window.history.replaceState(null, "", cleanUrl);
    }
  }, [searchParams]);

  useEffect(() => {
    try {
      const v = localStorage.getItem(VIEW_STORAGE_KEY);
      if (v === "list" || v === "cards" || v === "table") setViewMode(v);
    } catch { /* ignore */ }
  }, []);

  const setViewModePersisted = useCallback((m: DocumentsViewMode) => {
    setViewMode(m);
    try { localStorage.setItem(VIEW_STORAGE_KEY, m); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    async function fetchContext() {
      try {
        const res = await fetch("/api/auth/context", { credentials: "include" });
        const data = await res.json();
        if (data.workspaceId) setWorkspaceId(data.workspaceId);
      } catch (err) { console.error("Failed to fetch context", err); }
    }
    void fetchContext();
  }, []);

  const fetchDocuments = useCallback(
    async (silent = false, updateTimestamp = true) => {
      if (!workspaceId) return;
      if (silent) {
        if (updateTimestamp) setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      try {
        const params = new URLSearchParams({
          page: page.toString(),
          pageSize: pageSize.toString(),
          status: statusFilter,
        });
        if (searchQuery) params.append("search", searchQuery);

        const res = await fetch(`/api/documents?${params.toString()}`, {
          credentials: "include",
          headers: { "x-workspace-id": workspaceId },
        });
        const data = await res.json();
        
        if (data.documents) {
          setDocuments(data.documents as SourceDocumentRow[]);
          if (data.pagination) {
            setTotalCount(data.pagination.totalCount);
            setTotalPages(data.pagination.totalPages);
            // Sync current page if server returns a different one (e.g. if current is invalid)
            if (data.pagination.page !== page) setPage(data.pagination.page);
          }
          if (data.metrics) {
            setMetrics(data.metrics);
          }
        }
        
        if (updateTimestamp) setLastFetchedAt(new Date());
      } catch (err) {
        console.error("Failed to fetch documents", err);
      } finally {
        if (silent) {
          if (updateTimestamp) setIsRefreshing(false);
        } else {
          setIsLoading(false);
        }
      }
    },
    [workspaceId, page, pageSize, searchQuery, statusFilter],
  );

  useEffect(() => {
    if (workspaceId) {
        setPage(1); // Reset page when workspace context changes
        void fetchDocuments(false);
    }
  }, [workspaceId]); // Removed fetchDocuments from deps to only trigger on ID change

  useEffect(() => {
    const isProcessing = documents.some(isDocumentInFlight);

    if (wasProcessing && !isProcessing && documents.length > 0) {
      const readyDocs = documents.some((d) => calculateReadiness(d) >= 1.0);
      if (readyDocs) {
        toast({
          severity: "success",
          title: "Pipeline Synchronized",
          message: "New evidence has been indexed into your Knowledge Base.",
          persistent: true,
        });
      }
    }

    if (isProcessing !== wasProcessing) setWasProcessing(isProcessing);
    if (!isProcessing) return;

    const timer = setInterval(() => { void fetchDocuments(true, false); }, 3000);
    return () => clearInterval(timer);
  }, [documents, wasProcessing, fetchDocuments, toast]);

  const handleSearchChange = (q: string) => {
    setSearchQuery(q);
    setPage(1);
  };

  const handleStatusFilterChange = (s: string) => {
    setStatusFilter(s);
    setPage(1);
  };

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Documents are now filtered on the server
  const activeDocuments = documents;

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    if (selectedIds.size === activeDocuments.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(activeDocuments.map(d => d.id)));
  }, [selectedIds.size, activeDocuments]);

  // Aggregate metrics are now provided by the server
  const aggregateReadiness = metrics.readinessScore;

  return (
    <div className="space-y-8 animate-page-fade pb-12">
      <PageHeader
        title="Document Pipeline"
        description="Professional control center for multi-stage evidence processing and verification."
        variant="emphasized"
        actions={
          <div className="flex items-center gap-3">
            <Button variant="outline" asChild>
              <Link href="/app/library?discovery=true">Start Discovery</Link>
            </Button>
            <Button onClick={() => setIsModalOpen(true)} leftIcon={<PlusIcon className="h-4 w-4" />}>
              Upload Evidence
            </Button>
          </div>
        }
      />

      <DocumentsMetricGrid 
        isLoading={isLoading && documents.length === 0}
        metrics={{ ...metrics, readinessScore: aggregateReadiness }} 
      />

      <DocumentCoverageBanner />

      <Card noPadding className="overflow-hidden border-surface-border bg-white shadow-xl shadow-surface-border/10">
        <CardContent noPadding>
          {isLoading && documents.length === 0 ? (
            <div className="p-8 space-y-6">
              <div className="flex items-center justify-between border-b border-surface-border pb-4">
                <div className="flex gap-2">
                  <Skeleton className="h-9 w-24 rounded-lg" />
                  <Skeleton className="h-9 w-24 rounded-lg" />
                </div>
                <Skeleton className="h-9 w-64 rounded-lg" />
              </div>
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center gap-4 py-3 border-b border-surface-border/50 last:border-0">
                    <Skeleton className="h-5 w-5 rounded" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-[40%] rounded" />
                      <Skeleton className="h-3 w-[20%] rounded" />
                    </div>
                    <Skeleton className="h-8 w-24 rounded-full" />
                    <Skeleton className="h-8 w-24 rounded-full" />
                    <Skeleton className="h-8 w-8 rounded-lg" />
                  </div>
                ))}
              </div>
            </div>
          ) : documents.length === 0 ? (
            <div className="py-12">
              <EmptyState
                icon={<UploadIcon className="h-12 w-12" />}
                title="Build your evidence base"
                description="Upload policies, certifications, and security documents so TrustDesk can support answer recommendations with real evidence."
                action={{ label: "Upload Evidence", onClick: () => setIsModalOpen(true) }}
                variant="guided"
              />
              <p className="text-center text-xs text-text-muted mt-4 italic max-w-md mx-auto">
                A rich evidence base improves recommendation accuracy and provides grounded citations for your questionnaire responses.
              </p>
            </div>
          ) : (
            <div className="flex flex-col">
              <DocumentsToolbar
                viewMode={viewMode}
                onViewModeChange={setViewModePersisted}
                onUpload={() => setIsModalOpen(true)}
                searchQuery={searchQuery}
                onSearchChange={handleSearchChange}
                statusFilter={statusFilter}
                onStatusFilterChange={handleStatusFilterChange}
                selectedCount={selectedIds.size}
                onClearSelection={() => setSelectedIds(new Set())}
                onBulkAction={async (action) => {
                  try {
                    const res = await fetch("/api/documents/bulk", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ ids: Array.from(selectedIds), action }),
                    });
                    if (!res.ok) throw new Error("Bulk action failed");
                    toast({ severity: "success", title: "Action Authorized", message: `Executing ${action} for selected items.` });
                    setSelectedIds(new Set());
                    void fetchDocuments(true);
                  } catch (err) { toast({ severity: "error", title: "Authorization Denied", message: String(err) }); }
                }}
              />
              <DocumentsActivityBar
                documents={activeDocuments}
                lastFetchedAt={lastFetchedAt}
                isRefreshing={isRefreshing}
                onRefresh={() => void fetchDocuments(true)}
              />
              <div className="flex flex-col min-h-[500px]">
                <div className="flex-grow">
                  {viewMode === "table" && (
                    <DocumentsTableView 
                      data={activeDocuments} 
                      workspaceId={workspaceId ?? undefined}
                      onRefresh={() => void fetchDocuments(true)}
                      selectedIds={selectedIds}
                      onToggleAllSelection={selectAll}
                      onToggleSelection={toggleSelection}
                    />
                  )}
                  {viewMode === "list" && (
                    <DocumentsListView 
                      data={activeDocuments} 
                      workspaceId={workspaceId ?? undefined}
                      onRefresh={() => void fetchDocuments(true)} 
                      selectedIds={selectedIds}
                      onToggleSelection={toggleSelection}
                    />
                  )}
                  {viewMode === "cards" && (
                    <DocumentsCardsView 
                      data={activeDocuments} 
                      workspaceId={workspaceId ?? undefined}
                      onRefresh={() => void fetchDocuments(true)} 
                      selectedIds={selectedIds}
                      onToggleSelection={toggleSelection}
                    />
                  )}
                  {activeDocuments.length === 0 && (
                    <div className="py-24">
                      <EmptyState 
                          icon={<SearchIcon className="h-10 w-10 text-text-muted/10" />}
                          title="No results found"
                          description="Try adjusting your filter parameters or search query."
                          action={{ label: "Clear visibility filters", onClick: () => { handleSearchChange(""); handleStatusFilterChange("all"); } }}
                      />
                    </div>
                  )}
                </div>
                
                {totalCount > 0 && (
                  <Pagination 
                    currentPage={page}
                    totalPages={totalPages}
                    totalResults={totalCount}
                    pageSize={pageSize}
                    onPageChange={setPage}
                    onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
                  />
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {isModalOpen && workspaceId && (
        <UploadDocumentModal
          workspaceId={workspaceId}
          onClose={() => setIsModalOpen(false)}
          onUploadCompleteFinished={() => void fetchDocuments(true)}
        />
      )}
    </div>
  );
}
