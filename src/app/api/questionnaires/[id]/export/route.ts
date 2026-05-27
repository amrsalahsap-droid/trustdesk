import { NextResponse } from "next/server";
import { buildAuthContext } from "@/lib/auth/build-context";
import { handleApiError } from "@/lib/api/error-handler";
import { assertQuestionnaireExport } from "@/lib/auth/governance-actions";
import { QuestionnaireExportService } from "@/modules/questionnaires/questionnaire-export-service";

/**
 * GET /api/questionnaires/[id]/export?format=xlsx|csv&includeUnresolved=true|false&strictBuyerExport=true|false
 *
 * Streams the exported questionnaire file back to the browser. XLSX re-injects
 * answers into the uploaded source workbook (Story D12-US-01), preserving
 * formatting; CSV generates a lean Row/Question/Answer file.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const ctx = await buildAuthContext(request);
    const { workspaceId } = ctx;

    const { searchParams } = new URL(request.url);
    const format = (searchParams.get("format") || "xlsx").toLowerCase();

    assertQuestionnaireExport(ctx, format);
    const includeUnresolved = searchParams.get("includeUnresolved") === "true";
    const strictParam = searchParams.get("strictBuyerExport");
    const strictBuyerExport =
      strictParam === "true" ? true : strictParam === "false" ? false : undefined;

    if (format !== "xlsx" && format !== "csv") {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_FORMAT",
            message: "Supported formats: xlsx, csv",
          },
        },
        { status: 400 },
      );
    }

    const exportOpts = { includeUnresolved, strictBuyerExport };
    const result =
      format === "xlsx"
        ? await QuestionnaireExportService.exportToXlsx(id, workspaceId, exportOpts)
        : await QuestionnaireExportService.exportToCsv(id, workspaceId, exportOpts);

    // RFC 5987 encoded filename so non-ASCII names survive cleanly.
    const fallbackName = result.fileName.replace(/[^\x20-\x7E]/g, "_");
    const encodedName = encodeURIComponent(result.fileName);

    const body = new Uint8Array(result.buffer);

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": result.contentType,
        "Content-Disposition": `attachment; filename="${fallbackName}"; filename*=UTF-8''${encodedName}`,
        "Content-Length": result.buffer.length.toString(),
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "X-Export-Job-Id": result.jobId, // Custom header for tracking
      },
    });

  } catch (err) {
    return handleApiError(err);
  }
}
