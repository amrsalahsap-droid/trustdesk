export interface Topic {
  id: string;
  key: string;
  name: string;
  description: string | null;
}

export interface EvidenceSnippet {
  docName: string;
  content: string;
  page?: number;
}

export interface AnswerBlock {
  id: string;
  topic: Topic | null;
  title: string;
  answer: string;
  evidence: EvidenceSnippet[];
  ownerId: string | null;
  owner: string;
  approverId?: string | null;
  ownerUser?: { id?: string; name: string; email: string };
  approverUser?: { id?: string; name: string; email: string };
  governanceStatus?: string | null;
  approvalScope?: string | null;
  exportSafe?: boolean;
  nextReviewDueAt?: string | null;
  expiresAt?: string | null;
  reviewCadenceDays?: number | null;
  updatedAt: string;
  lastVerified: string;
  version: string;
  currentVersion: number;
  status: string;
  confidenceScore: number | null;
  hasEvidence: boolean;
  overrideReasonCategory?: string | null;
  overrideComment?: string | null;
  overrideScope?: string | null;
  /**
   * Contribution signals indicating if the current user has contributed to this answer.
   * Used for Contributor role context-only marking in broader view mode.
   */
  contributionSignals?: {
    hasVersionContribution: boolean;
    hasEvidenceContribution: boolean;
    hasContributed: boolean;
  };
}

/** Structured diff entry stored on `AnswerLibraryItemVersion.changeDiffJson`. */
export interface AnswerVersionDiffEntry {
  field: string;
  before: unknown;
  after: unknown;
}

/** Row from GET/PATCH `/api/knowledge/answers/[id]` `versions` include. */
export interface AnswerDetailVersion {
  id: string;
  versionNumber: number;
  createdAt: string;
  changeReason: string | null;
  answerText?: string | null;
  title?: string | null;
  changedBy?: { id?: string; name: string | null; email?: string | null } | null;
  governanceStatus?: string | null;
  approvalScope?: string | null;
  exportSafe?: boolean | null;
  changeDiffJson?: AnswerVersionDiffEntry[] | null;
  resetApprovalRequired?: boolean | null;
  changeKind?: string | null;
  ownerId?: string | null;
  approverId?: string | null;
}

/** Evidence edge shape from answer detail API. */
export interface AnswerDetailEvidenceLink {
  chunk: {
    text: string;
    chunkIndex: number;
    metadata?: { page?: number } | null;
    sourceDocument: { filename: string };
  };
}

/** Full item from GET `/api/knowledge/answers/[id]` (after JSON). */
export interface AnswerDetailItem {
  id: string;
  title: string;
  answer: string;
  status: string;
  currentVersion: number;
  updatedAt: string;
  confidenceScore: number | null;
  topic?: { id: string; name: string; key?: string } | null;
  owner?: string | null;
  ownerId?: string | null;
  approverId?: string | null;
  ownerUser?: { id: string; name: string; email: string } | null;
  approverUser?: { id: string; name: string; email: string } | null;
  approvedByUser?: { id: string; name: string; email: string } | null;
  approvedAt?: string | null;
  governanceStatus?: string | null;
  approvalScope?: string | null;
  exportSafe?: boolean | null;
  lastReviewedAt?: string | null;
  nextReviewDueAt?: string | null;
  expiresAt?: string | null;
  reviewCadenceDays?: number | null;
  versions?: AnswerDetailVersion[];
  evidence?: AnswerDetailEvidenceLink[];
  overrideReasonCategory?: string | null;
  overrideComment?: string | null;
  overrideScope?: string | null;
  overrideAt?: string | null;
}
