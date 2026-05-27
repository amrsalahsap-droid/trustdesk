import type { AnswerApprovalScope, AnswerGovernanceStatus, AnswerStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { isEligibleForExportReuse, isEligibleForInternalReuse } from "@/lib/knowledge/answer-workflow";

/** UI / filter bucket for library answers and linked row summaries. */
export const EXPORT_SAFETY_TIERS = [
  "draft_only",
  "approved_internal",
  "approved_for_export",
  "restricted",
  "not_approved",
] as const;

export type ExportSafetyTier = (typeof EXPORT_SAFETY_TIERS)[number];

export type AnswerExportSafetyInput = {
  status: AnswerStatus;
  governanceStatus: AnswerGovernanceStatus;
  approvalScope: AnswerApprovalScope;
  exportSafe: boolean;
  nextReviewDueAt?: Date | null;
};

export const EXPORT_SAFETY_LABELS: Record<ExportSafetyTier, string> = {
  draft_only: "Draft only",
  approved_internal: "Approved internal",
  approved_for_export: "Approved for export",
  restricted: "Restricted / needs review",
  not_approved: "Not approved",
};

export const EXPORT_SAFETY_SHORT_LABELS: Record<ExportSafetyTier, string> = {
  draft_only: "Draft",
  approved_internal: "Internal",
  approved_for_export: "Export-safe",
  restricted: "Restricted",
  not_approved: "Not approved",
};

/**
 * Derives a single tier for badges and filters. Not identical to
 * `isEligibleForExportReuse` (stale dates map to restricted).
 */
export function getAnswerExportSafetyTier(
  item: AnswerExportSafetyInput,
  now: Date = new Date(),
): ExportSafetyTier {
  if (item.status === "ARCHIVED" || item.governanceStatus === "ARCHIVED" || item.governanceStatus === "REJECTED") {
    return "not_approved";
  }

  if (
    isEligibleForExportReuse(
      {
        status: item.status,
        governanceStatus: item.governanceStatus,
        approvalScope: item.approvalScope,
        exportSafe: item.exportSafe,
        nextReviewDueAt: item.nextReviewDueAt,
      },
      now,
    )
  ) {
    return "approved_for_export";
  }

  if (item.governanceStatus === "APPROVED_FOR_EXPORT" && item.approvalScope === "EXPORT_ALLOWED") {
    return "restricted";
  }

  if (item.governanceStatus === "APPROVED_INTERNAL") {
    return "approved_internal";
  }

  if (item.status === "APPROVED" && item.governanceStatus === "DRAFT") {
    return "approved_internal";
  }

  if (
    isEligibleForInternalReuse({
      status: item.status,
      governanceStatus: item.governanceStatus,
    })
  ) {
    return "approved_internal";
  }

  if (
    item.governanceStatus === "DRAFT" ||
    (item.governanceStatus === "REVISION_REQUIRED" && item.status === "DRAFT")
  ) {
    return "draft_only";
  }

  if (
    item.governanceStatus === "IN_REVIEW" ||
    item.governanceStatus === "REVISION_REQUIRED" ||
    item.governanceStatus === "EXPIRED"
  ) {
    return "restricted";
  }

  return "not_approved";
}

export function trimAnswerText(s: string | null | undefined): string {
  return (s ?? "").trim();
}

/** True when reviewed final text is still the library suggestion (buyer strict gate). */
export function reviewedRowUsesSuggestedLibraryText(args: {
  finalAnswer: string | null | undefined;
  suggestedAnswer: string | null | undefined;
}): boolean {
  return trimAnswerText(args.finalAnswer) === trimAnswerText(args.suggestedAnswer) && trimAnswerText(args.finalAnswer) !== "";
}

/** Prisma AND clause for GET /api/knowledge/answers ?exportSafety= */
export function prismaWhereForExportSafetyTier(tier: ExportSafetyTier): Prisma.AnswerLibraryItemWhereInput {
  const now = new Date();
  switch (tier) {
    case "approved_for_export":
      return {
        status: { not: "ARCHIVED" },
        governanceStatus: "APPROVED_FOR_EXPORT",
        approvalScope: "EXPORT_ALLOWED",
        exportSafe: true,
        OR: [{ nextReviewDueAt: null }, { nextReviewDueAt: { gte: now } }],
      };
    case "approved_internal":
      return {
        status: { not: "ARCHIVED" },
        governanceStatus: { not: "APPROVED_FOR_EXPORT" },
        OR: [{ governanceStatus: "APPROVED_INTERNAL" }, { status: "APPROVED", governanceStatus: "DRAFT" }],
      };
    case "draft_only":
      return {
        status: "DRAFT",
        governanceStatus: { in: ["DRAFT", "REVISION_REQUIRED"] },
      };
    case "restricted":
      return {
        status: { not: "ARCHIVED" },
        OR: [
          { governanceStatus: "IN_REVIEW" },
          { governanceStatus: "REVISION_REQUIRED", NOT: { status: "DRAFT" } },
          { governanceStatus: "EXPIRED" },
          {
            governanceStatus: "APPROVED_FOR_EXPORT",
            approvalScope: "EXPORT_ALLOWED",
            OR: [{ exportSafe: false }, { nextReviewDueAt: { not: null, lt: now } }],
          },
        ],
      };
    case "not_approved":
      return {
        OR: [{ status: "ARCHIVED" }, { governanceStatus: "REJECTED" }, { governanceStatus: "ARCHIVED" }],
      };
    default:
      return {};
  }
}
