import type { ConfidenceLevel } from "@/components/ui/confidence-pill";
import type { ExportSafetyTier } from "@/lib/knowledge/answer-export-safety";

export type ParserConfidence = ConfidenceLevel;

export type ParseIssueSeverity = "info" | "review" | "warning" | "error";

export interface ParseIssue {
  severity: ParseIssueSeverity;
  title: string;
  detail: string;
}

export interface ScoredSheet {
  name: string;
  totalScore: number;
  reasons: string[];
}

/** Preview returned from scan / stored on QuestionnaireJob.previewJson */
export interface QuestionnaireImportPreview {
  sheetNames: string[];
  selectedSheet: string;
  scoredSheets?: ScoredSheet[];
  headerRow1Based: number;
  questionColIndex: number;
  answerColIndex: number;
  columnHeaders: string[];
  rowPreview: { question: string; answer: string }[];
  confidence: ParserConfidence;
  headerConfidence?: ParserConfidence;
  questionConfidence?: ParserConfidence;
  answerConfidence?: ParserConfidence;
  sheetConfidence?: ParserConfidence;
  suggestNewAnswerColumn: boolean;
  issues: ParseIssue[];
  explainerBullets: string[];
  /** First N rows of the active sheet (0-based row index) for client-side remapping. */
  gridSample: string[][];
  /** Rows available in the scanned sample (used for header row bounds in UI). */
  rowCount: number;
  /** Preserved system guesses for manual override recovery. */
  detectedHeaderRowIndex?: number;
  detectedQuestionColIndex?: number;
  detectedAnswerColIndex?: number;
}

export type VerificationStatus = "DRAFTED" | "SUGGESTED" | "NEEDS_REVIEW" | "ACCEPTED" | "AUTO_ACCEPTED" | "AMBIGUOUS_MATCH" | "REJECTED" | "UNRESOLVED" | "UNREVIEWED" | "EDITED" | "MANUAL_OVERRIDE";

export type ReviewStatus = "ok" | "missing" | "conflict" | "unresolved";

export interface AnswerCandidate {
  id: string;
  answer: string;
  score: number;
  isApproved: boolean;
  topicName?: string;
}

export interface EvidenceSource {
  quote: string;
  documentName: string;
  documentId: string;
  heading?: string;
  pageNumber?: number;
  metadata?: any;
}

export interface AnswerProvenance {
  answerOrigin: "approved_reuse" | "subcontrol_synthesis" | "evidence_derived" | "unresolved";
  sourceAnswerIds?: string[];
  sourceSubControlKeys?: string[];
  sourceDocumentIds?: string[];
  synthesisUsed?: boolean;
  verifierVerdict?: "pass" | "fail" | null;
  tone?: string;
  evidenceCount?: number;
}

/** LLM semantic assist outcome when invoked after deterministic rules found no hit. */
export interface ReviewSemanticJudgeDTO {
  contradictionLikely: boolean;
  confidence: number;
  reason: string;
  supportingExcerpts: Array<{ source: "row" | "canonical"; text: string }>;
}

/** One rule hit returned with review load (subset of engine hit for JSON). */
export interface ReviewCanonicalContradictionHitDTO {
  ruleId: string;
  ruleDescription: string;
  contradictionType: string;
  severity: string;
  message: string;
  reason: string;
  rowExcerpt: string;
  canonicalExcerpt: string;
  confidence: number;
}

/** Persisted row-level contradiction state merged into review GET for the UI. */
export interface ReviewContradictionPersistenceDTO {
  resultId: string;
  resolutionStatus:
    | "PENDING"
    | "ACKNOWLEDGED"
    | "RESOLVED_ROW"
    | "RESOLVED_CANONICAL"
    | "FALSE_POSITIVE"
    | "STALE";
  resolvedAt?: string | null;
  resolutionAction?: string | null;
}

/**
 * Canonical contradiction: row answer vs approved library (policy) truth.
 * Distinct from evidence-level issues: `conflictNote` and `status === "conflict"`
 * refer to conflicting source documents during onboarding, not this object.
 */
export type ReviewCanonicalContradictionDTO =
  | { status: "skipped"; reason: string }
  | { status: "no_canonical"; reason?: string; code?: string }
  | { status: "no_rule_pack" }
  | { status: "error"; message: string }
  | {
      status: "checked";
      contradictionFound: boolean;
      canonicalUnavailable?: boolean;
      severity: string | null;
      contradictionType: string | null;
      message: string | null;
      reason: string | null;
      hits: ReviewCanonicalContradictionHitDTO[];
      rulesEvaluated: number;
      rulePackVersion: string;
      detectorVersion: string;
      canonicalAnswerId?: string;
      canonicalAnswerExcerpt?: string | null;
      /** Pinned canonical version for persistence and display. */
      canonicalVersionNumber?: number;
      topicId?: string;
      canonicalApprovedAt?: string | null;
      canonicalGovernanceStatus?: string | null;
      /** Primary rule id from the first hit (mirrors DB `ruleId`). */
      primaryRuleId?: string | null;
      /** Present when the semantic judge ran (including negative outcomes). */
      semanticJudge?: ReviewSemanticJudgeDTO;
      /** Set after review GET upserts `ContradictionResult`. */
      persistence?: ReviewContradictionPersistenceDTO;
    };

export interface ReviewQuestionDTO {
  id: string;
  question: string;
  suggestedAnswer: string;
  finalAnswer: string;
  /**
   * Durable record of the customer's uploaded manual answer (`QuestionnaireItem.importedAnswer`).
   * Null when the spreadsheet cell was empty or the row predates the imported-answer workflow
   * with no recoverable history.
   */
  importedAnswer?: string | null;
  /** How `importedAnswer` was populated — see `ImportedAnswerSource` enum. */
  importedAnswerSource?: "raw_import" | "final_answer_legacy" | "suggested_answer_legacy" | "unknown" | null;
  /**
   * Reviewer's explicit choice of which source became `finalAnswer`. Null means "not
   * picked yet" and the row cannot be marked reviewed. See `FinalAnswerSelection` enum.
   */
  finalAnswerSelection?: "imported" | "suggested" | "edited" | "canonical_aligned" | null;
  finalAnswerSelectedAt?: string | null;
  finalAnswerSelectedByUserId?: string | null;
  type: string;
  rowNumber?: number;
  reviewed: boolean;
  reviewSummary?: string;
  topicKey?: string;
  topicName?: string;
  confidence: "high" | "medium" | "low";
  status: ReviewStatus;
  /**
   * Evidence-level conflict (onboarding / multiple documents). Not the same as
   * `canonicalContradiction`, which compares the row to approved canonical answers.
   */
  conflictNote?: string;
  sources: EvidenceSource[];
  topicId?: string;
  suggestedAnswerId?: string;
  suggestionStatus?: string;
  exportStatus?: string;
  candidates: AnswerCandidate[];
  unresolvedReason?: string;
  verificationStatus: VerificationStatus;
  provenance?: AnswerProvenance;
  isAmbiguous?: boolean;
  ambiguityJson?: {
    reason: string;
    competingTopics?: Array<{ id: string; name: string; score: number }>;
    competingSubControls?: Array<{ key: string; score: number }>;
    severity: "high" | "medium" | "low";
  };
  assigneeId?: string;
  assignee?: { id: string; name: string | null; email: string };
  /** Owner of the library answer backing this row's suggestedAnswer. */
  answerOwner?: { id: string; name: string | null; email: string } | null;
  /** Designated approver of the library answer backing this row's suggestedAnswer. */
  answerApprover?: { id: string; name: string | null; email: string } | null;
  /** Derived export-safety tier for the linked library answer (when suggestedAnswerId is set). */
  linkedAnswerExportTier?: ExportSafetyTier;
  /** Row-level deviation rationale when final text differs from the suggestion. */
  overrideReasonCategory?: string | null;
  overrideComment?: string | null;
  overrideScope?: string | null;
  overrideAt?: string | null;
  overrideByUserId?: string | null;
  /** Row vs approved canonical answer; see `ReviewCanonicalContradictionDTO`. */
  canonicalContradiction?: ReviewCanonicalContradictionDTO;
}
