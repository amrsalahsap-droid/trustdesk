import React from "react";
import Link from "next/link";
import { ArrowRightIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick?: () => void;
    href?: string;
    variant?: "primary" | "secondary" | "outline";
  };
  secondaryActions?: Array<{
    label: string;
    onClick?: () => void;
    href?: string;
  }>;
  isLoading?: boolean;
  variant?: "default" | "guided" | "minimal";
}

export function EmptyState({ 
  icon, 
  title, 
  description, 
  action, 
  secondaryActions = [],
  isLoading,
  variant = "default"
}: EmptyStateProps) {
  // Visual hierarchy: Container styles based on variant
  const getContainerClass = () => {
    switch (variant) {
      case "guided":
        return "flex flex-col items-center justify-center py-12 px-6 text-center rounded-2xl border border-accent-primary/10 bg-white shadow-sm ring-1 ring-accent-primary/5";
      case "minimal":
        return "flex flex-col items-center justify-center py-8 px-4 text-center";
      default:
        return "flex flex-col items-center justify-center py-16 px-6 text-center rounded-2xl border border-surface-border bg-white shadow-sm";
    }
  };

  // Visual hierarchy: Icon container
  const getIconContainerClass = () => {
    switch (variant) {
      case "guided":
        return "flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-primary/[0.04] text-accent-primary mb-5 ring-1 ring-accent-primary/10 transition-transform duration-300 group-hover:scale-110";
      case "minimal":
        return "flex h-12 w-12 items-center justify-center rounded-xl border border-surface-border bg-surface-base mb-4";
      default:
        return "flex h-16 w-16 items-center justify-center rounded-2xl border border-surface-border bg-surface-base mb-6";
    }
  };

  return (
    <div className={cn("group", getContainerClass())}>
      <div className={getIconContainerClass()}>
        {icon}
      </div>
      
      <div className="max-w-md">
        <h3 className="text-xl font-bold text-text-primary tracking-tight">{title}</h3>
        <p className="mt-2 text-sm text-text-muted leading-relaxed">{description}</p>
      </div>

      {(action || secondaryActions.length > 0) && (
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {action && (
            action.href ? (
              <Button asChild variant={action.variant === "secondary" ? "secondary" : "primary"}>
                <Link href={action.href}>
                  {action.label}
                  <ArrowRightIcon className="h-4 w-4" />
                </Link>
              </Button>
            ) : (
              <Button 
                variant={action.variant === "secondary" ? "secondary" : "primary"}
                onClick={action.onClick}
                isLoading={isLoading}
              >
                {action.label}
                <ArrowRightIcon className="h-4 w-4" />
              </Button>
            )
          )}

          {secondaryActions.map((secAction, idx) => (
            secAction.href ? (
              <Button key={idx} variant="outline" asChild>
                <Link href={secAction.href}>{secAction.label}</Link>
              </Button>
            ) : (
              <Button key={idx} variant="outline" onClick={secAction.onClick}>
                {secAction.label}
              </Button>
            )
          ))}
        </div>
      )}
    </div>
  );
}
