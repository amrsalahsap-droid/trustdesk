"use client";

import React, { useState, useEffect, useMemo, useReducer, useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  reviewInteractionReducer,
  initialReviewInteractionState,
  OnboardingAnalytics,
  type RemediationTarget,
  type ExplorerFilterContext,
  type ExplorerTabId,
} from "./onboarding-review-interactions";
import {
  parseExplorerParam,
  serializeExplorerParam,
  explorerParamToFilter,
  filterToExplorerParam,
  resolveExplorerTabFromFilter,
} from "./explorer-url-state";
import { RemediationDrawer } from "./components/remediation-drawer";
import { ProfileReviewDrawer } from "./components/profile-review-drawer";
import { ReanalyzeConfirmationModal } from "./components/reanalyze-confirmation-modal";
import type { GovernanceTaskRemediationRecord } from "@/modules/workspaces/onboarding/governance-remediation-types";
import type { GovernanceRemediationAction } from "@/modules/workspaces/onboarding/governance-remediation-types";
import {
  countOpenGovernanceTasks,
  collectSatisfiedEvidenceTypes,
} from "@/modules/workspaces/onboarding/governance-remediation-utils";
import { 
  CheckIcon, 
  ChevronRightIcon, 
  SparklesIcon, 
  BuildingIcon, 
  ShieldCheckIcon, 
  DatabaseIcon, 
  LayoutIcon,
  LinkIcon,
  CloudIcon,
  SearchIcon,
  FileTextIcon,
  UserIcon,
  AlertCircleIcon,
  HelpCircleIcon,
  PlusIcon,
  SettingsIcon,
  ShieldIcon,
  FileIcon,
  PackageIcon,
  UploadIcon,
  WarningIcon,
  ClockIcon,
  GlobeIcon,
  ActivityIcon,
  FolderIcon,
  ArrowRightIcon,
} from "@/components/icons";
import { type RecommendedDocument } from "@/modules/workspaces/onboarding/document-recommendation-service";
import { 
  type DeepInferredProfile, 
  type IndustryCandidate,
} from "@/modules/workspaces/onboarding/website-analysis-service";
import { SignalCitation } from "@/modules/workspaces/onboarding/evidence";
import { VendorIntelligenceProfile } from "@/modules/workspaces/onboarding/vendor-intelligence-types";
import { type Capability, type ProcurementRiskArea, type DataInteractionModel, type SignalCategory } from "@/modules/workspaces/onboarding/website-analysis-service";
import { cn } from "@/lib/utils";
import { 
  AppCard, 
  AppTypography, 
  AppIcon, 
  AppBadge, 
  AppSection, 
  AppContainer, 
  AppButton,
  AppMetaLabel,
  AppInput,
  AppLabel
} from "@/components/ui/app-design-system/primitives";
import { RecommendedDocumentCard } from "./components/recommended-document-card";
import { DocumentSampleModal } from "./components/document-sample-modal";
import { EvidenceDiagnostics, type DomainEvidenceSummary, type FieldEvidence } from "@/components/onboarding/evidence-diagnostics";
import { PersonalizedRecommendations } from "./components/personalized-recommendations";
import { UnderstoodIntelligenceSection } from "./components/understood-intelligence-section";
import { TrustIntelligenceHero } from "./components/trust-intelligence-hero";
import { type Recommendation, type NextBestAction } from "@/modules/workspaces/onboarding/recommendation-metadata";
import { OnboardingSidebar } from "./components/onboarding-sidebar";
import { UploadProgressToast } from "./components/upload-progress-toast";
import { StickySectionNav } from "./components/sticky-section-nav";
import { TopContextBar } from "./components/top-context-bar";
import { IntelligenceExplorer } from "./components/intelligence-explorer";
import { ReadinessHero } from "./components/readiness-hero";import { mapToReadinessViewModel } from "./onboarding-view-model-mapper";
import { ReadinessFoundationSummary } from "./components/readiness-foundation-summary";
import { EvidenceUploadModal } from "./components/evidence-upload-modal";
import { EvidenceExceptionModal } from "./components/evidence-exception-modal";
import { ReadinessRiskAreas } from "./components/readiness-risk-areas";
import { ReadinessCapabilityIntelligence } from "./components/readiness-capability-intelligence";
import { ReadinessOperationalModel } from "./components/readiness-operational-model";
import { ReadinessClarificationTasks } from "./components/readiness-clarification-tasks";
import { ReadinessOperationalWorkflows } from "./components/readiness-operational-workflows";
import { ReadinessOperationalProfile } from "./components/readiness-operational-profile";
import { ReadinessBuyerQuestions } from "./components/readiness-buyer-questions";

import { type OnboardingStep as Step, shouldShowOnboardingMarketingRail } from "./onboarding-layout-helpers";

type TopicPack = {
  id: string;
  name: string;
  description: string;
  topics: { key: string; name: string; description: string }[];
  recommendationRationale?: string;
};

type OrchestrationPayload = {
  recommendations: Recommendation[];
  topRecommendations: Recommendation[];
  nextBestActions: NextBestAction[];
  summary?: {
    total: number;
    highPriorityCount: number;
    evidenceBackedCount: number;
    needsReviewCount: number;
    categoriesCovered: string[];
  };
};

type SignalCandidate<T> = {
  value: T;
  confidence: number;
  sources: SignalCitation[];
  sourcePages?: string[];
};

type SignalConflict<T> = {
  hasConflict: boolean;
  rival?: {
    value: T;
    confidence: number;
    sources: SignalCitation[];
  };
};

type Signal<T> = {
  value: T;
  category: SignalCategory;
  confidence: number;
  source?: string;
  citations?: SignalCitation[];
  candidates?: SignalCandidate<T>[];
  conflict?: SignalConflict<T>;
};

type AnalyzedSignals = {
  industry?: Signal<string[]>;
  productType?: Signal<string[]>;
  customerSegment?: Signal<string[]>;
  dataTypes?: Signal<string[]>;
  complianceSignals?: Signal<string[]>;
  businessDomain?: Signal<string>;
  productLines?: Signal<string[]>;
  solutionCategories?: Signal<string[]>;
  structuredCapabilities?: Signal<Capability[]>;
  deploymentComponents?: Signal<string[]>;
  dataInteractionModel?: Signal<DataInteractionModel>;
  procurementRiskAreas?: Signal<ProcurementRiskArea[]>;
};

/**
 * Derived field-status state used by the review UI. Computed purely from
 * {@link Signal} plus the current raw form value, so the server contract
 * stays lean — only the renderer knows about "Valid other", "Unknown", etc.
 */
type FieldStatus =
  | "UNKNOWN"
  | "CONFLICTED"
  | "RESOLVED"
  | "VALID_OTHER"
  | "LOW_CONFIDENCE_HYPOTHESIS"
  | "OBSERVED"
  | "DERIVED"
  | "HYPOTHESIZED";

/**
 * Classifies a field for rendering. Priority is important:
 *  1. conflict beats everything else — even an OBSERVED primary is honest
 *     only when no credible rival disagrees.
 *  2. Empty rawValue AND missing signal -> UNKNOWN.
 *  3. A HYPOTHESIZED "other" is NOT a valid "other" — it's disguised
 *     uncertainty; we route those to UNKNOWN too.
 *  4. A non-hypothesized "other" is genuinely off-enum -> VALID_OTHER.
 *  5. A HYPOTHESIZED with < 0.5 confidence is a low-confidence hypothesis.
 */
function deriveFieldStatus(
  signal: Signal<string[]> | undefined,
  rawValue: string[],
  isResolved?: boolean,
): FieldStatus {
  if (signal?.conflict?.hasConflict) {
    return isResolved ? "RESOLVED" : "CONFLICTED";
  }
  if (!rawValue || rawValue.length === 0) return "UNKNOWN";
  
  const isOther = rawValue.some(v => /(^|\W)other(\W|$)/i.test(v));
  if (isOther && signal?.category === "HYPOTHESIZED") return "UNKNOWN";
  if (isOther && signal && signal.category !== "HYPOTHESIZED") return "VALID_OTHER";
  if (!signal) return "HYPOTHESIZED";
  if (signal.category === "HYPOTHESIZED" && signal.confidence < 0.5) {
    return "LOW_CONFIDENCE_HYPOTHESIS";
  }
  return signal.category;
}

type AnalysisFailure = {
  status:
    | "insufficient_evidence"
    | "crawl_failed"
    | "tls_blocked"
    | "schema_invalid"
    | "manual_review_required"
    | "weak_signals"
    | "timeout"
    | "redirect_loop"
    | "no_site";
  reason?: string;
};

type CrawlHealthSnapshot = {
  pagesAttempted: number;
  /** Layer 1: HTTP success count (requestSucceeded). */
  pagesReached: number;
  statusCodes: number[];
  finalUrl: string;
  redirectChain: string[];
  durationMs: number;
  blockedBy?: string;
  /** Layer 1 alias: pages that returned HTTP 200 + valid content-type. */
  pagesRequested?: number;
  /** Layer 3: pages that produced structured evidence blocks (evidenceSucceeded). */
  pagesEvidenced?: number;
};

type AnalysisHealthSnapshot = {
  reachability: {
    ok: boolean;
    pagesAttempted: number;
    pagesReached: number;
    blockedBy?: string;
  };
  extraction: {
    ok: boolean;
    strongPages: number;
    totalNonBoilerplateChars: number;
    renderedPages: number;
  };
  business: {
    ok: boolean;
    observedFields: number;
    derivedFields: number;
    confidence: number;
  };
  compliance: {
    ok: boolean;
    observedFields: number;
    trustPagesSeen: number;
    confidence: number;
  };
};

type AnalysisDiagnosticsSnapshot = {
  capApplied: boolean;
  capReason: string | null;
  preCapConfidence: number;
  finalTailoringConfidence: number;
  observedFieldCount: number;
  groundedSignalCount: number;
  highSignalCount: number;
  fieldEvidenceCoverage: Record<string, "strong" | "medium" | "limited" | "weak" | "none">;
  crawlIssues: Array<{ severity: "info" | "warning" | "error"; code: string; message: string }>;
  signalIssues: Array<{ severity: "info" | "warning" | "error"; code: string; message: string }>;
  confidenceIssues: Array<{ severity: "info" | "warning" | "error"; code: string; message: string }>;
  inferenceNotes: string[];
};



// Recommendations values ARE provisional. onSaveProfile is the single gate for
// DB persistence; any pre-filled state here must originate from either
// explicit user input or signals the user has the chance to review first.
export function OnboardingWorkspaceForm({
  initialStep = "DETAILS",
  initialWorkspaceId = "",
  initialValues = { name: "", website: "" },
  userId = "",
}: {
  initialStep?: Step;
  initialWorkspaceId?: string;
  initialValues?: { name: string; website: string };
  userId?: string;
}) {
  const [step, setStep] = useState<Step>(initialStep);
  const [workspaceId, setWorkspaceId] = useState(initialWorkspaceId);
  const [workspaceName, setWorkspaceName] = useState(initialValues.name);
  const [website, setWebsite] = useState(initialValues.website);
  const [industry, setIndustry] = useState<string[]>([]);
  const [productType, setProductType] = useState<string[]>([]);
  const [customerSegment, setCustomerSegment] = useState<string[]>([]);
  const [dataTypes, setDataTypes] = useState<string[]>([]);
  const [complianceTargets, setComplianceTargets] = useState<string[]>([]);
  const [intelligenceProfile, setIntelligenceProfile] = useState<VendorIntelligenceProfile | null>(null);
  const [analyzedSignals, setAnalyzedSignals] = useState<AnalyzedSignals>({});
  /** Full analyze-time profile; persisted only on profile confirm (POST /api/onboarding/profile). */
  const [analyzedProfile, setAnalyzedProfile] = useState<DeepInferredProfile | null>(null);
  const [recommendedPacks, setRecommendedPacks] = useState<TopicPack[]>([]);
  const [selectedTopicKeys, setSelectedTopicKeys] = useState<Set<string>>(new Set());
  const [recommendedDocs, setRecommendedDocs] = useState<RecommendedDocument[]>([]);
  const [orchestration, setOrchestration] = useState<OrchestrationPayload | null>(null);
  const [expandedExplainability, setExpandedExplainability] = useState<Set<string>>(new Set());
  const [analysisFailure, setAnalysisFailure] = useState<AnalysisFailure | null>(null);
  const [crawlHealthSnapshot, setCrawlHealthSnapshot] = useState<CrawlHealthSnapshot | null>(null);
  const [analysisHealthSnapshot, setAnalysisHealthSnapshot] = useState<AnalysisHealthSnapshot | null>(null);
  const [analysisDiagnosticsSnapshot, setAnalysisDiagnosticsSnapshot] = useState<AnalysisDiagnosticsSnapshot | null>(null);
  const [previewDoc, setPreviewDoc] = useState<RecommendedDocument | null>(null);
  const [adoptedIds, setAdoptedIds] = useState<Set<string>>(new Set());
  const [isTailoring, setIsTailoring] = useState(false);
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [reanalyzeError, setReanalyzeError] = useState<string | null>(null);
  const [interactionState, dispatchInteraction] = useReducer(reviewInteractionReducer, initialReviewInteractionState);
  const [memoizedTemplates, setMemoizedTemplates] = useState<
    Record<
      string,
      {
        template: string;
        mode: string;
        confidence: number;
        templateQuality?: string;
        signalsUsed?: RecommendedDocument["templateSignalsUsed"];
      }
    >
  >({});
  const [generatingTemplateId, setGeneratingTemplateId] = useState<string | null>(null);

  const [uploadedTypes, setUploadedTypes] = useState<string[]>([]);
  const [exceptions, setExceptions] = useState<Record<string, { status: "unavailable" | "not_applicable"; reason: string; note: string }>>({});
  const [governanceRemediations, setGovernanceRemediations] = useState<
    Record<string, GovernanceTaskRemediationRecord>
  >({});
  const [remediationSaving, setRemediationSaving] = useState(false);
  const [explorerTab, setExplorerTab] = useState<ExplorerTabId>("source-pages");
  const [selectedExceptionGap, setSelectedExceptionGap] = useState<{ type: string; title: string } | null>(null);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collisionData, setCollisionData] = useState<{
    workspaceId: string;
    workspaceName: string;
    isProfileComplete: boolean;
  } | null>(null);

  /**
   * Convert existing crawl health snapshot to new domain evidence summary format
   */
  const convertToDomainEvidenceSummary = (
    health: CrawlHealthSnapshot | ExtendedCrawlHealth,
    extraction?: AnalysisHealthSnapshot["extraction"],
    diagnostics?: AnalysisDiagnosticsSnapshot | null,
  ): DomainEvidenceSummary => {
    const issues: DomainEvidenceSummary["issues"] = diagnostics
      ? [
          ...diagnostics.crawlIssues.map(i => ({ ...i, severity: health.pagesReached > 0 ? "warning" : i.severity })),
          ...diagnostics.signalIssues,
          ...diagnostics.confidenceIssues,
        ].map((issue) => ({
          type: issue.severity as any,
          message: issue.message,
        }))
      : [];

    if (diagnostics?.inferenceNotes) {
      diagnostics.inferenceNotes.forEach(note => {
        issues.push({
          type: "info",
          message: note,
        });
      });
    }
    
    // Legacy fallback for older backend payloads that do not include diagnostics.
    if (!diagnostics && health.blockedBy === "robots") {
      issues.push({
        type: "warning",
        message: "Access blocked by robots.txt",
      });
    }
    
    if (!diagnostics && health.blockedBy === "403") {
      issues.push({
        type: "error",
        message: "Access forbidden (403)",
      });
    }
    
    if (!diagnostics && health.blockedBy === "429") {
      issues.push({
        type: "warning", 
        message: "Rate limited (429)",
      });
    }
    
    // Determine block reason
    let blockReason: DomainEvidenceSummary["blockReason"];
    if (health.blockedBy === "403") blockReason = "blocked";
    else if (health.blockedBy === "429") blockReason = "rate_limited";
    else if (health.blockedBy === "5xx") blockReason = "server_error";
    else if (health.blockedBy === "dns") blockReason = "dns_error";
    else if (health.blockedBy === "timeout") blockReason = "timeout";
    
    // Use totalUsefulChars from extended health if available, otherwise fall back to extraction
    const extendedHealth = health as ExtendedCrawlHealth;
    const totalUsefulChars = extendedHealth.totalUsefulChars ?? extraction?.totalNonBoilerplateChars ?? 0;

    return {
      pagesAttempted: health.pagesAttempted || 0,
      // pagesFetched = Layer 1 (HTTP) — prefer pagesRequested if present, fall back to pagesReached
      pagesFetched: (health as ExtendedCrawlHealth).pagesRequested ?? health.pagesReached ?? 0,
      // pagesEvidenced = Layer 3 (evidence blocks) — separate field for accurate reporting
      pagesEvidenced: (health as ExtendedCrawlHealth).pagesEvidenced,
      highValuePagesFound: extraction?.strongPages || 0,
      securityLegalPagesFound: 0, // Would need extended health data
      totalUsefulChars,
      observedFieldCount: diagnostics?.observedFieldCount,
      groundedSignalCount: diagnostics?.groundedSignalCount,
      capReason: diagnostics?.capApplied ? diagnostics.capReason : null,
      issues,
      blockReason,
      durationMs: health.durationMs ?? 0,
      placeholderPages: extendedHealth.placeholderPages,
      recoveredRenderedPages: extendedHealth.recoveredRenderedPages,
      trueEvidencePages: extendedHealth.trueEvidencePages,
    };
  };

  /**
   * Convert analyzed signals to field evidence format
   */
  const convertToFieldEvidence = (signals: AnalyzedSignals): FieldEvidence[] => {
    const fieldMapping: Record<string, { fieldName: string; fieldKey: string }> = {
      industry: { fieldName: "Industry", fieldKey: "industry" },
      productType: { fieldName: "Product Type", fieldKey: "productType" },
      customerSegment: { fieldName: "Customer Segment", fieldKey: "customerSegment" },
      dataTypes: { fieldName: "Data Types", fieldKey: "dataTypes" },
      complianceSignals: { fieldName: "Compliance", fieldKey: "compliance" },
    };

    return Object.entries(signals).map(([signalKey, signal]) => {
      const mapping = fieldMapping[signalKey];
      if (!mapping || !signal) return null;

      let strength: FieldEvidence["strength"] = "unknown";
      let supportScore = 0;
      let evidenceCoverage = 0;
      
      if (signal.confidence >= 0.8) {
        strength = "strong";
        supportScore = Math.round(signal.confidence * 100);
        evidenceCoverage = Math.min(100, supportScore);
      } else if (signal.confidence >= 0.6) {
        strength = "medium";
        supportScore = Math.round(signal.confidence * 100);
        evidenceCoverage = Math.min(90, supportScore);
      } else if (signal.confidence >= 0.3) {
        strength = "limited";
        supportScore = Math.round(signal.confidence * 100);
        evidenceCoverage = Math.min(70, supportScore);
      } else if (signal.confidence > 0) {
        strength = "weak";
        supportScore = Math.round(signal.confidence * 100);
        evidenceCoverage = Math.min(50, supportScore);
      }

      const topCandidate = signal.value ? {
        value: Array.isArray(signal.value) ? signal.value.join(", ") : signal.value,
        confidenceBand: signal.confidence >= 0.7 ? "high" : signal.confidence >= 0.5 ? "medium" : "limited",
        reasons: signal.citations?.slice(0, 2).map(c => c.evidenceKind) || [],
      } : undefined;

      const evidenceRefs = (signal.citations || []).map(citation => ({
        sourceUrl: citation.pageUrl,
        pageType: citation.pageType,
        snippet: citation.excerpt || "",
        signalType: citation.evidenceKind,
      }));

      return {
        fieldKey: mapping.fieldKey,
        fieldName: mapping.fieldName,
        strength,
        category: signal.category,
        supportScore,
        evidenceCoverage,
        topCandidate,
        isConflicted: signal.conflict?.hasConflict || false,
        evidenceRefs,
      };
    }).filter(Boolean) as FieldEvidence[];
  };

  const toggleIndustry = (val: string) => {
    setIndustry(prev => prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]);
  };
  const toggleProductType = (val: string) => {
    setProductType(prev => prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]);
  };
  const toggleCustomerSegment = (val: string) => {
    setCustomerSegment(prev => prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]);
  };

  const toggleDataType = (type: string) => {
    setDataTypes(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]);
  };

  const toggleCompliance = (target: string) => {
    setComplianceTargets(prev => prev.includes(target) ? prev.filter(t => t !== target) : [...prev, target]);
  };

  const toggleTopic = (key: string) => {
    const next = new Set(selectedTopicKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelectedTopicKeys(next);
  };

  async function onTryDemo() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/onboarding/demo", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Failed to create demo workspace");
        setSubmitting(false);
        return;
      }
      window.location.href = data.redirectUrl;
    } catch {
      setError("An unexpected error occurred while creating the demo.");
      setSubmitting(false);
    }
  }

  const [analysisStatus, setAnalysisStatus] = useState<string | null>(null);

  async function onCreateWorkspace(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/onboarding/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          workspaceName,
          website
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.error?.code === "ALREADY_ONBOARDED") {
          setCollisionData({
            workspaceId: data.error.workspaceId,
            workspaceName: data.error.workspaceName,
            isProfileComplete: !!data.error.isProfileComplete,
          });
        }
        setError(data.error?.message ?? "Failed to create workspace");
        setSubmitting(false);
        return;
      }

      setWorkspaceId(data.workspaceId);

      if (website.trim()) {
        setStep("ANALYZING");
        performWebsiteAnalysis(website);
      } else {
        setStep("PROFILE");
        setSubmitting(false);
      }
    } catch {
      setError("An unexpected error occurred.");
      setSubmitting(false);
    }
  }

  async function performWebsiteAnalysis(url: string) {
    setAnalysisFailure(null);
    setAnalyzedProfile(null);
    setCrawlHealthSnapshot(null);
    setAnalysisHealthSnapshot(null);
    setAnalysisDiagnosticsSnapshot(null);
    try {
      const res = await fetch("/api/onboarding/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ website: url }),
      });
      const data = await res.json();

      const status: string | undefined = data?.analysisStatus;
      setAnalysisStatus(status ?? null);
      console.log("[Analysis] Response:", { status, ok: res.ok, data });
      if (data?.crawlHealth) setCrawlHealthSnapshot(data.crawlHealth as CrawlHealthSnapshot);
      if (data?.health) setAnalysisHealthSnapshot(data.health as AnalysisHealthSnapshot);
      else setAnalysisHealthSnapshot(null);
      if (data?.diagnostics) setAnalysisDiagnosticsSnapshot(data.diagnostics as AnalysisDiagnosticsSnapshot);
      else setAnalysisDiagnosticsSnapshot(null);

      if (!res.ok || !status) {
        console.log("[Analysis] Failed - no status or not ok:", { status, ok: res.ok, reason: data?.reason, error: data?.error });
        setAnalyzedProfile(null);
        setAnalysisFailure({
          status: "manual_review_required",
          reason: data?.reason || data?.error || "We couldn't analyze this website.",
        });
        setStep("PROFILE");
        return;
      }

      if (status !== "success" && status !== "needs_review") {
        console.log("[Analysis] Non-success status:", { status, reason: data?.reason });
        setAnalyzedProfile(null);
        setAnalysisFailure({
          status: status as AnalysisFailure["status"],
          reason: data?.reason,
        });
        setStep("PROFILE");
        return;
      }

      const profile = data.profile ?? {};
      setAnalyzedProfile(profile as DeepInferredProfile);
      setIntelligenceProfile(data.intelligenceProfile || null);
      const signals: AnalyzedSignals = {
        industry: normalizeStringArraySignal(profile.industry as any),
        productType: normalizeStringArraySignal(profile.productType as any),
        customerSegment: normalizeStringArraySignal(profile.customerSegment as any),
        dataTypes: normalizeStringArraySignal(profile.dataTypes),
        complianceSignals: normalizeStringArraySignal(profile.complianceSignals),
        businessDomain: profile.businessDomain,
        productLines: normalizeStringArraySignal(profile.productLines),
        solutionCategories: normalizeStringArraySignal(profile.solutionCategories),
        structuredCapabilities: profile.structuredCapabilities,
        deploymentComponents: normalizeStringArraySignal(profile.deploymentComponents),
        dataInteractionModel: profile.dataInteractionModel,
        procurementRiskAreas: profile.procurementRiskAreas,
      };
      setAnalyzedSignals(signals);
      setAnalyzedProfile(profile as DeepInferredProfile);

      if (profile.companyName && !workspaceName) setWorkspaceName(profile.companyName);
      if (signals.industry?.value) setIndustry(Array.isArray(signals.industry.value) ? signals.industry.value : [signals.industry.value]);
      if (signals.productType?.value) setProductType(Array.isArray(signals.productType.value) ? signals.productType.value : [signals.productType.value]);
      if (signals.customerSegment?.value) setCustomerSegment(Array.isArray(signals.customerSegment.value) ? signals.customerSegment.value : [signals.customerSegment.value]);
      if (signals.dataTypes?.value) setDataTypes(signals.dataTypes.value);
      if (signals.complianceSignals?.value) setComplianceTargets(signals.complianceSignals.value);

      if (data.intelligenceProfile?.workspacePreparation?.recommendedTrustTopics) {
        const autoSelected = new Set<string>();
        data.intelligenceProfile.workspacePreparation.recommendedTrustTopics
          .filter((t: any) => t.priority === "CRITICAL" || t.priority === "HIGH")
          .forEach((t: any) => t.topicKeys.forEach((k: string) => autoSelected.add(k)));
        
        if (autoSelected.size > 0) {
          setSelectedTopicKeys(autoSelected);
        }
      }

      setStep("REVIEW");
    } catch {
      setAnalyzedProfile(null);
      setAnalysisFailure({
        status: "manual_review_required",
        reason: "Connection error during website analysis.",
      });
      setStep("PROFILE");
    } finally {
      setSubmitting(false);
    }
  }

  async function performReanalysis(url: string) {
    setIsReanalyzing(true);
    setReanalyzeError(null);
    try {
      const runId = Math.random().toString(36).substring(7);
      const res = await fetch("/api/onboarding/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ website: url, bypassCache: true, runId }),
      });
      const data = await res.json();

      const status: string | undefined = data?.analysisStatus;

      if (!res.ok || !status || (status !== "success" && status !== "needs_review")) {
        setReanalyzeError(data?.reason || data?.error || "New analysis failed. Your previous result is still available.");
        return;
      }

      setAnalysisStatus(status ?? null);
      if (data?.crawlHealth) setCrawlHealthSnapshot(data.crawlHealth as CrawlHealthSnapshot);
      if (data?.health) setAnalysisHealthSnapshot(data.health as AnalysisHealthSnapshot);
      else setAnalysisHealthSnapshot(null);
      if (data?.diagnostics) setAnalysisDiagnosticsSnapshot(data.diagnostics as AnalysisDiagnosticsSnapshot);
      else setAnalysisDiagnosticsSnapshot(null);

      const profile = data.profile ?? {};
      setAnalyzedProfile(profile as DeepInferredProfile);
      setIntelligenceProfile(data.intelligenceProfile || null);
      const signals: AnalyzedSignals = {
        industry: normalizeStringArraySignal(profile.industry as any),
        productType: normalizeStringArraySignal(profile.productType as any),
        customerSegment: normalizeStringArraySignal(profile.customerSegment as any),
        dataTypes: normalizeStringArraySignal(profile.dataTypes),
        complianceSignals: normalizeStringArraySignal(profile.complianceSignals),
        businessDomain: profile.businessDomain,
        productLines: normalizeStringArraySignal(profile.productLines),
        solutionCategories: normalizeStringArraySignal(profile.solutionCategories),
        structuredCapabilities: profile.structuredCapabilities,
        deploymentComponents: normalizeStringArraySignal(profile.deploymentComponents),
        dataInteractionModel: profile.dataInteractionModel,
        procurementRiskAreas: profile.procurementRiskAreas,
      };
      setAnalyzedSignals(signals);

      if (profile.companyName && !workspaceName) setWorkspaceName(profile.companyName);
      if (signals.industry?.value) setIndustry(Array.isArray(signals.industry.value) ? signals.industry.value : [signals.industry.value]);
      if (signals.productType?.value) setProductType(Array.isArray(signals.productType.value) ? signals.productType.value : [signals.productType.value]);
      if (signals.customerSegment?.value) setCustomerSegment(Array.isArray(signals.customerSegment.value) ? signals.customerSegment.value : [signals.customerSegment.value]);
      if (signals.dataTypes?.value) setDataTypes(signals.dataTypes.value);
      if (signals.complianceSignals?.value) setComplianceTargets(signals.complianceSignals.value);

      if (data.intelligenceProfile?.workspacePreparation?.recommendedTrustTopics) {
        const autoSelected = new Set<string>();
        data.intelligenceProfile.workspacePreparation.recommendedTrustTopics
          .filter((t: any) => t.priority === "CRITICAL" || t.priority === "HIGH")
          .forEach((t: any) => t.topicKeys.forEach((k: string) => autoSelected.add(k)));
        
        if (autoSelected.size > 0) {
          setSelectedTopicKeys(autoSelected);
        }
      }

      dispatchInteraction({ type: "CLOSE_INTERACTION" });
    } catch {
      setReanalyzeError("New analysis failed. Your previous result is still available.");
    } finally {
      setIsReanalyzing(false);
    }
  }

  // onSaveProfile is the ONLY path that persists inferred values to the workspace.
  // Recommendations stored in `analyzedSignals` are never written to the DB until
  // the user lands here via the REVIEW confirm button or the PROFILE step.
  async function onSaveProfile(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setError(null);
    setSubmitting(true);
    setIsTailoring(true);
    try {
      const res = await fetch("/api/onboarding/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          workspaceId,
          industry,
          productType,
          customerSegment,
          dataTypes,
          complianceTargets,
          ...(analyzedProfile ? { analyzedProfile } : {}),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        const errorMessage = data.error?.message || data.error || "Failed to save profile";
        console.error("Profile save error:", { status: res.status, data });
        setError(errorMessage);
        return;
      }

      setRecommendedPacks(data.packs || []);
      setRecommendedDocs(data.documents || []);
      setOrchestration(null);

      const allKeys = new Set<string>();
      data.packs?.forEach((p: TopicPack) => p.topics.forEach(t => allKeys.add(t.key)));
      setSelectedTopicKeys(allKeys);

      try {
        const orchestratedRes = await fetch(`/api/onboarding/recommendations?workspaceId=${workspaceId}`);
        if (orchestratedRes.ok) {
          const orchestratedData = await orchestratedRes.json();
          const orchestrationPayload = orchestratedData?.orchestration as OrchestrationPayload | undefined;
          if (orchestrationPayload?.recommendations) {
            setOrchestration(orchestrationPayload);
            const topicKeys = new Set<string>();
            orchestrationPayload.recommendations
              .filter(r => r.category === "trust_topics")
              .forEach(r => r.metadata?.topicKeys?.forEach((k: string) => topicKeys.add(k)));
            if (topicKeys.size > 0) {
              setSelectedTopicKeys(topicKeys);
            }
          }
        }
      } catch {
        // Keep onboarding resilient; UI falls back to packs/documents if orchestration fetch fails.
      }

      setStep("RECOMMENDATIONS");
    } catch {
      setError("Failed to fetch recommendations.");
    } finally {
      setSubmitting(false);
      setIsTailoring(false);
    }
  }

  const onDownloadDocx = (docId: string) => {
    const url = `/api/onboarding/documents/download?workspaceId=${workspaceId}&documentId=${docId}`;
    window.location.href = url;
  };

  async function refreshOrchestrationRecommendations() {
    if (!workspaceId) return;
    try {
      const orchestratedRes = await fetch(`/api/onboarding/recommendations?workspaceId=${workspaceId}`);
      if (orchestratedRes.ok) {
        const orchestratedData = await orchestratedRes.json();
        const orchestrationPayload = orchestratedData?.orchestration as OrchestrationPayload | undefined;
        if (orchestrationPayload?.recommendations) {
          setOrchestration(orchestrationPayload);
        }
      }
    } catch {
      // Keep onboarding resilient
    }
  }

  async function ensureTemplate(doc: RecommendedDocument): Promise<{
    template: string;
    mode: string;
    confidence: number;
    templateQuality?: string;
    signalsUsed?: RecommendedDocument["templateSignalsUsed"];
  }> {
    if (memoizedTemplates[doc.id]) return memoizedTemplates[doc.id];

    setGeneratingTemplateId(doc.id);
    try {
      const res = await fetch(`/api/onboarding/template?workspaceId=${workspaceId}&docId=${doc.id}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      const result = {
        template: data.template,
        mode: data.tailoringMode,
        confidence: data.tailoringConfidence,
        templateQuality: data.templateQuality as string | undefined,
        signalsUsed: data.signalsUsed as RecommendedDocument["templateSignalsUsed"] | undefined,
      };
      setMemoizedTemplates(prev => ({ ...prev, [doc.id]: result }));
      return result;
    } catch (err) {
      console.error("Template generation failed", err);
      return {
        template: doc.libraryMetadata?.sampleText || "",
        mode: "LIMITED_FALLBACK",
        confidence: 0,
        templateQuality: "manual_required",
      };
    } finally {
      setGeneratingTemplateId(null);
    }
  }

  async function onAdoptTemplate(doc: RecommendedDocument) {
    const { template, mode, confidence, templateQuality, signalsUsed } = await ensureTemplate(doc);
    setSubmitting(true);
    try {
      const formData = new FormData();
      const blob = new Blob([template], { type: "text/plain" });
      const file = new File([blob], `${doc.name} (Template).txt`, { type: "text/plain" });
      formData.append("file", file);

      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { 
          "x-workspace-id": workspaceId
        },
        body: formData,
      });
      if (!res.ok) throw new Error();

      setRecommendedDocs(prev =>
        prev.map(d =>
          d.id === doc.id
            ? {
                ...d,
                tailoringMode: mode,
                tailoringConfidence: confidence,
                templateQuality: templateQuality as RecommendedDocument["templateQuality"],
                templateSignalsUsed: signalsUsed,
              }
            : d,
        ),
      );

      setAdoptedIds(prev => new Set(prev).add(doc.id));
    } catch (err) {
      console.error("Failed to adopt template", err);
    } finally {
      setSubmitting(false);
    }
  }

  async function onViewSample(doc: RecommendedDocument) {
    const { template, mode, confidence, templateQuality, signalsUsed } = await ensureTemplate(doc);
    setPreviewDoc({
      ...doc,
      tailoredTemplate: template,
      tailoringMode: mode,
      tailoringConfidence: confidence,
      templateQuality: templateQuality as RecommendedDocument["templateQuality"],
      templateSignalsUsed: signalsUsed,
    });

    setRecommendedDocs(prev =>
      prev.map(d =>
        d.id === doc.id
          ? {
              ...d,
              tailoringMode: mode,
              tailoringConfidence: confidence,
              templateQuality: templateQuality as RecommendedDocument["templateQuality"],
              templateSignalsUsed: signalsUsed,
            }
          : d,
      ),
    );
  }

  const handleAddEvidence = (
    documentType: string,
    details?: {
      title?: string;
      relatedPillar?: string;
      whyItMatters?: string;
      suggestedSources?: string[];
      relatedTopics?: string[];
      relatedRisks?: string[];
      remediationTaskId?: string;
    },
  ) => {
    const allBuyerQuestions = readinessViewModel?.buyerQuestions || [];
    const relatedQuestions = allBuyerQuestions.filter((q: any) => {
      const needLower = documentType.toLowerCase();
      const matchByEvidenceName = q.relatedEvidence?.some((e: string) => e.toLowerCase().includes(needLower) || needLower.includes(e.toLowerCase()));
      const matchByRisks = q.relatedRisks?.some((r: string) => details?.relatedPillar?.toLowerCase().includes(r.toLowerCase()) || details?.whyItMatters?.toLowerCase().includes(r.toLowerCase()));
      return matchByEvidenceName || matchByRisks;
    });

    const matchingRec = (orchestration?.recommendations as any[])?.find((r: any) => r.category === "evidence_uploads" && r.title.toLowerCase().includes(documentType.toLowerCase()));

    dispatchInteraction({
      type: "OPEN_MODAL",
      modalType: "evidence_upload",
      context: {
        expectedDocumentType: documentType,
        onboardingSessionId: workspaceId ? `onboarding-session-${workspaceId}` : undefined,
        title: details?.title || documentType,
        relatedPillar: details?.relatedPillar || "Compliance & Audit Readiness",
        whyItMatters: details?.whyItMatters || "Required to verify operational safeguards and accelerate enterprise security clearance.",
        suggestedSources: details?.suggestedSources || matchingRec?.evidenceMetadata?.acceptedEvidenceExamples || ["Official Security Policy document", "Technical Architecture specification", "Standard Operating Procedure (SOP)"],
        relatedTopics: details?.relatedTopics || matchingRec?.metadata?.topicKeys || [],
        relatedRisks: details?.relatedRisks || matchingRec?.metadata?.riskKeys || [],
        buyerQuestions: relatedQuestions,
        remediationTaskId: details?.remediationTaskId as string | undefined,
      },
    });
  };

  const handleEvidenceUploadComplete = async (result: {
    documentId: string;
    documentType: string;
    linkedTopics: string[];
    success: boolean;
  }) => {
    if (!result.success) return;

    try {
      const orchestrateRes = await fetch("/api/onboarding/evidence/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          userId,
          documentId: result.documentId,
          expectedDocumentType: interactionState.uploadContext?.expectedDocumentType,
          onboardingSessionId: interactionState.uploadContext?.onboardingSessionId || (workspaceId ? `onboarding-session-${workspaceId}` : undefined),
        }),
      });

      if (orchestrateRes.ok) {
        // Track the successfully uploaded type to dynamically hide/resolve the gap
        if (interactionState.uploadContext?.expectedDocumentType) {
          setUploadedTypes((prev) => [...prev, interactionState.uploadContext!.expectedDocumentType!]);
        }

        const remediationTaskId = interactionState.uploadContext?.remediationTaskId;
        if (remediationTaskId && workspaceId) {
          await persistGovernanceRemediation(remediationTaskId, "evidence_uploaded", {
            evidenceDocumentId: result.documentId,
            evidenceType: interactionState.uploadContext?.expectedDocumentType || result.documentType,
            relatedTopicKeys: result.linkedTopics,
            sourceRationale: interactionState.uploadContext?.title,
            taskSnapshot: interactionState.remediationTarget ?? undefined,
          });
        }

        // Refresh recommendations
        await refreshOrchestrationRecommendations();
      }
    } catch (err) {
      console.error("Failed to process evidence", err);
    }
  };

  async function onFinalizeTopics(selectedTopics?: Set<string>) {
    setSubmitting(true);
    try {
      // Generate onboarding session ID for tracking
      const onboardingSessionId = `onboarding-${workspaceId}-${Date.now()}`;
      
      // Use topics from parameter or fallback to component state
      const topicsToSubmit = selectedTopics || selectedTopicKeys;

      const response = await fetch("/api/onboarding/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: workspaceId,
          topicKeys: Array.from(topicsToSubmit),
          onboardingSessionId,
          profileSignals: {
            industry: industry,
            productType: productType,
            customerSegment: customerSegment,
            complianceTargets: complianceTargets,
            deepProfileJson: analyzedProfile,
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || "Failed to save recommendations";
        console.error("Recommendations save error:", { status: response.status, data: errorData });
        setError(errorMessage);
        throw new Error(errorMessage);
      } else {
        const result = await response.json();
        
        // Log orchestration results
        if (result.workspacePrepared && result.orchestration) {
          console.log("Workspace orchestration completed:", {
            success: result.orchestration.success,
            completedStages: result.orchestration.summary.completedStages,
            failedStages: result.orchestration.summary.failedStages,
            totalEntities: result.orchestration.summary.totalEntities,
            duration: result.orchestration.summary.totalDuration,
            nextActions: result.orchestration.nextActions,
          });

          // Log detailed stage results
          Object.entries(result.orchestration.stageResults).forEach(([stage, stageResult]: [string, any]) => {
            console.log(`Stage ${stage}:`, {
              success: stageResult.success,
              entities: stageResult.entities,
              errors: stageResult.errors,
              warnings: stageResult.warnings,
            });
          });
        }
        
        // Redirect to app on success
        window.location.href = "/app";
      }
    } finally {
      setSubmitting(false);
    }
  }
  const handleSaveProfileReview = async (updatedProfile: any) => {
    // 1. Audit log
    try {
      await fetch("/api/onboarding/profile/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updatedProfile }),
      }).catch(e => console.warn("Audit log failed, continuing.", e));
    } catch (e) {}

    // 2. Map edits back into analyzedSignals & intelligenceProfile
    setIntelligenceProfile((prev: any) => {
      if (!prev) return prev;
      const next = { ...prev };
      
      // We do a shallow copy on businessModel and dataInteractionModel
      next.businessModel = { ...next.businessModel };
      next.dataInteractionModel = { ...next.dataInteractionModel };

      // Update business domain & market category
      next.businessModel.businessDomain = updatedProfile.businessDomain;
      next.businessModel.primaryIndustry = updatedProfile.productType; // Product Type usually maps here
      
      // Map AI Usage back
      if (updatedProfile.aiInteractionModel?.status === "unconfirmed" || updatedProfile.aiInteractionModel?.value?.toLowerCase().includes("no ") || updatedProfile.aiInteractionModel?.value?.toLowerCase().includes("none")) {
        next.dataInteractionModel.usesAIOnCustomerData = { value: false, confidence: 0 };
      } else if (updatedProfile.aiInteractionModel?.status === "confirmed") {
        next.dataInteractionModel.usesAIOnCustomerData = { value: true, confidence: 1 };
      }

      // Map Data Persistence back
      if (updatedProfile.persistenceBehavior?.status === "unconfirmed" || updatedProfile.persistenceBehavior?.value?.toLowerCase().includes("transient") || updatedProfile.persistenceBehavior?.value?.toLowerCase().includes("none")) {
        next.dataInteractionModel.storesCustomerData = { value: false, confidence: 0 };
      } else if (updatedProfile.persistenceBehavior?.status === "confirmed") {
        next.dataInteractionModel.storesCustomerData = { value: true, confidence: 1 };
      }
      
      // Map Scanning Behavior / Infrastructure Interaction back
      if (updatedProfile.scanningBehavior?.status === "unconfirmed" || updatedProfile.scanningBehavior?.value?.toLowerCase().includes("passive") || updatedProfile.scanningBehavior?.value?.toLowerCase().includes("none")) {
        next.dataInteractionModel.scansInfrastructure = { value: false, confidence: 0 };
      } else if (updatedProfile.scanningBehavior?.status === "confirmed") {
        next.dataInteractionModel.scansInfrastructure = { value: true, confidence: 1 };
      }

      return next;
    });

    setAnalyzedSignals((prev: any) => {
      const next = { ...prev };
      if (next.businessDomain) {
        next.businessDomain = { ...next.businessDomain, value: updatedProfile.businessDomain };
      }
      return next;
    });
    
    dispatchInteraction({ type: "CLOSE_INTERACTION" });
  };

  const handleOpenCreateReviewWorkspaceConfirm = () => {
    dispatchInteraction({
      type: "OPEN_MODAL",
      modalType: "create_review_workspace_confirm",
    });
  };





    const compliancePseudoSignal: Signal<string[]> | undefined = analyzedSignals.complianceSignals
      ? {
          value: complianceTargets,
          category: analyzedSignals.complianceSignals.category,
          confidence: analyzedSignals.complianceSignals.confidence,
          source: analyzedSignals.complianceSignals.source,
          citations: analyzedSignals.complianceSignals.citations,
        }
      : undefined;
    const complianceCitations = analyzedSignals.complianceSignals?.citations || [];
    // Calculate raw profile status for resolution detection
    const rawIndustryStatus = deriveFieldStatus(analyzedSignals.industry, industry);
    const rawSegmentStatus = deriveFieldStatus(combineSegmentSignal(analyzedSignals.productType, analyzedSignals.customerSegment), [...productType, ...customerSegment]);
    const rawComplianceStatus = deriveFieldStatus(compliancePseudoSignal, complianceTargets);

    // Check if conflicted fields have been resolved by user selection
    const isIndustryResolved = rawIndustryStatus === "CONFLICTED" && industry.length > 0 && (
      JSON.stringify(industry) === JSON.stringify(analyzedSignals.industry?.value) ||
      JSON.stringify(industry) === JSON.stringify(analyzedSignals.industry?.conflict?.rival?.value)
    );
    // For segment and compliance, any non-empty selection after a conflict is considered a manual resolution
    const isSegmentResolved = rawSegmentStatus === "CONFLICTED" && [...productType, ...customerSegment].length > 0;
    const isComplianceResolved = rawComplianceStatus === "CONFLICTED" && complianceTargets.length > 0;
    
    // Final statuses for UI rendering
    const industryStatus = deriveFieldStatus(analyzedSignals.industry, industry, isIndustryResolved);
    const segmentStatus = deriveFieldStatus(combineSegmentSignal(analyzedSignals.productType, analyzedSignals.customerSegment), [...productType, ...customerSegment], isSegmentResolved);
    const complianceStatus = deriveFieldStatus(compliancePseudoSignal, complianceTargets, isComplianceResolved);

    const allStatuses = [industryStatus, segmentStatus, complianceStatus];
    const readyCount = allStatuses.filter(s => s === "OBSERVED" || s === "DERIVED" || s === "RESOLVED").length;
    const conflictedCount = allStatuses.filter(s => s === "CONFLICTED").length;
    const needsReviewCount = allStatuses.filter(s => s === "LOW_CONFIDENCE_HYPOTHESIS" || s === "UNKNOWN").length;
    const hasUnresolvedConflicts = conflictedCount > 0;

    const isNeedsReview = analysisStatus === "needs_review";

    // Calculate aggregate confidence and evidence count
    const primarySignals = [
      analyzedSignals.industry,
      analyzedSignals.productType,
      analyzedSignals.businessDomain,
      analyzedSignals.complianceSignals
    ].filter(Boolean) as Signal<any>[];

    const aggregateConfidence = primarySignals.length > 0 
      ? primarySignals.reduce((acc, s) => acc + (s.confidence || 0), 0) / primarySignals.length
      : 0.85;

    const allCitations = [
      ...(analyzedSignals.industry?.citations || []),
      ...(analyzedSignals.productType?.citations || []),
      ...(analyzedSignals.businessDomain?.citations || []),
      ...(analyzedSignals.complianceSignals?.citations || []),
      ...(analyzedSignals.structuredCapabilities?.value?.map(c => ({ pageUrl: c.sourceUrl })) || [])
    ];
    const uniqueEvidencePoints = new Set(allCitations.map(c => c.pageUrl)).size;


  const currentFoundation = (orchestration?.summary as any)?.foundation || intelligenceProfile?.workspacePreparation?.workspaceFoundation;

  const readinessViewModel: OnboardingReadinessViewModel | null = useMemo(() => {
    return mapToReadinessViewModel(intelligenceProfile, currentFoundation, aggregateConfidence, analyzedSignals);
  }, [currentFoundation, intelligenceProfile, aggregateConfidence, analyzedSignals]);

  const governanceTaskIds = useMemo(() => {
    const ids: string[] = [];
    const priority = readinessViewModel?.foundation?.priorityActionItem;
    const remaining = readinessViewModel?.foundation?.remainingGovernanceTasks ?? [];
    if (priority?.id) ids.push(priority.id);
    for (const task of remaining) {
      if (task.id) ids.push(task.id);
    }
    return ids;
  }, [readinessViewModel?.foundation?.priorityActionItem, readinessViewModel?.foundation?.remainingGovernanceTasks]);

  const openGovernanceTasksCount = useMemo(
    () => countOpenGovernanceTasks(governanceTaskIds, governanceRemediations),
    [governanceTaskIds, governanceRemediations],
  );

  const remediatedEvidenceTypes = useMemo(
    () => collectSatisfiedEvidenceTypes(governanceRemediations),
    [governanceRemediations],
  );

  const completedEvidenceTypes = useMemo(
    () => [...new Set([...uploadedTypes, ...remediatedEvidenceTypes])],
    [uploadedTypes, remediatedEvidenceTypes],
  );

  const syncExplorerUrl = useCallback(
    (context: ExplorerFilterContext | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (!context) {
        params.delete("explorer");
      } else {
        const serialized = serializeExplorerParam(filterToExplorerParam(context));
        if (serialized) params.set("explorer", serialized);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const openIntelligenceExplorer = useCallback(
    (context?: ExplorerFilterContext) => {
      const filters = context ?? {};
      const tab = resolveExplorerTabFromFilter(filters);
      setExplorerTab(tab);
      dispatchInteraction({
        type: "OPEN_DRAWER",
        drawerType: "intelligence_explorer",
        context: { ...filters, initialTab: tab },
      });
      syncExplorerUrl({ ...filters, initialTab: tab });
      if (typeof window !== "undefined") {
        console.info(OnboardingAnalytics.EXPLORER_OPENED, filters);
      }
    },
    [syncExplorerUrl],
  );

  const closeIntelligenceExplorer = useCallback(() => {
    dispatchInteraction({ type: "CLOSE_INTERACTION" });
    syncExplorerUrl(null);
    if (typeof window !== "undefined") {
      console.info(OnboardingAnalytics.EXPLORER_CLOSED);
    }
  }, [syncExplorerUrl]);

  useEffect(() => {
    if (step !== "REVIEW") return;
    const raw = searchParams.get("explorer");
    if (!raw) return;
    const param = parseExplorerParam(raw);
    if (!param) return;
    const filters = explorerParamToFilter(param);
    const tab = resolveExplorerTabFromFilter(filters);
    setExplorerTab(tab);
    dispatchInteraction({
      type: "OPEN_DRAWER",
      drawerType: "intelligence_explorer",
      context: { ...filters, initialTab: tab },
    });
  }, [step, searchParams]);

  const systemWarning = !currentFoundation && step === "REVIEW" 
    ? "WorkspaceFoundationResult missing from onboarding response."
    : (currentFoundation && currentFoundation.totalRelevantTopicsCount === 0 && (intelligenceProfile?.securityAndTrustModel?.procurementRiskAreas?.length || 0) > 0)
    ? "Detected risk areas are not mapped to trust topics."
    : undefined;



  // Persistent exceptions fetcher and handlers
  useEffect(() => {
    if (!workspaceId) return;
    async function fetchExceptions() {
      try {
        const res = await fetch(`/api/onboarding/evidence/exception?workspaceId=${workspaceId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.exceptions) {
            setExceptions(data.exceptions);
          }
        }
      } catch (err) {
        console.error("Failed to load workspace exceptions:", err);
      }
    }
    fetchExceptions();
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;
    async function fetchGovernanceRemediations() {
      try {
        const res = await fetch(`/api/onboarding/governance/remediation?workspaceId=${workspaceId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.remediations) {
            setGovernanceRemediations(data.remediations);
          }
        }
      } catch (err) {
        console.error("Failed to load governance remediations:", err);
      }
    }
    fetchGovernanceRemediations();
  }, [workspaceId]);

  const persistGovernanceRemediation = async (
    taskId: string,
    action: GovernanceRemediationAction,
    extras?: {
      owner?: string;
      dueDate?: string;
      note?: string;
      evidenceDocumentId?: string;
      evidenceType?: string;
      relatedTopicKeys?: string[];
      sourceRationale?: string;
      taskSnapshot?: RemediationTarget;
    },
  ) => {
    if (!workspaceId) throw new Error("Workspace is required");
    setRemediationSaving(true);
    try {
      const res = await fetch("/api/onboarding/governance/remediation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          taskId,
          action,
          ...extras,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to save remediation");
      }
      const data = await res.json();
      setGovernanceRemediations(data.remediations || {});
      return data.remediation as GovernanceTaskRemediationRecord;
    } finally {
      setRemediationSaving(false);
    }
  };

  const handleRemediateControl = (target: RemediationTarget) => {
    if (typeof window !== "undefined") {
      console.info(OnboardingAnalytics.REMEDIATION_CLICKED, { taskId: target.taskId });
    }
    dispatchInteraction({
      type: "OPEN_DRAWER",
      drawerType: "remediation_details",
      context: target,
    });
  };

  const handleRemediationAddEvidence = (task: RemediationTarget) => {
    dispatchInteraction({ type: "CLOSE_INTERACTION" });
    const primaryEvidence = task.requestedEvidence?.[0] || task.title;
    handleAddEvidence(primaryEvidence, {
      title: task.title,
      relatedPillar: task.relatedPillar,
      whyItMatters: task.whyItMatters,
      relatedRisks: task.relatedRisks,
      relatedTopics: task.relatedTopicKeys,
      remediationTaskId: task.taskId,
    });
  };

  const handleMarkUnavailable = (type: string, gap: { title: string }) => {
    setSelectedExceptionGap({ type, title: gap.title });
  };

  const handleSaveException = async (status: "unavailable" | "not_applicable", reason: string, note: string) => {
    if (!workspaceId || !selectedExceptionGap) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/onboarding/evidence/exception", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          evidenceType: selectedExceptionGap.type,
          status,
          reason,
          note,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setExceptions(data.exceptions || {});
        setSelectedExceptionGap(null);
      } else {
        const errData = await res.json();
        setError(errData.error || "Failed to save exception");
      }
    } catch (err) {
      console.error("Save exception error:", err);
      setError("An unexpected error occurred while saving exception.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveException = async (evidenceType: string) => {
    if (!workspaceId) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/onboarding/evidence/exception", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          evidenceType,
          remove: true,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setExceptions(data.exceptions || {});
        setSelectedExceptionGap(null);
      } else {
        const errData = await res.json();
        setError(errData.error || "Failed to remove exception");
      }
    } catch (err) {
      console.error("Remove exception error:", err);
      setError("An unexpected error occurred while removing exception.");
    } finally {
      setSubmitting(false);
    }
  };

  const showSidebar = shouldShowOnboardingMarketingRail(step);

  // DEV-ONLY INVARIANTS & INSTRUMENTATION
  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as any).__TRUSTDESK_ONBOARDING_DEBUG__ = {
        apiResponseFoundation: intelligenceProfile?.workspacePreparation?.workspaceFoundation,
        apiRiskAreas: intelligenceProfile?.securityAndTrustModel?.procurementRiskAreas,
        apiGeneratedTopics: intelligenceProfile?.workspacePreparation?.recommendedTrustTopics,
        normalizedViewModel: readinessViewModel,
        sourceUsedForEachMetric: "intelligenceProfile -> workspacePreparation -> workspaceFoundation"
      };

      if (readinessViewModel?.riskAreas?.length && readinessViewModel.riskAreas.reduce((sum, r) => sum + r.topicCount, 0) > 0 && readinessViewModel.foundation?.totalRelevantTopicsCount === 0) {
        console.error("INVARIANT FAILED: Risk topic keys exist but foundation topics are zero.");
      }
    }
  }, [intelligenceProfile, readinessViewModel]);

  return (
    <div className="flex min-h-screen bg-surface-base">
      {showSidebar && (
        <OnboardingSidebar 
          currentStep={step}
          workspaceName={workspaceName}
          website={website}
          industry={industry[0]}
          readinessScore={readinessViewModel?.evidenceExplorer?.intelligenceCoverage ? readinessViewModel.evidenceExplorer.intelligenceCoverage / 100 : aggregateConfidence}
          onReanalyze={() => dispatchInteraction({ type: "OPEN_MODAL", modalType: "reanalyze_confirm" })}
        />
      )}
      <main className={cn(
        "flex-1 flex flex-col min-w-0 bg-surface-base relative overflow-y-auto",
        !showSidebar && "w-full"
      )}>
        {step === "ANALYZING" && (
           <AnalysisLoadingState 
             key="step-analyzing"
             website={website}
             onTimeout={() => setStep("PROFILE")}
           />
        )}

        {step === "RECOMMENDATIONS" && (
          <div className="w-full" key="step-recommendations">
            {isTailoring && (
              <div className="py-24 flex flex-col items-center justify-center gap-4 animate-in fade-in zoom-in duration-500">
                 <div className="relative">
                    <div className="absolute inset-0 bg-accent-primary/20 rounded-full blur-xl animate-pulse" />
                    <SparklesIcon className="h-10 w-10 text-accent-primary relative animate-bounce" />
                 </div>
                 <div className="text-center space-y-1">
                    <p className="text-sm font-bold text-text-primary">Preparing personalized recommendations</p>
                    <p className="text-xs text-text-muted">Analyzing your Trust Profile and evidence...</p>
                 </div>
              </div>
            )}

            {!isTailoring && (
              <div className="inner-container py-12">
                <PersonalizedRecommendations
                  key="personalized-recommendations-component"
                  recommendations={(orchestration?.recommendations || []) as any}
                  nextBestActions={(orchestration?.nextBestActions || []) as any}
                  summary={orchestration?.summary || {
                    total: (orchestration?.recommendations || []).length,
                    highPriorityCount: (orchestration?.recommendations || []).filter(r => r.priority === "CRITICAL" || r.priority === "HIGH").length,
                    evidenceBackedCount: (orchestration?.recommendations || []).filter(r => !r.needsReview).length,
                    needsReviewCount: (orchestration?.recommendations || []).filter(r => r.needsReview).length,
                    categoriesCovered: [],
                  }}
                  profileContext={{
                    industry,
                    productType,
                    customerSegment,
                    confidence: 0.8,
                  }}
                  onCompleteSetup={onFinalizeTopics}
                  onUploadDocuments={() => {}}
                  onManualSetup={() => {
                    window.location.href = "/app";
                  }}
                  workspaceId={workspaceId}
                  userId={userId}
                  onboardingSessionId={workspaceId ? `onboarding-session-${workspaceId}` : undefined}
                  onEvidenceUploaded={refreshOrchestrationRecommendations}
                />
              </div>
            )}

            {previewDoc && (
              <DocumentSampleModal 
                doc={previewDoc} 
                onClose={() => setPreviewDoc(null)} 
                onDownload={() => onDownloadDocx(previewDoc.id)}
              />
            )}
          </div>
        )}

        {step !== "ANALYZING" && step !== "RECOMMENDATIONS" && (
          <form onSubmit={step === "DETAILS" ? onCreateWorkspace : onSaveProfile} className="flex flex-col flex-1 h-full">
          {analysisFailure && step === "PROFILE" && (
            <AnalysisFailureBanner failure={analysisFailure} />
          )}
          
          {step === "REVIEW" && (
            <>
              <TopContextBar 
                website={website}
                industry={industry[0]}
                confidence={readinessViewModel?.evidenceExplorer?.intelligenceCoverage ? readinessViewModel.evidenceExplorer.intelligenceCoverage / 100 : aggregateConfidence}
                evidenceCount={readinessViewModel?.foundation?.sourcePagesCount || 0}
                onReanalyze={() => dispatchInteraction({ type: "OPEN_MODAL", modalType: "reanalyze_confirm" })}
              />
              
              {(isReanalyzing || reanalyzeError) && (
                <div className={cn(
                  "border-b px-6 py-3 flex items-center justify-center text-sm font-medium animate-in slide-in-from-top-2",
                  isReanalyzing ? "bg-intelligence-blue/10 text-intelligence-blue border-intelligence-blue/20" : "bg-error-red/10 text-error-red border-error-red/20"
                )}>
                  {isReanalyzing ? "Re-analyzing domain... Please wait, your current data is preserved." : reanalyzeError}
                </div>
              )}

              <StickySectionNav />

              <AppContainer size="xl" className="py-12 lg:py-16 pb-48 animate-in fade-in slide-in-from-bottom-4 duration-1000" key="step-review">
                <div className="space-y-16">
                  {/* Hero Section */}
                  <ReadinessHero 
                    companyName={analyzedProfile?.companyName || website}
                    domain={analyzedSignals.businessDomain?.value || industry[0]}
                    businessSummary={(analyzedProfile as any)?.organizationSummary?.shortDescription || (analyzedProfile as any)?.companyDescription || "Enterprise-grade platform requiring security verification."}
                    confidence={readinessViewModel?.evidenceExplorer?.intelligenceCoverage ? readinessViewModel.evidenceExplorer.intelligenceCoverage / 100 : aggregateConfidence}
                    evidencePoints={readinessViewModel?.foundation?.sourcePagesCount || 0}
                    securityPillarsIdentifiedCount={readinessViewModel?.foundation?.securityPillarsIdentifiedCount || 0}
                    totalRelevantTopicsCount={readinessViewModel?.foundation?.totalRelevantTopicsCount || 0}
                    autoReadyTopicsCount={readinessViewModel?.foundation?.autoReadyTopicsCount || 0}
                    evidenceNeedsCount={readinessViewModel?.foundation?.evidenceNeedsCount || 0}
                    clarificationTasksCount={
                      governanceTaskIds.length > 0
                        ? openGovernanceTasksCount
                        : readinessViewModel?.foundation?.clarificationTasksCount || 0
                    }
                    onReanalyze={() => dispatchInteraction({ type: "OPEN_MODAL", modalType: "reanalyze_confirm" })}
                    onExplore={() => openIntelligenceExplorer()}
                  />

                  {/* Foundation Summary & Warnings */}
                  <div id="section-summary">
                    <ReadinessFoundationSummary 
                      securityPillarsIdentifiedCount={readinessViewModel?.foundation?.securityPillarsIdentifiedCount || 0}
                      autoReadyTopicsCount={readinessViewModel?.foundation?.autoReadyTopicsCount || 0}
                      reviewSuggestedTopicsCount={readinessViewModel?.foundation?.reviewSuggestedTopicsCount || 0}
                      needsEvidenceTopicsCount={readinessViewModel?.foundation?.needsEvidenceTopicsCount || 0}
                      answerScaffoldsReadyCount={readinessViewModel?.foundation?.answerScaffoldsReadyCount || 0}
                      evidenceNeedsCount={readinessViewModel?.foundation?.evidenceNeedsCount || 0}
                      clarificationTasksCount={
                        governanceTaskIds.length > 0
                          ? openGovernanceTasksCount
                          : readinessViewModel?.foundation?.clarificationTasksCount || 0
                      }
                      pillars={readinessViewModel?.foundation?.pillars || []}
                      evidenceNeeds={readinessViewModel?.foundation?.evidenceNeeds || []}
                      resolvedEvidenceNeeds={readinessViewModel?.foundation?.resolvedEvidenceNeeds || []}
                      onAddEvidence={handleAddEvidence}
                      onExploreEvidenceGap={(evidenceType) =>
                        openIntelligenceExplorer({
                          evidenceNeedId: evidenceType,
                          initialTab: "evidence-needs",
                          highlightId: evidenceType,
                        })
                      }
                      onExplorePillar={(pillarKey) =>
                        openIntelligenceExplorer({
                          pillarKey,
                          initialTab: "trust-topics",
                          highlightId: pillarKey,
                        })
                      }
                      completedEvidenceTypes={completedEvidenceTypes}
                      warnings={readinessViewModel?.foundation?.warnings}
                      systemWarning={systemWarning}
                      onInitialize={handleOpenCreateReviewWorkspaceConfirm}
                      submitting={submitting}
                      disabled={hasUnresolvedConflicts}
                      exceptions={exceptions}
                      onMarkUnavailable={handleMarkUnavailable}
                    />
                  </div>

                  {/* Operational Intelligence Profile */}
                  <div id="section-profile">
                    <ReadinessOperationalProfile 
                      profile={readinessViewModel?.operationalProfile || null}
                    />
                  </div>

                  {/* Capability Intelligence */}
                  <div id="section-capabilities">
                    <ReadinessCapabilityIntelligence 
                      businessDomain={readinessViewModel?.operationalProfile?.businessDomain}
                      productType={readinessViewModel?.operationalProfile?.productType}
                      marketCategory={readinessViewModel?.operationalProfile?.marketCategory}
                      onExploreEvidence={(capabilityKey, evidenceUrl) =>
                        openIntelligenceExplorer({
                          capabilityKey,
                          initialTab: evidenceUrl ? "evidence-snippets" : "capabilities",
                          highlightId: evidenceUrl || capabilityKey,
                        })
                      }
                      deployment={readinessViewModel?.operationalProfile?.deployment}
                      capabilities={readinessViewModel?.capabilities || []}
                    />
                  </div>

                  {/* Operational Workflows Timeline */}
                  {readinessViewModel?.foundation?.operationalWorkflows && readinessViewModel.foundation.operationalWorkflows.length > 0 && (
                    <div id="section-workflows" className="pt-16 border-t border-surface-border/50">
                      <ReadinessOperationalWorkflows 
                        workflows={readinessViewModel.foundation.operationalWorkflows}
                      />
                    </div>
                  )}

                  {/* Simulated Buyer Procurement Questions */}
                  <div id="section-questions">
                    <ReadinessBuyerQuestions
                      questions={readinessViewModel?.buyerQuestions || []}
                      onAddEvidence={(question) => {
                        dispatchInteraction({
                          type: "OPEN_EVIDENCE_UPLOAD",
                          payload: {
                            expectedDocumentType: "buyer_question_evidence",
                            title: `Evidence for: ${question.question}`,
                            relatedPillar: question.concernDomain,
                            whyItMatters: question.whyBuyersAskThis,
                            relatedTopics: question.relatedTrustTopics,
                            relatedRisks: question.relatedRisks,
                            buyerQuestions: [question],
                          },
                        });
                      }}
                      onCreateAnswerDraft={(question) => {
                        if (question.answerReadiness === "blocked" || (question.missingEvidence && question.missingEvidence.length > 0)) {
                          // Show blocking message or alert
                          alert("Answer draft blocked until evidence is added or confirmed.");
                        } else {
                          // TODO: Implement answer draft creation
                          console.log("Create answer draft for question:", question.id);
                        }
                      }}
                    />
                  </div>

                  {/* Procurement Risk Areas */}
                  <div id="section-risks">
                    <ReadinessRiskAreas 
                      riskAreas={readinessViewModel?.riskAreas || []}
                      onInspectRisk={(riskKey) => {
                        if (typeof window !== "undefined") {
                          console.info(OnboardingAnalytics.RISK_REVIEW_DETAILS_OPENED, { riskKey });
                        }
                        openIntelligenceExplorer({
                          riskKey,
                          initialTab: "risks",
                          highlightId: riskKey,
                        });
                      }}
                    />
                  </div>

                  {/* Technical Security Profile (Full Width) */}
                  <div className="w-full">
                    <ReadinessOperationalModel 
                      operationalModel={readinessViewModel?.operationalSignals || []}
                    />
                  </div>

                  <div id="section-actions">

                  {/* Priority Action Item (Full Width, High Emphasis) */}
                  {readinessViewModel?.foundation?.priorityActionItem && (
                    <div className="mt-12 pt-12 border-t border-surface-border/50">
                      <ReadinessClarificationTasks 
                        tasks={[readinessViewModel.foundation.priorityActionItem]}
                        isCompactHeader={false}
                        customTitle="Priority Action Item"
                        customSubtitle="Immediate action required to resolve initial blocker."
                        showProTip={!readinessViewModel.foundation.remainingGovernanceTasks || readinessViewModel.foundation.remainingGovernanceTasks.length === 0}
                        taskRemediations={governanceRemediations}
                        onRemediate={handleRemediateControl}
                      />
                    </div>
                  )}

                  {/* Remaining Governance Tasks (Full Width) */}
                  {readinessViewModel?.foundation?.remainingGovernanceTasks && readinessViewModel.foundation.remainingGovernanceTasks.length > 0 && (
                    <div className="mt-12 pt-12 border-t border-surface-border/50">
                      <ReadinessClarificationTasks 
                        tasks={readinessViewModel.foundation.remainingGovernanceTasks}
                        isCompactHeader={true}
                        customTitle="Remaining Governance Action Items"
                        customSubtitle="Follow-up remediation steps to complete security tailoring."
                        showProTip={true}
                        taskRemediations={governanceRemediations}
                        onRemediate={handleRemediateControl}
                      />
                    </div>
                  )}
                  </div>

                  {/* Intelligence Explorer (Deep Dive) */}
                  <div className="pt-20 border-t border-surface-border/50" id="intelligence-explorer">
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
                      <div className="space-y-2">
                        <AppBadge variant="brand" className="text-[9px] uppercase tracking-[0.2em] px-3">Raw Signal Audit</AppBadge>
                        <AppTypography.SectionTitle className="!text-3xl font-black tracking-tight">Evidence &amp; Signal Explorer</AppTypography.SectionTitle>
                        <AppTypography.Body className="max-w-[600px] text-text-secondary">
                          Inspect the raw evidence chains, architectural signals, and reasoning extracted from your digital footprint.
                        </AppTypography.Body>
                      </div>
                      <AppButton 
                        variant="outline" 
                        onClick={() => openIntelligenceExplorer()}
                        className="h-12 px-6 rounded-xl border-intelligence-blue/20 bg-intelligence-blue/[0.03] text-intelligence-blue hover:bg-intelligence-blue/[0.06] font-black uppercase tracking-widest text-[10px]"
                      >
                        <SearchIcon className="h-3.5 w-3.5 mr-2" />
                        Launch Full Explorer
                      </AppButton>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                      <ExplorerTeaserCard 
                        title="Risk Evidence" 
                        count={readinessViewModel?.evidenceExplorer?.riskEvidenceCount || 0}
                        description="Direct mappings from capabilities to enterprise procurement risks."
                        onClick={() => openIntelligenceExplorer({ initialTab: "risks" })}
                      />
                      <ExplorerTeaserCard 
                        title="Trust Topics" 
                        count={readinessViewModel?.evidenceExplorer?.trustTopicCount || 0}
                        description="AI-generated knowledge areas ready for automated seeding."
                        onClick={() => openIntelligenceExplorer({ initialTab: "trust-topics" })}
                      />
                      <ExplorerTeaserCard 
                        title="Source Pages" 
                        count={readinessViewModel?.evidenceExplorer?.sourcePageCount || 0}
                        description="Specific URLs where security and compliance evidence was found."
                        onClick={() => openIntelligenceExplorer({ initialTab: "source-pages" })}
                      />
                      <ExplorerTeaserCard 
                        title="Intelligence Coverage" 
                        count={readinessViewModel?.evidenceExplorer?.intelligenceCoverage || 0}
                        unit="%"
                        description="Coverage reflects extraction completeness and evidence discovery quality, not final procurement certainty."
                        onClick={() => openIntelligenceExplorer({ initialTab: "diagnostics" })}
                      />
                    </div>
                  </div>
                </div>
              </AppContainer>
              <ReviewActionBar 
                onReviewProfile={() => dispatchInteraction({ type: "OPEN_DRAWER", drawerType: "profile_review" })}
                onEnterWorkspace={handleOpenCreateReviewWorkspaceConfirm}
                submitting={submitting}
                hasUnresolvedConflicts={hasUnresolvedConflicts}
                conflictedCount={conflictedCount}
                confidence={readinessViewModel?.evidenceExplorer?.intelligenceCoverage ? readinessViewModel.evidenceExplorer.intelligenceCoverage / 100 : aggregateConfidence}
                evidenceCount={readinessViewModel?.foundation?.citationsCount || 0}
                securityPillarsIdentifiedCount={readinessViewModel?.foundation?.securityPillarsIdentifiedCount || 0}
                totalRelevantTopicsCount={readinessViewModel?.foundation?.totalRelevantTopicsCount || 0}
                autoReadyTopicsCount={readinessViewModel?.foundation?.autoReadyTopicsCount || 0}
                clarificationTasksCount={
                  governanceTaskIds.length > 0
                    ? openGovernanceTasksCount
                    : readinessViewModel?.foundation?.clarificationTasksCount || 0
                }
                error={error}
                fullWidth={!showSidebar}
              />

              {interactionState.activeModal === "evidence_upload" && (
                <EvidenceUploadModal
                  isOpen={interactionState.activeModal === "evidence_upload"}
                  onClose={() => dispatchInteraction({ type: "CLOSE_INTERACTION" })}
                  workspaceId={workspaceId}
                  userId={userId}
                  onboardingSessionId={interactionState.uploadContext?.onboardingSessionId || (workspaceId ? `onboarding-session-${workspaceId}` : undefined)}
                  expectedDocumentType={interactionState.uploadContext?.expectedDocumentType}
                  title={interactionState.uploadContext?.title}
                  relatedPillar={interactionState.uploadContext?.relatedPillar}
                  whyItMatters={interactionState.uploadContext?.whyItMatters}
                  suggestedSources={interactionState.uploadContext?.suggestedSources}
                  relatedTopics={interactionState.uploadContext?.relatedTopics}
                  relatedRisks={interactionState.uploadContext?.relatedRisks}
                  buyerQuestions={interactionState.uploadContext?.buyerQuestions}
                  documentReviewHref="/app/documents"
                  onComplete={handleEvidenceUploadComplete}
                />
              )}

              {selectedExceptionGap && (
                <EvidenceExceptionModal
                  isOpen={!!selectedExceptionGap}
                  onClose={() => setSelectedExceptionGap(null)}
                  workspaceId={workspaceId}
                  evidenceType={selectedExceptionGap.type}
                  evidenceTitle={selectedExceptionGap.title}
                  existingException={exceptions[selectedExceptionGap.type]}
                  onSave={async (payload) => {
                    await handleSaveException(payload.status, payload.reason, payload.note);
                  }}
                  onRemove={async () => {
                    await handleRemoveException(selectedExceptionGap.type);
                  }}
                />
              )}

              {interactionState.activeModal === "create_review_workspace_confirm" && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                  <div 
                    className="absolute inset-0 bg-black/60 backdrop-blur-md transition-opacity duration-300 animate-in fade-in"
                    onClick={() => dispatchInteraction({ type: "CLOSE_INTERACTION" })} 
                  />
                  <div className="relative w-full max-w-xl rounded-3xl bg-brand-navy/95 border border-white/10 p-8 shadow-[0_20px_60px_rgba(0,0,0,0.8)] animate-in fade-in zoom-in-95 duration-300 flex flex-col gap-6">
                    <div className="space-y-2">
                      <div className="h-12 w-12 rounded-2xl bg-intelligence-blue/15 border border-intelligence-blue/30 flex items-center justify-center text-intelligence-blue mb-4">
                        <ShieldIcon className="h-6 w-6" />
                      </div>
                      <AppTypography.SectionTitle className="!text-white !text-2xl !font-black tracking-tight">
                        Create review workspace?
                      </AppTypography.SectionTitle>
                      <AppTypography.Body className="!text-white/70 !text-sm leading-relaxed">
                        TrustDesk will create a review workspace with {readinessViewModel?.foundation?.totalRelevantTopicsCount || 0} trust topics, {readinessViewModel?.foundation?.evidenceNeedsCount || 0} evidence needs, and {readinessViewModel?.foundation?.clarificationTasksCount || 0} confirmations. No answers or claims will be auto-approved until evidence is added or reviewed.
                      </AppTypography.Body>
                    </div>

                    {/* Summary statistics */}
                    <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5 space-y-4">
                      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30">
                        Workspace Summary Checklist
                      </div>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-white/60 font-medium">Trust topics to seed</span>
                          <span className="font-bold text-white bg-white/10 px-2.5 py-0.5 rounded-lg text-[11px]">{readinessViewModel?.foundation?.totalRelevantTopicsCount || 0}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-white/60 font-medium">Evidence needs to create</span>
                          <span className="font-bold text-white bg-white/10 px-2.5 py-0.5 rounded-lg text-[11px]">{readinessViewModel?.foundation?.evidenceNeedsCount || 0}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-white/60 font-medium">Governance tasks to create</span>
                          <span className="font-bold text-white bg-white/10 px-2.5 py-0.5 rounded-lg text-[11px]">{readinessViewModel?.foundation?.clarificationTasksCount || 0}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-white/60 font-medium">Buyer questions to retain</span>
                          <span className="font-bold text-white bg-white/10 px-2.5 py-0.5 rounded-lg text-[11px]">{readinessViewModel?.buyerQuestions?.length || 0}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-white/60 font-medium">Source citations to preserve</span>
                          <span className="font-bold text-white bg-white/10 px-2.5 py-0.5 rounded-lg text-[11px]">{readinessViewModel?.foundation?.citationsCount || 0}</span>
                        </div>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-col gap-3">
                      <AppButton
                        onClick={async () => {
                          setError(null);
                          dispatchInteraction({ type: "START_ACTION", loadingAction: "creating_workspace" });
                          try {
                            await onFinalizeTopics();
                            dispatchInteraction({ type: "ACTION_SUCCESS" });
                            dispatchInteraction({ type: "CLOSE_INTERACTION" });
                          } catch (err: any) {
                            dispatchInteraction({ type: "ACTION_ERROR", error: err.message || "Failed to initialize workspace." });
                            setError(err.message || "Failed to initialize workspace. Please try again.");
                          }
                        }}
                        isLoading={interactionState.loadingAction === "creating_workspace"}
                        className="h-13 w-full rounded-2xl bg-intelligence-blue hover:bg-intelligence-blue-hover text-white font-black uppercase tracking-widest text-[11px] shadow-premium-lg"
                      >
                        Create Review Workspace
                      </AppButton>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            dispatchInteraction({ type: "CLOSE_INTERACTION" });
                            // Smooth scroll to top evidence gaps
                            document.getElementById("top-evidence-gaps")?.scrollIntoView({ behavior: "smooth" });
                          }}
                          className="h-12 rounded-xl border border-white/10 bg-white/[0.02] text-white/80 hover:text-white hover:bg-white/[0.05] font-black uppercase tracking-widest text-[10px] transition-all"
                        >
                          Review Evidence First
                        </button>
                        <button
                          type="button"
                          onClick={() => dispatchInteraction({ type: "CLOSE_INTERACTION" })}
                          className="h-12 rounded-xl border border-white/5 bg-transparent text-white/50 hover:text-white/80 font-black uppercase tracking-widest text-[10px] transition-all"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Conditional Steps */}
      {crawlHealthSnapshot && step === "PROFILE" && (
        <EvidenceDiagnostics
          domainSummary={convertToDomainEvidenceSummary(crawlHealthSnapshot, analysisHealthSnapshot?.extraction, analysisDiagnosticsSnapshot)}
          fieldEvidence={convertToFieldEvidence(analyzedSignals)}
          onAddEvidence={() => {
            // TODO: Add evidence collection handler
            console.log("Add evidence clicked");
          }}
          onTryAnotherUrl={() => {
            // TODO: Add URL retry handler
            console.log("Try another URL clicked");
          }}
          onContinueManually={() => {
            // TODO: Add manual continuation handler
            console.log("Continue manually clicked");
          }}
        />
      )}
      {step === "DETAILS" && (
        <AppContainer className="max-w-[640px] animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="space-y-3 mb-10 text-center">
            <AppBadge variant="brand" className="mx-auto">New Workspace</AppBadge>
            <AppTypography.HeroTitle className="!text-3xl lg:!text-4xl">Create your workspace</AppTypography.HeroTitle>
            <AppTypography.Body className="max-w-[440px] mx-auto text-base !text-text-secondary opacity-80">
              Your workspace is the private home for your documents, answers, and questionnaire reviews.
            </AppTypography.Body>
          </div>

          <AppCard variant="hero" className="!p-8 md:!p-12 shadow-premium-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-6 opacity-[0.03] pointer-events-none">
               <SparklesIcon className="h-12 w-12" />
            </div>

            {collisionData ? (
              <div className="text-center">
                <div className="inline-flex h-16 w-16 items-center justify-center rounded-3xl bg-accent-primary/10 mb-6">
                  <AppIcon icon={ShieldCheckIcon} variant="brand" size="lg" />
                </div>
                <AppTypography.SubSection className="mb-2 text-xl">You&apos;re already set up!</AppTypography.SubSection>
                <AppTypography.BodySm className="mb-8">
                  It looks like you or your organization already has an active workspace named{" "}
                  <span className="font-bold text-text-primary">&quot;{collisionData.workspaceName}&quot;</span>.
                </AppTypography.BodySm>

                <AppButton
                  onClick={() => {
                    const url = collisionData.isProfileComplete ? "/app" : "/onboarding";
                    window.location.href = url;
                  }}
                  className="w-full h-14 rounded-2xl shadow-premium-xl"
                >
                  {collisionData.isProfileComplete ? "Go to Workspace" : "Continue to Dashboard"}
                </AppButton>
                <AppTypography.Metadata className="mt-4 opacity-50 italic">
                  Note: Multiple workspaces per user are currently restricted during the early access phase.
                </AppTypography.Metadata>
              </div>
            ) : (
              <div className="space-y-10">
                <div className="space-y-6">
                  <div>
                    <AppLabel>Workspace Name</AppLabel>
                    <AppInput
                      type="text"
                      required
                      value={workspaceName}
                      onChange={(e) => setWorkspaceName(e.target.value)}
                      placeholder="Acme Security"
                    />
                  </div>
                  <div>
                    <AppLabel className="flex items-center justify-between">
                      Company Website 
                      <span className="text-[10px] lowercase font-medium opacity-50">optional</span>
                    </AppLabel>
                    <AppInput
                      type="text"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                      placeholder="acme.com"
                    />
                    <AppTypography.BodySm className="mt-2.5 !text-[13px] !text-text-secondary opacity-80 leading-relaxed">
                      We&apos;ll scan your site to build your Trust Profile—suggesting relevant compliance topics and pre-populating questionnaire answers.
                    </AppTypography.BodySm>
                  </div>
                </div>

                {error && (
                  <div className="rounded-2xl border border-semantic-error/20 bg-semantic-error/5 p-4 flex gap-4 animate-in fade-in slide-in-from-top-2">
                    <AppIcon icon={AlertCircleIcon} variant="error" size="sm" className="mt-0.5" />
                    <AppTypography.BodySm className="!text-semantic-error font-medium">{error}</AppTypography.BodySm>
                  </div>
                )}

                <AppButton
                  type="submit"
                  isLoading={submitting}
                  className="w-full h-12 rounded-[14px] shadow-premium-xl mt-4 flex items-center justify-center gap-2"
                >
                  Create Workspace
                  <ArrowRightIcon className="h-4 w-4" />
                </AppButton>

                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-surface-border/50"></div></div>
                  <div className="relative flex justify-center text-[10px] uppercase font-bold tracking-[0.08em] text-text-muted"><span className="bg-surface-base px-4">OR</span></div>
                </div>

                <button
                  type="button"
                  onClick={onTryDemo}
                  disabled={submitting}
                  className="w-full h-[46px] rounded-[14px] border border-intelligence-blue/20 bg-intelligence-blue/[0.03] flex items-center justify-center gap-3 text-intelligence-blue hover:bg-intelligence-blue/[0.06] transition-all active:scale-[0.99] disabled:opacity-50 mt-2"
                >
                  <SparklesIcon className="h-4 w-4 animate-pulse" />
                  <span className="text-[13px] font-bold uppercase tracking-[0.04em]">Try a Demo Workspace</span>
                </button>
              </div>
            )}
          </AppCard>
        </AppContainer>
      )}

      {step === "PROFILE" && (
        <AppContainer className="max-w-4xl animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="space-y-4 mb-10 text-center">
            <AppBadge variant="brand" className="mx-auto">Trust Profile</AppBadge>
            <AppTypography.HeroTitle>Tailor your trust profile</AppTypography.HeroTitle>
            <AppTypography.Body className="max-w-2xl mx-auto">
              Tell us a bit about your business so we can recommend the most relevant trust topics and evidence requirements.
            </AppTypography.Body>
          </div>

          <AppCard variant="hero" className="!p-8 md:!p-16 shadow-premium-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-6 opacity-[0.03] pointer-events-none">
               <SparklesIcon className="h-12 w-12" />
            </div>

            <div className="space-y-12">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                {/* Industry */}
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <AppIcon icon={BuildingIcon} variant="brand" size="sm" />
                    <AppTypography.SubSection className="!text-[11px] uppercase tracking-widest opacity-60">Industry / Business Domain</AppTypography.SubSection>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {["software", "fintech", "healthtech", "ecommerce", "other"].map(ind => (
                      <button
                        key={ind}
                        type="button"
                        onClick={() => toggleIndustry(ind)}
                        className={cn(
                          "rounded-xl border p-4 text-xs font-black uppercase tracking-widest transition-all",
                          industry.includes(ind)
                            ? "border-accent-primary bg-accent-primary/[0.04] text-accent-primary shadow-premium-sm"
                            : "border-surface-border text-text-muted bg-surface-base hover:bg-surface-base-hover hover:border-surface-border-hover",
                        )}
                      >
                        {ind}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-10">
                  {/* Product Type */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <AppIcon icon={CloudIcon} variant="brand" size="sm" />
                      <AppTypography.SubSection className="!text-[11px] uppercase tracking-widest opacity-60">Deployment / Product Type</AppTypography.SubSection>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { id: "saas", label: "Cloud / SaaS" },
                        { id: "on-premise", label: "On-Premise" },
                        { id: "hybrid", label: "Hybrid" },
                        { id: "mobile", label: "Native / Mobile" }
                      ].map(type => (
                        <button
                          key={type.id}
                          type="button"
                          onClick={() => toggleProductType(type.id)}
                          className={cn(
                            "rounded-xl border p-4 text-xs font-black uppercase tracking-widest transition-all",
                            productType.includes(type.id)
                              ? "border-accent-primary bg-accent-primary/[0.04] text-accent-primary shadow-premium-sm"
                              : "border-surface-border text-text-muted bg-surface-base hover:bg-surface-base-hover hover:border-surface-border-hover",
                          )}
                        >
                          {type.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Data Types */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <AppIcon icon={DatabaseIcon} variant="brand" size="sm" />
                      <AppTypography.SubSection className="!text-[11px] uppercase tracking-widest opacity-60">Data Types Handled</AppTypography.SubSection>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {["PII", "PHI", "PCI", "Financial Records", "Secrets"].map(type => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => toggleDataType(type)}
                          className={cn(
                            "rounded-full border px-5 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all",
                            dataTypes.includes(type)
                              ? "border-text-primary bg-text-primary text-white shadow-premium-md"
                              : "border-surface-border text-text-muted bg-surface-base hover:bg-surface-base-hover hover:text-text-primary",
                          )}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {error && (
                <div className="rounded-2xl border border-semantic-error/20 bg-semantic-error/5 p-4 flex gap-4">
                  <AppIcon icon={AlertCircleIcon} variant="error" size="sm" className="mt-0.5" />
                  <AppTypography.BodySm className="!text-semantic-error font-medium">{error}</AppTypography.BodySm>
                </div>
              )}

              <div className="flex gap-4">
                <AppButton
                  variant="outline"
                  type="button"
                  onClick={() => setStep("DETAILS")}
                  className="flex-1 h-14 rounded-2xl"
                >
                  Back
                </AppButton>
                <AppButton
                  type="submit"
                  isLoading={submitting}
                  className="flex-[2] h-14 rounded-2xl shadow-premium-xl"
                >
                  {submitting ? "Processing..." : "See Recommendations"}
                </AppButton>
              </div>
            </div>
          </AppCard>
        </AppContainer>
      )}

      <div className="mt-2 text-center">
        <a href="/api/auth/logout" className="text-xs text-text-muted hover:text-text-secondary transition-colors">
          Not your organization? <span className="underline decoration-text-muted/30 underline-offset-4">Sign out</span>
        </a>
      </div>
          {/* Close the main form and shell */}
        </form>
        )}

        <IntelligenceExplorer 
          isOpen={interactionState.activeDrawer === "intelligence_explorer"}
          onClose={closeIntelligenceExplorer}
          profile={intelligenceProfile}
          readinessViewModel={readinessViewModel}
          filters={interactionState.explorerFilters}
          activeTab={explorerTab}
          onTabChange={(tab) => {
            setExplorerTab(tab);
            if (interactionState.explorerFilters) {
              syncExplorerUrl({ ...interactionState.explorerFilters, initialTab: tab });
            }
          }}
        />

        <RemediationDrawer
          isOpen={interactionState.activeDrawer === "remediation_details"}
          onClose={() => dispatchInteraction({ type: "CLOSE_INTERACTION" })}
          task={interactionState.remediationTarget}
          remediation={
            interactionState.remediationTarget
              ? governanceRemediations[interactionState.remediationTarget.taskId]
              : null
          }
          isSaving={remediationSaving}
          onAddEvidence={handleRemediationAddEvidence}
          onMarkNotApplicable={async (note) => {
            const task = interactionState.remediationTarget;
            if (!task) return;
            await persistGovernanceRemediation(task.taskId, "not_applicable", {
              note,
              sourceRationale: task.sourceRationale,
              taskSnapshot: task,
            });
          }}
          onConfirmManually={async (note) => {
            const task = interactionState.remediationTarget;
            if (!task) return;
            await persistGovernanceRemediation(task.taskId, "confirm", {
              note,
              sourceRationale: task.sourceRationale,
              taskSnapshot: task,
            });
          }}
          onAssignOwner={async (owner, note) => {
            const task = interactionState.remediationTarget;
            if (!task) return;
            await persistGovernanceRemediation(task.taskId, "assign_owner", {
              owner,
              note,
              taskSnapshot: task,
            });
          }}
          onSetDueDate={async (dueDate, note) => {
            const task = interactionState.remediationTarget;
            if (!task) return;
            await persistGovernanceRemediation(task.taskId, "set_due_date", {
              dueDate,
              note,
              taskSnapshot: task,
            });
          }}
          onAddNote={async (note) => {
            const task = interactionState.remediationTarget;
            if (!task) return;
            await persistGovernanceRemediation(task.taskId, "add_note", {
              note,
              taskSnapshot: task,
            });
          }}
        />

        <ProfileReviewDrawer
          isOpen={interactionState.activeDrawer === "profile_review"}
          onClose={() => dispatchInteraction({ type: "CLOSE_INTERACTION" })}
          initialProfile={readinessViewModel?.operationalProfile || null}
          onSaveProfileReview={handleSaveProfileReview}
        />

        <ReanalyzeConfirmationModal
          isOpen={interactionState.activeModal === "reanalyze_confirm"}
          onClose={() => dispatchInteraction({ type: "CLOSE_INTERACTION" })}
          domain={website}
          onReanalyzeSameDomain={() => {
            dispatchInteraction({ type: "CLOSE_INTERACTION" });
            performReanalysis(website);
          }}
          onChangeDomain={() => {
            dispatchInteraction({ type: "CLOSE_INTERACTION" });
            setStep("DOMAIN_INPUT");
          }}
        />

      </main>
    </div>
  );
}

/**
 * Server responses occasionally return a scalar string where our UI expects
 * `string[]` (e.g. `{ value: "saas" }` instead of `{ value: ["saas"] }`).
 * Normalize the whole Signal<string[]> graph so downstream renderers can
 * safely call `.map`/`.length` on every `value` field — including candidates
 * and conflict rivals — without runtime type checks scattered everywhere.
 */
function normalizeStringArraySignal(
  signal: Signal<string[]> | undefined | null,
): Signal<string[]> | undefined {
  if (!signal || typeof signal !== "object") return undefined;
  const toArr = (v: unknown): string[] => {
    if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
    if (typeof v === "string") return v.length > 0 ? [v] : [];
    return [];
  };
  const candidates = Array.isArray(signal.candidates)
    ? signal.candidates.map(c => ({ ...c, value: toArr(c?.value) }))
    : undefined;
  const rival = signal.conflict?.rival
    ? { ...signal.conflict.rival, value: toArr(signal.conflict.rival.value) }
    : undefined;
  const conflict = signal.conflict
    ? { ...signal.conflict, ...(rival ? { rival } : {}) }
    : undefined;
  return {
    ...signal,
    value: toArr(signal.value),
    ...(candidates ? { candidates } : {}),
    ...(conflict ? { conflict } : {}),
  };
}

function combineSegmentSignal(
  productType: Signal<string[]> | undefined,
  customerSegment: Signal<string[]> | undefined,
): Signal<string[]> | undefined {
  if (!productType && !customerSegment) return undefined;
  // Surface the weaker of the two categories so the badge cannot overstate certainty.
  const categories: SignalCategory[] = ["HYPOTHESIZED", "DERIVED", "OBSERVED"];
  const rank = (c?: SignalCategory) => (c ? categories.indexOf(c) : 0);
  const weakest = rank(productType?.category) <= rank(customerSegment?.category) ? productType : customerSegment;
  
  const value = [
    ...(productType?.value || []),
    ...(customerSegment?.value || [])
  ];

  // Union citations so the combined card can render evidence from BOTH halves.
  const citations = [
    ...(productType?.citations ?? []),
    ...(customerSegment?.citations ?? []),
  ];

  // If either half disagrees internally, surface the conflict on the fused card.
  const hasConflict =
    !!productType?.conflict?.hasConflict || !!customerSegment?.conflict?.hasConflict;

  return {
    value,
    category: weakest?.category ?? "HYPOTHESIZED",
    confidence: Math.min(productType?.confidence ?? 1, customerSegment?.confidence ?? 1),
    source: productType?.source ?? customerSegment?.source,
    citations: citations.length > 0 ? citations : undefined,
    conflict: hasConflict ? { hasConflict: true } : undefined,
  };
}

const REVIEW_FIELD_CARD_CLASS = cn(
  "rounded-2xl border border-surface-border bg-surface-base p-5 sm:p-6 lg:p-7",
  "shadow-sm ring-1 ring-black/[0.02] transition-shadow dark:ring-white/[0.04] hover:shadow-md",
);

function formatConfidencePct(confidence: number) {
  return Math.round(Math.max(0, Math.min(1, confidence)) * 100);
}

export function getConfidenceBandLabel(band?: string | null): string {
  switch (band) {
    case "high":
      return "High confidence";
    case "medium":
      return "Medium confidence";
    case "limited":
      return "Limited evidence";
    case "unknown":
      return "Needs your decision";
    default:
      return "Needs your decision";
  }
}

export function getConfidenceBandColor(band?: string | null): string {
  switch (band) {
    case "high":
      return "text-trust-green";
    case "medium":
      return "text-intelligence-blue";
    case "limited":
      return "text-warning-amber";
    case "unknown":
      return "text-error-red";
    default:
      return "text-error-red";
  }
}

export function formatConfidenceDisplay(signal: any): { label: string; color: string; showPercentage: boolean } {
  // Use backend confidence band if available
  if (signal.confidenceBand) {
    return {
      label: getConfidenceBandLabel(signal.confidenceBand),
      color: getConfidenceBandColor(signal.confidenceBand),
      showPercentage: false,
    };
  }
  
  // Fallback to percentage for backward compatibility
  const pct = formatConfidencePct(signal.confidence);
  if (pct >= 80) {
    return {
      label: "High confidence",
      color: "text-trust-green",
      showPercentage: true,
    };
  } else if (pct >= 60) {
    return {
      label: "Medium confidence",
      color: "text-intelligence-blue",
      showPercentage: true,
    };
  } else if (pct >= 40) {
    return {
      label: "Limited evidence",
      color: "text-warning-amber",
      showPercentage: true,
    };
  } else {
    return {
      label: "Needs your decision",
      color: "text-error-red",
      showPercentage: true,
    };
  }
}

function CitationSourcesBlock({
  citations,
  fallbackSource,
  signal,
}: {
  citations: SignalCitation[];
  fallbackSource?: string;
  signal?: Signal<any>;
}) {
  const confidence = signal ? formatConfidenceDisplay(signal) : null;

  if (citations.length > 0) {
    return (
      <div className="mt-4 border-t border-surface-border pt-4">
        {confidence && (
          <div className="mb-3 flex items-center gap-2">
            <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Confidence:</span>
            <span className={cn("text-xs font-bold", confidence.color)}>
              {confidence.label}
            </span>
            {confidence.showPercentage && (
              <span className="text-[10px] text-text-muted/60 font-mono">
                ({formatConfidencePct(signal?.confidence ?? 0)}%)
              </span>
            )}
          </div>
        )}
        {citations.length === 1 ? (
          <SourceChip source={citations[0]} />
        ) : (
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-intelligence-blue hover:underline [&::-webkit-details-marker]:hidden">
              <ChevronRightIcon className="h-4 w-4 shrink-0 transition-transform group-open:rotate-90" />
              View sources ({citations.length})
            </summary>
            <ul className="mt-3 space-y-2">
              {citations.map((s, i) => (
                <li key={`${s.pageUrl}-${s.evidenceKind}-${i}`}>
                  <SourceChip source={s} />
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    );
  }
  if (fallbackSource) {
    return (
      <div className="mt-4 border-t border-surface-border pt-4">
         {confidence && (
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Confidence:</span>
            <span className={cn("text-xs font-bold", confidence.color)}>
              {confidence.label}
            </span>
          </div>
        )}
        <p className="text-sm text-text-muted leading-relaxed">
          Source: {fallbackSource}
        </p>
      </div>
    );
  }
  return null;
}

function SignalCard({
  label,
  signal,
  rawValue,
  display,
  onEdit,
  onPickValue,
  analyzedProfile,
  expandedExplainability,
  setExpandedExplainability,
  isResolved,
}: {
  label: string;
  signal: Signal<string[]> | undefined;
  rawValue: string[];
  display: (v: string) => string;
  onEdit: () => void;
  onPickValue?: (value: string[]) => void;
  analyzedProfile?: DeepInferredProfile | null;
  expandedExplainability: Set<string>;
  setExpandedExplainability: (v: Set<string>) => void;
  isResolved?: boolean;
}) {
  const status = deriveFieldStatus(signal, rawValue, isResolved);
  const isUnknown = status === "UNKNOWN";
  const isConflicted = status === "CONFLICTED";
  const citations = signal?.citations ?? [];

  return (
    <AppCard 
      variant="section" 
      className={cn(
        "transition-all duration-300",
        isConflicted ? "border-error-red/30 bg-error-red/[0.02]" : "hover:border-intelligence-blue/20"
      )}
    >
      <div className="flex items-start justify-between mb-6">
        <div className="space-y-3">
          <AppTypography.Metadata className="opacity-40 uppercase tracking-[0.2em] !text-[9px]">{label}</AppTypography.Metadata>
          <div className="flex flex-wrap items-center gap-3">
            <SignalBadge 
              status={status} 
              isCompliance={label.toLowerCase().includes("compliance") || label.toLowerCase().includes("data types")} 
            />
          </div>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="text-[10px] font-black uppercase tracking-widest text-intelligence-blue hover:text-accent-primary-hover transition-colors"
        >
          Adjust
        </button>
      </div>

      <div className="space-y-6">
        {isUnknown ? (
          <p className="text-lg font-black text-warning-amber tracking-tight">Requires your input</p>
        ) : isConflicted && onPickValue && signal && signal.conflict?.rival ? (
          (() => {
            const rival = signal.conflict.rival;
            const hasSelected = rawValue.length > 0 && (JSON.stringify(rawValue) === JSON.stringify(signal.value) || JSON.stringify(rawValue) === JSON.stringify(rival.value));
            
            // Find industry candidates for explainability
            const industryCandidates = analyzedProfile?.industryCandidates || [];
            const primaryCandidate = industryCandidates.find(c => 
              Array.isArray(signal.value) ? (signal.value as string[]).includes(c.value) : (c.value as any) === signal.value
            );
            const rivalCandidate = industryCandidates.find(c => 
              Array.isArray(rival.value) ? (rival.value as string[]).includes(c.value) : (c.value as any) === rival.value
            );
            
            return (
              <div className="space-y-6">
                <div className="rounded-2xl bg-error-red/5 border border-error-red/10 p-4 flex items-start gap-4">
                  <AppIcon icon={AlertCircleIcon} variant="error" size="xs" className="mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-xs font-black uppercase tracking-widest text-error-red">Evidence Conflict</p>
                    <AppTypography.BodySm className="opacity-70">Competing sources found. Please select the accurate option.</AppTypography.BodySm>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <CandidatePicker
                    roleLabel="Option A"
                    value={signal.value}
                    display={display}
                    confidence={signal.confidence}
                    sources={JSON.stringify(signal.value) === JSON.stringify(rival.value) ? [] : citations}
                    selected={JSON.stringify(rawValue) === JSON.stringify(signal.value)}
                    onPick={() => onPickValue(signal.value)}
                  />
                  <CandidatePicker
                    roleLabel="Option B"
                    value={rival.value}
                    display={display}
                    confidence={rival.confidence}
                    sources={rival.sources}
                    selected={JSON.stringify(rawValue) === JSON.stringify(rival.value)}
                    onPick={() => onPickValue(rival.value)}
                  />
                </div>

                {(primaryCandidate || rivalCandidate) && (
                   <div className="flex gap-4">
                      {primaryCandidate && (
                        <IndustryCandidateExplainability
                          candidate={primaryCandidate}
                          isOpen={expandedExplainability.has(`${signal.value}-primary`)}
                          onToggle={() => {
                            const newExpanded = new Set(expandedExplainability);
                            if (newExpanded.has(`${signal.value}-primary`)) {
                              newExpanded.delete(`${signal.value}-primary`);
                            } else {
                              newExpanded.add(`${signal.value}-primary`);
                            }
                            setExpandedExplainability(newExpanded);
                          }}
                        />
                      )}
                      {rivalCandidate && (
                        <IndustryCandidateExplainability
                          candidate={rivalCandidate}
                          isOpen={expandedExplainability.has(`${rival.value}-rival`)}
                          onToggle={() => {
                            const newExpanded = new Set(expandedExplainability);
                            if (newExpanded.has(`${rival.value}-rival`)) {
                              newExpanded.delete(`${rival.value}-rival`);
                            } else {
                              newExpanded.add(`${rival.value}-rival`);
                            }
                            setExpandedExplainability(newExpanded);
                          }}
                        />
                      )}
                   </div>
                )}
                
                {hasSelected && (
                  <div className="flex items-center gap-3 text-trust-green">
                    <AppIcon icon={CheckIcon} variant="success" size="xs" />
                    <AppTypography.Metadata className="!text-trust-green font-black">Selection saved</AppTypography.Metadata>
                  </div>
                )}
              </div>
            );
          })()
        ) : isConflicted ? (
          <div className="space-y-4">
            <div className="rounded-2xl bg-error-red/5 border border-error-red/10 p-4 flex items-start gap-4">
              <AppIcon icon={AlertCircleIcon} variant="error" size="xs" className="mt-0.5" />
              <div className="space-y-1">
                <p className="text-xs font-black uppercase tracking-widest text-error-red">Needs Resolution</p>
                <AppTypography.BodySm className="opacity-70">Use manual edit to pick the correct value.</AppTypography.BodySm>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              {rawValue.map(v => (
                <AppTypography.SubSection key={v} className="text-xl !font-black tracking-tight">{display(v)}</AppTypography.SubSection>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2.5">
            {rawValue.map(v => (
              <div key={v} className="bg-surface-base px-4 py-2 rounded-xl border border-surface-border text-sm font-black text-text-primary uppercase tracking-widest shadow-premium-sm">
                {display(v)}
              </div>
            ))}
          </div>
        )}
      </div>

      {!isConflicted && !isUnknown && (
        <div className="mt-8 pt-6 border-t border-surface-border/50">
          {label === "Industry" && analyzedProfile?.industryCandidates && (
            <IndustryCandidateExplainability
              candidate={analyzedProfile.industryCandidates.find(c => 
                rawValue.length > 0 && c.value === rawValue[0]
              ) || analyzedProfile.industryCandidates[0]}
              isOpen={expandedExplainability.has('industry-main')}
              onToggle={() => {
                const newExpanded = new Set(expandedExplainability);
                if (newExpanded.has('industry-main')) {
                  newExpanded.delete('industry-main');
                } else {
                  newExpanded.add('industry-main');
                }
                setExpandedExplainability(newExpanded);
              }}
            />
          )}
          
          <CitationSourcesBlock citations={citations} fallbackSource={citations.length === 0 ? signal?.source : undefined} signal={signal} />
        </div>
      )}
    </AppCard>
  );
}

function CandidatePicker({
  roleLabel,
  value,
  display,
  confidence,
  sources,
  selected,
  onPick,
}: {
  roleLabel: string;
  value: string[];
  display: (v: string) => string;
  confidence: number;
  sources: SignalCitation[];
  selected: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={cn(
        "flex flex-col items-start gap-3 rounded-2xl border p-5 text-left transition-all active:scale-[0.99] relative overflow-hidden group",
        selected
          ? "border-intelligence-blue bg-intelligence-blue-soft shadow-premium-md ring-1 ring-intelligence-blue/20"
          : "border-border-soft bg-surface-base hover:border-border-soft hover:bg-surface-base shadow-premium-sm",
      )}
    >
      <div className={cn(
        "absolute top-0 right-0 h-1.5 w-full transition-opacity duration-500",
        selected ? "bg-intelligence-blue opacity-100" : "bg-intelligence-blue opacity-0 group-hover:opacity-30"
      )} />

      {/* Selected indicator */}
      {selected && (
        <div className="absolute top-4 right-4 flex items-center gap-1.5 text-intelligence-blue">
          <AppIcon icon={CheckIcon} variant="brand" size="xs" />
          <AppTypography.Metadata className="!text-intelligence-blue font-black uppercase tracking-widest !text-[9px]">Selected</AppTypography.Metadata>
        </div>
      )}
      
      <div className="flex w-full flex-wrap items-baseline justify-between gap-2 pr-20">
        <AppTypography.Metadata className="opacity-40 uppercase tracking-[0.2em] !text-[9px]">{roleLabel}</AppTypography.Metadata>
      </div>
      <AppTypography.SubSection className={cn("text-lg !font-black tracking-tight", selected ? "!text-intelligence-blue" : "!text-text-primary")}>
        {value.map(v => display(v)).join(", ")}
      </AppTypography.SubSection>

      <div className="mt-2 flex items-center gap-2">
        <AppTypography.Metadata className="opacity-30 uppercase tracking-widest !text-[8px]">Confidence</AppTypography.Metadata>
        <div className="h-1.5 w-16 rounded-full bg-border-soft overflow-hidden">
           <div 
             className={cn("h-full transition-all duration-1000", selected ? "bg-intelligence-blue" : "bg-text-muted/30")}
             style={{ width: `${Math.round(confidence * 100)}%` }}
           />
        </div>
        <AppTypography.Metadata className="font-black !text-[10px] opacity-60">{Math.round(confidence * 100)}%</AppTypography.Metadata>
      </div>

      {sources.length > 0 && (
        <div className="mt-4 flex w-full flex-col gap-2 border-t border-surface-border/50 pt-4">
          {sources.slice(0, 1).map((s, i) => (
            <SourceChip key={`${s.pageUrl}-${i}`} source={s} compact />
          ))}
        </div>
      )}
    </button>
  );
}

function IndustryCandidateExplainability({ 
  candidate, 
  isOpen, 
  onToggle 
}: { 
  candidate: IndustryCandidate; 
  isOpen: boolean; 
  onToggle: () => void; 
}) {
  return (
    <div className="mt-3 border-t border-surface-border pt-3">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-intelligence-blue hover:text-accent-primary-hover transition-colors"
      >
        <HelpCircleIcon className="h-4 w-4" />
        {isOpen ? "Hide evidence" : "Why this?"}
        <ChevronRightIcon className={cn("h-3 w-3 transition-transform", isOpen && "rotate-90")} />
      </button>
      
      {isOpen && (
        <div className="mt-3 space-y-3">
          {/* Confidence and Score */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-text-muted">Support Score:</span>
            <span className="font-mono font-medium">{candidate.supportScore}/100</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-text-muted">Confidence:</span>
            <span className={getConfidenceBandColor(candidate.confidenceBand)}>
              {getConfidenceBandLabel(candidate.confidenceBand)}
            </span>
          </div>
          
          {/* Reasons */}
          {candidate.reasons.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-text-primary mb-2">Why this industry:</h4>
              <ul className="space-y-1">
                {candidate.reasons.map((reason: string, i: number) => (
                  <li key={i} className="text-xs text-text-secondary flex items-start gap-1">
                    <span className="text-accent-primary mt-0.5">•</span>
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {/* Evidence Sources */}
          {candidate.evidenceRefs.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-text-primary mb-2">
                Evidence from {candidate.evidenceRefs.length} source{candidate.evidenceRefs.length > 1 ? 's' : ''}:
              </h4>
              <div className="space-y-2">
                {candidate.evidenceRefs.slice(0, 5).map((ref: any, i: number) => (
                  <div key={i} className="text-xs border-l-2 border-surface-border pl-2 py-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-surface-elevated text-text-muted">
                        {ref.pageType}
                      </span>
                      {ref.strength === "strong" && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                          Strong
                        </span>
                      )}
                    </div>
                    <p className="text-text-secondary italic">"{ref.snippet.slice(0, 120)}{ref.snippet.length > 120 ? "..." : ""}"</p>
                  </div>
                ))}
                {candidate.evidenceRefs.length > 5 && (
                  <p className="text-xs text-text-muted">
                    ...and {candidate.evidenceRefs.length - 5} more sources
                  </p>
                )}
              </div>
            </div>
          )}
          
          {/* Conflicting Signals */}
          {candidate.conflictingSignals.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-rose-600 dark:text-rose-400 mb-2">
                Conflicting evidence:
              </h4>
              <div className="space-y-2">
                {candidate.conflictingSignals.slice(0, 3).map((conflict: any, i: number) => (
                  <div key={i} className="text-xs border-l-2 border-rose-500/20 pl-2 py-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-600 dark:text-rose-400">
                        {conflict.pageType}
                      </span>
                    </div>
                    <p className="text-text-secondary italic">"{conflict.snippet.slice(0, 80)}{conflict.snippet.length > 80 ? "..." : ""}"</p>
                  </div>
                ))}
              </div>
              {candidate.isConflicted && (
                <p className="text-xs text-rose-600/80 dark:text-rose-400/80 mt-2">
                  These conflicting signals create uncertainty. Review and select the best fit.
                </p>
              )}
            </div>
          )}
          
          {/* Missing Evidence for Limited Confidence */}
          {candidate.confidenceBand === "limited" && candidate.evidenceCoverage === "limited" && (
            <div>
              <h4 className="text-xs font-semibold text-amber-600 dark:text-amber-400 mb-2">
                What's missing for higher confidence:
              </h4>
              <ul className="space-y-1 text-xs text-text-secondary">
                <li className="flex items-start gap-1">
                  <span className="text-amber-600 dark:text-amber-400 mt-0.5">•</span>
                  <span>More explicit industry statements on key pages</span>
                </li>
                <li className="flex items-start gap-1">
                  <span className="text-amber-600 dark:text-amber-400 mt-0.5">•</span>
                  <span>Structured data (JSON-LD) confirming industry type</span>
                </li>
                <li className="flex items-start gap-1">
                  <span className="text-amber-600 dark:text-amber-400 mt-0.5">•</span>
                  <span>Additional pages with clear industry positioning</span>
                </li>
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SourceChip({ source, compact = false }: { source: SignalCitation; compact?: boolean }) {
  const shortHost = (() => {
    try {
      const u = new URL(source.pageUrl);
      return u.hostname.replace(/^www\./, "") + (u.pathname === "/" ? "" : u.pathname);
    } catch {
      return source.pageUrl;
    }
  })();
  const kindLabel = source.evidenceKind.replace("-", " ");
  if (compact) {
    return (
      <a
        href={source.pageUrl}
        target="_blank"
        rel="noreferrer"
        title={source.excerpt ?? source.pageUrl}
        className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border-soft bg-surface-base px-2 py-1 text-xs font-medium text-text-secondary transition-colors hover:border-intelligence-blue/35 hover:text-text-primary"
      >
        <AppIcon icon={LinkIcon} size="xs" variant="ghost" className="text-current shrink-0" />
        <span className="min-w-0 truncate">{shortHost}</span>
        <span className="shrink-0 text-text-muted">·</span>
        <span className="shrink-0 text-text-muted">{source.pageType}</span>
      </a>
    );
  }
  return (
    <a
      href={source.pageUrl}
      target="_blank"
      rel="noreferrer"
      title={source.excerpt ?? source.pageUrl}
      className="block p-4 rounded-xl border border-border-soft bg-surface-base hover:border-intelligence-blue/20 transition-all group"
    >
      <span className="flex items-start gap-3">
        <AppIcon icon={LinkIcon} size="sm" variant="brand" className="mt-0.5 shrink-0 opacity-80" />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-sm font-black uppercase tracking-widest text-text-primary">
            <span className="break-all group-hover:text-intelligence-blue">{shortHost}</span>
            <span className="text-text-muted opacity-40">·</span>
            <span className="text-xs text-text-muted opacity-60">{source.pageType}</span>
          </span>
          <span className="mt-0.5 block text-xs text-text-muted">{kindLabel}</span>
          {source.excerpt ? (
            <span className="mt-1.5 block text-xs leading-relaxed text-text-muted line-clamp-2">{source.excerpt}</span>
          ) : null}
        </span>
      </span>
    </a>
  );
}

function SignalBadge({ status, isCompliance }: { status: FieldStatus; isCompliance?: boolean }) {
  const config: Record<FieldStatus, { label: string; className: string; Icon: typeof CheckIcon }> = {
    OBSERVED: {
      label: isCompliance ? "Direct evidence" : "Observed",
      className: "bg-trust-green/10 text-trust-green border-trust-green/20",
      Icon: CheckIcon,
    },
    DERIVED: {
      label: isCompliance ? "Derived from website evidence" : "Derived",
      className: "bg-intelligence-blue/10 text-intelligence-blue border-intelligence-blue/20",
      Icon: SparklesIcon,
    },
    HYPOTHESIZED: {
      label: isCompliance ? "Needs confirmation" : "Hypothesized",
      className: "bg-warning-amber/10 text-warning-amber border-warning-amber/20",
      Icon: AlertCircleIcon,
    },
    LOW_CONFIDENCE_HYPOTHESIS: {
      label: "Needs review",
      className: "bg-warning-amber/10 text-warning-amber border-warning-amber/30",
      Icon: AlertCircleIcon,
    },
    VALID_OTHER: {
      label: "Other (not in enum)",
      className: "bg-text-muted/10 text-text-muted border-text-muted/20",
      Icon: SparklesIcon,
    },
    CONFLICTED: {
      label: "Competing evidence found",
      className: "bg-error-red/10 text-error-red border-error-red/30",
      Icon: WarningIcon,
    },
    RESOLVED: {
      label: isCompliance ? "Confirmed" : "Resolved",
      className: "bg-trust-green/10 text-trust-green border-trust-green/20",
      Icon: CheckIcon,
    },
    UNKNOWN: {
      label: isCompliance ? "Needs confirmation" : "Needs decision",
      className: "bg-warning-amber/10 text-warning-amber border-warning-amber/30",
      Icon: AlertCircleIcon,
    },
  };
  const { label, className, Icon } = config[status];
  return (
    <AppBadge variant={status === "CONFLICTED" ? "error" : status === "DERIVED" ? "brand" : (status === "OBSERVED" || status === "RESOLVED") ? "success" : "warning"} className="gap-1.5">
      <AppIcon icon={Icon} size="xs" variant="ghost" className="text-current" />
      {label}
    </AppBadge>
  );
}

function ReviewActionBar({
  confidence,
  evidenceCount,
  securityPillarsIdentifiedCount,
  totalRelevantTopicsCount,
  autoReadyTopicsCount,
  clarificationTasksCount,
  onReviewProfile,
  onEnterWorkspace,
  submitting,
  hasUnresolvedConflicts,
  conflictedCount,
  error,
  fullWidth = false,
}: {
  confidence: number;
  evidenceCount: number;
  securityPillarsIdentifiedCount: number;
  totalRelevantTopicsCount: number;
  autoReadyTopicsCount: number;
  clarificationTasksCount: number;
  onReviewProfile: () => void;
  onEnterWorkspace: () => void;
  submitting: boolean;
  hasUnresolvedConflicts: boolean;
  conflictedCount: number;
  error?: string | null;
  fullWidth?: boolean;
}) {
  return (
    <div className={cn(
      "fixed bottom-0 right-0 z-50 animate-in slide-in-from-bottom-full duration-700 ease-out pb-safe",
      fullWidth ? "left-0" : "left-0 lg:left-[280px] xl:left-[320px]"
    )}>
      <div className="absolute inset-0 bg-brand-navy/95 backdrop-blur-md border-t border-white/10 shadow-[0_-20px_60px_rgba(0,0,0,0.5)]" />
      <div className={cn(
        "relative mx-auto px-6 py-6 lg:py-8 lg:px-10",
        fullWidth ? "max-w-[1240px]" : "max-w-[1120px]"
      )}>
        <div className="flex flex-col gap-6">
          {error && (
            <div className="rounded-2xl border border-error-red/20 bg-error-red/5 p-4 flex gap-4 animate-in fade-in slide-in-from-top-2">
              <AppIcon icon={AlertCircleIcon} variant="error" size="sm" className="mt-0.5" />
              <AppTypography.BodySm className="!text-error-red font-medium">{error}</AppTypography.BodySm>
            </div>
          )}
          
          <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-6">
              <div className="space-y-1">
                 <AppTypography.Metadata className="text-white/30 uppercase tracking-[0.2em] !text-[9px]">Workspace Status</AppTypography.Metadata>
                 <div className="flex items-center gap-3">
                    <div className={cn("h-2 w-2 rounded-full", hasUnresolvedConflicts ? "bg-warning-amber shadow-[0_0_10px_rgba(245,158,11,0.5)]" : "bg-trust-green shadow-[0_0_10px_rgba(16,185,129,0.5)]")} />
                    <AppTypography.SubSection className="!text-white !text-base !font-black tracking-tight">
                      {hasUnresolvedConflicts ? `${conflictedCount} Decisions Needed` : "Analysis Validated"}
                    </AppTypography.SubSection>
                 </div>
              </div>
            </div>

            {/* 2. Compact Metrics */}
            <div className="hidden md:flex items-center gap-10 border-l border-white/10 pl-10">
               <div className="space-y-0.5 text-center">
                  <AppTypography.Metadata className="text-white/20 uppercase tracking-widest !text-[8px]">Pillars</AppTypography.Metadata>
                  <p className="text-sm font-black text-white/90 leading-none mt-1">{securityPillarsIdentifiedCount}</p>
               </div>
               <div className="space-y-0.5 text-center">
                  <AppTypography.Metadata className="text-white/20 uppercase tracking-widest !text-[8px]">Topics</AppTypography.Metadata>
                  <p className="text-sm font-black text-trust-green leading-none mt-1">{totalRelevantTopicsCount}</p>
               </div>
               <div className="space-y-0.5 text-center">
                  <AppTypography.Metadata className="text-white/20 uppercase tracking-widest !text-[8px]">Tasks</AppTypography.Metadata>
                  <p className="text-sm font-black text-warning-amber leading-none mt-1">{clarificationTasksCount}</p>
               </div>
               <div className="space-y-0.5 text-center">
                  <AppTypography.Metadata className="text-white/20 uppercase tracking-widest !text-[8px]">Evidence</AppTypography.Metadata>
                  <p className="text-sm font-black text-white/90 leading-none mt-1">{evidenceCount}</p>
               </div>
            </div>


            
            {/* 3. Actions */}
            <div className="flex items-center gap-4 shrink-0">
              <AppButton
                variant="outline"
                type="button"
                onClick={onReviewProfile}
                className="h-14 px-8 rounded-xl border-white/10 bg-white/[0.02] text-white/70 hover:text-white hover:bg-white/[0.05] hover:border-white/20 transition-all font-black uppercase tracking-widest text-[10px]"
              >
                Review Profile
              </AppButton>
              
              <AppButton
                onClick={onEnterWorkspace}
                disabled={submitting || hasUnresolvedConflicts}
                isLoading={submitting}
                className={cn(
                  "h-14 px-10 rounded-xl transition-all font-black uppercase tracking-widest text-[10px] shadow-premium-xl",
                  hasUnresolvedConflicts 
                    ? "bg-white/5 text-white/20 border-white/5 cursor-not-allowed" 
                    : "bg-intelligence-blue text-white hover:bg-intelligence-blue-hover shadow-[0_0_20px_rgba(37,99,235,0.3)]"
                )}
              >
                {!submitting && <SparklesIcon className="h-3.5 w-3.5 mr-2.5" />}
                {hasUnresolvedConflicts ? "Resolve Conflicts" : "Create Review Workspace"}
              </AppButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Profile Status Summary - Shows overall review state with counts
 */
function ProfileStatusSummary({
  readyCount,
  conflictedCount,
  needsReviewCount,
  hasUnresolvedConflicts,
}: {
  readyCount: number;
  conflictedCount: number;
  needsReviewCount: number;
  hasUnresolvedConflicts: boolean;
}) {
  const total = readyCount + conflictedCount + needsReviewCount;
  
  // Determine overall status
  let statusTitle = "Ready to confirm";
  let statusColor = "text-trust-green";
  let statusBg = "bg-trust-green/10 border-trust-green/20";
  let statusIcon = CheckIcon;
  
  if (hasUnresolvedConflicts) {
    statusTitle = "Needs your decision";
    statusColor = "text-error-red";
    statusBg = "bg-error-red/10 border-error-red/20";
    statusIcon = AlertCircleIcon;
  } else if (needsReviewCount > 0) {
    statusTitle = "Needs review";
    statusColor = "text-warning-amber";
    statusBg = "bg-warning-amber/10 border-warning-amber/20";
    statusIcon = AlertCircleIcon;
  }
  
  const StatusIcon = statusIcon;
  
  return (
    <div className={cn("section-card !p-4", statusBg)}>
      <div className="flex items-start gap-3">
        <AppIcon icon={StatusIcon} variant={status === "CONFLICTED" ? "error" : status === "RESOLVED" || status === "READY" ? "success" : "warning"} filled size="md" />
        <div className="flex-1 min-w-0">
          <h3 className={cn("text-sm font-semibold", statusColor)}>{statusTitle}</h3>
          <p className="text-xs text-text-muted mt-0.5">
            {total} fields analyzed · {readyCount} ready
            {conflictedCount > 0 && (
              <span className="text-error-red font-medium"> · {conflictedCount} conflicted</span>
            )}
            {needsReviewCount > 0 && !hasUnresolvedConflicts && (
              <span className="text-warning-amber font-medium"> · {needsReviewCount} needs review</span>
            )}
          </p>
        </div>
      </div>
      
      {/* Count pills */}
      <div className="mt-3 flex flex-wrap gap-2">
        {readyCount > 0 && (
          <AppBadge variant="success" className="gap-1.5">
            <AppIcon icon={CheckIcon} size="xs" variant="ghost" className="text-current" />
            {readyCount} ready
          </AppBadge>
        )}
        {conflictedCount > 0 && (
          <AppBadge variant="error" className="gap-1.5">
            <AppIcon icon={AlertCircleIcon} size="xs" variant="ghost" className="text-current" />
            {conflictedCount} conflicted
          </AppBadge>
        )}
        {needsReviewCount > 0 && (
          <AppBadge variant="warning" className="gap-1.5">
            <AppIcon icon={AlertCircleIcon} size="xs" variant="ghost" className="text-current" />
            {needsReviewCount} needs review
          </AppBadge>
        )}
      </div>
    </div>
  );
}

function PartialSuccessBanner({ onOpenManualCompliance }: { onOpenManualCompliance: () => void }) {
  return (
    <div
      className="flex gap-3 rounded-xl border border-trust-green/25 bg-trust-green/[0.06] p-4 text-sm text-text-secondary"
      role="status"
    >
      <AppIcon icon={ShieldCheckIcon} variant="success" size="sm" className="mt-0.5" />
      <div className="min-w-0 space-y-2">
        <p className="font-semibold text-text-primary">Business profile inferred — compliance evidence needs review</p>
        <p className="text-xs leading-relaxed text-text-muted">
          We found enough on-page signal for business tailoring, but privacy / trust / compliance pages were thin or
          missing. Complete data types and compliance targets manually for full assurance.
        </p>
        <button
          type="button"
          onClick={onOpenManualCompliance}
          className="text-xs font-semibold text-accent-primary hover:underline underline-offset-2"
        >
          Open Trust Profile manual step →
        </button>
      </div>
    </div>
  );
}

/**
 * Evidence quality level derived from crawl health and extraction data.
 */
type EvidenceQuality = "strong" | "limited" | "weak";

function deriveEvidenceQuality(
  health: CrawlHealthSnapshot,
  extraction?: AnalysisHealthSnapshot["extraction"],
): { quality: EvidenceQuality; issues: string[] } {
  const issues: string[] = [];

  // Check for crawl issues
  if (health.blockedBy) {
    issues.push(`Blocked by ${health.blockedBy}`);
  }
  if (health.pagesReached < health.pagesAttempted) {
    const failed = health.pagesAttempted - health.pagesReached;
    issues.push(`${failed} page${failed > 1 ? "s" : ""} failed to load`);
  }

  // Check extraction quality
  if (extraction) {
    if (!extraction.ok) {
      issues.push("Limited page content extracted");
    }
    if (extraction.strongPages === 0) {
      issues.push("No strong evidence pages found");
    } else if (extraction.strongPages < 2) {
      issues.push("Few strong evidence pages");
    }
  }

  // Determine quality level
  if (issues.length === 0 && extraction?.ok && extraction.strongPages >= 2) {
    return { quality: "strong", issues: [] };
  }
  if (issues.length <= 1 && health.pagesReached >= 1) {
    return { quality: "limited", issues };
  }
  return { quality: "weak", issues };
}

/**
 * Extended crawl health with page classification summary.
 */
type ExtendedCrawlHealth = CrawlHealthSnapshot & {
  highValuePages?: number;
  securityLegalPages?: number;
  totalUsefulChars?: number;
  pdfCandidates?: string[];
  subdomainsFound?: string[];
  /** Layer 1 count (HTTP success). */
  pagesRequested?: number;
  /** Layer 3 count (evidence produced). */
  pagesEvidenced?: number;
  placeholderPages?: number;
  recoveredRenderedPages?: number;
  trueEvidencePages?: number;
  classificationSummary?: {
    security?: number;
    trust?: number;
    compliance?: number;
    privacy?: number;
    legal?: number;
    dpa?: number;
    subprocessors?: number;
    status?: number;
    [key: string]: number | undefined;
  };
};

/**
 * Compact evidence quality summary for the main onboarding flow.
 * Shows detailed domain evidence collection stats with technical details behind a collapsible section.
 */
function EvidenceQualitySummary({
  health,
  extraction,
  extendedHealth,
}: {
  health: CrawlHealthSnapshot;
  extraction?: AnalysisHealthSnapshot["extraction"];
  extendedHealth?: ExtendedCrawlHealth;
}) {
  const { quality, issues } = deriveEvidenceQuality(health, extraction);
  const [showDetails, setShowDetails] = useState(false);

  // Calculate stats
  const pagesAnalyzed = health.pagesReached || 0;
  const highValuePages = extendedHealth?.highValuePages ?? Math.max(0, pagesAnalyzed - 1);
  const securityLegalPages = extendedHealth?.securityLegalPages ?? 
    (extendedHealth?.classificationSummary ? 
      (extendedHealth.classificationSummary.security || 0) +
      (extendedHealth.classificationSummary.compliance || 0) +
      (extendedHealth.classificationSummary.privacy || 0) +
      (extendedHealth.classificationSummary.legal || 0) +
      (extendedHealth.classificationSummary.dpa || 0) +
      (extendedHealth.classificationSummary.trust || 0)
      : 0);

  const qualityConfig = {
    strong: {
      label: "Authoritative",
      colorClass: "text-trust-green",
      icon: CheckIcon,
    },
    limited: {
      label: "Limited",
      colorClass: "text-warning-amber",
      icon: AlertCircleIcon,
    },
    weak: {
      label: "Low Density",
      colorClass: "text-error-red",
      icon: AlertCircleIcon,
    },
  };

  const config = qualityConfig[quality];
  const Icon = config.icon;

  return (
    <div className="section-panel !p-10 shadow-premium-lg transition-all hover:shadow-premium-xl bg-white relative overflow-hidden group/ev">
      <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity">
         <ShieldCheckIcon className="h-32 w-32" />
      </div>
      <div className="flex items-start justify-between relative z-10">
        <div className="flex items-start gap-4">
        <AppIcon icon={GlobeIcon} variant="muted" filled size="md" className="shrink-0" />
        <div className="space-y-1">
            <div className="flex items-center gap-3">
              <span className="text-sm font-black uppercase tracking-widest text-text-muted">Domain Intelligence</span>
              <div className={cn("flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-tighter border transition-colors", quality === 'strong' ? "border-trust-green/20 bg-trust-green/5 text-trust-green" : "border-warning-amber/20 bg-warning-amber/5 text-warning-amber")}>
                <AppIcon icon={Icon} size="xs" variant="ghost" className="text-current" />
                {config.label}
              </div>
            </div>
            <h3 className="text-2xl font-black text-text-primary tracking-tight font-display">
              {pagesAnalyzed} page{pagesAnalyzed !== 1 ? "s" : ""} reviewed
            </h3>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowDetails(!showDetails)}
          className="text-[10px] font-black uppercase tracking-widest text-accent-primary hover:underline underline-offset-4"
        >
          {showDetails ? "Collapse Diagnostics" : "Technical Details"}
        </button>
      </div>

      <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-6">
        <div className="space-y-1">
           <p className="text-[10px] font-black uppercase tracking-[0.1em] text-text-muted">High-Value Pages</p>
           <p className="text-xl font-bold text-text-primary font-display">{highValuePages}</p>
        </div>
        <div className="space-y-1">
           <p className="text-[10px] font-black uppercase tracking-[0.1em] text-text-muted">Security/Legal</p>
           <p className="text-xl font-bold text-trust-green font-display">{securityLegalPages}</p>
        </div>
        <div className="space-y-1">
           <p className="text-[10px] font-black uppercase tracking-[0.1em] text-text-muted">Extraction OK</p>
           <p className="text-xl font-bold text-text-primary font-display">{extraction?.ok ? "Confirmed" : "Partial"}</p>
        </div>
        <div className="space-y-1">
           <p className="text-[10px] font-black uppercase tracking-[0.1em] text-text-muted">Duration</p>
           <p className="text-xl font-bold text-text-primary font-display">{health.durationMs}ms</p>
        </div>
      </div>

      {issues.length > 0 && (
        <div className="mt-8 flex flex-wrap gap-2 pt-6 border-t border-surface-border">
          {issues.map((issue, i) => (
            <span key={i} className="px-3 py-1 rounded-full bg-warning-amber/5 border border-warning-amber/10 text-[10px] font-bold text-warning-amber tracking-tight">
              • {issue}
            </span>
          ))}
        </div>
      )}

      {showDetails && (
        <div className="mt-8 border-t border-surface-border pt-8 animate-in fade-in slide-in-from-top-4 duration-500 ease-out">
          <CollapsibleCrawlDetails health={health} extraction={extraction} extendedHealth={extendedHealth} />
        </div>
      )}
    </div>
  );
}

/**
 * Technical crawl diagnostics in a collapsible, structured format.
 * Kept readable but secondary to the main flow.
 */
function CollapsibleCrawlDetails({
  health,
  extraction,
  extendedHealth,
}: {
  health: CrawlHealthSnapshot;
  extraction?: AnalysisHealthSnapshot["extraction"];
  extendedHealth?: ExtendedCrawlHealth;
}) {
  return (
    <div className="space-y-3 text-xs text-text-secondary">
      {/* Crawl reachability */}
      <div className="space-y-1">
        <p className="font-semibold text-text-primary uppercase tracking-wider text-[10px]">Crawl Summary</p>
        <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
          <div>Pages analyzed: {health.pagesReached}</div>
          <div>Pages attempted: {health.pagesAttempted}</div>
          {extendedHealth?.highValuePages !== undefined && (
            <div className="text-accent-primary">High-value pages: {extendedHealth.highValuePages}</div>
          )}
          {extendedHealth?.securityLegalPages !== undefined && (
            <div className="text-trust-green">Security/legal pages: {extendedHealth.securityLegalPages}</div>
          )}
          <div>Duration: {health.durationMs}ms</div>
          {extendedHealth?.pdfCandidates && (
            <div className="text-sky-600 dark:text-sky-400">PDF documents: {extendedHealth.pdfCandidates.length}</div>
          )}
          {extendedHealth?.subdomainsFound && (
            <div className="text-purple-600 dark:text-purple-400">Trust subdomains: {extendedHealth.subdomainsFound.length}</div>
          )}
          {health.blockedBy && (
            <div className="text-error-red col-span-2">
              Blocked: {health.blockedBy}
            </div>
          )}
        </div>
        {health.finalUrl && health.finalUrl !== "-" && (
          <div className="font-mono text-[11px] text-text-muted truncate" title={health.finalUrl}>
            Final: {health.finalUrl}
          </div>
        )}
      </div>

      {/* Page classification */}
      {extendedHealth?.classificationSummary && (
        <div className="space-y-1 border-t border-surface-border pt-2">
          <p className="font-semibold text-text-primary uppercase tracking-wider text-[10px]">Page Types Found</p>
          <div className="grid grid-cols-3 gap-2 font-mono text-[11px]">
            {Object.entries(extendedHealth.classificationSummary)
              .filter(([, count]) => count && count > 0)
              .map(([type, count]) => (
                <div key={type} className="flex justify-between">
                  <span className="capitalize">{type}:</span>
                  <span className={cn(
                    "font-semibold",
                    ["security", "trust", "compliance", "privacy", "legal", "dpa"].includes(type)
                      ? "text-trust-green"
                      : "text-text-primary"
                  )}>
                    {count}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Extraction details */}
      {extraction && (
        <div className="space-y-1 border-t border-surface-border pt-2">
          <p className="font-semibold text-text-primary uppercase tracking-wider text-[10px]">Extraction</p>
          <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
            <div>Strong pages: {extraction.strongPages}</div>
            <div className="group relative">
              <span>JS-rendered: {extraction.renderedPages}</span>
              {extraction.renderedPages === 0 && (
                <div className="absolute bottom-full left-0 mb-2 hidden w-48 rounded bg-surface-elevated border border-surface-border p-2 text-xs text-text-secondary shadow-lg group-hover:block z-10">
                  <div className="absolute bottom-0 left-4 translate-y-full border-4 border-transparent border-t-surface-elevated"></div>
                  0 means static HTML extraction was enough; browser rendering was not needed.
                </div>
              )}
            </div>
            <div className="col-span-2">
              Content chars: {extraction.totalNonBoilerplateChars.toLocaleString()}
            </div>
          </div>
        </div>
      )}

      {/* Status codes */}
      {health.statusCodes?.length > 0 && (
        <div className="space-y-1 border-t border-surface-border pt-2">
          <p className="font-semibold text-text-primary uppercase tracking-wider text-[10px]">Status codes</p>
          <div className="font-mono text-[11px] flex flex-wrap gap-1">
            {health.statusCodes.map((code, i) => (
              <span
                key={i}
                className={cn(
                  "px-1.5 py-0.5 rounded",
                  code >= 200 && code < 300
                    ? "bg-trust-green/10 text-trust-green"
                    : code >= 300 && code < 400
                      ? "bg-warning-amber/10 text-warning-amber"
                      : "bg-error-red/10 text-error-red"
                )}
              >
                {code}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Redirect chain */}
      {health.redirectChain?.length > 0 && (
        <div className="space-y-1 border-t border-surface-border pt-2">
          <p className="font-semibold text-text-primary uppercase tracking-wider text-[10px]">Redirects</p>
          <div className="font-mono text-[11px] text-text-muted truncate">
            {health.redirectChain.join(" → ")}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Field-level evidence coverage indicator.
 */
/**
 * Field-level evidence coverage indicator.
 */
function FieldEvidenceInfo({
  coverage,
  confidenceBand,
  reason,
  hasConflict,
  evidenceCount,
}: {
  coverage?: "strong" | "medium" | "limited" | "weak" | "none";
  confidenceBand?: "high" | "medium" | "low" | "uncertain";
  reason?: string;
  hasConflict?: boolean;
  evidenceCount?: number;
}) {
  const coverageConfig = {
    strong: { color: "text-trust-green", bg: "bg-trust-green/10", label: "Strong evidence" },
    medium: { color: "text-intelligence-blue", bg: "bg-intelligence-blue/10", label: "Medium evidence" },
    limited: { color: "text-warning-amber", bg: "bg-warning-amber/10", label: "Limited evidence" },
    weak: { color: "text-intelligence-blue", bg: "bg-intelligence-blue/10", label: "Low density" },
    none: { color: "text-text-muted", bg: "bg-surface-base", label: "No evidence" },
  };

  const confidenceConfig = {
    high: { color: "text-trust-green", icon: CheckIcon },
    medium: { color: "text-intelligence-blue", icon: HelpCircleIcon },
    low: { color: "text-warning-amber", icon: AlertCircleIcon },
    uncertain: { color: "text-intelligence-blue", icon: SparklesIcon },
  };

  const config = coverage ? coverageConfig[coverage] : coverageConfig.none;
  const confConfig = confidenceBand ? confidenceConfig[confidenceBand] : confidenceConfig.uncertain;
  const ConfidenceIcon = confConfig.icon;

  // Weak/none evidence display (muted)
  if (coverage === "weak" || coverage === "none") {
    return (
      <div className="mt-3 rounded-2xl bg-blue-500/5 border border-blue-500/10 p-4 shadow-premium-sm transition-all hover:shadow-premium-md">
        <div className="flex items-start gap-3">
          <div className="h-8 w-8 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-600 shrink-0">
             <SparklesIcon className="h-4 w-4" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-bold text-text-primary tracking-tight">
              Awaiting Manual Confirmation
            </p>
            <p className="text-xs text-text-muted leading-relaxed">
              We identified partial signals, but manual confirmation is required to reach enterprise authority.
            </p>
            {reason && <p className="text-[10px] font-black uppercase tracking-widest text-blue-600/80 mt-2">{reason}</p>}
          </div>
        </div>
      </div>
    );
  }

  // Conflicted display (muted amber)
  if (hasConflict) {
    return (
      <div className="mt-3 rounded-2xl bg-amber-500/5 border border-amber-500/10 p-4 shadow-premium-sm">
        <div className="flex items-start gap-3">
          <div className="h-8 w-8 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600 shrink-0">
             <ActivityIcon className="h-4 w-4" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-bold text-text-primary tracking-tight">
              Competing Evidence Found
            </p>
            <p className="text-xs text-text-muted leading-relaxed">
              Multiple technical signals were detected. Please select the authoritative value for your profile.
            </p>
            {reason && <p className="text-[10px] font-black uppercase tracking-widest text-amber-600/80 mt-2">{reason}</p>}
            {evidenceCount !== undefined && (
              <p className="text-[10px] font-bold text-amber-600/60 mt-1">
                {evidenceCount} available sources
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Normal evidence display
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 text-[10px] font-black uppercase tracking-widest">
      <span className={cn("px-2.5 py-1 rounded-lg border", config.bg, config.color, "border-current/10")}>
        {config.label}
      </span>
      <span className={cn("flex items-center gap-1.5", confConfig.color)}>
        <ConfidenceIcon className="h-3.5 w-3.5" />
        {confidenceBand ? confidenceBand.charAt(0).toUpperCase() + confidenceBand.slice(1) : "Unknown"} Confidence
      </span>
      {reason && <span className="text-text-muted opacity-60">· {reason}</span>}
    </div>
  );
}

/**
 * Fallback path for when domain evidence is insufficient.
 */
function InsufficientEvidenceFallback({
  onAddUrl,
  onContinueManual,
  onUploadDocuments,
  hasWeakEvidence = false,
}: {
  onAddUrl: () => void;
  onContinueManual: () => void;
  onUploadDocuments: () => void;
  hasWeakEvidence?: boolean;
}) {
  const [showOptions, setShowOptions] = useState(false);

  if (!hasWeakEvidence) return null;

  return (
    <div className="rounded-[2rem] border border-surface-border bg-surface-panel p-8 shadow-premium-sm">
      <div className="flex items-start gap-6">
        <AppIcon icon={SparklesIcon} variant="brand" filled size="lg" className="shrink-0 shadow-premium-sm" />
        <div className="flex-1 min-w-0 space-y-4">
          <div className="space-y-1">
             <h3 className="text-xl font-bold text-text-primary tracking-tight font-display">
               Enhance Analysis Precision
             </h3>
             <p className="text-sm text-text-secondary leading-relaxed max-w-xl">
               We've reached the limit of public domain signals. To move beyond partial findings, you can provide internal security documents or specific technical URLs.
             </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <AppButton
              type="button"
              onClick={() => setShowOptions(!showOptions)}
              className="px-6 rounded-xl shadow-premium-lg"
            >
              <AppIcon icon={PlusIcon} size="xs" variant="ghost" className="text-current mr-2" />
              Add Evidence Sources
            </AppButton>
            <AppButton
              type="button"
              variant="outline"
              onClick={onContinueManual}
              className="px-6 rounded-xl"
            >
              <AppIcon icon={SettingsIcon} size="xs" variant="ghost" className="text-current mr-2" />
              Continue Manually
            </AppButton>
          </div>

          {showOptions && (
            <div className="mt-3 space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
              <p className="text-xs font-medium text-amber-800 dark:text-amber-400">
                Suggested pages to add:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={onAddUrl}
                  className="flex items-center gap-2 p-2 text-left text-xs bg-surface-panel hover:bg-surface-base border border-border-soft hover:border-warning-amber/30 rounded-lg transition-colors"
                >
                  <AppIcon icon={ShieldIcon} variant="success" size="sm" className="shrink-0" />
                  <div>
                    <span className="font-medium text-text-primary block">Security page</span>
                    <span className="text-text-muted">/security or /trust-center</span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={onAddUrl}
                  className="flex items-center gap-2 p-2 text-left text-xs bg-surface-panel hover:bg-surface-base border border-border-soft hover:border-warning-amber/30 rounded-lg transition-colors"
                >
                  <AppIcon icon={LockIcon} variant="brand" size="sm" className="shrink-0" />
                  <div>
                    <span className="font-medium text-text-primary block">Privacy policy</span>
                    <span className="text-text-muted">/privacy or /privacy-policy</span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={onAddUrl}
                  className="flex items-center gap-2 p-2 text-left text-xs bg-surface-panel hover:bg-surface-base-hover border border-surface-border hover:border-amber-500/30 rounded-lg transition-colors"
                >
                  <AppIcon icon={ShieldCheckIcon} variant="brand" size="sm" className="shrink-0" />
                  <div>
                    <span className="font-medium text-text-primary block">Compliance page</span>
                    <span className="text-text-muted">/compliance or /certifications</span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={onAddUrl}
                  className="flex items-center gap-2 p-2 text-left text-xs bg-surface-panel hover:bg-surface-base-hover border border-surface-border hover:border-amber-500/30 rounded-lg transition-colors"
                >
                  <AppIcon icon={PackageIcon} variant="warning" size="sm" className="shrink-0" />
                  <div>
                    <span className="font-medium text-text-primary block">Product page</span>
                    <span className="text-text-muted">/product or /features</span>
                  </div>
                </button>
              </div>

              <div className="pt-2 border-t border-amber-500/20">
                <button
                  type="button"
                  onClick={onUploadDocuments}
                  className="flex items-center gap-2 p-2 text-left text-xs bg-surface-panel hover:bg-surface-base-hover border border-surface-border hover:border-amber-500/30 rounded-lg transition-colors w-full"
                >
                  <AppIcon icon={UploadIcon} variant="brand" size="sm" className="shrink-0" />
                  <div>
                    <span className="font-medium text-text-primary block">Upload documents</span>
                    <span className="text-text-muted">Add SOC 2 reports, security questionnaires, etc.</span>
                  </div>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Enhanced analysis loading state with staged progress and premium UI.
 * Shows a polished enterprise intelligence workflow experience.
 */
function AnalysisLoadingState({
  website,
  onTimeout,
}: {
  website: string;
  onTimeout: () => void;
}) {
  const [currentStage, setCurrentStage] = useState(0);
  const [progress, setProgress] = useState(15);
  const [isLongRunning, setIsLongRunning] = useState(false);
  const displayUrl = website.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
 
  const stages = [
    { id: "connecting", label: "Architecture Discovery", description: "Mapping DNS and endpoint reachability.", icon: GlobeIcon, progressTarget: 20 },
    { id: "collecting", label: "Evidence Collection", description: "Harvesting product, security, and legal assets.", icon: FileTextIcon, progressTarget: 40 },
    { id: "extracting", label: "Semantic Extraction", description: "Identifying trust signals from unstructured content.", icon: ShieldCheckIcon, progressTarget: 60 },
    { id: "mapping", label: "Domain Logic Mapping", description: "Aligning signals to procurement focus areas.", icon: ActivityIcon, progressTarget: 85 },
    { id: "preparing", label: "Workspace Preparation", description: "Finalizing your AI-tailored trust environment.", icon: SparklesIcon, progressTarget: 98 },
  ];
 
  useEffect(() => {
    const stageInterval = setInterval(() => {
      setCurrentStage(prev => (prev < stages.length - 1 ? prev + 1 : prev));
    }, 4500);
 
    const progressInterval = setInterval(() => {
      setProgress(prev => {
        const target = stages[currentStage].progressTarget;
        if (prev < target) return prev + 1;
        if (prev < 99) return prev + 0.1;
        return prev;
      });
    }, 150);
 
    const timer = setTimeout(() => setIsLongRunning(true), 12000);
    return () => {
      clearInterval(stageInterval);
      clearInterval(progressInterval);
      clearTimeout(timer);
    };
  }, [currentStage, stages.length]);
 
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col items-center justify-center min-h-[70vh] gap-16 py-20 animate-in fade-in duration-1000 relative">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(37,99,235,0.05),transparent_70%)] pointer-events-none" />
      <div className="relative">
        <div className="absolute inset-0 bg-intelligence-blue/15 blur-[120px] rounded-full animate-pulse" />
        <div className="relative h-24 w-24 rounded-[2rem] bg-brand-navy flex items-center justify-center text-white shadow-[0_20px_50px_rgba(15,23,42,0.4)] border border-white/5 rotate-3 animate-bounce-subtle">
           <SparklesIcon className="h-10 w-10" />
        </div>
      </div>
 
      <div className="text-center space-y-4 max-w-xl relative">
        <div className="space-y-1">
           <span className="text-[10px] font-black uppercase tracking-[0.3em] text-accent-primary/60">AI Intelligence Engine</span>
           <h2 className="text-4xl font-black tracking-tight text-text-primary font-display">Analyzing {displayUrl}</h2>
        </div>
        <p className="text-lg text-text-secondary leading-relaxed">
          TrustDesk is mapping your technical architecture to enterprise security requirements. This usually takes 15-30 seconds.
        </p>
      </div>
 
      <div className="w-full max-w-2xl space-y-12">
        <div className="space-y-4">
          <div className="h-2 w-full rounded-full bg-surface-base border border-surface-border overflow-hidden p-0.5">
            <div 
              className="h-full bg-text-primary rounded-full transition-all duration-700 ease-out shadow-[0_0_15px_rgba(15,23,42,0.3)]"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-text-muted">
            <span>Progress: {Math.round(progress)}%</span>
            <span>Target: Workspace Ready</span>
          </div>
        </div>
 
        <div className="grid grid-cols-1 gap-4">
          {stages.map((stage, idx) => {
            const isCompleted = idx < currentStage;
            const isActive = idx === currentStage;
            const StageIcon = stage.icon;
 
            return (
              <div 
                key={stage.id}
                className={cn(
                  "flex items-center gap-6 p-6 rounded-[1.5rem] border transition-all duration-500",
                  isActive ? "bg-surface-panel border-accent-primary/20 shadow-premium-lg translate-x-2" : "bg-transparent border-transparent opacity-40 grayscale"
                )}
              >
                <div className={cn(
                  "h-12 w-12 rounded-2xl flex items-center justify-center transition-all duration-500",
                  isActive ? "bg-text-primary text-white scale-110" : "bg-surface-base text-text-muted"
                )}>
                  <StageIcon className="h-5 w-5" />
                </div>
                <div className="flex-1 space-y-0.5">
                  <h3 className={cn("text-base font-bold tracking-tight font-display", isActive ? "text-text-primary" : "text-text-muted")}>{stage.label}</h3>
                  <p className="text-sm text-text-muted truncate max-w-xs">{stage.description}</p>
                </div>
                {isCompleted && (
                  <div className="h-6 w-6 rounded-full bg-trust-green/10 flex items-center justify-center text-trust-green animate-in zoom-in duration-300">
                    <CheckIcon className="h-3 w-3" />
                  </div>
                )}
                {isActive && (
                   <div className="flex gap-1">
                      <div className="h-1 w-1 rounded-full bg-accent-primary animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="h-1 w-1 rounded-full bg-accent-primary animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="h-1 w-1 rounded-full bg-accent-primary animate-bounce" style={{ animationDelay: '300ms' }} />
                   </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
 
      {isLongRunning && (
        <button
          onClick={onTimeout}
          className="text-xs font-black uppercase tracking-widest text-text-muted hover:text-accent-primary transition-colors border-b border-surface-border pb-1"
        >
          Skip analysis and continue manually
        </button>
      )}
      
      {/* Footer trust notes */}
      <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-[10px] font-black uppercase tracking-widest text-text-muted opacity-60">
        <span className="flex items-center gap-1.5">
          <ShieldCheckIcon className="h-3.5 w-3.5" />
          GDPR Aligned
        </span>
        <span className="flex items-center gap-1.5">
          <DatabaseIcon className="h-3.5 w-3.5" />
          Isolated Tenants
        </span>
        <span className="flex items-center gap-1.5">
          <LockIcon className="h-3.5 w-3.5" />
          Encrypted at Rest
        </span>
      </div>
    </div>
  );
}

/**
 * Simple lock icon for trust indicators.
 */
function LockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function ExplorerTeaserCard({ title, count, unit = "", description, onClick }: { title: string, count: number, unit?: string, description: string, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="text-left p-6 rounded-2xl bg-surface-base border border-surface-border/50 hover:border-intelligence-blue/30 hover:shadow-premium-lg transition-all group"
    >
      <div className="space-y-4">
        <div className="flex items-end gap-1">
          <span className="text-3xl font-black text-text-primary tracking-tighter">{count}{unit}</span>
          <span className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-1.5 ml-1">{title}</span>
        </div>
        <p className="text-[11px] text-text-secondary leading-relaxed opacity-70 group-hover:opacity-100 transition-opacity">
          {description}
        </p>
        <div className="flex items-center gap-1.5 text-intelligence-blue text-[9px] font-black uppercase tracking-widest pt-2">
          <span>Explore Details</span>
          <ArrowRightIcon className="h-2.5 w-2.5 group-hover:translate-x-1 transition-transform" />
        </div>
      </div>
    </button>
  );
}

function AnalysisFailureBanner({ failure }: { failure: AnalysisFailure }) {
  const copy: Record<AnalysisFailure["status"], { title: string; hint: string }> = {
    insufficient_evidence: {
      title: "Not enough evidence to auto-fill",
      hint: "Your site loaded but didn't contain enough readable content to infer a profile safely. Please fill the fields manually below.",
    },
    crawl_failed: {
      title: "We couldn't reach your website",
      hint: "The server didn't respond or returned an error. Double-check the URL, or fill in your profile manually below.",
    },
    tls_blocked: {
      title: "We couldn't securely reach your site",
      hint: "TLS/certificate validation failed. This is commonly caused by expired or self-signed certificates. Fill your profile manually below.",
    },
    schema_invalid: {
      title: "We couldn't interpret the AI response",
      hint: "The inference engine returned an unexpected shape. To keep your data honest, nothing was auto-filled. Please complete your profile manually.",
    },
    manual_review_required: {
      title: "Limited tailoring — manual setup recommended",
      hint: "We could not find enough grounded evidence to prepare reliable recommendations.",
    },
    weak_signals: {
      title: "Limited tailoring — manual setup recommended",
      hint: "We could not find enough grounded evidence to prepare reliable recommendations.",
    },
    timeout: {
      title: "Website request timed out",
      hint: "The scan hit a timeout talking to your server. Try again later or enter your profile manually.",
    },
    redirect_loop: {
      title: "Too many redirects",
      hint: "Your site redirected in a loop. Fix redirect configuration or enter your profile manually.",
    },
    no_site: {
      title: "Site could not be resolved",
      hint: "DNS could not resolve the host or the connection was refused. Check the domain or enter your profile manually.",
    },
  };
  const { title, hint } = copy[failure.status];
  return (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 flex gap-3 animate-in fade-in slide-in-from-top-1">
      <AlertCircleIcon className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
      <div>
        <h3 className="text-xs font-bold text-amber-700 dark:text-amber-400 mb-1">{title}</h3>
        <p className="text-[10px] text-amber-700/80 dark:text-amber-400/80 leading-relaxed">
          {hint}
          {failure.reason ? <span className="block mt-1 opacity-70">Detail: {failure.reason}</span> : null}
        </p>
      </div>
    </div>
  );
}
