interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  variant?: "default" | "emphasized" | "minimal";
  subtitle?: string;
}

export function PageHeader({ 
  title, 
  description, 
  actions, 
  variant = "default",
  subtitle 
}: PageHeaderProps) {
  // Visual hierarchy: Title styles based on variant
  const getTitleClass = () => {
    switch (variant) {
      case "emphasized":
        return "text-3xl font-bold tracking-tight text-text-primary";
      case "minimal":
        return "text-xl font-semibold tracking-tight text-text-primary";
      default:
        return "text-2xl font-semibold tracking-tight text-text-primary";
    }
  };

  // Visual hierarchy: Container styles
  const getContainerClass = () => {
    switch (variant) {
      case "emphasized":
        return "flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between pb-6 border-b border-surface-border mb-6";
      case "minimal":
        return "flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between";
      default:
        return "flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between";
    }
  };

  return (
    <div className={getContainerClass()}>
      <div className="flex-1 min-w-0">
        {/* Subtitle - if provided, shown above title with muted style */}
        {subtitle && (
          <p className="text-xs font-medium uppercase tracking-wider text-text-muted mb-1">
            {subtitle}
          </p>
        )}
        
        {/* Title - strongest visual weight */}
        <h1 className={getTitleClass()}>{title}</h1>
        
        {/* Description - muted, secondary information */}
        {description && (
          <p className="mt-1.5 text-sm text-text-muted max-w-2xl leading-relaxed">
            {description}
          </p>
        )}
      </div>
      
      {/* Actions - visually distinct from content */}
      {actions && (
        <div className="flex items-center gap-3 mt-4 sm:mt-0 flex-shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}
