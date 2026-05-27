"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg" | "icon";
  isLoading?: boolean;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", isLoading, loading, leftIcon, rightIcon, children, disabled, asChild, ...props }, ref) => {
    const isActuallyLoading = isLoading || loading;
    const variants = {
      primary: "bg-accent-primary text-white hover:bg-accent-primary-hover shadow-sm",
      secondary: "bg-accent-primary/10 text-accent-primary hover:bg-accent-primary/20",
      outline: "border border-surface-border bg-surface-panel text-text-primary hover:bg-surface-hover shadow-sm",
      ghost: "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
      danger: "bg-semantic-error text-white hover:bg-semantic-error/90 shadow-sm",
    };

    const sizes = {
      sm: "h-8 px-3 text-xs gap-1.5",
      md: "h-9 px-4 text-sm gap-2",
      lg: "h-11 px-6 text-base gap-2.5",
      icon: "h-9 w-9 items-center justify-center",
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isActuallyLoading}
        className={cn(
          "inline-flex items-center justify-center rounded-md font-medium transition-all duration-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 focus-ring hover:translate-y-[-1px] active:translate-y-0",
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      >
        {isActuallyLoading ? (
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : (
          <>
            {leftIcon}
            {children}
            {rightIcon}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = "Button";
