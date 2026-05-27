"use client";

import { useState } from "react";

export interface Column<T> {
  key: string;
  header: string;
  /** Optional sticky column (e.g. the question column in review). */
  sticky?: boolean;
  /** Custom cell render. Falls back to `String(row[key])`. */
  render?: (row: T) => React.ReactNode;
  /** Tailwind classes for the <th>/<td>. */
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  /** Unique key extractor for each row. */
  rowKey: (row: T) => string;
  /** Row-level class name injection (e.g. conflict left border). */
  rowClassName?: (row: T) => string | undefined;
  /** Click handler per row. */
  onRowClick?: (row: T) => void;
  /** Rendered when data is empty. */
  emptyState?: React.ReactNode;
  /** Enable row selection checkboxes. */
  selectable?: boolean;
  /** Called when selection changes. */
  onSelectionChange?: (selectedKeys: Set<string>) => void;
  /** Omit outer border/background when nested inside a Card. */
  embedded?: boolean;
}

export function DataTable<T>({
  columns,
  data,
  rowKey,
  rowClassName,
  onRowClick,
  emptyState,
  selectable,
  onSelectionChange,
  embedded,
}: DataTableProps<T>) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggleAll() {
    if (selected.size === data.length) {
      setSelected(new Set());
      onSelectionChange?.(new Set());
    } else {
      const all = new Set(data.map(rowKey));
      setSelected(all);
      onSelectionChange?.(all);
    }
  }

  function toggleRow(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      onSelectionChange?.(next);
      return next;
    });
  }

  if (data.length === 0 && emptyState) {
    return (
      <div className={embedded ? "" : "rounded-2xl border border-surface-border bg-white shadow-sm"}>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          {emptyState}
        </div>
      </div>
    );
  }

  const wrapClass = embedded ? "overflow-x-auto" : "overflow-x-auto rounded-2xl border border-surface-border bg-white shadow-sm";

  return (
    <div className={wrapClass}>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-surface-border bg-surface-base">
            {selectable && (
              <th className="w-10 px-3 py-2">
                <input
                  type="checkbox"
                  checked={data.length > 0 && selected.size === data.length}
                  onChange={toggleAll}
                  className="h-3.5 w-3.5 rounded border-surface-border"
                />
              </th>
            )}
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-3 py-2 text-xs font-medium text-text-muted ${col.sticky ? "sticky left-0 z-10 bg-surface-base" : ""} ${col.className ?? ""}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-border">
          {data.map((row) => {
            const key = rowKey(row);
            const extraCls = rowClassName?.(row) ?? "";
            return (
              <tr
                key={key}
                onClick={() => onRowClick?.(row)}
                className={`group transition-colors duration-150 ${onRowClick ? "cursor-pointer hover:bg-surface-base/50" : ""} ${extraCls}`}
              >
                {selectable && (
                  <td className="w-10 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(key)}
                      onChange={() => toggleRow(key)}
                      onClick={(e) => e.stopPropagation()}
                      className="h-3.5 w-3.5 rounded border-surface-border"
                    />
                  </td>
                )}
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-3 py-2 ${col.sticky ? "sticky left-0 z-10 bg-surface-panel" : ""} ${col.className ?? ""}`}
                  >
                    {col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? "")}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
