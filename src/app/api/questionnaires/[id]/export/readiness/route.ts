import { NextResponse } from "next/server";
import { buildAuthContext } from "@/lib/auth/build-context";
import { handleApiError } from "@/lib/api/error-handler";
import { QuestionnaireExportService } from "@/modules/questionnaires/questionnaire-export-service";
import { Permission } from "@/lib/auth/permissions";

/**
 * GET /api/questionnaires/[id]/export/readiness
 *
 * Returns whether the questionnaire can be exported as XLSX/CSV and, if not,
 * a human-friendly reason. Used by the export page to gate the XLSX tile and
 * explain the state for legacy records that were imported before the source
 * workbook was retained.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const ctx = await buildAuthContext(request);

    if (!ctx.permissions.includes(Permission.VIEW_ANSWERS)) {
      return NextResponse.json(
        { error: { code: "INSUFFICIENT_ROLE", message: "Viewing answers is required to export questionnaires" } },
        { status: 403 }
      );
    }

    const readiness = await QuestionnaireExportService.getReadiness(id, ctx.workspaceId);
    return NextResponse.json(readiness);
  } catch (err) {
    // #region agent log
    fetch("http://127.0.0.1:7618/ingest/a37008bc-4f93-4d72-91cb-2408447c5f61", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "c92399" },
      body: JSON.stringify({
        sessionId: "c92399",
        hypothesisId: "H1|H2|H3|H4|H5",
        location: "export/readiness/route.ts:catch",
        message: "readiness GET failed",
        data: {
          errName: err instanceof Error ? err.name : "unknown",
          errMessage: err instanceof Error ? err.message : String(err),
          errCode: (err as { code?: unknown })?.code ?? null,
          stackPreview: err instanceof Error ? (err.stack ?? "").slice(0, 1200) : undefined,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    return handleApiError(err);
  }
}
