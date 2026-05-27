"use client";

import { useEffect, useState, useMemo } from "react";
import { format as formatDate, formatDistanceToNow } from "date-fns";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { 
  ClockIcon, 
  FileIcon, 
  CheckIcon, 
  AlertCircleIcon,
  DownloadIcon,
  SearchIcon,
  FilterIcon,
  UserIcon,
  CalendarIcon,
  PackageIcon,
  ShieldIcon,
  ExclamationTriangleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  RefreshIcon
} from "@/components/icons";

interface ExportJob {
  id: string;
  format: string;
  fileName: string | null;
  status: string;
  createdAt: string;
  exportedAt?: string | null;
  rowCount?: number | null;
  exportSafeCoverage?: number | null;
  unresolvedWarnings?: any[] | null;
  questionnaire?: {
    id: string;
    title: string;
    sourceFileName?: string | null;
  } | null;
  exportedBy?: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  fileSize?: number | null;
  errorMessage?: string | null;
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export default function ExportHistoryPage() {
  const [exports, setExports] = useState<ExportJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [format, setFormat] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);

  const fetchExports = async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "25",
      });
      
      if (search) params.append("search", search);
      if (status) params.append("status", status);
      if (format) params.append("format", format);
      if (dateFrom) params.append("dateFrom", dateFrom);
      if (dateTo) params.append("dateTo", dateTo);

      const res = await fetch(`/api/workspaces/exports?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setExports(data.exports);
        setPagination(data.pagination);
      } else {
        throw new Error("Failed to load exports");
      }
    } catch (err) {
      console.error("Failed to load exports", err);
      setError("We encountered an issue retrieving your export history. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExports(currentPage);
  }, [currentPage]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setCurrentPage(1);
      fetchExports(1);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [search, status, format, dateFrom, dateTo]);

  const getStatusIcon = (status: string) => {
    if (status === "completed") return <CheckIcon className="h-4 w-4 text-semantic-ok" />;
    if (status === "failed") return <AlertCircleIcon className="h-4 w-4 text-semantic-error" />;
    if (status === "processing") return <ClockIcon className="h-4 w-4 text-accent-primary animate-pulse" />;
    return <ClockIcon className="h-4 w-4 text-text-muted animate-pulse" />;
  };

  const getStatusColor = (status: string) => {
    if (status === "completed") return "text-semantic-ok";
    if (status === "failed") return "text-semantic-error";
    if (status === "processing") return "text-accent-primary";
    return "text-text-muted";
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "—";
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };

  const getCoverageColor = (coverage: number | null) => {
    if (!coverage) return "text-text-muted";
    if (coverage >= 90) return "text-semantic-ok";
    if (coverage >= 70) return "text-feedback-warning";
    return "text-semantic-error";
  };

  const clearFilters = () => {
    setSearch("");
    setStatus("");
    setFormat("");
    setDateFrom("");
    setDateTo("");
  };

  const hasActiveFilters = search || status || format || dateFrom || dateTo;

  return (
    <div className="max-w-7xl pb-20 space-y-6">
      <PageHeader
        title="Export History"
        description="Track questionnaire/export activity, external-sharing history, and download packages."
        variant="emphasized"
      />

      {/* Search and Filters */}
      <div className="space-y-4">
        {/* Search Bar */}
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search by filename, questionnaire, or user..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-surface-border rounded-lg bg-surface-panel text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent-primary/25 focus:border-accent-primary"
          />
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-hover rounded-md transition-colors"
          >
            <FilterIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <div className="bg-surface-panel border border-surface-border rounded-lg p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full px-3 py-2 border border-surface-border rounded-md bg-surface-base text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/25"
                >
                  <option value="">All Status</option>
                  <option value="completed">Completed</option>
                  <option value="processing">Processing</option>
                  <option value="failed">Failed</option>
                  <option value="pending">Pending</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">Format</label>
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value)}
                  className="w-full px-3 py-2 border border-surface-border rounded-md bg-surface-base text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/25"
                >
                  <option value="">All Formats</option>
                  <option value="xlsx">Excel (.xlsx)</option>
                  <option value="csv">CSV (.csv)</option>
                  <option value="docx">Word (.docx)</option>
                  <option value="pdf">PDF (.pdf)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">Date From</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full px-3 py-2 border border-surface-border rounded-md bg-surface-base text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/25"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">Date To</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full px-3 py-2 border border-surface-border rounded-md bg-surface-base text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/25"
                />
              </div>
            </div>

            {hasActiveFilters && (
              <div className="flex justify-end">
                <button
                  onClick={clearFilters}
                  className="px-4 py-2 text-sm text-accent-primary hover:text-accent-primary-hover transition-colors"
                >
                  Clear Filters
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Results Summary */}
      {pagination && (
        <div className="flex items-center justify-between text-sm text-text-muted">
          <span>
            Showing {exports.length} of {pagination.total} exports
          </span>
          {hasActiveFilters && (
            <span className="text-accent-primary">Filters applied</span>
          )}
        </div>
      )}

      {/* Error State */}
      {error && (
        <Card className="border-rose-200 bg-rose-50/30 p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600 mb-4">
            <AlertCircleIcon className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-bold text-text-primary">Failed to load export history</h3>
          <p className="mt-2 text-sm text-text-muted max-w-md mx-auto">{error}</p>
          <Button variant="outline" className="mt-6" onClick={() => fetchExports(currentPage)}>
            <RefreshIcon className="h-4 w-4 mr-2" />
            Try Again
          </Button>
        </Card>
      )}

      {/* Export Table */}
      {!error && (
        <div className="rounded-2xl border border-surface-border bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-base text-text-muted font-bold uppercase tracking-widest text-[10px] border-b border-surface-border">
                <tr>
                  <th className="px-6 py-4">Export Details</th>
                  <th className="px-6 py-4">Questionnaire</th>
                  <th className="px-6 py-4">Exported By</th>
                  <th className="px-6 py-4">Coverage</th>
                  <th className="px-6 py-4">Warnings</th>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {loading ? (
                  [...Array(8)].map((_, i) => (
                    <tr key={i}>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <Skeleton className="h-8 w-8 rounded-lg" />
                          <div className="space-y-2">
                            <Skeleton className="h-4 w-40 rounded" />
                            <Skeleton className="h-3 w-24 rounded" />
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4"><Skeleton className="h-4 w-32 rounded" /></td>
                      <td className="px-6 py-4"><Skeleton className="h-4 w-24 rounded" /></td>
                      <td className="px-6 py-4"><Skeleton className="h-6 w-12 rounded-full" /></td>
                      <td className="px-6 py-4"><Skeleton className="h-6 w-12 rounded-full" /></td>
                      <td className="px-6 py-4"><Skeleton className="h-4 w-28 rounded" /></td>
                      <td className="px-6 py-4 text-right"><Skeleton className="h-8 w-8 rounded-lg ml-auto" /></td>
                    </tr>
                  ))
                ) : exports.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16">
                    <EmptyState
                      icon={<PackageIcon className="h-12 w-12" />}
                      title="No Trust Packs exported yet"
                      description="Completed exports will appear here with coverage, warnings, and delivery history."
                      action={{ 
                        label: "Start Questionnaire", 
                        onClick: () => window.location.href = "/app/questionnaires/new" 
                      }}
                      variant="guided"
                    />
                    <p className="text-center text-xs text-text-muted mt-4 italic">
                      Exporting Trust Packs allows you to share verified security responses with customers and partners.
                    </p>
                  </td>
                </tr>
              ) : (
                exports.map((job) => (
                  <tr key={job.id} className="hover:bg-surface-hover transition-colors">
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <FileIcon className="h-4 w-4 text-accent-primary" />
                          <span className="font-medium text-text-primary truncate max-w-xs">
                            {job.fileName || "Untitled Export"}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-text-muted">
                          <span className="uppercase font-bold">{job.format}</span>
                          {job.fileSize && <span>{formatFileSize(job.fileSize)}</span>}
                          {job.rowCount && <span>{job.rowCount.toLocaleString()} rows</span>}
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      {job.questionnaire ? (
                        <div className="space-y-1">
                          <div className="font-medium text-text-primary truncate max-w-xs">
                            {job.questionnaire.title}
                          </div>
                          {job.questionnaire.sourceFileName && (
                            <div className="text-xs text-text-muted truncate max-w-xs">
                              {job.questionnaire.sourceFileName}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>

                    <td className="px-6 py-4">
                      {job.exportedBy ? (
                        <div className="flex items-center gap-2">
                          <UserIcon className="h-4 w-4 text-text-muted" />
                          <div>
                            <div className="font-medium text-text-primary">
                              {job.exportedBy.name || job.exportedBy.email}
                            </div>
                            {job.exportedBy.name && (
                              <div className="text-xs text-text-muted">{job.exportedBy.email}</div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="text-text-muted">System</span>
                      )}
                    </td>

                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <ShieldIcon className="h-4 w-4 text-text-muted" />
                        {job.exportSafeCoverage !== null && job.exportSafeCoverage !== undefined ? (
                          <span className={`font-medium ${getCoverageColor(job.exportSafeCoverage)}`}>
                            {job.exportSafeCoverage.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      {job.unresolvedWarnings && job.unresolvedWarnings.length > 0 ? (
                        <div className="flex items-center gap-2">
                          <ExclamationTriangleIcon className="h-4 w-4 text-feedback-warning" />
                          <span className="text-feedback-warning font-medium">
                            {job.unresolvedWarnings.length}
                          </span>
                        </div>
                      ) : job.status === "completed" ? (
                        <CheckIcon className="h-4 w-4 text-semantic-ok" />
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>

                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        {job.exportedAt && (
                          <div className="text-text-primary">
                            {formatDate(new Date(job.exportedAt), "MMM d, yyyy")}
                          </div>
                        )}
                        <div className="text-xs text-text-muted">
                          {job.exportedAt ? (
                            formatDistanceToNow(new Date(job.exportedAt), { addSuffix: true })
                          ) : (
                            formatDistanceToNow(new Date(job.createdAt), { addSuffix: true })
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {job.status === "completed" && (
                          <button
                            className="text-accent-primary hover:text-accent-primary-hover transition-colors p-1.5 rounded-md hover:bg-accent-primary/10"
                            title="Download"
                          >
                            <DownloadIcon className="h-4 w-4" />
                          </button>
                        )}
                        {job.status === "failed" && job.errorMessage && (
                          <button
                            className="text-semantic-error hover:text-semantic-error-hover transition-colors p-1.5 rounded-md hover:bg-semantic-error/10"
                            title="View Error"
                          >
                            <AlertCircleIcon className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="border-t border-surface-border px-6 py-3">
            <div className="flex items-center justify-between">
              <div className="text-sm text-text-muted">
                Page {pagination.page} of {pagination.totalPages}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(pagination.hasPrev ? pagination.page - 1 : 1)}
                  disabled={!pagination.hasPrev}
                  className="p-2 text-text-muted hover:text-text-primary disabled:opacity-50 disabled:cursor-not-allowed rounded-md hover:bg-surface-hover transition-colors"
                >
                  <ChevronLeftIcon className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setCurrentPage(pagination.hasNext ? pagination.page + 1 : pagination.page)}
                  disabled={!pagination.hasNext}
                  className="p-2 text-text-muted hover:text-text-primary disabled:opacity-50 disabled:cursor-not-allowed rounded-md hover:bg-surface-hover transition-colors"
                >
                  <ChevronRightIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )}
    </div>
  );
}
