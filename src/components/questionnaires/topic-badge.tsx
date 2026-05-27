import { TopicIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

interface TopicBadgeProps {
  topicName?: string;
  confidence?: "high" | "medium" | "low";
  isAmbiguous?: boolean;
  className?: string;
}

/**
 * TopicBadge displays the system's inferred classification for a questionnaire row.
 */
export function TopicBadge({
  topicName,
  confidence,
  isAmbiguous,
  className
}: TopicBadgeProps) {
  if (!topicName && !isAmbiguous) {
    return (
      <span className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-surface-border bg-surface-base/50 px-2 py-0.5 text-[10px] font-bold text-text-muted/60",
        className
      )}>
        Unclassified
      </span>
    );
  }

  if (isAmbiguous) {
    return (
      <div className={cn(
        "inline-flex flex-col gap-1 w-fit",
        className
      )}>
        <span className="text-[9px] font-black uppercase tracking-widest text-semantic-warning/70">Ambiguous Matching</span>
        <div className="flex items-center gap-1.5 rounded-full border border-semantic-warning/30 bg-semantic-warning/[0.03] px-2 py-0.5 text-[10px] font-bold text-semantic-warning">
          <TopicIcon className="h-3 w-3" />
          {topicName || "Multiple Candidates"}
        </div>
      </div>
    );
  }

  const isLowConfidence = confidence === "low";

  return (
    <div className={cn(
        "inline-flex flex-col gap-0.5 w-fit",
        className
      )}>
        <span className="text-[8px] font-bold uppercase tracking-widest text-text-muted/40">Inferred Topic</span>
        <div className={cn(
            "flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold transition-all",
            isLowConfidence 
                ? "border-surface-border bg-surface-base text-text-muted/80 shadow-inner" 
                : "border-accent-primary/20 bg-accent-primary/[0.03] text-accent-primary shadow-sm"
        )}>
            <TopicIcon className={cn("h-3 w-3", !isLowConfidence && "text-accent-primary")} />
            {topicName}
            {isLowConfidence && <span className="ml-1 text-[8px] opacity-70">(Weak)</span>}
        </div>
    </div>
  );
}
