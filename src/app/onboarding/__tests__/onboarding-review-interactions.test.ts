import { describe, it, expect } from "vitest";
import {
  reviewInteractionReducer,
  initialReviewInteractionState,
  ReviewInteractionState,
  ExplorerFilterContext,
  RemediationTarget,
  EvidenceUploadContext,
  RiskDetailContext,
  BuyerQuestionContext,
} from "../onboarding-review-interactions";

describe("Onboarding Review Interaction Reducer", () => {
  it("should return initial state by default", () => {
    // @ts-expect-error - Testing invalid action fallback
    const result = reviewInteractionReducer(initialReviewInteractionState, { type: "UNKNOWN_ACTION" });
    expect(result).toEqual(initialReviewInteractionState);
  });

  describe("Overlays & Drawer Interactions", () => {
    it("should handle OPEN_DRAWER for intelligence_explorer", () => {
      const context: ExplorerFilterContext = { pillarKey: "ai_security", riskKey: "ai_training" };
      const action = { type: "OPEN_DRAWER" as const, drawerType: "intelligence_explorer" as const, context };

      const state: ReviewInteractionState = {
        ...initialReviewInteractionState,
        activeModal: "evidence_upload", // Modal active before opening drawer
      };

      const result = reviewInteractionReducer(state, action);
      expect(result.activeDrawer).toBe("intelligence_explorer");
      expect(result.activeModal).toBeNull(); // Should close modal
      expect(result.explorerFilters).toEqual(context);
    });

    it("should handle OPEN_DRAWER for remediation_details", () => {
      const context: RemediationTarget = {
        taskId: "task_123",
        title: "Test Remediation",
        description: "Remediate this control details",
      };
      const action = { type: "OPEN_DRAWER" as const, drawerType: "remediation_details" as const, context };

      const result = reviewInteractionReducer(initialReviewInteractionState, action);
      expect(result.activeDrawer).toBe("remediation_details");
      expect(result.activeModal).toBeNull();
      expect(result.remediationTarget).toEqual(context);
    });
  });

  describe("Modal Interactions", () => {
    it("should handle OPEN_MODAL for evidence_upload", () => {
      const context: EvidenceUploadContext = { expectedDocumentType: "ai_policy" };
      const action = { type: "OPEN_MODAL" as const, modalType: "evidence_upload" as const, context };

      const state: ReviewInteractionState = {
        ...initialReviewInteractionState,
        activeDrawer: "intelligence_explorer", // Drawer active before opening modal
      };

      const result = reviewInteractionReducer(state, action);
      expect(result.activeModal).toBe("evidence_upload");
      expect(result.activeDrawer).toBeNull(); // Should close drawer
      expect(result.uploadContext).toEqual(context);
    });

    it("should handle OPEN_MODAL for profile_confirm", () => {
      const action = { type: "OPEN_MODAL" as const, modalType: "profile_confirm" as const };
      const result = reviewInteractionReducer(initialReviewInteractionState, action);
      expect(result.activeModal).toBe("profile_confirm");
      expect(result.activeDrawer).toBeNull();
    });

    it("should handle OPEN_MODAL for create_review_workspace_confirm", () => {
      const action = { type: "OPEN_MODAL" as const, modalType: "create_review_workspace_confirm" as const };
      const result = reviewInteractionReducer(initialReviewInteractionState, action);
      expect(result.activeModal).toBe("create_review_workspace_confirm");
      expect(result.activeDrawer).toBeNull();
    });
  });

  describe("Close Interaction & Cleanups", () => {
    it("should handle CLOSE_INTERACTION", () => {
      const action = { type: "CLOSE_INTERACTION" as const };
      const activeState: ReviewInteractionState = {
        activeDrawer: "intelligence_explorer",
        activeModal: "evidence_upload",
        selectedEvidenceNeed: "AI Policy",
        selectedRisk: "ai_risk",
        selectedPillar: "ai",
        selectedCapability: "audit",
        selectedQuestion: "q1",
        selectedWorkflow: "wf1",
        explorerFilters: { pillarKey: "ai" },
        uploadContext: { expectedDocumentType: "ai" },
        remediationTarget: { taskId: "task_1", title: "task", description: "desc" },
        riskDetailContext: { riskKey: "ai_risk", label: "AI", severity: "CRITICAL" },
        buyerQuestionContext: { questionId: "q1", question: "Q", concernDomain: "AI" },
        loadingAction: "loading",
        lastActionError: "err",
      };

      const result = reviewInteractionReducer(activeState, action);
      expect(result.activeDrawer).toBeNull();
      expect(result.activeModal).toBeNull();
      expect(result.explorerFilters).toBeNull();
      expect(result.uploadContext).toBeNull();
      expect(result.remediationTarget).toBeNull();
      expect(result.riskDetailContext).toBeNull();
      expect(result.buyerQuestionContext).toBeNull();

      // Keep selectors/loading state intact across overlays close as they aren't drawer-only bound
      expect(result.selectedRisk).toBe("ai_risk");
      expect(result.loadingAction).toBe("loading");
      expect(result.lastActionError).toBe("err");
    });
  });

  describe("Selection Targets", () => {
    it("should handle SELECT_EVIDENCE_NEED", () => {
      const action = { type: "SELECT_EVIDENCE_NEED" as const, needTitle: "SOC 2 Report" };
      const result = reviewInteractionReducer(initialReviewInteractionState, action);
      expect(result.selectedEvidenceNeed).toBe("SOC 2 Report");
    });

    it("should handle SELECT_RISK with context", () => {
      const context: RiskDetailContext = { riskKey: "tenant_isolation", label: "Isolation", severity: "CRITICAL" };
      const action = { type: "SELECT_RISK" as const, riskKey: "tenant_isolation", context };
      const result = reviewInteractionReducer(initialReviewInteractionState, action);
      expect(result.selectedRisk).toBe("tenant_isolation");
      expect(result.riskDetailContext).toEqual(context);
    });

    it("should handle SELECT_PILLAR", () => {
      const action = { type: "SELECT_PILLAR" as const, pillarKey: "cloud_sec" };
      const result = reviewInteractionReducer(initialReviewInteractionState, action);
      expect(result.selectedPillar).toBe("cloud_sec");
    });

    it("should handle SELECT_CAPABILITY", () => {
      const action = { type: "SELECT_CAPABILITY" as const, capabilityKey: "iam" };
      const result = reviewInteractionReducer(initialReviewInteractionState, action);
      expect(result.selectedCapability).toBe("iam");
    });

    it("should handle SELECT_QUESTION with context", () => {
      const context: BuyerQuestionContext = { questionId: "q_1", question: "Access Check?", concernDomain: "IAM" };
      const action = { type: "SELECT_QUESTION" as const, questionId: "q_1", context };
      const result = reviewInteractionReducer(initialReviewInteractionState, action);
      expect(result.selectedQuestion).toBe("q_1");
      expect(result.buyerQuestionContext).toEqual(context);
    });

    it("should handle SELECT_WORKFLOW", () => {
      const action = { type: "SELECT_WORKFLOW" as const, workflowId: "wf_monitoring" };
      const result = reviewInteractionReducer(initialReviewInteractionState, action);
      expect(result.selectedWorkflow).toBe("wf_monitoring");
    });
  });

  describe("Shared Action Lifecycle States", () => {
    it("should handle START_ACTION", () => {
      const action = { type: "START_ACTION" as const, loadingAction: "saving_profile" };
      const state: ReviewInteractionState = {
        ...initialReviewInteractionState,
        lastActionError: "old error",
      };

      const result = reviewInteractionReducer(state, action);
      expect(result.loadingAction).toBe("saving_profile");
      expect(result.lastActionError).toBeNull(); // Should clear old error
    });

    it("should handle ACTION_SUCCESS", () => {
      const action = { type: "ACTION_SUCCESS" as const };
      const state: ReviewInteractionState = {
        ...initialReviewInteractionState,
        loadingAction: "saving_profile",
        lastActionError: "old error",
      };

      const result = reviewInteractionReducer(state, action);
      expect(result.loadingAction).toBeNull();
      expect(result.lastActionError).toBeNull();
    });

    it("should handle ACTION_ERROR", () => {
      const action = { type: "ACTION_ERROR" as const, error: "Network timeout" };
      const state: ReviewInteractionState = {
        ...initialReviewInteractionState,
        loadingAction: "saving_profile",
      };

      const result = reviewInteractionReducer(state, action);
      expect(result.loadingAction).toBeNull();
      expect(result.lastActionError).toBe("Network timeout");
    });
  });
});
