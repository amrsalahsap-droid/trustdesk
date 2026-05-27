/**
 * Onboarding Review Screen Central Interaction Model
 * Centralizes state management, action handling, and analytics constants for all CTAs.
 */

// 1. Overlay & Context Types
export type ReviewDrawerType = "intelligence_explorer" | "remediation_details" | "profile_review" | null;
export type ReviewModalType = "evidence_upload" | "profile_confirm" | "create_review_workspace_confirm" | "reanalyze_confirm" | null;

export interface EvidenceUploadContext {
  expectedDocumentType?: string;
  onboardingSessionId?: string;
  title?: string;
  relatedPillar?: string;
  whyItMatters?: string;
  suggestedSources?: string[];
  relatedTopics?: string[];
  relatedRisks?: string[];
  remediationTaskId?: string;
  [key: string]: unknown;
}

export interface RemediationTarget {
  taskId: string;
  title: string;
  description: string;
  priority?: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  relatedPillar?: string;
  relatedRisks?: string[];
  whyItMatters?: string;
  procurementBlockerImpact?: string;
  requestedEvidence?: string[];
  whatItUnlocks?: string;
  confidenceDelta?: number;
  sourceRationale?: string;
  relatedTopicKeys?: string[];
  [key: string]: unknown;
}

export type ExplorerTabId =
  | "source-pages"
  | "evidence-snippets"
  | "capabilities"
  | "workflows"
  | "risks"
  | "trust-topics"
  | "evidence-needs"
  | "buyer-questions"
  | "diagnostics";

export interface ExplorerFilterContext {
  pillarKey?: string;
  riskKey?: string;
  topicKey?: string;
  taskKey?: string;
  evidenceNeedId?: string;
  capabilityKey?: string;
  workflowKey?: string;
  questionId?: string;
  initialTab?: ExplorerTabId;
  highlightId?: string;
  [key: string]: unknown;
}

export interface RiskDetailContext {
  riskKey: string;
  label: string;
  severity: string;
  [key: string]: any;
}

export interface BuyerQuestionContext {
  questionId: string;
  question: string;
  concernDomain: string;
  [key: string]: any;
}

// 2. Central Interaction State Interface
export interface ReviewInteractionState {
  // Overlays
  activeDrawer: ReviewDrawerType;
  activeModal: ReviewModalType;

  // Selected entities (Targeting/Tracking)
  selectedEvidenceNeed: string | null;
  selectedRisk: string | null;
  selectedPillar: string | null;
  selectedCapability: string | null;
  selectedQuestion: string | null;
  selectedWorkflow: string | null;

  // Associated Context Metadata
  explorerFilters: ExplorerFilterContext | null;
  uploadContext: EvidenceUploadContext | null;
  remediationTarget: RemediationTarget | null;
  riskDetailContext: RiskDetailContext | null;
  buyerQuestionContext: BuyerQuestionContext | null;

  // Global Action/CTA States
  loadingAction: string | null; // e.g. "initializing_workspace"
  lastActionError: string | null;
}

// Initial State Definition
export const initialReviewInteractionState: ReviewInteractionState = {
  activeDrawer: null,
  activeModal: null,
  selectedEvidenceNeed: null,
  selectedRisk: null,
  selectedPillar: null,
  selectedCapability: null,
  selectedQuestion: null,
  selectedWorkflow: null,
  explorerFilters: null,
  uploadContext: null,
  remediationTarget: null,
  riskDetailContext: null,
  buyerQuestionContext: null,
  loadingAction: null,
  lastActionError: null,
};

// 3. Analytics Event Naming Constants
export const OnboardingAnalytics = {
  EXPLORER_OPENED: "onboarding.explorer.opened",
  EXPLORER_CLOSED: "onboarding.explorer.closed",
  EVIDENCE_ADD_CLICKED: "onboarding.evidence.add_clicked",
  EVIDENCE_MARK_UNAVAILABLE: "onboarding.evidence.mark_unavailable",
  RISK_REVIEW_DETAILS_OPENED: "onboarding.risk.review_details_opened",
  WORKSPACE_CREATE_REVIEW_STARTED: "onboarding.workspace.create_review_started",
  REMEDIATION_CLICKED: "onboarding.remediation.remediate_clicked",
  WORKFLOW_TAB_SWAPPED: "onboarding.workflow.tab_swapped",
  BUYER_FILTER_CHANGED: "onboarding.buyer.filter_changed",
  STEP_TRANSITION: "onboarding.flow.step_transition",
} as const;

// 4. Action Type System
export type ReviewInteractionAction =
  | { type: "OPEN_DRAWER"; drawerType: "intelligence_explorer"; context?: ExplorerFilterContext | null }
  | { type: "OPEN_DRAWER"; drawerType: "remediation_details"; context: RemediationTarget }
  | { type: "OPEN_DRAWER"; drawerType: "profile_review" }
  | { type: "OPEN_MODAL"; modalType: "evidence_upload"; context?: EvidenceUploadContext | null }
  | { type: "OPEN_MODAL"; modalType: "profile_confirm" }
  | { type: "OPEN_MODAL"; modalType: "create_review_workspace_confirm" }
  | { type: "OPEN_MODAL"; modalType: "reanalyze_confirm" }
  | { type: "CLOSE_INTERACTION" }
  | { type: "SELECT_EVIDENCE_NEED"; needTitle: string | null }
  | { type: "SELECT_RISK"; riskKey: string | null; context?: RiskDetailContext | null }
  | { type: "SELECT_PILLAR"; pillarKey: string | null }
  | { type: "SELECT_CAPABILITY"; capabilityKey: string | null }
  | { type: "SELECT_QUESTION"; questionId: string | null; context?: BuyerQuestionContext | null }
  | { type: "SELECT_WORKFLOW"; workflowId: string | null }
  | { type: "START_ACTION"; loadingAction: string }
  | { type: "ACTION_SUCCESS" }
  | { type: "ACTION_ERROR"; error: string };

// 5. Central State Reducer Logic
export function reviewInteractionReducer(
  state: ReviewInteractionState,
  action: ReviewInteractionAction
): ReviewInteractionState {
  switch (action.type) {
    case "OPEN_DRAWER":
      if (action.drawerType === "intelligence_explorer") {
        return {
          ...state,
          activeDrawer: "intelligence_explorer",
          activeModal: null, // Keep UI clean by closing active modal
          explorerFilters: action.context || null,
        };
      }
      if (action.drawerType === "remediation_details") {
        return {
          ...state,
          activeDrawer: "remediation_details",
          activeModal: null,
          remediationTarget: action.context,
        };
      }
      if (action.drawerType === "profile_review") {
        return {
          ...state,
          activeDrawer: "profile_review",
          activeModal: null,
        };
      }
      return state;

    case "OPEN_MODAL":
      if (action.modalType === "evidence_upload") {
        return {
          ...state,
          activeModal: "evidence_upload",
          activeDrawer: null, // Keep UI clean by closing active drawer
          uploadContext: action.context || null,
        };
      }
      if (action.modalType === "profile_confirm") {
        return {
          ...state,
          activeModal: "profile_confirm",
          activeDrawer: null,
        };
      }
      if (action.modalType === "create_review_workspace_confirm") {
        return {
          ...state,
          activeModal: "create_review_workspace_confirm",
          activeDrawer: null,
        };
      }
      if (action.modalType === "reanalyze_confirm") {
        return {
          ...state,
          activeModal: "reanalyze_confirm",
          activeDrawer: null,
        };
      }
      return state;

    case "CLOSE_INTERACTION":
      return {
        ...state,
        activeDrawer: null,
        activeModal: null,
        uploadContext: null,
        remediationTarget: null,
        explorerFilters: null,
        riskDetailContext: null,
        buyerQuestionContext: null,
      };

    case "SELECT_EVIDENCE_NEED":
      return {
        ...state,
        selectedEvidenceNeed: action.needTitle,
      };

    case "SELECT_RISK":
      return {
        ...state,
        selectedRisk: action.riskKey,
        riskDetailContext: action.context || null,
      };

    case "SELECT_PILLAR":
      return {
        ...state,
        selectedPillar: action.pillarKey,
      };

    case "SELECT_CAPABILITY":
      return {
        ...state,
        selectedCapability: action.capabilityKey,
      };

    case "SELECT_QUESTION":
      return {
        ...state,
        selectedQuestion: action.questionId,
        buyerQuestionContext: action.context || null,
      };

    case "SELECT_WORKFLOW":
      return {
        ...state,
        selectedWorkflow: action.workflowId,
      };

    case "START_ACTION":
      return {
        ...state,
        loadingAction: action.loadingAction,
        lastActionError: null,
      };

    case "ACTION_SUCCESS":
      return {
        ...state,
        loadingAction: null,
        lastActionError: null,
      };

    case "ACTION_ERROR":
      return {
        ...state,
        loadingAction: null,
        lastActionError: action.error,
      };

    default:
      return state;
  }
}
