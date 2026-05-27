"use client";

import { createContext, useContext, useState, useCallback } from "react";
import { 
  CheckIcon, 
  WarningIcon, 
  AlertCircleIcon, 
  CloseIcon,
  SearchIcon 
} from "@/components/icons";
import { cn } from "@/lib/utils";
import type { SignalSeverity } from "./status-signal";

interface Toast {
  id: string;
  severity: SignalSeverity;
  title: string;
  message?: string;
  persistent?: boolean;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastContextType {
  toast: (payload: Omit<Toast, "id">) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback(({ severity, title, message, persistent, action }: Omit<Toast, "id">) => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts((prev) => [...prev, { id, severity, title, message, persistent, action }]);
    
    if (!persistent) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 5000);
    }
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-3 w-80">
        {toasts.map((t) => (
          <ToastItem 
            key={t.id} 
            {...t} 
            onRemove={() => removeToast(t.id)} 
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider");
  return context;
}

function ToastItem({ severity, title, message, action, onRemove }: Toast & { onRemove: () => void }) {
  const Icon = {
    success: CheckIcon,
    warning: WarningIcon,
    error: AlertCircleIcon,
    info: SearchIcon,
    neutral: SearchIcon,
  }[severity];

  const colors = {
    success: "text-semantic-ok",
    warning: "text-semantic-warning",
    error: "text-semantic-error",
    info: "text-accent-primary",
    neutral: "text-text-muted",
  }[severity];

  return (
    <div className="flex items-start gap-4 rounded-xl border border-surface-border bg-surface-panel p-5 shadow-2xl animate-in fade-in slide-in-from-right-4 duration-300 ring-1 ring-black/5">
      <div className={cn("mt-1", colors)}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 space-y-1.5">
        <p className="text-sm font-bold text-text-primary leading-tight">{title}</p>
        {message && <p className="text-[11px] text-text-muted leading-relaxed font-medium">{message}</p>}
        {action && (
          <div className="pt-1">
            <button 
              onClick={() => {
                action.onClick();
                onRemove();
              }}
              className="text-[11px] font-black uppercase tracking-widest text-accent-primary hover:text-accent-primary/80 transition-colors bg-accent-primary/5 px-2.5 py-1.5 rounded-md border border-accent-primary/10"
            >
              {action.label}
            </button>
          </div>
        )}
      </div>
      <button onClick={onRemove} className="text-text-muted hover:text-text-primary transition-colors mt-0.5">
        <CloseIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
