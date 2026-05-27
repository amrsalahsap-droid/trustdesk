import type { StatusVariant } from "@/components/ui/status-badge";
import { answerStatusToBadgeVariant } from "@/components/trust/map-answer-status-variant";

/** @deprecated Use answerStatusToBadgeVariant from @/components/trust — alias kept for existing imports. */
export function answerStatusBadgeVariant(status: string | null | undefined): StatusVariant {
  return answerStatusToBadgeVariant(status);
}
