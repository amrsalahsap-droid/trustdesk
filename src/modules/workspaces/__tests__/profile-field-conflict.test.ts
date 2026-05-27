import { describe, it, expect, beforeEach, vi } from "vitest";
import { ProfileFieldStatus, ProfileFieldSourceType } from "@prisma/client";
import {
  ProfileFieldService,
  CONFLICT_DETECTION_THRESHOLD,
  LOW_CONFIDENCE_THRESHOLD,
  type ProfileFieldInput,
} from "../profile-field-service";
import { prisma } from "@/lib/db/prisma";
import type { Signal, SignalCandidate } from "../onboarding/website-analysis-service";

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
    SIGNAL_CONFIRMED: "SIGNAL_CONFIRMED",
    SIGNAL_REJECTED: "SIGNAL_REJECTED",
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

describe("Conflict Detection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("signalsToFieldInputs conflict detection", () => {
    it("marks field as conflicted when top two candidates have equal confidence", () => {
      const candidates: SignalCandidate<string>[] = [
        { value: "software", confidence: 0.75, sources: [] },
        { value: "healthtech", confidence: 0.75, sources: [] },
      ];

      const signal: Signal<string> = {
        value: "software",
        category: "DERIVED",
        confidence: 0.75,
        candidates,
      };

      const profile = { industry: signal };
      const fields = ProfileFieldService.signalsToFieldInputs(profile);

      expect(fields).toHaveLength(1);
      expect(fields[0].fieldKey).toBe("industry");
      expect(fields[0].status).toBe(ProfileFieldStatus.NEEDS_REVIEW);
      expect(fields[0].sourceType).toBe(ProfileFieldSourceType.CONFLICTED);
      expect(fields[0].conflictInfo).toMatchObject({
        hasConflict: true,
        rival: { value: "healthtech", confidence: 0.75 },
      });
      expect(fields[0].candidates).toEqual(candidates);
    });

    it("marks field as conflicted when confidence gap is within threshold (10-15%)", () => {
      const candidates: SignalCandidate<string>[] = [
        { value: "software", confidence: 0.80, sources: [] },
        { value: "fintech", confidence: 0.70, sources: [] }, // 10% gap
      ];

      const signal: Signal<string> = {
        value: "software",
        category: "OBSERVED",
        confidence: 0.80,
        candidates,
      };

      const profile = { industry: signal };
      const fields = ProfileFieldService.signalsToFieldInputs(profile);

      expect(fields[0].status).toBe(ProfileFieldStatus.NEEDS_REVIEW);
      expect(fields[0].sourceType).toBe(ProfileFieldSourceType.CONFLICTED);
      const gap = candidates[0].confidence - candidates[1].confidence;
      expect(gap).toBe(0.10); // Within 15% threshold
    });

    it("marks field as conflicted when confidence gap is at threshold boundary (15%)", () => {
      const candidates: SignalCandidate<string>[] = [
        { value: "software", confidence: 0.75, sources: [] },
        { value: "ecommerce", confidence: 0.60, sources: [] }, // Exactly 15% gap
      ];

      const signal: Signal<string> = {
        value: "software",
        category: "DERIVED",
        confidence: 0.75,
        candidates,
      };

      const profile = { industry: signal };
      const fields = ProfileFieldService.signalsToFieldInputs(profile);

      // 15% gap is within threshold (0.15), so it's a conflict
      expect(fields[0].status).toBe(ProfileFieldStatus.NEEDS_REVIEW);
      expect(fields[0].sourceType).toBe(ProfileFieldSourceType.CONFLICTED);
    });

    it("does NOT mark as conflicted when clear winner (gap > threshold)", () => {
      const candidates: SignalCandidate<string>[] = [
        { value: "software", confidence: 0.85, sources: [] },
        { value: "healthtech", confidence: 0.65, sources: [] }, // 20% gap
      ];

      const signal: Signal<string> = {
        value: "software",
        category: "OBSERVED",
        confidence: 0.85,
        candidates,
      };

      const profile = { industry: signal };
      const fields = ProfileFieldService.signalsToFieldInputs(profile);

      expect(fields[0].status).toBe(ProfileFieldStatus.SUGGESTED);
      expect(fields[0].sourceType).toBe(ProfileFieldSourceType.OBSERVED);
      expect(fields[0].conflictInfo).toBeUndefined();
    });

    it("does NOT mark as conflicted when runner-up is same value as primary", () => {
      const candidates: SignalCandidate<string>[] = [
        { value: "software", confidence: 0.80, sources: [] },
        { value: "software", confidence: 0.75, sources: [] }, // Same value, different source
      ];

      const signal: Signal<string> = {
        value: "software",
        category: "OBSERVED",
        confidence: 0.80,
        candidates,
      };

      const profile = { industry: signal };
      const fields = ProfileFieldService.signalsToFieldInputs(profile);

      // Should not be conflicted since both candidates are the same value
      expect(fields[0].status).toBe(ProfileFieldStatus.SUGGESTED);
      expect(fields[0].sourceType).toBe(ProfileFieldSourceType.OBSERVED);
    });

    it("does NOT mark as conflicted with only one candidate", () => {
      const candidates: SignalCandidate<string>[] = [
        { value: "software", confidence: 0.75, sources: [] },
      ];

      const signal: Signal<string> = {
        value: "software",
        category: "OBSERVED",
        confidence: 0.75,
        candidates,
      };

      const profile = { industry: signal };
      const fields = ProfileFieldService.signalsToFieldInputs(profile);

      expect(fields[0].status).toBe(ProfileFieldStatus.SUGGESTED);
      expect(fields[0].sourceType).toBe(ProfileFieldSourceType.OBSERVED);
    });

    it("marks field as needs_review when low confidence (< 40%)", () => {
      const signal: Signal<string> = {
        value: "software",
        category: "HYPOTHESIZED",
        confidence: 0.35, // Below 40% threshold
      };

      const profile = { industry: signal };
      const fields = ProfileFieldService.signalsToFieldInputs(profile);

      expect(fields[0].status).toBe(ProfileFieldStatus.NEEDS_REVIEW);
    });

    it("marks field as needs_review when borderline low confidence", () => {
      const signal: Signal<string> = {
        value: "software",
        category: "HYPOTHESIZED",
        confidence: 0.39, // Just below 40% threshold
      };

      const profile = { industry: signal };
      const fields = ProfileFieldService.signalsToFieldInputs(profile);

      expect(fields[0].status).toBe(ProfileFieldStatus.NEEDS_REVIEW);
    });

    it("preserves suggested status for high confidence with candidates", () => {
      const candidates: SignalCandidate<string>[] = [
        { value: "software", confidence: 0.85, sources: [] },
        { value: "fintech", confidence: 0.60, sources: [] }, // 25% gap, clear winner
      ];

      const signal: Signal<string> = {
        value: "software",
        category: "OBSERVED",
        confidence: 0.85,
        candidates,
      };

      const profile = { industry: signal };
      const fields = ProfileFieldService.signalsToFieldInputs(profile);

      expect(fields[0].status).toBe(ProfileFieldStatus.SUGGESTED);
      expect(fields[0].sourceType).toBe(ProfileFieldSourceType.OBSERVED);
    });

    it("preserves existing conflict info from signal if no candidate conflict", () => {
      const signal: Signal<string> = {
        value: "software",
        category: "CONFLICTED",
        confidence: 0.70,
        conflict: { hasConflict: true },
      };

      const profile = { industry: signal };
      const fields = ProfileFieldService.signalsToFieldInputs(profile);

      expect(fields[0].conflictInfo).toEqual({ hasConflict: true });
      expect(fields[0].status).toBe(ProfileFieldStatus.NEEDS_REVIEW);
    });
  });

  describe("confirmAllSafeFields", () => {
    it("confirms only non-conflicted fields", async () => {
      vi.mocked(prisma.workspaceProfileField.findMany).mockResolvedValue([
        {
          fieldKey: "industry",
          suggestedValue: ["software"],
          status: ProfileFieldStatus.SUGGESTED,
          sourceType: ProfileFieldSourceType.OBSERVED,
          conflictInfo: null,
        },
        {
          fieldKey: "productType",
          suggestedValue: ["saas"],
          status: ProfileFieldStatus.NEEDS_REVIEW,
          sourceType: ProfileFieldSourceType.CONFLICTED,
          conflictInfo: { hasConflict: true, rival: { value: "mobile", confidence: 0.65 } },
        },
        {
          fieldKey: "customerSegment",
          suggestedValue: ["b2b"],
          status: ProfileFieldStatus.SUGGESTED,
          sourceType: ProfileFieldSourceType.OBSERVED,
          conflictInfo: null,
        },
      ] as any);

      vi.mocked(prisma.workspaceProfileField.update).mockResolvedValue({} as any);
      vi.mocked(prisma.workspace.update).mockResolvedValue({} as any);

      const result = await ProfileFieldService.confirmAllSafeFields("ws-123", "user-123");

      // Should confirm industry and customerSegment, skip productType
      expect(result.confirmed).toContain("industry");
      expect(result.confirmed).toContain("customerSegment");
      expect(result.skipped).toContain("productType");
      expect(result.confirmed).toHaveLength(2);
      expect(result.skipped).toHaveLength(1);

      // Verify only 2 confirmations were processed
      expect(prisma.workspaceProfileField.update).toHaveBeenCalledTimes(2);
    });

    it("skips all fields when all are conflicted", async () => {
      vi.mocked(prisma.workspaceProfileField.findMany).mockResolvedValue([
        {
          fieldKey: "industry",
          suggestedValue: ["software"],
          status: ProfileFieldStatus.NEEDS_REVIEW,
          sourceType: ProfileFieldSourceType.CONFLICTED,
          conflictInfo: { hasConflict: true },
        },
        {
          fieldKey: "productType",
          suggestedValue: ["saas"],
          status: ProfileFieldStatus.NEEDS_REVIEW,
          sourceType: ProfileFieldSourceType.CONFLICTED,
          conflictInfo: { hasConflict: true },
        },
      ] as any);

      const result = await ProfileFieldService.confirmAllSafeFields("ws-123", "user-123");

      expect(result.confirmed).toHaveLength(0);
      expect(result.skipped).toHaveLength(2);
      expect(prisma.workspaceProfileField.update).not.toHaveBeenCalled();
    });

    it("skips fields with NEEDS_REVIEW status even without conflict info", async () => {
      vi.mocked(prisma.workspaceProfileField.findMany).mockResolvedValue([
        {
          fieldKey: "industry",
          suggestedValue: ["software"],
          status: ProfileFieldStatus.NEEDS_REVIEW,
          sourceType: ProfileFieldSourceType.HYPOTHESIZED,
          conflictInfo: null, // Low confidence, no conflict info
        },
      ] as any);

      const result = await ProfileFieldService.confirmAllSafeFields("ws-123", "user-123");

      expect(result.confirmed).toHaveLength(0);
      expect(result.skipped).toContain("industry");
    });

    it("confirms all fields when none are conflicted", async () => {
      vi.mocked(prisma.workspaceProfileField.findMany).mockResolvedValue([
        {
          fieldKey: "industry",
          suggestedValue: ["software"],
          status: ProfileFieldStatus.SUGGESTED,
          sourceType: ProfileFieldSourceType.OBSERVED,
          conflictInfo: null,
        },
        {
          fieldKey: "productType",
          suggestedValue: ["saas"],
          status: ProfileFieldStatus.SUGGESTED,
          sourceType: ProfileFieldSourceType.DERIVED,
          conflictInfo: null,
        },
      ] as any);

      vi.mocked(prisma.workspaceProfileField.update).mockResolvedValue({} as any);
      vi.mocked(prisma.workspace.update).mockResolvedValue({} as any);

      const result = await ProfileFieldService.confirmAllSafeFields("ws-123", "user-123");

      expect(result.confirmed).toHaveLength(2);
      expect(result.skipped).toHaveLength(0);
      expect(prisma.workspaceProfileField.update).toHaveBeenCalledTimes(2);
    });
  });

  describe("getConfirmableFields", () => {
    it("returns only SUGGESTED status fields", async () => {
      vi.mocked(prisma.workspaceProfileField.findMany).mockResolvedValue([
        {
          fieldKey: "industry",
          status: ProfileFieldStatus.SUGGESTED,
          sourceType: ProfileFieldSourceType.OBSERVED,
          conflictInfo: null,
        },
        {
          fieldKey: "productType",
          status: ProfileFieldStatus.NEEDS_REVIEW,
          sourceType: ProfileFieldSourceType.CONFLICTED,
          conflictInfo: { hasConflict: true },
        },
      ] as any);

      const fields = await ProfileFieldService.getConfirmableFields("ws-123");

      expect(fields).toHaveLength(1);
      expect(fields[0].fieldKey).toBe("industry");
    });

    it("excludes fields with CONFLICTED source type", async () => {
      vi.mocked(prisma.workspaceProfileField.findMany).mockResolvedValue([
        {
          fieldKey: "industry",
          status: ProfileFieldStatus.SUGGESTED,
          sourceType: ProfileFieldSourceType.CONFLICTED,
          conflictInfo: null,
        },
      ] as any);

      const fields = await ProfileFieldService.getConfirmableFields("ws-123");

      expect(fields).toHaveLength(0);
    });
  });

  describe("Threshold constants", () => {
    it("has conflict detection threshold of 15%", () => {
      expect(CONFLICT_DETECTION_THRESHOLD).toBe(0.15);
    });

    it("has low confidence threshold of 40%", () => {
      expect(LOW_CONFIDENCE_THRESHOLD).toBe(0.4);
    });
  });
});
