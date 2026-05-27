"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalResults: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  className?: string;
}

export function Pagination({
  currentPage,
  totalPages,
  totalResults,
  pageSize,
  onPageChange,
  onPageSizeChange,
  className,
}: PaginationProps) {
  if (totalResults === 0) return null;

  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalResults);

  return (
    <div className={cn("flex flex-col sm:flex-row items-center justify-between gap-4 px-6 py-4 border-t border-surface-border bg-white", className)}>
      <div className="flex items-center gap-4 text-xs font-medium text-text-muted">
        <span className="whitespace-nowrap">
          Showing <span className="text-text-main font-bold">{start}–{end}</span> of <span className="text-text-main font-bold">{totalResults}</span> documents
        </span>
        
        <div className="flex items-center gap-2 border-l border-surface-border pl-4">
          <span className="hidden sm:inline">Per page:</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="bg-transparent font-bold text-text-main focus:outline-none cursor-pointer hover:text-accent-primary transition-colors"
          >
            {[10, 20, 25, 50, 100].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-surface-border transition-all hover:bg-surface-soft disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-1 mx-2">
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            // Simple page range logic (can be improved for many pages)
            let pageNum = i + 1;
            if (totalPages > 5 && currentPage > 3) {
                pageNum = currentPage - 3 + i + 1;
                if (pageNum > totalPages) pageNum = totalPages - (4 - i);
            }
            if (pageNum <= 0) return null;
            if (pageNum > totalPages) return null;

            return (
              <button
                key={pageNum}
                onClick={() => onPageChange(pageNum)}
                className={cn(
                  "h-8 min-w-[32px] px-2 rounded-md text-xs font-bold transition-all",
                  currentPage === pageNum
                    ? "bg-accent-primary text-white shadow-md shadow-accent-primary/20"
                    : "text-text-muted hover:bg-surface-soft hover:text-text-main"
                )}
              >
                {pageNum}
              </button>
            );
          })}
          
          {totalPages > 5 && currentPage < totalPages - 2 && (
            <>
                <span className="text-text-muted px-1 text-[10px]">...</span>
                <button
                    onClick={() => onPageChange(totalPages)}
                    className={cn(
                    "h-8 min-w-[32px] px-2 rounded-md text-xs font-bold transition-all text-text-muted hover:bg-surface-soft hover:text-text-main"
                    )}
                >
                    {totalPages}
                </button>
            </>
          )}
        </div>

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-surface-border transition-all hover:bg-surface-soft disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronRightIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
