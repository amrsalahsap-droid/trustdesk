/**
 * Export completeness policy — decides whether unanswered / unreviewed rows should
 * block, warn, or be ignored on the questionnaire export surface. Deliberately kept
 * separate from the contradiction policy (see `export-contradiction-policy.ts`):
 * contradiction is a safety gate, completeness is a coverage gate.
 */

export type UnansweredExportPolicy = "IGNORE" | "WARN" | "BLOCK";

/**
 * Parse the raw workspace setting into a known policy value. Unknown/missing values
 * fall back to WARN (the product default) so enum drift never silently downgrades
 * the gate.
 */
export function unansweredExportPolicyFromDb(
  p: string | null | undefined,
): UnansweredExportPolicy {
  if (p === "IGNORE" || p === "BLOCK" || p === "WARN") return p;
  return "WARN";
}

/**
 * Normalize the workspace `questionnaireExportMinReviewedPercent` into a clamped
 * integer in the inclusive range [0, 100], or null when unset. Values outside the
 * range are clamped rather than rejected so stale/legacy data never throws on
 * export readiness.
 */
export function normalizeMinReviewedPercent(
  raw: number | null | undefined,
): number | null {
  if (raw === null || raw === undefined) return null;
  if (!Number.isFinite(raw)) return null;
  if (raw <= 0) return 0;
  if (raw >= 100) return 100;
  return Math.round(raw);
}

/**
 * Resolve the effective completeness gating given the configured policy, an optional
 * minimum-reviewed-percent threshold, and the questionnaire's reviewed-row coverage.
 * The min-percent threshold, when set and not met, forces BLOCK regardless of the
 * policy enum so admins can guarantee coverage without toggling off WARN elsewhere.
 */
export function resolveCompletenessGating(args: {
  policy: UnansweredExportPolicy;
  minReviewedPercent: number | null;
  total: number;
  reviewed: number;
}): "block" | "warn" | "none" {
  const { policy, minReviewedPercent, total, reviewed } = args;
  if (total <= 0) return "none";
  const unresolved = Math.max(0, total - reviewed);
  if (unresolved <= 0) return "none";

  if (minReviewedPercent !== null) {
    const coveragePercent = (reviewed / total) * 100;
    if (coveragePercent < minReviewedPercent) {
      return "block";
    }
  }

  if (policy === "IGNORE") return "none";
  if (policy === "BLOCK") return "block";
  return "warn";
}
