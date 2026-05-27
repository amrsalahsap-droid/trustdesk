import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/build-context", () => ({
  buildAuthContext: vi.fn(),
}));

vi.mock("@/lib/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/audit")>();
  return {
    ...actual,
    recordAuditEventSafe: vi.fn().mockResolvedValue(undefined),
  };
});

import { POST } from "@/app/api/questionnaires/[id]/items/[itemId]/contradiction/resolve/route";
import { buildAuthContext } from "@/lib/auth/build-context";
import { Permission } from "@/lib/auth/permissions";
import * as resolveSvc from "@/lib/questionnaires/contradiction-resolve-service";
import { recordAuditEventSafe, AUDIT_EVENT_TYPES } from "@/lib/audit";

const mockBuildContext = vi.mocked(buildAuthContext);

const operatorCtx = {
  userId: "user-1",
  workspaceId: "ws-1",
  membershipId: "mem-1",
  role: "OPERATOR" as const,
  permissions: [Permission.REVIEW_ROWS, Permission.EDIT_ANSWERS] as Permission[],
};

function makeRequest(body: unknown): Request {
  return new Request(
    "http://localhost/api/questionnaires/qn-1/items/item-1/contradiction/resolve",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-workspace-id": "ws-1" },
      body: JSON.stringify(body),
    },
  );
}

describe("POST /api/questionnaires/[id]/items/[itemId]/contradiction/resolve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildContext.mockResolvedValue(operatorCtx as never);
    vi.spyOn(resolveSvc, "executeContradictionResolve").mockResolvedValue({
      resultId: "cr-1",
      previousResolutionStatus: "PENDING",
      primaryAuditMetadata: {
        questionnaireId: "qn-1",
        questionnaireItemId: "item-1",
        contradictionResultId: "cr-1",
        canonicalAnswerId: "ans-1",
        canonicalVersionNumber: 1,
        resolutionAction: "KEEP_ROW",
      },
      postEditDetectedMetadata: null,
    });
  });

  it("returns 400 when FALSE_POSITIVE without resolutionNote", async () => {
    const res = await POST(makeRequest({ action: "FALSE_POSITIVE" }), {
      params: Promise.resolve({ id: "qn-1", itemId: "item-1" }),
    });
    expect(res.status).toBe(400);
    expect(resolveSvc.executeContradictionResolve).not.toHaveBeenCalled();
  });

  it("returns 400 when KEEP_ROW without overrideReasonCategory", async () => {
    const res = await POST(makeRequest({ action: "KEEP_ROW", overrideComment: "x" }), {
      params: Promise.resolve({ id: "qn-1", itemId: "item-1" }),
    });
    expect(res.status).toBe(400);
    expect(resolveSvc.executeContradictionResolve).not.toHaveBeenCalled();
  });

  it("returns 400 when EDIT_ROW_ALIGN without finalAnswer", async () => {
    const res = await POST(makeRequest({ action: "EDIT_ROW_ALIGN" }), {
      params: Promise.resolve({ id: "qn-1", itemId: "item-1" }),
    });
    expect(res.status).toBe(400);
    expect(resolveSvc.executeContradictionResolve).not.toHaveBeenCalled();
  });

  it("calls execute with FALSE_POSITIVE and records DISMISSED audit", async () => {
    vi.mocked(resolveSvc.executeContradictionResolve).mockResolvedValueOnce({
      resultId: "cr-1",
      previousResolutionStatus: "PENDING",
      primaryAuditMetadata: {
        questionnaireId: "qn-1",
        questionnaireItemId: "item-1",
        contradictionResultId: "cr-1",
        resolutionAction: "FALSE_POSITIVE",
        resolutionNotePreview: "Detector misfired",
      },
      postEditDetectedMetadata: null,
    });
    const res = await POST(
      makeRequest({ action: "FALSE_POSITIVE", resolutionNote: "Detector misfired on wording." }),
      { params: Promise.resolve({ id: "qn-1", itemId: "item-1" }) },
    );
    expect(res.status).toBe(200);
    expect(resolveSvc.executeContradictionResolve).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        questionnaireId: "qn-1",
        questionnaireItemId: "item-1",
        body: expect.objectContaining({
          action: "FALSE_POSITIVE",
          resolutionNote: "Detector misfired on wording.",
        }),
      }),
    );
    expect(recordAuditEventSafe).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: AUDIT_EVENT_TYPES.QUESTIONNAIRE_ITEM_CONTRADICTION_DISMISSED,
        objectId: "item-1",
        metadata: expect.objectContaining({
          questionnaireId: "qn-1",
          questionnaireItemId: "item-1",
          contradictionResultId: "cr-1",
          resolutionAction: "FALSE_POSITIVE",
        }),
      }),
    );
  });

  it("calls execute with KEEP_ROW and records RESOLVED audit", async () => {
    const res = await POST(
      makeRequest({
        action: "KEEP_ROW",
        resultId: "cr-1",
        overrideReasonCategory: "WORDING_CLARIFICATION",
        overrideComment: "Buyer wording",
      }),
      { params: Promise.resolve({ id: "qn-1", itemId: "item-1" }) },
    );
    expect(res.status).toBe(200);
    expect(resolveSvc.executeContradictionResolve).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          action: "KEEP_ROW",
          overrideReasonCategory: "WORDING_CLARIFICATION",
        }),
      }),
    );
    expect(recordAuditEventSafe).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: AUDIT_EVENT_TYPES.QUESTIONNAIRE_ITEM_CONTRADICTION_RESOLVED,
        metadata: expect.objectContaining({
          questionnaireItemId: "item-1",
          contradictionResultId: "cr-1",
          resolutionAction: "KEEP_ROW",
        }),
      }),
    );
  });

  it("calls execute with REQUEST_CANONICAL_UPDATE and records CANONICAL_UPDATE_REQUESTED", async () => {
    vi.mocked(resolveSvc.executeContradictionResolve).mockResolvedValueOnce({
      resultId: "cr-1",
      previousResolutionStatus: "PENDING",
      primaryAuditMetadata: {
        questionnaireId: "qn-1",
        questionnaireItemId: "item-1",
        contradictionResultId: "cr-1",
        resolutionAction: "REQUEST_CANONICAL_UPDATE",
      },
      postEditDetectedMetadata: null,
    });
    const res = await POST(
      makeRequest({
        action: "REQUEST_CANONICAL_UPDATE",
        overrideReasonCategory: "LEGAL_REQUIRED_CHANGE",
        overrideComment: "Policy text is outdated",
      }),
      { params: Promise.resolve({ id: "qn-1", itemId: "item-1" }) },
    );
    expect(res.status).toBe(200);
    expect(resolveSvc.executeContradictionResolve).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ action: "REQUEST_CANONICAL_UPDATE" }),
      }),
    );
    expect(recordAuditEventSafe).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: AUDIT_EVENT_TYPES.QUESTIONNAIRE_ITEM_CANONICAL_UPDATE_REQUESTED,
        metadata: expect.objectContaining({
          questionnaireItemId: "item-1",
          contradictionResultId: "cr-1",
        }),
      }),
    );
  });

  it("calls execute with EDIT_ROW_ALIGN and records RESOLVED plus DETECTED when still conflicting", async () => {
    vi.mocked(resolveSvc.executeContradictionResolve).mockResolvedValueOnce({
      resultId: "cr-1",
      previousResolutionStatus: "PENDING",
      primaryAuditMetadata: {
        questionnaireId: "qn-1",
        questionnaireItemId: "item-1",
        contradictionResultId: "cr-1",
        resolutionAction: "EDIT_ROW_ALIGN",
        outcome: "still_conflicting_reopened",
        contradictionFoundAfter: true,
      },
      postEditDetectedMetadata: {
        questionnaireId: "qn-1",
        questionnaireItemId: "item-1",
        contradictionResultId: "cr-1",
        detectedReason: "still_conflicting_after_edit",
      },
    });
    const res = await POST(
      makeRequest({
        action: "EDIT_ROW_ALIGN",
        finalAnswer: "Aligned canonical-aligned answer text.",
      }),
      { params: Promise.resolve({ id: "qn-1", itemId: "item-1" }) },
    );
    expect(res.status).toBe(200);
    expect(resolveSvc.executeContradictionResolve).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          action: "EDIT_ROW_ALIGN",
          finalAnswer: "Aligned canonical-aligned answer text.",
        }),
      }),
    );
    const calls = vi.mocked(recordAuditEventSafe).mock.calls.map((c) => c[0]);
    expect(calls.some((c) => c.eventType === AUDIT_EVENT_TYPES.QUESTIONNAIRE_ITEM_CONTRADICTION_RESOLVED)).toBe(
      true,
    );
    expect(calls.some((c) => c.eventType === AUDIT_EVENT_TYPES.QUESTIONNAIRE_ITEM_CONTRADICTION_DETECTED)).toBe(
      true,
    );
  });

  it("maps ContradictionResolveError to response status", async () => {
    vi.mocked(resolveSvc.executeContradictionResolve).mockRejectedValueOnce(
      new resolveSvc.ContradictionResolveError("CONFLICT", "Already resolved", 409),
    );
    const res = await POST(
      makeRequest({ action: "FALSE_POSITIVE", resolutionNote: "ok" }),
      { params: Promise.resolve({ id: "qn-1", itemId: "item-1" }) },
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error?.code).toBe("CONFLICT");
  });
});
