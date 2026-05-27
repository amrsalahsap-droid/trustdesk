import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/auth/build-context", () => ({
  buildAuthContext: vi.fn(),
}));

vi.mock("@/modules/questionnaires/questionnaire-export-service", () => ({
  QuestionnaireExportService: {
    exportToXlsx: vi.fn(),
    exportToCsv: vi.fn(),
    getReadiness: vi.fn(),
  },
}));

import { buildAuthContext } from "@/lib/auth/build-context";
import { getPermissionsForRole, Permission } from "@/lib/auth/permissions";
import { QuestionnaireExportService } from "@/modules/questionnaires/questionnaire-export-service";
import { QuestionnaireExportError } from "@/modules/questionnaires/errors";
import { GET as exportGet } from "@/app/api/questionnaires/[id]/export/route";
import { GET as readinessGet } from "@/app/api/questionnaires/[id]/export/readiness/route";

const mockBuildContext = vi.mocked(buildAuthContext);
const mockXlsx = vi.mocked(QuestionnaireExportService.exportToXlsx);
const mockCsv = vi.mocked(QuestionnaireExportService.exportToCsv);
const mockReadiness = vi.mocked(QuestionnaireExportService.getReadiness);

function makeRequest(url: string): Request {
  return new Request(url);
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockBuildContext.mockResolvedValue({
    userId: "user-1",
    workspaceId: "ws-1",
    membershipId: "m-1",
    role: "OWNER",
    permissions: getPermissionsForRole("OWNER"),
  } as never);
});

describe("GET /api/questionnaires/[id]/export", () => {
  it("returns 200 with xlsx buffer, content-type, and filename headers", async () => {
    const buffer = Buffer.from("fake xlsx bytes");
    mockXlsx.mockResolvedValueOnce({
      buffer,
      fileName: "Acme.xlsx - TrustDesk.xlsx",
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    } as never);

    const res = await exportGet(
      makeRequest("http://localhost/api/questionnaires/qn-1/export?format=xlsx"),
      makeParams("qn-1"),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("spreadsheetml");
    expect(res.headers.get("Content-Disposition")).toContain("filename");
    expect(res.headers.get("Content-Disposition")).toContain("filename*=UTF-8''");
    expect(mockXlsx).toHaveBeenCalledWith("qn-1", "ws-1", { includeUnresolved: false });
  });

  it("passes includeUnresolved=true to the service when requested", async () => {
    mockXlsx.mockResolvedValueOnce({
      buffer: Buffer.from(""),
      fileName: "x.xlsx",
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    } as never);

    await exportGet(
      makeRequest(
        "http://localhost/api/questionnaires/qn-1/export?format=xlsx&includeUnresolved=true",
      ),
      makeParams("qn-1"),
    );

    expect(mockXlsx).toHaveBeenCalledWith("qn-1", "ws-1", { includeUnresolved: true });
  });

  it("routes format=csv to exportToCsv", async () => {
    mockCsv.mockResolvedValueOnce({
      buffer: Buffer.from("a,b,c"),
      fileName: "x.csv",
      contentType: "text/csv; charset=utf-8",
    } as never);

    const res = await exportGet(
      makeRequest("http://localhost/api/questionnaires/qn-1/export?format=csv"),
      makeParams("qn-1"),
    );

    expect(res.status).toBe(200);
    expect(mockCsv).toHaveBeenCalled();
    expect(mockXlsx).not.toHaveBeenCalled();
  });

  it("returns 400 INVALID_FORMAT for unsupported formats", async () => {
    const res = await exportGet(
      makeRequest("http://localhost/api/questionnaires/qn-1/export?format=pdf"),
      makeParams("qn-1"),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_FORMAT");
  });

  it("returns 404 when the questionnaire is not found in the workspace", async () => {
    mockXlsx.mockRejectedValueOnce(QuestionnaireExportError.questionnaireNotFound());

    const res = await exportGet(
      makeRequest("http://localhost/api/questionnaires/qn-1/export?format=xlsx"),
      makeParams("qn-1"),
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("EXPORT_QUESTIONNAIRE_NOT_FOUND");
  });

  it("returns 409 when the source workbook is no longer attached", async () => {
    mockXlsx.mockRejectedValueOnce(QuestionnaireExportError.sourceUnavailable());

    const res = await exportGet(
      makeRequest("http://localhost/api/questionnaires/qn-1/export?format=xlsx"),
      makeParams("qn-1"),
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("EXPORT_SOURCE_UNAVAILABLE");
  });

  it("returns 422 when the stored sheet name is missing from the workbook", async () => {
    mockXlsx.mockRejectedValueOnce(QuestionnaireExportError.sheetMissing("Gone"));

    const res = await exportGet(
      makeRequest("http://localhost/api/questionnaires/qn-1/export?format=xlsx"),
      makeParams("qn-1"),
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("EXPORT_SHEET_MISSING");
  });

  it("returns 403 when user lacks EXPORT_DATA", async () => {
    mockBuildContext.mockResolvedValueOnce({
      userId: "user-1",
      workspaceId: "ws-1",
      membershipId: "m-1",
      role: "APPROVER",
      permissions: [Permission.VIEW_ANSWERS, Permission.APPROVE_ANSWERS],
    } as never);

    const res = await exportGet(
      makeRequest("http://localhost/api/questionnaires/qn-1/export?format=xlsx"),
      makeParams("qn-1"),
    );

    expect(res.status).toBe(403);
    expect(mockXlsx).not.toHaveBeenCalled();
  });

  it("returns 409 when the header/answer mapping is missing", async () => {
    mockXlsx.mockRejectedValueOnce(QuestionnaireExportError.mappingMissing());

    const res = await exportGet(
      makeRequest("http://localhost/api/questionnaires/qn-1/export?format=xlsx"),
      makeParams("qn-1"),
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("EXPORT_MAPPING_MISSING");
  });

  it("returns 409 EXPORT_CONTRADICTION_UNRESOLVED when export is blocked by contradictions", async () => {
    mockXlsx.mockRejectedValueOnce(QuestionnaireExportError.contradictionBlocksExport());

    const res = await exportGet(
      makeRequest("http://localhost/api/questionnaires/qn-1/export?format=xlsx"),
      makeParams("qn-1"),
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("EXPORT_CONTRADICTION_UNRESOLVED");
  });
});

describe("GET /api/questionnaires/[id]/export/readiness", () => {
  it("returns 403 when user lacks VIEW_ANSWERS", async () => {
    mockBuildContext.mockResolvedValueOnce({
      userId: "user-1",
      workspaceId: "ws-1",
      membershipId: "m-1",
      role: "VIEWER",
      permissions: [],
    } as never);

    const res = await readinessGet(
      makeRequest("http://localhost/api/questionnaires/qn-1/export/readiness"),
      makeParams("qn-1"),
    );

    expect(res.status).toBe(403);
    expect(mockReadiness).not.toHaveBeenCalled();
  });

  it("returns the readiness payload from the service", async () => {
    mockReadiness.mockResolvedValueOnce({
      xlsxAvailable: true,
      csvAvailable: true,
      originalFileName: "acme.xlsx",
      reason: null,
      macroSource: false,
      formatNotice: null,
      counts: { total: 5, reviewed: 3, unresolved: 2 },
    } as never);

    const res = await readinessGet(
      makeRequest("http://localhost/api/questionnaires/qn-1/export/readiness"),
      makeParams("qn-1"),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.xlsxAvailable).toBe(true);
    expect(body.counts.total).toBe(5);
    expect(body.macroSource).toBe(false);
    expect(body.formatNotice).toBeNull();
    expect(mockReadiness).toHaveBeenCalledWith("qn-1", "ws-1");
  });

  it("passes macroSource and formatNotice through unmodified (D12-EN-03)", async () => {
    mockReadiness.mockResolvedValueOnce({
      xlsxAvailable: true,
      csvAvailable: true,
      originalFileName: "acme.xlsm",
      reason: null,
      macroSource: true,
      formatNotice: "Macros will not be preserved.",
      counts: { total: 1, reviewed: 0, unresolved: 1 },
    } as never);

    const res = await readinessGet(
      makeRequest("http://localhost/api/questionnaires/qn-1/export/readiness"),
      makeParams("qn-1"),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.macroSource).toBe(true);
    expect(body.formatNotice).toBe("Macros will not be preserved.");
    expect(body.originalFileName).toBe("acme.xlsm");
  });

  it("passes sheetNames and targetSheetName through unmodified (D12-US-02)", async () => {
    mockReadiness.mockResolvedValueOnce({
      xlsxAvailable: true,
      csvAvailable: true,
      originalFileName: "acme.xlsx",
      reason: null,
      macroSource: false,
      formatNotice: null,
      sheetNames: ["Cover", "Responses", "Glossary"],
      targetSheetName: "Responses",
      counts: { total: 5, reviewed: 3, unresolved: 2 },
    } as never);

    const res = await readinessGet(
      makeRequest("http://localhost/api/questionnaires/qn-1/export/readiness"),
      makeParams("qn-1"),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sheetNames).toEqual(["Cover", "Responses", "Glossary"]);
    expect(body.targetSheetName).toBe("Responses");
  });

  it("returns 404 when the questionnaire is not visible to the workspace", async () => {
    mockReadiness.mockRejectedValueOnce(QuestionnaireExportError.questionnaireNotFound());

    const res = await readinessGet(
      makeRequest("http://localhost/api/questionnaires/qn-1/export/readiness"),
      makeParams("qn-1"),
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("EXPORT_QUESTIONNAIRE_NOT_FOUND");
  });
});
