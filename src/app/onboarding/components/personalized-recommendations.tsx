import React, { useState, useMemo } from "react";
import {
  CheckIcon,
  SparklesIcon,
  ShieldCheckIcon,
  FileIcon,
  SettingsIcon,
  AlertCircleIcon,
  ClockIcon,
  TopicIcon,
  BuildingIcon,
  FolderIcon,
  LockIcon,
  CloudIcon,
  ClipboardIcon,
  CloseIcon,
  ChevronRightIcon,
  ActivityIcon
} from "@/components/icons";
import { cn } from "@/lib/utils";
import type { Recommendation as BaseRecommendation, NextBestAction as BaseNextBestAction } from "@/modules/workspaces/onboarding/recommendation-metadata";
import { OnboardingCTAHandler } from "./onboarding-cta-handler";
import { TopicReviewModal } from "./topic-review-modal";
import { EvidenceUploadModal } from "./evidence-upload-modal";
import { ReviewerInviteModal } from "./reviewer-invite-modal";
import type { WorkspaceRole } from "@prisma/client";
import { 
  AppCard, 
  AppTypography, 
  AppIcon, 
  AppBadge, 
  AppSection, 
  AppContainer, 
  AppButton,
  AppMetaLabel
} from "@/components/ui/app-design-system/primitives";

type EvidenceEnterpriseCategory = "Compliance" | "Security Operations" | "Governance" | "Privacy" | "Infrastructure";
type EvidenceMaturityIndicator = "Recommended" | "Strongly recommended" | "Common enterprise requirement" | "Optional";

interface EvidenceMetadata {
  enterpriseCategory: EvidenceEnterpriseCategory;
  maturityIndicator: EvidenceMaturityIndicator;
  readinessHint?: string;
  supportedWorkflows: string[];
  supportedQuestionnaires: string[];
  businessValue: string;
  isUploaded?: boolean;
  verifiedAt?: string;
}

// Types matching the backend response
type Recommendation = {
  id: string;
  category: "trust_topics" | "evidence_uploads" | "workspace_configuration" | "questionnaire_readiness" | "trust_center_readiness" | "governance_maturity" | "next_best_actions";
  title: string;
  description: string;
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "OPTIONAL";
  score: number;
  confidence: number;
  confidenceBand: "high" | "medium" | "limited" | "low";
  needsReview: boolean;
  reviewReason?: string;
  recommendationReason: string;
  supportingSignals: Array<{
    field: string;
    value: string | string[];
    category: "OBSERVED" | "DERIVED" | "HYPOTHESIZED";
    confidence: number;
    citations?: Array<{
      pageUrl: string;
      pageType: string;
      evidenceKind: string;
      excerpt?: string;
    }>;
  }>;
  citations: Array<{
    pageUrl: string;
    pageType: string;
    evidenceKind: string;
    excerpt?: string;
  }>;
  onboardingStage: string;
  estimatedEffort?: string;
  estimatedImpact?: string;
  isMerged?: boolean;
  mergedFromIds?: string[];
  metadata?: {
    documentIds?: string[];
    topicKeys?: string[];
    configurationKeys?: string[];
    questionnaireTypes?: string[];
    workflowTypes?: string[];
    [key: string]: unknown;
  };
  evidenceMetadata?: EvidenceMetadata;
};

type RecommendationSummary = {
  total: number;
  highPriorityCount: number;
  evidenceBackedCount: number;
  needsReviewCount: number;
  categoriesCovered: string[];
};

type ProfileContext = {
  industry?: string[];
  productType?: string[];
  customerSegment?: string[];
  confidence?: number;
};

type NextBestAction = BaseNextBestAction & {
  id: string;
  title: string;
  description: string;
  actionLabel: string;
  actionType: string;
  priority: string;
  reason: string;
  confidence?: number;
};

interface PersonalizedRecommendationsProps {
  recommendations: Recommendation[];
  nextBestActions: NextBestAction[];
  summary: RecommendationSummary;
  profileContext: ProfileContext;
  onCompleteSetup: (selectedTopics: Set<string>) => void;
  onUploadDocuments: () => void;
  onManualSetup: () => void;
  workspaceId: string;
  userId: string;
  onboardingSessionId?: string;
  onEvidenceUploaded?: () => void | Promise<void>;
  onStepChange?: (step: any) => void;
}

export function PersonalizedRecommendations({
  recommendations,
  nextBestActions,
  summary,
  profileContext,
  onCompleteSetup,
  onUploadDocuments,
  onManualSetup,
  workspaceId,
  userId,
  onboardingSessionId,
  onEvidenceUploaded,
  onStepChange,
}: PersonalizedRecommendationsProps) {
  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(new Set());
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [showMoreTopics, setShowMoreTopics] = useState(false);
  const [showMoreEvidence, setShowMoreEvidence] = useState(false);
  const [showMoreSetup, setShowMoreSetup] = useState(false);

  // Safe guards to prevent duplicate section mounting
  const hasValidData = recommendations.length > 0 || nextBestActions.length > 0;

  // Check if a topic is selected
  const isSelected = (id: string) => selectedTopics.has(id);

  // Group questionnaire areas by category and deduplicate them
  const questionnaireAreas = useMemo(() => {
    const filtered = recommendations.filter(r => r.category === "trust_topics");
    return Array.from(new Map(filtered.map(r => [r.id, r])).values());
  }, [recommendations]);

  const evidenceUploads = useMemo(() => {
    const filtered = recommendations.filter(r => r.category === "evidence_uploads");
    return Array.from(new Map(filtered.map(r => [r.id, r])).values());
  }, [recommendations]);

  const workspaceSetup = useMemo(() => {
    const filtered = recommendations.filter(r => r.category === "workspace_configuration");
    return Array.from(new Map(filtered.map(r => [r.id, r])).values());
  }, [recommendations]);

  // Memoize filtered areas with initial limits and "Show more" logic
  const filteredQuestionnaireAreas = useMemo(() => {
    return showMoreTopics ? questionnaireAreas : questionnaireAreas.slice(0, 6);
  }, [questionnaireAreas, showMoreTopics]);

  const filteredEvidenceUploads = useMemo(() => {
    return showMoreEvidence ? evidenceUploads : evidenceUploads.slice(0, 4);
  }, [evidenceUploads, showMoreEvidence]);

  const filteredWorkspaceSetup = useMemo(() => {
    return showMoreSetup ? workspaceSetup : workspaceSetup.slice(0, 3);
  }, [workspaceSetup, showMoreSetup]);

  // Assessment Insights derivation
  const insights = useMemo(() => {
    const hasEnterpriseCompliance = recommendations.some(r => 
      r.supportingSignals.some(s => s.field === "complianceSignals" && Array.isArray(s.value) && s.value.some(v => ["SOC2", "ISO27001"].includes(v)))
    );
    const hasPrivacyFocus = recommendations.some(r => 
      r.supportingSignals.some(s => s.field === "complianceSignals" && Array.isArray(s.value) && s.value.some(v => ["GDPR", "CCPA"].includes(v)))
    );
    const hasStrongB2B = profileContext.customerSegment?.includes("b2b");
    const evidenceRatio = summary.evidenceBackedCount / (recommendations.length || 1);
    
    const assessmentInsights = [];
    if (hasEnterpriseCompliance) assessmentInsights.push("Enterprise security posture detected via public signals");
    if (hasPrivacyFocus) assessmentInsights.push("Advanced privacy framework (GDPR/CCPA) indicators observed");
    if (hasStrongB2B) assessmentInsights.push("B2B procurement readiness signals are present");
    if (evidenceRatio > 0.6) assessmentInsights.push("High evidence density for core trust domains");
    else if (evidenceRatio > 0) assessmentInsights.push("Initial evidence verification complete");
    else assessmentInsights.push("Awaiting primary evidence uploads for verification");
    
    if (summary.needsReviewCount > 3) assessmentInsights.push("Multiple manual review points identified");
    
    return assessmentInsights;
  }, [recommendations, profileContext.customerSegment, summary.evidenceBackedCount, summary.needsReviewCount]);

  // Readiness calculation
  const readiness = useMemo(() => {
    const confidence = profileContext.confidence || 0;
    const evidenceRatio = summary.evidenceBackedCount / (recommendations.length || 1);
    
    const getStatus = (val: number): "Audit-Ready" | "Market-Standard" | "Baseline" | "Gaps Detected" => {
      if (val >= 0.8) return "Audit-Ready";
      if (val >= 0.5) return "Market-Standard";
      if (val >= 0.3) return "Baseline";
      return "Gaps Detected";
    };

    const readinessExplanation = (() => {
      if (evidenceRatio > 0.7 && confidence > 0.8) 
        return "Your trust posture is exceptionally strong. We've verified significant enterprise signals and matching evidence.";
      if (evidenceRatio > 0.4) 
        return "You have a solid foundation. Uploading the remaining documents will move you toward Audit-Ready status.";
      if (confidence > 0.6)
        return "We've detected strong market-standard signals from your site, but need document evidence to confirm your posture.";
      return "Initial assessment complete. We've identified several gaps where evidence or configuration is needed to meet enterprise standards.";
    })();

    return {
      trust: getStatus(confidence * 0.7 + evidenceRatio * 0.3),
      procurement: getStatus(hasValidData ? 0.6 : 0.2),
      evidenceMaturity: getStatus(evidenceRatio),
      confidence: getStatus(confidence),
      explanation: readinessExplanation,
    };
  }, [profileContext.confidence, summary.evidenceBackedCount, recommendations.length, hasValidData]);

  // Helper to get readiness color
  const getReadinessColor = (status: string) => {
    switch (status) {
      case "Audit-Ready": return "text-trust-green";
      case "Market-Standard": return "text-intelligence-blue";
      case "Baseline": return "text-warning-amber";
      default: return "text-error-red";
    }
  };

  // Helper to get confidence display
  const getConfidenceDisplay = (rec: Recommendation) => {
    const hasObserved = rec.supportingSignals.some(s => s.category === "OBSERVED");
    const hasDerived = rec.supportingSignals.some(s => s.category === "DERIVED");
    const isHypothesized = rec.supportingSignals.every(s => s.category === "HYPOTHESIZED");

    if (rec.needsReview) {
      return {
        label: "Review suggested",
        color: "text-warning-amber",
        variant: "warning",
        icon: AlertCircleIcon,
      };
    }
    
    if (hasObserved || (rec.confidenceBand === "high" && !isHypothesized)) {
      return {
        label: "Evidence-backed",
        color: "text-trust-green",
        variant: "success" as const,
        icon: CheckIcon,
      };
    }

    if (hasDerived && rec.confidence >= 0.7) {
      return {
        label: "Recommended",
        color: "text-intelligence-blue",
        variant: "info" as const,
        icon: TopicIcon,
      };
    }

    if (isHypothesized || rec.confidence < 0.4) {
      return {
        label: "Needs confirmation",
        color: "text-brand-navy",
        variant: "muted" as const,
        icon: SparklesIcon,
      };
    }
    
    return {
      label: "Limited evidence",
      color: "text-text-muted",
      variant: "muted",
      icon: ClockIcon,
    };
  };

  // Helper to get priority display
  const getPriorityDisplay = (priority: string) => {
    switch (priority) {
      case "CRITICAL":
        return {
          label: "Critical",
          color: "text-error-red",
          variant: "error",
        };
      case "HIGH":
        return {
          label: "High",
          color: "text-warning-amber",
          variant: "warning",
        };
      case "MEDIUM":
        return {
          label: "Medium",
          color: "text-intelligence-blue",
          variant: "info",
        };
      default:
        return {
          label: "Low",
          color: "text-text-muted",
          bgColor: "bg-surface-base",
        };
    }
  };

  // Helper to get enterprise category icon and styling
  const getCategoryDisplay = (category: EvidenceEnterpriseCategory) => {
    switch (category) {
      case "Governance":
        return {
          icon: FolderIcon,
          color: "text-warning-amber",
          variant: "warning",
        };
      case "Privacy":
        return {
          icon: LockIcon,
          color: "text-trust-green",
          variant: "success",
        };
      case "Security Operations":
        return {
          icon: ShieldCheckIcon,
          color: "text-intelligence-blue",
          variant: "info",
        };
      case "Infrastructure":
        return {
          icon: CloudIcon,
          color: "text-intelligence-blue",
          variant: "brand",
        };
      case "Compliance":
        return {
          icon: ClipboardIcon,
          color: "text-error-red",
          variant: "error",
        };
      default:
        return {
          icon: FileIcon,
          color: "text-text-muted",
          bgColor: "bg-surface-base",
          borderColor: "border-surface-border",
        };
    }
  };

  // Helper to get maturity indicator styling
  const getMaturityDisplay = (indicator: EvidenceMaturityIndicator) => {
    switch (indicator) {
      case "Common enterprise requirement":
        return {
          label: "Common enterprise requirement",
          badge: "Enterprise",
          color: "text-intelligence-blue",
          variant: "info",
        };
      case "Strongly recommended":
        return {
          label: "Strongly recommended",
          badge: "Strongly recommended",
          color: "text-intelligence-blue",
          variant: "info",
        };
      case "Recommended":
        return {
          label: "Recommended",
          badge: "Recommended",
          color: "text-trust-green",
          variant: "success",
        };
      case "Optional":
        return {
          label: "Optional",
          badge: "Optional",
          color: "text-text-muted",
          bgColor: "bg-surface-base",
          borderColor: "border-surface-border",
        };
      default:
        return {
          label: "Recommended",
          badge: "Recommended",
          color: "text-text-muted",
          bgColor: "bg-surface-base",
          borderColor: "border-surface-border",
        };
    }
  };

  // Filter out already uploaded evidence
  const pendingEvidenceUploads = useMemo(() => {
    return evidenceUploads.filter(doc => !doc.evidenceMetadata?.isUploaded);
  }, [evidenceUploads]);

  // Group evidence by enterprise category
  const evidenceByCategory = useMemo(() => {
    const groups = new Map<EvidenceEnterpriseCategory, Recommendation[]>();
    pendingEvidenceUploads.forEach(doc => {
      const category = doc.evidenceMetadata?.enterpriseCategory ?? "Governance";
      if (!groups.has(category)) {
        groups.set(category, []);
      }
      groups.get(category)!.push(doc);
    });
    return groups;
  }, [pendingEvidenceUploads]);

  // Get count of uploaded documents
  const uploadedCount = useMemo(() => {
    return evidenceUploads.filter(doc => doc.evidenceMetadata?.isUploaded).length;
  }, [evidenceUploads]);

  const toggleTopicSelection = (id: string) => {
    const newSelected = new Set(selectedTopics);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedTopics(newSelected);
  };

  const toggleCardExpanded = (id: string) => {
    const newExpanded = new Set(expandedCards);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedCards(newExpanded);
  };

  // Handle weak evidence state
  const hasWeakEvidence = summary.evidenceBackedCount < recommendations.length * 0.3;

  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Handle CTA actions with safety
  const handleCTAAction = async (actionType: string, actionContext?: any) => {
    const actionId = actionContext?.id || actionType;
    setLoadingAction(actionId);
    setActionError(null);
    setActionSuccess(null);

    const action = {
      type: actionType as any,
      title: actionContext?.title || actionType,
      description: actionContext?.description || "",
      actionLabel: actionContext?.actionLabel || actionType,
      priority: actionContext?.priority || "MEDIUM",
      reason: actionContext?.reason || "",
      linkedRecommendationIds: actionContext?.linkedRecommendationIds || [],
      metadata: actionContext?.metadata,
    };
    
    try {
      const result = await ctaHandler.handleAction(action, {
        workspaceId: workspaceId,
        userId: userId,
        recommendationId: actionContext?.recommendationId,
        documentId: actionContext?.documentId,
        topicKey: actionContext?.topicKey,
        topicKeys: actionContext?.metadata?.topicKeys,
        metadata: actionContext?.metadata,
        selectedTopics: actionContext?.selectedTopics,
        recommendations: recommendations,
      });

      // Handle result
      if (result.success) {
        if (result.message) {
          setActionSuccess(result.message);
        }

        // Handle UI transitions based on nextAction signal
        switch (result.nextAction) {
          case "switch_step_profile":
            if (onManualSetup) {
              onManualSetup();
            }
            break;
          case "open_modal_evidence":
          case "open_modal_evidence_specific":
            setActionSuccess(null);
            setUploadContext({
              expectedDocumentType:
                result.metadata?.documentType ?? actionContext?.metadata?.documentType,
              recommendationId:
                result.metadata?.recommendationId ??
                actionContext?.recommendationId ??
                actionContext?.linkedRecommendationIds?.[0],
              linkedTopicKeys:
                result.metadata?.linkedTopicKeys ??
                (actionContext?.topicKey
                  ? [actionContext.topicKey]
                  : actionContext?.metadata?.topicKeys),
              evidenceCategory:
                result.metadata?.evidenceCategory ?? actionContext?.metadata?.evidenceCategory,
              onboardingSessionId: onboardingSessionId ?? actionContext?.onboardingSessionId,
            });
            setShowEvidenceUpload(true);
            break;
          case "open_modal_invite":
            setActionSuccess(null);
            setInviteModalContext({
              recommendationId:
                result.metadata?.recommendationId ??
                actionContext?.recommendationId ??
                actionContext?.linkedRecommendationIds?.[0],
              suggestedRole:
                (result.metadata?.suggestedRole as WorkspaceRole | undefined) ?? "CONTRIBUTOR",
            });
            setShowReviewerInvite(true);
            break;
          case "open_modal_topics":
            setShowTopicReview(true);
            break;
          case "open_modal_questionnaire":
            setActionError("Questionnaire import is not yet available in this preview.");
            break;
          case "open_modal_workflow":
            setActionError("Workflow configuration is not yet available in this preview.");
            break;
          case "complete_setup":
            if (result.shouldRedirect && result.redirectUrl) {
              window.location.href = result.redirectUrl;
            }
            break;
          default:
            console.log("Action successful:", result.message);
        }
      } else {
        setActionError(result.error || "Action failed");
        console.error("CTA Error:", result.error);
      }
    } catch (err) {
      console.error("Failed to execute action:", err);
      setActionError("An unexpected error occurred");
    } finally {
      setLoadingAction(null);
    }
  };

  // Synthesize Next Best Actions
  const prioritizedActions = useMemo(() => {
    const actions = [...nextBestActions];
    
    // Add manual review if evidence is weak
    if (hasWeakEvidence && !actions.some(a => a.actionType === "manual_profile_review")) {
      actions.unshift({
        id: "action-manual-review",
        title: "Review your Trust Profile manually",
        description: "Manually verify detected signals to improve recommendation accuracy.",
        actionLabel: "Review Profile",
        actionType: "manual_profile_review",
        priority: "HIGH",
        reason: "Website evidence analysis resulted in limited confidence for some areas.",
        confidence: profileContext.confidence,
        routeOrIntent: "/onboarding/review",
        linkedRecommendationIds: [],
      } as any);
    }
    
    return actions.slice(0, 5);
  }, [nextBestActions, hasWeakEvidence, profileContext.confidence]);

  // CTA handler instance
  const ctaHandler = OnboardingCTAHandler.getInstance();
  
  // Topic review modal state
  const [showTopicReview, setShowTopicReview] = useState(false);
  
  // Evidence upload modal state
  const [showEvidenceUpload, setShowEvidenceUpload] = useState(false);
  const [uploadContext, setUploadContext] = useState<{
    expectedDocumentType?: string;
    recommendationId?: string;
    linkedTopicKeys?: string[];
    evidenceCategory?: string;
    onboardingSessionId?: string;
  }>({});
  
  // Reviewer invite modal state
  const [showReviewerInvite, setShowReviewerInvite] = useState(false);
  const [inviteModalContext, setInviteModalContext] = useState<{
    recommendationId?: string;
    suggestedRole?: WorkspaceRole;
  }>({});
  
  // Handle saving topics from modal
  const handleSaveTopics = async (selectedTopicKeys: Set<string>) => {
    try {
      // Save topics through CTA handler
      await handleCTAAction("review_topics", {
        selectedTopics: Array.from(selectedTopicKeys),
      });
      
      // Update local state
      setSelectedTopics(selectedTopicKeys);
      setShowTopicReview(false);
    } catch (error) {
      console.error("Failed to save topics:", error);
    }
  };

  const handleEvidenceUploadComplete = async (result: {
    documentId: string;
    documentType: string;
    linkedTopics: string[];
    success: boolean;
  }) => {
    if (!result.success) return;

    const orchestrateRes = await fetch("/api/onboarding/evidence/orchestrate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId,
        userId,
        documentId: result.documentId,
        expectedDocumentType: uploadContext.expectedDocumentType,
        linkedTopicKeys: uploadContext.linkedTopicKeys?.length
          ? uploadContext.linkedTopicKeys
          : result.linkedTopics,
        recommendationId: uploadContext.recommendationId,
        onboardingSessionId: uploadContext.onboardingSessionId ?? onboardingSessionId,
        evidenceCategory: uploadContext.evidenceCategory,
      }),
    });

    const orchJson = await orchestrateRes.json().catch(() => ({}));
    if (!orchestrateRes.ok || orchJson.success === false) {
      const detail = orchJson.detail || orchJson.error || orchJson.message || "Processing failed";
      throw new Error(typeof detail === "string" ? detail : "Processing failed");
    }

    setActionSuccess(`Uploaded and processed evidence (${orchJson.orchestration?.documentType || result.documentType})`);
    await onEvidenceUploaded?.();
  };

  const openGeneralEvidenceUpload = () => {
    setActionSuccess(null);
    setUploadContext({
      onboardingSessionId,
    });
    setShowEvidenceUpload(true);
    onUploadDocuments();
  };

  if (!hasValidData) {
    return (
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="text-center py-12">
          <div className="rounded-xl border border-surface-border bg-surface-panel p-8">
            <SparklesIcon className="h-12 w-12 text-accent-primary mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-text-primary mb-2">
              No recommendations available
            </h2>
            <p className="text-text-muted">
              We couldn't generate personalized recommendations based on your profile. Please complete your setup manually or contact support.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
    <AppContainer size="lg" className="space-y-12 pb-24">
      {/* Notifications */}
      {(actionSuccess || actionError) && (
        <div className="space-y-4">
          {actionSuccess && (
            <div className="bg-trust-green/10 border border-trust-green/20 rounded-2xl p-4 flex items-start gap-4 animate-in fade-in slide-in-from-top-2">
              <AppIcon icon={CheckIcon} variant="success" size="sm" className="mt-0.5" />
              <div className="flex-1">
                <AppTypography.SubSection className="text-xs text-trust-green mb-1">Success</AppTypography.SubSection>
                <AppTypography.BodySm className="!text-trust-green font-medium">{actionSuccess}</AppTypography.BodySm>
              </div>
              <button onClick={() => setActionSuccess(null)} className="text-trust-green opacity-60 hover:opacity-100"><CloseIcon className="h-4 w-4" /></button>
            </div>
          )}
          {actionError && (
            <div className="bg-error-red/10 border border-error-red/20 rounded-2xl p-4 flex items-start gap-4 animate-in fade-in slide-in-from-top-2">
              <AppIcon icon={AlertCircleIcon} variant="error" size="sm" className="mt-0.5" />
              <div className="flex-1">
                <AppTypography.SubSection className="text-xs text-error-red mb-1">Action Failed</AppTypography.SubSection>
                <AppTypography.BodySm className="!text-error-red font-medium">{actionError}</AppTypography.BodySm>
              </div>
              <button onClick={() => setActionError(null)} className="text-error-red opacity-60 hover:opacity-100"><CloseIcon className="h-4 w-4" /></button>
            </div>
          )}
        </div>
      )}

      {/* Hero Panel */}
      <AppCard variant="hero" className="!p-0 group relative overflow-hidden">
        <div className="absolute top-0 right-0 -mr-24 -mt-24 h-96 w-96 rounded-full bg-intelligence-blue/[0.04] blur-[120px] transition-transform duration-[10s] group-hover:scale-110 pointer-events-none" />
        <div className="p-10 md:p-14 flex flex-col md:flex-row items-center justify-between gap-12 relative z-10">
          <div className="text-center md:text-left space-y-5 flex-1">
            <AppBadge variant="brand" className="px-4 py-1.5"><SparklesIcon className="h-3.5 w-3.5" /> Intelligence Analysis Complete</AppBadge>
            <AppTypography.HeroTitle>Your Trust Readiness Assessment</AppTypography.HeroTitle>
            <AppTypography.Body className="text-lg md:text-xl max-w-xl">
              TrustDesk has analyzed your product architecture and security posture to scaffold your enterprise-grade trust profile.
            </AppTypography.Body>
          </div>

          <div className="grid grid-cols-2 gap-6 w-full md:w-auto shrink-0">
            <MetricItem label="Trust Score" value={Math.round(readiness.overallScore || 0)} subLabel="Verification Confidence" variant="brand" />
            <MetricItem label="Mapped Topics" value={selectedTopics.size || questionnaireAreas.length} subLabel="Entity Alignment" variant="brand" />
          </div>
        </div>
        
        {/* Metadata Bar */}
        <div className="bg-surface-base/40 border-t border-border-soft/30 px-10 md:px-14 py-6 flex flex-wrap items-center justify-center md:justify-start gap-x-12 gap-y-4">
          <AppMetaLabel icon={BuildingIcon}>{profileContext.industry?.[0] || "General"}</AppMetaLabel>
          <AppMetaLabel icon={SettingsIcon}>{profileContext.productType?.[0] || "SaaS"}</AppMetaLabel>
          <AppMetaLabel icon={ShieldCheckIcon}>{Math.round((profileContext.confidence || 0) * 100)}% Confidence</AppMetaLabel>
        </div>
      </AppCard>

        {/* Profile Context - Metadata Row */}
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4 py-4 border-y border-border-soft/50">
          {[
            { label: "Industry", value: profileContext.industry?.[0], icon: BuildingIcon },
            { label: "Product", value: profileContext.productType?.[0], icon: SettingsIcon },
            { label: "Analysis Confidence", value: `${Math.round((profileContext.confidence || 0) * 100)}%`, icon: ShieldCheckIcon },
          ].map((item, idx) => (
            <div key={idx} className="flex items-center gap-3">
              <item.icon className="h-3.5 w-3.5 text-text-muted" />
              <div className="flex flex-col">
                <span className="text-metadata leading-none mb-1 opacity-60">{item.label}</span>
                <span className="text-sm font-black text-text-primary leading-none uppercase tracking-widest">
                  {item.value ? item.value.charAt(0).toUpperCase() + item.value.slice(1) : "—"}
                </span>
              </div>
            </div>
          ))}
        </div>

      {/* Main Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        <div className="lg:col-span-2 space-y-16">
          {/* Trust Topics */}
          <AppSection 
            title="Recommended Trust Topics" 
            description="Control areas identified as high-priority based on your business domain and procurement risk profile."
            icon={TopicIcon}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {filteredQuestionnaireAreas.map(rec => {
                const conf = getConfidenceDisplay(rec);
                return (
                  <AppCard key={rec.id} variant="section" hover className="flex flex-col h-full group/card">
                    <div className="flex items-start justify-between mb-4">
                      <conf.icon className={cn("h-6 w-6", conf.color)} />
                      <AppBadge variant={conf.variant as any}>{conf.label}</AppBadge>
                    </div>
                    <AppTypography.SubSection className="mb-2 line-clamp-1">{rec.title}</AppTypography.SubSection>
                    <AppTypography.BodySm className="mb-6 line-clamp-2 flex-1">{rec.description}</AppTypography.BodySm>
                    <div className="flex items-center justify-between pt-4 border-t border-border-soft/50">
                      <AppTypography.Metadata className="opacity-60 lowercase tracking-normal">Estimated Effort: {rec.estimatedEffort || "Low"}</AppTypography.Metadata>
                      <button 
                        onClick={() => handleCTAAction("review_topics", { id: rec.id, title: rec.title })}
                        className="text-xs font-black text-intelligence-blue uppercase tracking-widest hover:underline"
                      >
                        Review
                      </button>
                    </div>
                  </AppCard>
                );
              })}
            </div>
            {questionnaireAreas.length > 6 && (
              <button 
                onClick={() => setShowMoreTopics(!showMoreTopics)}
                className="w-full py-4 text-metadata text-intelligence-blue hover:bg-intelligence-blue-soft rounded-xl border border-dashed border-intelligence-blue/20 transition-all"
              >
                {showMoreTopics ? "Show Less" : `View all ${questionnaireAreas.length} Areas`}
              </button>
            )}
          </AppSection>

          {/* Evidence Uploads */}
          <AppSection 
            title="Critical Evidence Needed" 
            description="Upload these documents to automatically verify your trust posture and pre-fill security questionnaires."
            icon={FileIcon}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {filteredEvidenceUploads.map(rec => (
                <AppCard key={rec.id} variant="section" hover className="group/card">
                  <div className="flex items-start justify-between mb-4">
                    <AppIcon icon={FileIcon} filled variant="muted" size="sm" />
                    <AppBadge variant={getPriorityDisplay(rec.priority).variant as any}>{rec.priority}</AppBadge>
                  </div>
                  <AppTypography.SubSection className="mb-2">{rec.title}</AppTypography.SubSection>
                  <AppTypography.BodySm className="mb-6 line-clamp-2">{rec.description}</AppTypography.BodySm>
                  <AppButton 
                    variant="outline" 
                    className="w-full"
                    onClick={() => handleCTAAction("open_modal_evidence_specific", { recommendationId: rec.id, metadata: { documentType: rec.title } })}
                  >
                    Upload Evidence
                  </AppButton>
                </AppCard>
              ))}
            </div>
            {evidenceUploads.length > 4 && (
              <button 
                onClick={() => setShowMoreEvidence(!showMoreEvidence)}
                className="w-full py-4 text-metadata text-intelligence-blue hover:bg-intelligence-blue-soft rounded-xl border border-dashed border-intelligence-blue/20 transition-all"
              >
                {showMoreEvidence ? "Show Less" : `View all ${evidenceUploads.length} Documents`}
              </button>
            )}
          </AppSection>
        </div>

        {/* Sidebar: Next Steps */}
        <div className="space-y-12">
          <AppSection title="Next Best Actions" icon={TopicIcon}>
            <div className="space-y-4">
              {prioritizedActions.map(action => (
                <AppCard key={action.id} variant="compact" hover className="!p-5 group/action">
                  <div className="flex items-center gap-3 mb-2">
                    <div className={cn("h-1.5 w-1.5 rounded-full", action.priority === "HIGH" ? "bg-warning-amber" : "bg-intelligence-blue")} />
                    <AppTypography.Metadata className="opacity-60">{action.priority} Priority</AppTypography.Metadata>
                  </div>
                  <AppTypography.SubSection className="text-sm mb-1">{action.title}</AppTypography.SubSection>
                  <AppTypography.BodySm className="text-xs mb-4 line-clamp-2">{action.description}</AppTypography.BodySm>
                  <AppButton 
                    size="sm" 
                    variant={action.priority === "HIGH" ? "default" : "outline"} 
                    className="w-full !text-[10px]"
                    onClick={() => handleCTAAction(action.actionType, action)}
                  >
                    {action.actionLabel}
                  </AppButton>
                </AppCard>
              ))}
            </div>
          </AppSection>
        </div>
      </div>

      {/* Completion Summary */}
      <AppSection>
        <AppCard variant="hero" className="!p-16 text-center group relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-intelligence-blue/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
          
          <div className="max-w-2xl mx-auto space-y-10 relative z-10">
            <div className="space-y-4">
              <div className="inline-flex h-20 w-20 items-center justify-center rounded-[2rem] bg-intelligence-blue/10 border border-intelligence-blue/20 mb-4 shadow-premium-lg group-hover:scale-110 transition-transform duration-500">
                <SparklesIcon className="h-10 w-10 text-intelligence-blue" />
              </div>
              <AppTypography.HeroTitle className="text-4xl md:text-5xl">Trust Workspace Prepared</AppTypography.HeroTitle>
              <AppTypography.Body className="text-xl opacity-80">
                Analysis complete. Your workspace is now scaffolded with procurement-ready topics, verified evidence, and pre-mapped questionnaire logic.
              </AppTypography.Body>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 py-10 border-y border-border-soft">
              <MetricItem label="Trust Topics" value={selectedTopics.size || questionnaireAreas.length} subLabel="Pre-mapped" />
              <MetricItem label="Evidence" value={`${uploadedCount}/${evidenceUploads.length}`} subLabel="Verified" variant="success" />
              <MetricItem label="Readiness" value={readiness.trust} subLabel="Posture" variant="info" />
              <MetricItem label="Confidence" value={Math.round((profileContext.confidence || 0) * 100) + "%"} subLabel="Signal" variant="brand" />
            </div>

            <div className="flex flex-col sm:flex-row gap-6 justify-center pt-6">
              <AppButton 
                size="lg" 
                variant="outline" 
                className="min-w-[240px] h-16 rounded-[1.25rem] text-sm uppercase tracking-widest font-black"
                onClick={() => openGeneralEvidenceUpload()}
              >
                Upload Evidence
              </AppButton>
              <AppButton 
                size="lg" 
                className="min-w-[240px] h-16 rounded-[1.25rem] text-sm uppercase tracking-widest font-black shadow-premium-xl"
                onClick={() => handleCTAAction("complete_setup", { id: "complete-setup", selectedTopics: Array.from(selectedTopics) })}
              >
                Start Workflow
              </AppButton>
            </div>

            <div className="flex justify-center gap-12 pt-8 opacity-60">
              <button onClick={() => onManualSetup()} className="text-[11px] font-black uppercase tracking-widest hover:text-intelligence-blue transition-colors">Edit Profile</button>
              <button className="text-[11px] font-black uppercase tracking-widest hover:text-intelligence-blue transition-colors">Operational Settings</button>
            </div>
          </div>
        </AppCard>
      </AppSection>
    </AppContainer>


    {/* Topic Review Modal */}
    {showTopicReview && (
      <TopicReviewModal
        isOpen={showTopicReview}
        onClose={() => setShowTopicReview(false)}
        recommendations={recommendations as any}
        workspaceId={workspaceId}
        userId={userId}
        initialSelectedTopics={selectedTopics}
        onSave={handleSaveTopics}
      />
    )}

    {/* Evidence Upload Modal */}
    {showEvidenceUpload && (
      <EvidenceUploadModal
        isOpen={showEvidenceUpload}
        onClose={() => setShowEvidenceUpload(false)}
        workspaceId={workspaceId}
        userId={userId}
        onboardingSessionId={uploadContext.onboardingSessionId ?? onboardingSessionId}
        expectedDocumentType={uploadContext.expectedDocumentType}
        recommendationId={uploadContext.recommendationId}
        linkedTopicKeys={uploadContext.linkedTopicKeys}
        evidenceCategory={uploadContext.evidenceCategory}
        documentReviewHref="/app/documents"
        onComplete={handleEvidenceUploadComplete}
      />
    )}

    {/* Reviewer Invite Modal */}
    {showReviewerInvite && (
      <ReviewerInviteModal
        isOpen={showReviewerInvite}
        onClose={() => {
          setShowReviewerInvite(false);
          setInviteModalContext({});
        }}
        workspaceId={workspaceId}
        recommendationId={inviteModalContext.recommendationId}
        defaultRole={inviteModalContext.suggestedRole ?? "CONTRIBUTOR"}
        onInviteSuccess={async () => {
          setActionSuccess("Reviewer invitation saved.");
          await onEvidenceUploaded?.();
        }}
        onInviteError={(error) => {
          setActionError(error);
        }}
      />
    )}
    {/* 5. Sticky Operational Anchor (Premium Dark Section) */}
    <div className="fixed bottom-0 left-0 lg:left-[min(32%,420px)] right-0 z-50 bg-brand-navy border-t border-white/5 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
       <div className="mx-auto max-w-6xl px-8 py-6 flex items-center justify-between">
          <div className="flex items-center gap-10">
             <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-xl bg-intelligence-blue flex items-center justify-center shadow-[0_0_20px_rgba(37,99,235,0.4)]">
                   <AppIcon icon={ShieldCheckIcon} className="text-white" size="sm" />
                </div>
                <div className="space-y-0.5">
                   <p className="text-[10px] font-black text-intelligence-blue uppercase tracking-[0.3em] leading-none">Trust Readiness</p>
                   <p className="text-sm font-black text-white leading-none">Workspace Prepared</p>
                </div>
             </div>

             <div className="h-8 w-px bg-white/10 hidden md:block" />

             <div className="hidden md:flex items-center gap-8">
                <div className="flex flex-col gap-1">
                   <div className="flex items-center gap-2">
                      <AppIcon icon={ActivityIcon} size="xs" variant="success" ghost />
                      <span className="text-xs font-black text-white">{summary.evidenceBackedCount}</span>
                   </div>
                   <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Verified Citations</p>
                </div>
                <div className="flex flex-col gap-1">
                   <div className="flex items-center gap-2">
                      <AppIcon icon={SparklesIcon} size="xs" variant="brand" ghost />
                      <span className="text-xs font-black text-white">{summary.categoriesCovered.length}</span>
                   </div>
                   <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Domains Mapped</p>
                </div>
             </div>
          </div>

          <div className="flex items-center gap-4">
             <p className="hidden sm:block text-[11px] font-bold text-slate-400 max-w-[180px] leading-tight text-right">
                Ready to activate your automated trust infrastructure.
             </p>
             <AppButton 
                size="lg"
                onClick={() => handleCTAAction("complete_setup", { id: "complete-setup", selectedTopics: Array.from(selectedTopics) })}
                className="bg-intelligence-blue hover:bg-intelligence-blue/90 text-white font-black px-8 rounded-xl shadow-[0_0_30px_rgba(37,99,235,0.3)]"
             >
                Activate Workspace
                                  <AppIcon icon={ChevronRightIcon} size="xs" variant="ghost" className="ml-2.5 text-current" />
             </AppButton>
          </div>
       </div>
    </div>
    </>
  );
}

function MetricItem({ label, value, subLabel, variant }: { 
  label: string; 
  value: string | number; 
  subLabel: string;
  variant?: "success" | "info" | "warning" | "accent" | "brand" | "default";
}) {
  return (
    <div className="flex flex-col items-center text-center space-y-1">
      <AppTypography.Metadata className="text-[10px] opacity-60 uppercase tracking-widest">{label}</AppTypography.Metadata>
      <AppTypography.SubSection className={cn(
        "!text-2xl md:!text-3xl font-black font-display tracking-tight",
        variant === "success" ? "text-trust-green" :
        variant === "warning" ? "text-warning-amber" :
        variant === "info" ? "text-intelligence-blue" :
        variant === "brand" ? "text-intelligence-blue" :
        variant === "accent" ? "text-intelligence-blue" : "text-text-primary"
      )}>
        {value}
      </AppTypography.SubSection>
      <AppTypography.Metadata className="text-[9px] font-bold opacity-40 uppercase tracking-tighter">{subLabel}</AppTypography.Metadata>
    </div>
  );
}




