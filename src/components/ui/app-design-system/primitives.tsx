import React from "react";
import { cn } from "@/lib/utils";
import { Button, type ButtonProps } from "@/components/ui/button";
import { HelpCircleIcon } from "@/components/icons";

// --- Typography Primitives ---

interface TypographyProps extends React.HTMLAttributes<HTMLHeadingElement | HTMLParagraphElement> {
  children: React.ReactNode;
}

export const AppHeroTitle = ({ children, className, ...props }: TypographyProps) => (
  <h1 
    className={cn("text-display-sm md:text-display-md !font-black leading-tight tracking-tight text-text-primary", className)} 
    {...props}
  >
    {children}
  </h1>
);

export const AppSectionTitle = ({ children, className, ...props }: TypographyProps) => (
  <h2 
    className={cn("text-section-title !font-black tracking-tight text-text-primary", className)} 
    {...props}
  >
    {children}
  </h2>
);

export const AppSubSection = ({ children, className, ...props }: TypographyProps) => (
  <h3 
    className={cn("text-subsection font-black uppercase tracking-widest text-text-primary", className)} 
    {...props}
  >
    {children}
  </h3>
);

export const AppBody = ({ children, className, ...props }: TypographyProps) => (
  <p 
    className={cn("text-body-md text-text-secondary leading-relaxed font-medium", className)} 
    {...props}
  >
    {children}
  </p>
);

export const AppBodySm = ({ children, className, ...props }: TypographyProps) => (
  <p 
    className={cn("text-body-sm text-text-secondary leading-relaxed", className)} 
    {...props}
  >
    {children}
  </p>
);

export const AppMetadata = ({ children, className, ...props }: TypographyProps) => (
  <span 
    className={cn("text-metadata font-black uppercase tracking-[0.2em] text-text-muted", className)} 
    {...props}
  >
    {children}
  </span>
);

export const AppEyebrow = ({ children, className, ...props }: TypographyProps) => (
  <span 
    className={cn("text-eyebrow font-black uppercase tracking-[0.4em] text-intelligence-blue", className)} 
    {...props}
  >
    {children}
  </span>
);

export const AppTypography = {
  HeroTitle: AppHeroTitle,
  SectionTitle: AppSectionTitle,
  SubSection: AppSubSection,
  Body: AppBody,
  BodySm: AppBodySm,
  Metadata: AppMetadata,
  Eyebrow: AppEyebrow,
};

// --- Card Primitives ---

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  variant?: "hero" | "section" | "compact" | "intelligence" | "ghost";
  hover?: boolean;
}

export const AppCard = ({ children, variant = "section", hover = false, className, ...props }: CardProps) => {
  const variants = {
    hero: "hero-card shadow-premium-2xl",
    section: "section-card",
    compact: "compact-card",
    intelligence: "intelligence-panel shadow-premium-2xl",
    ghost: "bg-transparent border-none shadow-none",
  };

  const hoverVariants = {
    hero: "",
    section: "section-card-hover",
    compact: "compact-card-hover",
    evidence: "evidence-card-hover",
  };

  return (
    <div 
      className={cn(
        variants[variant],
        hover && hoverVariants[variant],
        className
      )} 
      {...props}
    >
      {children}
    </div>
  );
};

// --- Button Primitives ---

export const AppButton = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <Button
        ref={ref}
        variant={variant}
        size={size}
        className={cn(
          "font-bold uppercase tracking-[0.04em] text-[13px] md:text-[14px] transition-all active:scale-[0.98]",
          variant === "default" && "bg-intelligence-blue text-white hover:bg-intelligence-blue/90 shadow-lg shadow-intelligence-blue/20 focus:ring-4 focus:ring-intelligence-blue/20",
          className
        )}
        {...props}
      />
    );
  }
);
AppButton.displayName = "AppButton";

// --- Icon Primitives ---

interface AppIconProps extends React.HTMLAttributes<HTMLDivElement> {
  icon: React.ElementType;
  size?: "xs" | "sm" | "md" | "lg";
  variant?: "brand" | "success" | "warning" | "error" | "info" | "muted" | "navy";
  filled?: boolean;
}

export const AppIcon = ({ 
  icon: Icon, 
  size = "md", 
  variant = "brand", 
  filled = false,
  className, 
  ...props 
}: AppIconProps) => {
  const sizeClasses = {
    xs: "h-3 w-3",
    sm: "h-4 w-4",
    md: "h-5 w-5",
    lg: "h-6 w-6",
  };

  const containerSizes = {
    xs: "h-6 w-6 rounded-md",
    sm: "h-8 w-8 rounded-lg",
    md: "h-10 w-10 rounded-xl",
    lg: "h-12 w-12 rounded-2xl",
  };

  const variants = {
    brand: "bg-intelligence-blue/10 text-intelligence-blue border-intelligence-blue/20",
    success: "bg-trust-green/10 text-trust-green border-trust-green/20",
    warning: "bg-warning-amber/10 text-warning-amber border-warning-amber/20",
    error: "bg-error-red/10 text-error-red border-error-red/20",
    info: "bg-intelligence-blue/10 text-intelligence-blue border-intelligence-blue/20",
    muted: "bg-surface-base text-text-muted border-surface-border",
    navy: "bg-intelligence-blue/10 text-white border-white/10 shadow-lg",
    ghost: "bg-transparent text-current border-transparent",
  };

  const ResolvedIcon = Icon || HelpCircleIcon;

  if (filled) {
    return (
      <div 
        className={cn(
          "flex items-center justify-center border shrink-0",
          containerSizes[size],
          variants[variant],
          className
        )}
        {...props}
      >
        <ResolvedIcon className={sizeClasses[size]} />
      </div>
    );
  }

  return <ResolvedIcon className={cn(sizeClasses[size], className)} {...props} />;
};

// --- Badge Primitives ---

interface AppBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode;
  variant?: "success" | "warning" | "error" | "info" | "muted" | "brand";
}

export const AppBadge = ({ children, variant = "muted", className, ...props }: AppBadgeProps) => {
  const variants = {
    brand: "bg-intelligence-blue/10 text-intelligence-blue border-intelligence-blue/20",
    success: "bg-trust-green/10 text-trust-green border-trust-green/20",
    warning: "bg-warning-amber/10 text-warning-amber border-warning-amber/20",
    error: "bg-error-red/10 text-error-red border-error-red/20",
    info: "bg-intelligence-blue/10 text-intelligence-blue border-intelligence-blue/20",
    muted: "bg-text-muted/10 text-text-muted border-text-muted/20",
  };

  return (
    <span 
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest",
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
};

// --- Layout Primitives ---

export const AppContainer = ({ children, className, size = "default", ...props }: { children: React.ReactNode, className?: string, size?: "default" | "lg" | "narrow" | "xl" }) => {
  const sizes = {
    narrow: "max-w-2xl",
    default: "max-w-5xl",
    lg: "max-w-[1120px]",
    xl: "max-w-[1240px]",
  };

  return (
    <div className={cn("mx-auto w-full px-5 sm:px-8 xl:px-12", sizes[size], className)} {...props}>
      {children}
    </div>
  );
};

export const AppSection = ({ children, className, title, description, icon: Icon, ...props }: { 
  children: React.ReactNode, 
  className?: string, 
  title?: string, 
  description?: string,
  icon?: React.ElementType
}) => {
  return (
    <section className={cn("layout-stack-gap-md", className)} {...props}>
      {(title || description) && (
        <div className="layout-title-desc-gap mb-6">
          {title && (
            <div className="flex items-center layout-meta-gap-sm">
              {Icon && <AppIcon icon={Icon} filled size="md" />}
              <AppTypography.SectionTitle>{title}</AppTypography.SectionTitle>
            </div>
          )}
          {description && <AppTypography.Body className="max-w-3xl">{description}</AppTypography.Body>}
        </div>
      )}
      {children}
    </section>
  );
};

export const AppMetaLabel = ({ children, className, icon: Icon }: { children: React.ReactNode, className?: string, icon?: React.ElementType }) => (
  <div className={cn("flex items-center gap-2", className)}>
    {Icon && <Icon className="h-3 w-3 text-text-muted" />}
    <AppTypography.Metadata className="opacity-60">{children}</AppTypography.Metadata>
  </div>
);

export const AppPageHeader = ({ title, description, eyebrow, children, className }: { 
  title: string, 
  description?: string, 
  eyebrow?: string,
  children?: React.ReactNode,
  className?: string
}) => (
  <div className={cn("layout-stack-gap-sm mb-10", className)}>
    {eyebrow && <AppTypography.Eyebrow>{eyebrow}</AppTypography.Eyebrow>}
    <AppTypography.HeroTitle>{title}</AppTypography.HeroTitle>
    {description && <AppTypography.Body className="max-w-2xl">{description}</AppTypography.Body>}
    {children && <div className="pt-4">{children}</div>}
  </div>
);

export const AppInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "flex h-[46px] w-full rounded-[14px] border border-surface-border bg-surface-base px-4 text-sm font-medium text-text-primary transition-all duration-200 outline-none",
          "placeholder:text-text-muted placeholder:font-normal placeholder:tracking-normal placeholder:text-transform-none",
          "focus:border-intelligence-blue focus:ring-4 focus:ring-intelligence-blue/5",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
    );
  }
);
AppInput.displayName = "AppInput";

export const AppLabel = ({ children, className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
  <label 
    className={cn("block text-[11px] font-bold uppercase tracking-[0.08em] text-text-secondary mb-2", className)} 
    {...props}
  >
    {children}
  </label>
);
