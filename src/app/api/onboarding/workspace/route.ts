import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { resolveUserIdentity } from "@/lib/auth/resolve-identity";
import { createWorkspaceDuringOnboarding } from "@/modules/onboarding";
import { handleApiError } from "@/lib/api/error-handler";

function normalizeWebsite(url: string | undefined): string | undefined {
  if (!url || !url.trim()) return undefined;
  let normalized = url.trim().toLowerCase();
  // Remove protocol if present
  normalized = normalized.replace(/^https?:\/\//, "");
  // Remove www. prefix
  normalized = normalized.replace(/^www\./, "");
  // Remove trailing slash
  normalized = normalized.replace(/\/$/, "");
  // Remove path and query params (keep only domain)
  normalized = normalized.split("/")[0].split("?")[0].split("#")[0];
  // Basic domain validation regex
  const domainRegex = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/;
  if (!domainRegex.test(normalized)) {
    throw new Error("Invalid domain format");
  }
  return normalized;
}

const BodySchema = z
  .object({
    workspaceName: z.string().min(1).max(100),
    website: z.string()
      .optional()
      .transform((val) => {
        if (!val) return undefined;
        try {
          return normalizeWebsite(val);
        } catch {
          return undefined;
        }
      }),
  })
  .strict();

export async function POST(request: Request) {
  try {
    const { userId } = await resolveUserIdentity();

    const body: unknown = await request.json();
    const parsed = BodySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid request body",
            issues: parsed.error.issues,
          },
        },
        { status: 400 },
      );
    }

    const result = await createWorkspaceDuringOnboarding({
      userId,
      workspaceName: parsed.data.workspaceName,
      website: parsed.data.website,
    });

    return NextResponse.json(
      {
        workspaceId: result.workspaceId,
        workspaceName: result.workspaceName,
        workspaceSlug: result.workspaceSlug,
        role: result.role,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid workspace name",
            issues: error.flatten(),
          },
        },
        { status: 400 },
      );
    }
    return handleApiError(error);
  }
}
