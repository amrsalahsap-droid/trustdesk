import { describe, it, expect, beforeEach, vi } from "vitest";
import { ProfileFieldStatus, ProfileFieldSourceType } from "@prisma/client";
import { ProfileFieldService } from "../profile-field-service";
import { prisma } from "@/lib/db/prisma";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    workspaceProfileField: {
      upsert: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    workspace: {
      update: vi.fn(),
    },
    $transaction: vi.fn((ops) => Promise.all(ops)),
  },
}));

vi.mock("@/lib/audit", () => ({
  recordAuditEventSafe: vi.fn(),
  AUDIT_EVENT_TYPES: {
    WORKSPACE_PROFILE_UPDATED: "WORKSPACE_PROFILE_UPDATED",
  },
  AUDIT_OBJECT_TYPES: {
    WORKSPACE: "Workspace",
  },
}));

vi.mock("@/lib/logging/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

describe("ProfileFieldService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("storeSuggestions", () => {
    it("stores AI suggestions as provisional fields with SUGGESTED status", async () => {
      const workspaceId = "ws-123";
      const userId = "user-123";
      const fields = [
        {
          fieldKey: "industry" as const,
          suggestedValue: ["software"],
          confidence: 0.85,
          sourceType: ProfileFieldSourceType.OBSERVED,
          status: ProfileFieldStatus.SUGGESTED,
          citations: [
            { pageUrl: "https://example.com/about", pageType: "about", evidenceKind: "text", excerpt: "We are a software company" },
          ],
        },
        {
          fieldKey: "productType" as const,
          suggestedValue: ["saas"],
          confidence: 0.75,
          sourceType: ProfileFieldSourceType.DERIVED,
          status: ProfileFieldStatus.SUGGESTED,
        },
      ];

      vi.mocked(prisma.workspaceProfileField.upsert).mockResolvedValue({ id: "pf-1" } as any);

      await ProfileFieldService.storeSuggestions(workspaceId, userId, fields);

      expect(prisma.workspaceProfileField.upsert).toHaveBeenCalledTimes(2);
      
      // First call - industry
      expect(prisma.workspaceProfileField.upsert).toHaveBeenNthCalledWith(1, {
        where: { workspaceId_fieldKey: { workspaceId, fieldKey: "industry" } },
        create: expect.objectContaining({
          workspaceId,
          fieldKey: "industry",
          suggestedValue: ["software"],
          confidence: 0.85,
          confidenceBand: "high",
          sourceType: ProfileFieldSourceType.OBSERVED,
          status: ProfileFieldStatus.SUGGESTED,
        }),
        update: expect.objectContaining({
          suggestedValue: ["software"],
          confidence: 0.85,
          status: ProfileFieldStatus.SUGGESTED,
          confirmedValue: null,
          confirmedAt: null,
          rejectedAt: null,
        }),
      });
    });

    it("sets confidence band based on confidence score", async () => {
      const workspaceId = "ws-123";
      const fields = [
        { fieldKey: "industry" as const, suggestedValue: ["software"], confidence: 0.85, sourceType: ProfileFieldSourceType.OBSERVED, status: ProfileFieldStatus.SUGGESTED },
        { fieldKey: "productType" as const, suggestedValue: ["saas"], confidence: 0.55, sourceType: ProfileFieldSourceType.DERIVED, status: ProfileFieldStatus.SUGGESTED },
        { fieldKey: "dataTypes" as const, suggestedValue: ["pii"], confidence: 0.25, sourceType: ProfileFieldSourceType.HYPOTHESIZED, status: ProfileFieldStatus.NEEDS_REVIEW },
        { fieldKey: "complianceTargets" as const, suggestedValue: [], confidence: 0, sourceType: ProfileFieldSourceType.UNKNOWN, status: ProfileFieldStatus.NEEDS_REVIEW },
      ];

      vi.mocked(prisma.workspaceProfileField.upsert).mockResolvedValue({ id: "pf-1" } as any);

      await ProfileFieldService.storeSuggestions(workspaceId, "user-1", fields);

      const calls = vi.mocked(prisma.workspaceProfileField.upsert).mock.calls;
      
      expect(calls[0][0].create.confidenceBand).toBe("high");    // 0.85
      expect(calls[1][0].create.confidenceBand).toBe("medium"); // 0.55
      expect(calls[2][0].create.confidenceBand).toBe("low");    // 0.25
      expect(calls[3][0].create.confidenceBand).toBe("none");    // 0
    });
  });

  describe("confirmFields", () => {
    it("confirms a field with CONFIRMED status and records confirmed value", async () => {
      const workspaceId = "ws-123";
      const userId = "user-123";
      const confirmations = [
        {
          fieldKey: "industry" as const,
          confirmedValue: ["software"],
          status: ProfileFieldStatus.CONFIRMED,
        },
      ];

      vi.mocked(prisma.workspaceProfileField.update).mockResolvedValue({ id: "pf-1" } as any);
      vi.mocked(prisma.workspaceProfileField.findMany).mockResolvedValue([]);

      await ProfileFieldService.confirmFields(workspaceId, userId, confirmations);

      expect(prisma.workspaceProfileField.update).toHaveBeenCalledWith({
        where: { workspaceId_fieldKey: { workspaceId, fieldKey: "industry" } },
        data: expect.objectContaining({
          confirmedValue: ["software"],
          status: ProfileFieldStatus.CONFIRMED,
          confirmedAt: expect.any(Date),
          rejectedAt: null,
        }),
      });
    });

    it("edits a field with EDITED status and marks source as MANUAL", async () => {
      const workspaceId = "ws-123";
      const userId = "user-123";
      const confirmations = [
        {
          fieldKey: "industry" as const,
          confirmedValue: ["fintech"], // User changed from suggested "software"
          status: ProfileFieldStatus.EDITED,
        },
      ];

      vi.mocked(prisma.workspaceProfileField.update).mockResolvedValue({ id: "pf-1" } as any);
      vi.mocked(prisma.workspaceProfileField.findMany).mockResolvedValue([]);

      await ProfileFieldService.confirmFields(workspaceId, userId, confirmations);

      expect(prisma.workspaceProfileField.update).toHaveBeenCalledWith({
        where: { workspaceId_fieldKey: { workspaceId, fieldKey: "industry" } },
        data: expect.objectContaining({
          confirmedValue: ["fintech"],
          status: ProfileFieldStatus.EDITED,
          sourceType: ProfileFieldSourceType.MANUAL,
          confirmedAt: expect.any(Date),
          rejectedAt: null,
        }),
      });
    });

    it("rejects a field with REJECTED status and records rejectedAt", async () => {
      const workspaceId = "ws-123";
      const userId = "user-123";
      const confirmations = [
        {
          fieldKey: "complianceTargets" as const,
          confirmedValue: null,
          status: ProfileFieldStatus.REJECTED,
        },
      ];

      vi.mocked(prisma.workspaceProfileField.update).mockResolvedValue({ id: "pf-1" } as any);
      vi.mocked(prisma.workspaceProfileField.findMany).mockResolvedValue([]);

      await ProfileFieldService.confirmFields(workspaceId, userId, confirmations);

      expect(prisma.workspaceProfileField.update).toHaveBeenCalledWith({
        where: { workspaceId_fieldKey: { workspaceId, fieldKey: "complianceTargets" } },
        data: expect.objectContaining({
          confirmedValue: null,
          status: ProfileFieldStatus.REJECTED,
          confirmedAt: null,
          rejectedAt: expect.any(Date),
        }),
      });
    });
  });

  describe("syncConfirmedValuesToWorkspace", () => {
    it("syncs confirmed field values to workspace scalars", async () => {
      const workspaceId = "ws-123";
      
      vi.mocked(prisma.workspaceProfileField.findMany).mockResolvedValue([
        { fieldKey: "industry", confirmedValue: ["software"], status: ProfileFieldStatus.CONFIRMED },
        { fieldKey: "productType", confirmedValue: ["saas"], status: ProfileFieldStatus.EDITED },
        { fieldKey: "complianceTargets", confirmedValue: ["soc2"], status: ProfileFieldStatus.CONFIRMED },
      ] as any);

      await ProfileFieldService.syncConfirmedValuesToWorkspace(workspaceId);

      expect(prisma.workspace.update).toHaveBeenCalledWith({
        where: { id: workspaceId },
        data: {
          industry: ["software"],
          productType: ["saas"],
          complianceTargets: ["soc2"],
        },
      });
    });

    it("does not update workspace when no confirmed fields", async () => {
      const workspaceId = "ws-123";
      
      vi.mocked(prisma.workspaceProfileField.findMany).mockResolvedValue([]);

      await ProfileFieldService.syncConfirmedValuesToWorkspace(workspaceId);

      expect(prisma.workspace.update).not.toHaveBeenCalled();
    });
  });

  describe("getFields", () => {
    it("returns all fields for a workspace", async () => {
      const workspaceId = "ws-123";
      
      vi.mocked(prisma.workspaceProfileField.findMany).mockResolvedValue([
        { id: "pf-1", fieldKey: "industry", status: ProfileFieldStatus.SUGGESTED, confidence: 0.8, sourceType: ProfileFieldSourceType.OBSERVED, createdAt: new Date(), updatedAt: new Date() },
        { id: "pf-2", fieldKey: "productType", status: ProfileFieldStatus.CONFIRMED, confidence: 0.7, sourceType: ProfileFieldSourceType.DERIVED, createdAt: new Date(), updatedAt: new Date() },
      ] as any);

      const fields = await ProfileFieldService.getFields(workspaceId);

      expect(fields).toHaveLength(2);
      expect(fields[0].fieldKey).toBe("industry");
      expect(fields[0].status).toBe(ProfileFieldStatus.SUGGESTED);
      expect(fields[1].fieldKey).toBe("productType");
      expect(fields[1].status).toBe(ProfileFieldStatus.CONFIRMED);
    });

    it("filters by status when provided", async () => {
      const workspaceId = "ws-123";
      
      vi.mocked(prisma.workspaceProfileField.findMany).mockResolvedValue([
        { id: "pf-1", fieldKey: "industry", status: ProfileFieldStatus.SUGGESTED },
      ] as any);

      await ProfileFieldService.getFields(workspaceId, { status: [ProfileFieldStatus.SUGGESTED] });

      expect(prisma.workspaceProfileField.findMany).toHaveBeenCalledWith({
        where: { workspaceId, status: { in: [ProfileFieldStatus.SUGGESTED] } },
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      });
    });
  });

  describe("getConfirmedValues", () => {
    it("returns only confirmed and edited field values", async () => {
      const workspaceId = "ws-123";
      
      vi.mocked(prisma.workspaceProfileField.findMany).mockResolvedValue([
        { fieldKey: "industry", confirmedValue: ["software"], status: ProfileFieldStatus.CONFIRMED },
        { fieldKey: "productType", confirmedValue: ["saas"], status: ProfileFieldStatus.EDITED },
        { fieldKey: "dataTypes", confirmedValue: null, status: ProfileFieldStatus.SUGGESTED }, // Should not be included
      ] as any);

      const values = await ProfileFieldService.getConfirmedValues(workspaceId);

      expect(values).toEqual({
        industry: ["software"],
        productType: ["saas"],
      });
    });
  });

  describe("hasUnconfirmedFields", () => {
    it("returns true when SUGGESTED fields exist", async () => {
      vi.mocked(prisma.workspaceProfileField.count).mockResolvedValue(2);

      const result = await ProfileFieldService.hasUnconfirmedFields("ws-123");

      expect(result).toBe(true);
    });

    it("returns true when NEEDS_REVIEW fields exist", async () => {
      vi.mocked(prisma.workspaceProfileField.count).mockResolvedValue(1);

      const result = await ProfileFieldService.hasUnconfirmedFields("ws-123");

      expect(result).toBe(true);
    });

    it("returns false when all fields are confirmed/rejected", async () => {
      vi.mocked(prisma.workspaceProfileField.count).mockResolvedValue(0);

      const result = await ProfileFieldService.hasUnconfirmedFields("ws-123");

      expect(result).toBe(false);
    });
  });

  describe("signalsToFieldInputs", () => {
    it("converts AI signals to profile field inputs", () => {
      const profile = {
        industry: { value: "software", category: "OBSERVED", confidence: 0.85, citations: [{ pageUrl: "https://example.com/about", pageType: "about", evidenceKind: "text" }] },
        productType: { value: "saas", category: "DERIVED", confidence: 0.75 },
        complianceSignals: { value: ["soc2", "iso27001"], category: "HYPOTHESIZED", confidence: 0.45 },
      };

      const inputs = ProfileFieldService.signalsToFieldInputs(profile);

      expect(inputs).toHaveLength(3);
      
      const industryInput = inputs.find((i) => i.fieldKey === "industry");
      expect(industryInput).toMatchObject({
        suggestedValue: ["software"],
        confidence: 0.85,
        sourceType: ProfileFieldSourceType.OBSERVED,
      });

      const productTypeInput = inputs.find((i) => i.fieldKey === "productType");
      expect(productTypeInput).toMatchObject({
        suggestedValue: ["saas"],
        confidence: 0.75,
        sourceType: ProfileFieldSourceType.DERIVED,
      });

      const complianceInput = inputs.find((i) => i.fieldKey === "complianceSignals");
      expect(complianceInput).toMatchObject({
        suggestedValue: ["soc2", "iso27001"],
        confidence: 0.45,
        sourceType: ProfileFieldSourceType.HYPOTHESIZED,
      });
    });

    it("normalizes string values to arrays", () => {
      const profile = {
        industry: { value: "software", category: "OBSERVED", confidence: 0.8 },
      };

      const inputs = ProfileFieldService.signalsToFieldInputs(profile);

      expect(inputs[0].suggestedValue).toEqual(["software"]);
    });

    it("preserves array values", () => {
      const profile = {
        dataTypes: { value: ["pii", "financial"], category: "OBSERVED", confidence: 0.9 },
      };

      const inputs = ProfileFieldService.signalsToFieldInputs(profile);

      expect(inputs[0].suggestedValue).toEqual(["pii", "financial"]);
    });

    it("includes conflict info when present", () => {
      const profile = {
        industry: {
          value: "software",
          category: "CONFLICTED",
          confidence: 0.6,
          conflict: { hasConflict: true, rival: { value: "fintech", confidence: 0.55, sources: [] } },
        },
      };

      const inputs = ProfileFieldService.signalsToFieldInputs(profile);

      expect(inputs[0].sourceType).toBe(ProfileFieldSourceType.CONFLICTED);
      expect(inputs[0].conflictInfo).toEqual(profile.industry.conflict);
    });
  });
});
