interface SectionHeaderProps {
  title: string;
  meta?: string;
  actions?: React.ReactNode;
}

export function SectionHeader({ title, meta, actions }: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-baseline gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">{title}</h2>
        {meta && <span className="text-xs text-text-muted">{meta}</span>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
