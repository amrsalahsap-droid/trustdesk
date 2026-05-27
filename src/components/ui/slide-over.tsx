"use client";

import { CloseIcon } from "@/components/icons";

interface SlideOverProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  width?: "md" | "lg";
  children: React.ReactNode;
  footer?: React.ReactNode;
}

const WIDTH_MAP = {
  md: "max-w-xl",
  lg: "max-w-2xl",
};

export function SlideOver({
  isOpen,
  onClose,
  title,
  width = "md",
  children,
  footer,
}: SlideOverProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end overflow-hidden">
      <div
        className="absolute inset-0 bg-overlay-backdrop transition-opacity"
        onClick={onClose}
      />

      <div
        className={`relative h-full w-full ${WIDTH_MAP[width]} border-l border-surface-border bg-surface-panel shadow-xl animate-in slide-in-from-right duration-300`}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-surface-border px-6 py-4">
            <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
            <button
              onClick={onClose}
              className="rounded-md p-1.5 text-text-muted hover:bg-surface-hover hover:text-text-primary transition-colors"
            >
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">{children}</div>

          {footer && (
            <div className="border-t border-surface-border px-6 py-4 flex items-center justify-end gap-3">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
