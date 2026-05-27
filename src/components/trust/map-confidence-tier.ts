/** Discrete model-confidence buckets — never show raw floats in UI. */
export type ConfidenceTierLevel = "manual" | "high" | "medium" | "low";

export function mapConfidenceTier(score: number | null | undefined): ConfidenceTierLevel {
  if (score === null || score === undefined) return "manual";
  if (score > 0.8) return "high";
  if (score > 0.5) return "medium";
  return "low";
}

/** Short label for dense rows (no false precision). */
export function confidenceTierShortLabel(tier: ConfidenceTierLevel): string {
  switch (tier) {
    case "manual":
      return "Manual";
    case "high":
      return "High";
    case "medium":
      return "Medium";
    case "low":
      return "Review suggested";
    default:
      return "Manual";
  }
}

/** Optional helper text for tooltips / detail surfaces. */
export function confidenceTierDescription(tier: ConfidenceTierLevel): string {
  if (tier === "manual") {
    return "Not model-scored; treat as human-authored unless otherwise verified.";
  }
  return "Model-assessed consistency with source material (internal). Not a statistical guarantee.";
}
