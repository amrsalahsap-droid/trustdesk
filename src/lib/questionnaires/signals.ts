import type { VerificationStatus } from "./types";

/**
 * Maps the internal confidence string to the canonical StatusSignal key.
 * This ensures that "low" confidence rows always show as "Low" (Yellow) 
 * across both the Table and the Drawer, preventing "Unresolved" mismatches.
 */
export function getConfidenceSignalKey(confidence: string) {
  switch (confidence?.toLowerCase()) {
    case "high": return "conf_high";
    case "medium": return "conf_medium";
    case "low": return "conf_low";
    default: return "conf_unresolved";
  }
}

/**
 * Returns the human-readable label and Tailwind theme classes for a given 
 * VerificationStatus. This centralizes the "Accepted" vs "Approved" terminology.
 */
export function getStatusTheme(status: VerificationStatus | undefined) {
  const normalized = status || "UNREVIEWED";
  
  switch (normalized) {
    case "ACCEPTED":
    case "MANUAL_OVERRIDE":
    case "EDITED":
      return {
        label: normalized === "ACCEPTED" ? "Accepted" : normalized.replace("_", " "),
        className: "bg-semantic-success/15 text-semantic-success border-semantic-success/20",
        tone: "success" as const
      };
    case "AUTO_ACCEPTED":
      return {
        label: "Auto Accepted",
        className: "bg-semantic-success/25 text-semantic-success border-semantic-success/40",
        tone: "success" as const
      };
    case "AMBIGUOUS_MATCH":
      return {
        label: "Ambiguous Match",
        className: "bg-semantic-warning/20 text-semantic-warning border-semantic-warning/40 shadow-[0_0_8px_rgba(217,119,6,0.1)]",
        tone: "warning" as const
      };
    case "SUGGESTED":
      return {
        label: "Suggested",
        className: "bg-accent-primary/10 text-accent-primary border-accent-primary/20",
        tone: "primary" as const
      };
    case "NEEDS_REVIEW":
      return {
        label: "Needs Review",
        className: "bg-semantic-warning/15 text-semantic-warning border-semantic-warning/20",
        tone: "warning" as const
      };
    case "REJECTED":
      return {
        label: "Rejected",
        className: "bg-semantic-error/15 text-semantic-error border-semantic-error/20",
        tone: "error" as const
      };
    case "UNRESOLVED":
      return {
        label: "Unresolved",
        className: "bg-semantic-error/25 text-semantic-error border-semantic-error/40",
        tone: "error" as const
      };
    case "DRAFTED":
    case "UNREVIEWED":
    default:
      return {
        label: normalized === "UNREVIEWED" ? "Unreviewed" : "Drafted",
        className: "bg-surface-border/50 text-text-muted border-surface-border",
        tone: "muted" as const
      };
  }
}
