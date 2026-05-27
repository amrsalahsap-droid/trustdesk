"use client";

import { cn } from "@/lib/utils";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  noPadding?: boolean;
  interactive?: boolean;
}

export function Card({ children, className, noPadding, interactive, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-surface-border bg-white shadow-sm transition-all duration-200",
        interactive && "cursor-pointer hover:border-accent-primary/30 hover:shadow-md hover:translate-y-[-1px]",
        !noPadding && "p-6",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, description, actions, className }: { 
  title: React.ReactNode; 
  description?: React.ReactNode; 
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4 pb-6", className)}>
      <div className="space-y-1">
        <h3 className="text-lg font-bold leading-none tracking-tight text-text-primary">
          {title}
        </h3>
        {description && (
          <div className="text-sm text-text-muted">
            {description}
          </div>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}

export function CardContent({ children, className, noPadding }: {
  children: React.ReactNode;
  className?: string;
  noPadding?: boolean;
}) {
  return (
    <div className={cn(!noPadding && "pt-0", className)}>
      {children}
    </div>
  );
}

export function CardFooter({ children, className }: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center pt-6 border-t border-surface-border mt-6", className)}>
      {children}
    </div>
  );
}
