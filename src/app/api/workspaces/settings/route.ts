import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { buildAuthContext } from "@/lib/auth/build-context";
import { handleApiError } from "@/lib/api/error-handler";
import { ALLOWED_CADENCE_DAYS } from "@/lib/knowledge/answer-freshness";

const PatchSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  slug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens").optional(),
  website: z.string().url().or(z.literal("")).optional().nullable(),
  timezone: z.string().optional(),
  logoUrl: z.string().url().or(z.literal("")).optional().nullable(),
  defaultAnswerReviewCadenceDays: z
    .number()
    .int()
    .refine((n) => (ALLOWED_CADENCE_DAYS as readonly number[]).includes(n), {
      message: "Must be 90, 180, or 365",
    })
    .optional(),
  flagAnswerOnEvidenceChange: z.boolean().optional(),
  allowApprovedAnswerBodyEditWithoutReapproval: z.boolean().optional(),
  questionnaireExportStrictBuyerMode: z.boolean().optional(),
  questionnaireExportContradictionMediumPolicy: z.enum(["WARN", "BLOCK"]).optional(),
  requireApproverExportSafeConfirmation: z.boolean().optional(),
  allowOwnerSelfApprove: z.boolean().optional(),
  defaultTone: z.string().optional(),
  industry: z.array(z.string()).optional(),
  productType: z.array(z.string()).optional(),
  customerSegment: z.array(z.string()).optional(),
  complianceTargets: z.array(z.string()).optional(),
  inviteExpirationDays: z.number().int().min(1).max(365).optional(),
  allowedEmailDomains: z.array(z.string()).optional(),
  enforceDomainCheck: z.boolean().optional(),
  sessionTimeoutMinutes: z.number().int().min(15).max(43200).optional(),
  exportIncludeEvidence: z.boolean().optional(),
  exportIncludeProvenance: z.boolean().optional(),
  exportFormatDefault: z.string().optional(),
  exportUnresolvedBehavior: z.string().optional(),
  exportFontFamily: z.string().optional(),
  exportFontSize: z.number().int().min(6).max(72).optional(),
  exportBoldHeaders: z.boolean().optional(),
  exportVerticalTop: z.boolean().optional(),
  exportWrapText: z.boolean().optional(),
  exportOutputColumnName: z.string().max(100).optional(),
  exportAutoMoveNotesToEnd: z.boolean().optional(),
});

const SELECT_FIELDS = {
  id: true,
  name: true,
  slug: true,
  website: true,
  timezone: true,
  logoUrl: true,
  industry: true,
  productType: true,
  customerSegment: true,
  complianceTargets: true,
  defaultAnswerReviewCadenceDays: true,
  flagAnswerOnEvidenceChange: true,
  allowApprovedAnswerBodyEditWithoutReapproval: true,
  questionnaireExportStrictBuyerMode: true,
  questionnaireExportContradictionMediumPolicy: true,
  requireApproverExportSafeConfirmation: true,
  allowOwnerSelfApprove: true,
  defaultTone: true,
  inviteExpirationDays: true,
  allowedEmailDomains: true,
  enforceDomainCheck: true,
  sessionTimeoutMinutes: true,
  exportIncludeEvidence: true,
  exportIncludeProvenance: true,
  exportFormatDefault: true,
  exportUnresolvedBehavior: true,
  exportFontFamily: true,
  exportFontSize: true,
  exportBoldHeaders: true,
  exportVerticalTop: true,
  exportWrapText: true,
  exportOutputColumnName: true,
  exportAutoMoveNotesToEnd: true,
} as const;

/**
 * GET workspace-level answer governance and questionnaire export defaults.
 */
export async function GET(request: Request) {
  try {
    const ctx = await buildAuthContext(request);
    const workspace = await prisma.workspace.findUnique({
      where: { id: ctx.workspaceId },
      select: SELECT_FIELDS,
    });
    if (!workspace) {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Workspace not found" } }, { status: 404 });
    }
    return NextResponse.json({ workspace });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH workspace-level answer governance defaults (cadence, evidence policy).
 */
export async function PATCH(request: Request) {
  try {
    const ctx = await buildAuthContext(request);
    if (ctx.role !== "OWNER" && ctx.role !== "ADMIN") {
      return NextResponse.json({ error: "Only workspace owners and admins can change settings" }, { status: 403 });
    }

    const body: unknown = await request.json();
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", issues: parsed.error.issues } },
        { status: 400 },
      );
    }

    if (Object.keys(parsed.data).length === 0) {
      return NextResponse.json({ error: "No updates provided" }, { status: 400 });
    }

    // Check slug uniqueness if changing
    if (parsed.data.slug) {
      const existing = await prisma.workspace.findFirst({
        where: { 
          slug: parsed.data.slug,
          id: { not: ctx.workspaceId }
        }
      });
      if (existing) {
        return NextResponse.json({ error: "Slug is already in use" }, { status: 400 });
      }
    }

    const workspace = await prisma.workspace.update({
      where: { id: ctx.workspaceId },
      data: parsed.data,
      select: SELECT_FIELDS,
    });

    return NextResponse.json({ workspace });
  } catch (error) {
    return handleApiError(error);
  }
}

