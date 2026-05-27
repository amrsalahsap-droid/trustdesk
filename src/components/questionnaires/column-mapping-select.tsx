"use client";

interface ColumnMappingSelectProps {
  label: React.ReactNode;
  value: number;
  options: { index: number; label: string }[];
  onChange: (index: number) => void;
  disabled?: boolean;
}

export function ColumnMappingSelect({ label, value, options, onChange, disabled }: ColumnMappingSelectProps) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-text-muted">{label}</label>
      <select
        className="h-10 w-full rounded-md border border-surface-border bg-surface-base px-3 text-sm text-text-primary disabled:opacity-50"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {options.map((o) => (
          <option key={o.index} value={o.index}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
