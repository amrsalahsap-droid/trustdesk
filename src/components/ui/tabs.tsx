"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface TabsProps {
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}

const TabsContext = React.createContext<{
  value?: string;
  onValueChange?: (value: string) => void;
}>({});

export function Tabs({ defaultValue, value, onValueChange, children, className }: TabsProps) {
  const [internalValue, setInternalValue] = React.useState(defaultValue);
  const activeValue = value ?? internalValue;
  const handleValueChange = onValueChange ?? setInternalValue;

  return (
    <TabsContext.Provider value={{ value: activeValue, onValueChange: handleValueChange }}>
      <div className={cn("w-full", className)}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center border-b border-surface-border", className)}>
      {children}
    </div>
  );
}

export function TabsTrigger({ value, label, icon: Icon, className }: { value: string; label: string; icon?: any; className?: string }) {
  const { value: activeValue, onValueChange } = React.useContext(TabsContext);
  const isActive = activeValue === value;

  return (
    <button
      type="button"
      onClick={() => onValueChange?.(value)}
      className={cn(
        "relative flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all focus-ring",
        isActive
          ? "text-accent-primary"
          : "text-text-muted hover:text-text-primary hover:bg-surface-hover",
        className
      )}
    >
      {Icon && <Icon className="h-4 w-4" />}
      {label}
      {isActive && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-primary animate-in fade-in slide-in-from-bottom-1 duration-300" />
      )}
    </button>
  );
}

export function TabsContent({ value, children, className }: { value: string; children: React.ReactNode; className?: string }) {
  const { value: activeValue } = React.useContext(TabsContext);
  if (activeValue !== value) return null;

  return (
    <div className={cn("py-6 animate-in fade-in slide-in-from-top-1 duration-500", className)}>
      {children}
    </div>
  );
}
