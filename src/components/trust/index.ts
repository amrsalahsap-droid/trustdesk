/**
 * Trust layer primitives for answers: evidence linkage, discrete confidence tiers,
 * knowledge status, and evidence snippet cards.
 *
 * Questionnaire review surfaces: import `KnowledgeStatusBadge`, `EvidencePresence`,
 * `ConfidenceTier`, and `EvidenceSnippetCard` with `density="md"` on indicators,
 * `density="comfortable"` on snippet cards, and wrap interactive rows in min-h-[44px]
 * where touch targets matter. Do not show raw confidence floats.
 */

export { EvidenceSnippetCard, type EvidenceSnippetDensity } from "@/components/trust/evidence-snippet-card";
export { EvidencePresence, type TrustDensity } from "@/components/trust/evidence-presence";
export { ConfidenceTier } from "@/components/trust/confidence-tier";
export { KnowledgeStatusBadge } from "@/components/trust/knowledge-status-badge";
export {
  mapConfidenceTier,
  confidenceTierShortLabel,
  confidenceTierDescription,
  type ConfidenceTierLevel,
} from "@/components/trust/map-confidence-tier";
export { answerStatusToBadgeVariant, answerStatusDisplayLabel } from "@/components/trust/map-answer-status-variant";
