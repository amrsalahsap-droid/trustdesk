import { useRef, useState, type DragEvent } from "react";
import { cn } from "@/lib/utils";

export type UploadZoneMode = "default" | "dropzoneOnly";

interface UploadZoneProps {
  accept?: string;
  hint?: string;
  onFiles?: (files: File[]) => void;
  /** `dropzoneOnly`: no internal file list; parent owns queue (e.g. upload modal). */
  mode?: UploadZoneMode;
  disabled?: boolean;
}

export function UploadZone({
  accept,
  hint = "PDF, DOCX, TXT — up to 25 MiB per file",
  onFiles,
  mode = "default",
  disabled = false,
}: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [files, setFiles] = useState<File[]>([]);

  function handleFiles(incoming: FileList | null) {
    if (!incoming || disabled) return;
    const list = Array.from(incoming);
    if (mode === "default") {
      setFiles((prev) => [...prev, ...list]);
    }
    onFiles?.(list);
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    if (disabled) return;
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  const showFileList = mode === "default" && files.length > 0;

  return (
    <div className="group relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "flex w-full flex-col items-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-all duration-300 ease-out",
          disabled 
            ? "cursor-not-allowed border-surface-border bg-surface-base/10 opacity-50"
            : dragging
            ? "border-accent-primary bg-accent-primary/[0.04] scale-[1.01] shadow-lg shadow-accent-primary/5"
            : "border-surface-border bg-surface-base/20 hover:border-text-muted hover:bg-surface-base/40"
        )}
      >
        <div className={cn(
          "flex h-12 w-12 items-center justify-center rounded-full bg-surface-panel shadow-sm transition-transform duration-300",
          dragging && "scale-110 rotate-3"
        )}>
          <UploadIcon className={cn(
            "h-6 w-6 transition-colors",
            dragging ? "text-accent-primary" : "text-text-muted"
          )} />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-text-primary">
            {dragging ? "Release to upload" : "Drop files here or click to browse"}
          </p>
          <p className="text-xs text-text-muted">{hint}</p>
        </div>
      </button>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={accept}
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
        className="hidden"
      />

      {showFileList && (
        <ul className="mt-4 space-y-2">
          {files.map((file, i) => (
            <li
              key={`${file.name}-${i}`}
              className="flex items-center justify-between rounded-lg border border-surface-border bg-surface-panel p-3 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="truncate text-sm font-medium text-text-primary">{file.name}</span>
              </div>
              <button
                type="button"
                onClick={() => removeFile(i)}
                className="ml-2 shrink-0 rounded p-1 text-xs font-medium text-text-muted transition-colors hover:bg-semantic-error-bg hover:text-semantic-error"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}
