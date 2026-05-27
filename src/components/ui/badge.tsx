import { ReactNode } from "react";

interface BadgeProps {
  children: ReactNode;
  variant?: "outline" | "default";
  className?: string;
}

export function Badge({ children, variant = "default", className = "" }: BadgeProps) {
  const baseStyles = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2";
  
  const variantStyles = variant === "outline" 
    ? "border border-surface-border text-text-primary"
    : "bg-accent-primary text-white";

  return (
    <div className={`${baseStyles} ${variantStyles} ${className}`}>
      {children}
    </div>
  );
}
