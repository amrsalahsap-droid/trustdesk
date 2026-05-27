import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/audit", () => ({
  recordAuditEventSafe: vi.fn(),
}));

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({}),
    }),
  );
});

import { OnboardingCTAHandler } from "@/app/onboarding/components/onboarding-cta-handler";

describe("OnboardingCTAHandler invite_reviewer", () => {
  it("returns open_modal_invite with suggestedRole and does not redirect", async () => {
    const handler = OnboardingCTAHandler.getInstance();
    const result = await handler.handleAction(
      {
        type: "invite_reviewer",
        title: "Invite",
        description: "",
        actionLabel: "Invite",
        priority: "HIGH",
        reason: "",
        linkedRecommendationIds: ["configure_approval_workflow"],
      },
      {
        workspaceId: "ws-1",
        userId: "user-1",
        recommendationId: "configure_approval_workflow",
        metadata: { suggestedRole: "APPROVER" },
      },
    );

    expect(result.success).toBe(true);
    expect(result.nextAction).toBe("open_modal_invite");
    expect(result.metadata?.recommendationId).toBe("configure_approval_workflow");
    expect(result.metadata?.suggestedRole).toBe("APPROVER");
    expect(result.shouldRedirect).toBeUndefined();
    expect(result.redirectUrl).toBeUndefined();
  });

  it("maps recommendation invite_reviewer to handler action type", () => {
    expect(OnboardingCTAHandler.mapRecommendationAction("invite_reviewer")).toBe("invite_reviewer");
  });

  it("upload_evidence preserves linkedTopicKeys from metadata for evidence modal", async () => {
    const handler = OnboardingCTAHandler.getInstance();
    const result = await handler.handleAction(
      {
        type: "upload_evidence",
        title: "Upload",
        description: "",
        actionLabel: "Upload",
        priority: "MEDIUM",
        reason: "",
      },
      {
        workspaceId: "ws-1",
        userId: "user-1",
        recommendationId: "soc2",
        metadata: {
          topicKeys: ["security"],
          documentType: "soc2_report",
          evidenceCategory: "Compliance",
        },
        topicKeys: ["security"],
      },
    );

    expect(result.success).toBe(true);
    expect(result.nextAction).toBe("open_modal_evidence");
    expect(result.metadata?.linkedTopicKeys).toEqual(["security"]);
  });
});
