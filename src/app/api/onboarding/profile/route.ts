import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveUserIdentity } from "@/lib/auth/resolve-identity";
import { handleApiError } from "@/lib/api/error-handler";
import { TrustProfileService, UnresolvedConflictsError } from "@/modules/workspaces/trust-profile-service";
import { ProfileFieldService } from "@/modules/workspaces/profile-field-service";
import { InsufficientRoleError } from "@/lib/auth/errors";
import { ProfileFieldStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

const fieldConfirmationSchema = z.object({
  fieldKey: z.enum([
    "industry",
    "productType",
    "customerSegment",
    "dataTypes",
    "complianceTargets",
    "userTypes",
    "internalRoles",
    "operationalWorkflows",
    "trustClaims",
    "riskAreas",
  ]),
  confirmedValue: z.unknown(),
  status: z.enum([
    ProfileFieldStatus.CONFIRMED,
    ProfileFieldStatus.EDITED,
    ProfileFieldStatus.REJECTED,
  ]),
});

const PostSchema = z.object({
  workspaceId: z.string(),
  industry: z.array(z.string()).optional(),
  productType: z.array(z.string()).optional(),
  customerSegment: z.array(z.string()).optional(),
  dataTypes: z.array(z.string()).optional(),
  complianceTargets: z.array(z.string()).optional(),
  /** Full DeepInferredProfile from analyze; validated in TrustProfileService. */
  analyzedProfile: z.unknown().optional(),
  /** Field-level confirmations from the review step */
  fieldConfirmations: z.array(fieldConfirmationSchema).optional(),
  /** When true, confirms all non-conflicted fields automatically */
  confirmAll: z.boolean().optional(),
});

export async function GET(request: Request) {
  try {
    const { userId } = await resolveUserIdentity();
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json({ error: "Missing workspaceId" }, { status: 400 });
    }

    // Verify membership
    const membership = await prisma.workspaceMembership.findFirst({
      where: {
        workspaceId,
        userId,
        status: "ACTIVE",
      },
    });

    if (!membership) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const fields = await ProfileFieldService.getFields(workspaceId);
    const confirmedValues = await ProfileFieldService.getConfirmedValues(workspaceId);
    const hasUnconfirmed = await ProfileFieldService.hasUnconfirmedFields(workspaceId);

    return NextResponse.json({
      fields,
      confirmedValues,
      hasUnconfirmedFields: hasUnconfirmed,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await resolveUserIdentity();
    const body = await request.json();
    const parsed = PostSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body", details: parsed.error }, { status: 400 });
    }

    // Handle confirmAll - with strict validation, blocks if unresolved conflicts exist
    if (parsed.data.confirmAll) {
      try {
        // Use strict mode - throws if any unresolved fields exist
        const result = await TrustProfileService.confirmAllSafeFields(
          parsed.data.workspaceId,
          userId,
          true, // strictMode = true
        );
        return NextResponse.json({ 
          success: true, 
          confirmed: result.confirmed,
          skipped: result.skipped,
          message: `Confirmed ${result.confirmed.length} fields.`,
        });
      } catch (error) {
        if (error instanceof UnresolvedConflictsError) {
          return NextResponse.json({
            error: {
              code: "UNRESOLVED_CONFLICTS",
              message: error.message,
              unresolvedFields: error.unresolvedFields,
              unresolvedFieldDetails: error.unresolvedFieldDetails,
            },
          }, { status: 409 });
        }
        throw error;
      }
    }

    // Delegate to standardized service layer
    try {
      const { workspace, packs, documents } = await TrustProfileService.updateProfile(
        parsed.data.workspaceId,
        userId,
        {
          industry: parsed.data.industry,
          productType: parsed.data.productType,
          customerSegment: parsed.data.customerSegment,
          dataTypes: parsed.data.dataTypes,
          complianceTargets: parsed.data.complianceTargets,
          analyzedProfile: parsed.data.analyzedProfile,
          fieldConfirmations: parsed.data.fieldConfirmations,
        }
      );

      return NextResponse.json({ success: true, packs, documents });
    } catch (error) {
      console.error("Profile update failed:", error);
      throw error;
    }
  } catch (error) {
    // Return 403 for permission errors instead of 500
    if (error instanceof InsufficientRoleError) {
      return NextResponse.json(
        { error: "Only workspace owners or admins can update the profile" },
        { status: 403 }
      );
    }
    return handleApiError(error);
  }
}

const PatchSchema = z.object({
  workspaceId: z.string(),
  fieldKey: z.enum([
    "industry",
    "productType",
    "customerSegment",
    "dataTypes",
    "complianceTargets",
    "userTypes",
    "internalRoles",
    "operationalWorkflows",
    "trustClaims",
    "riskAreas",
  ]),
  value: z.unknown(),
  status: z.enum([
    ProfileFieldStatus.CONFIRMED,
    ProfileFieldStatus.EDITED,
    ProfileFieldStatus.REJECTED,
    ProfileFieldStatus.NEEDS_REVIEW,
  ]),
});

/**
 * PATCH endpoint for single field updates.
 * Used for field-level editing in the onboarding review flow.
 */
export async function PATCH(request: Request) {
  try {
    const { userId } = await resolveUserIdentity();
    const body = await request.json();
    const parsed = PatchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const { workspaceId, fieldKey, value, status } = parsed.data;

    // Verify membership
    const membership = await prisma.workspaceMembership.findFirst({
      where: {
        workspaceId,
        userId,
        status: "ACTIVE",
      },
    });

    if (!membership) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Update the field
    await ProfileFieldService.updateField(workspaceId, userId, fieldKey, value, status, {
      preserveOriginal: true,
    });

    // Get updated field data
    const fields = await ProfileFieldService.getFields(workspaceId);
    const updatedField = fields.find((f) => f.fieldKey === fieldKey);

    return NextResponse.json({
      success: true,
      field: updatedField,
      message: `Field '${fieldKey}' updated successfully.`,
    });
  } catch (error) {
    if (error instanceof InsufficientRoleError) {
      return NextResponse.json(
        { error: "Only workspace owners or admins can update fields" },
        { status: 403 }
      );
    }
    return handleApiError(error);
  }
}
