import type { ReactNode } from "react";

interface OperationalListProps<T extends { id: string }> {
  items: T[];
  renderRow: (item: T) => ReactNode;
  emptyMessage?: string;
}

export function OperationalList<T extends { id: string }>({ items, renderRow, emptyMessage = "Nothing to show" }: OperationalListProps<T>) {
  if (items.length === 0) {
    return <p className="px-5 py-6 text-center text-sm text-text-muted">{emptyMessage}</p>;
  }

  return (
    <ul className="divide-y divide-surface-border">
      {items.map((item) => (
        <li key={item.id} className="hover:bg-surface-hover transition-colors">
          {renderRow(item)}
        </li>
      ))}
    </ul>
  );
}
