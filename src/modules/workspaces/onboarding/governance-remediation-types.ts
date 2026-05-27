export type GovernanceRemediationStatus =
  | "open"
  | "evidence_added"
  | "confirmed"
  | "not_applicable"
  | "assigned";

export interface GovernanceRemediationAuditEntry {
  action: string;
  status: GovernanceRemediationStatus;
  timestamp: string;
  userId: string;
  note?: string;
  metadata?: Record<string, unknown>;
}

export interface GovernanceTaskRemediationRecord {
  taskId: string;
  status: GovernanceRemediationStatus;
  owner?: string;
  dueDate?: string;
  note?: string;
  evidenceDocumentIds?: string[];
  satisfiedEvidenceTypes?: string[];
  relatedTopicKeys?: string[];
  sourceRationale?: string;
  updatedAt: string;
  updatedBy: string;
  auditHistory: GovernanceRemediationAuditEntry[];
}

export interface GovernanceRemediationMetadata {
  tasks: Record<string, GovernanceTaskRemediationRecord>;
}

export type GovernanceRemediationAction =
  | "not_applicable"
  | "confirm"
  | "assign_owner"
  | "set_due_date"
  | "add_note"
  | "evidence_uploaded";

export interface GovernanceRemediationUpdatePayload {
  workspaceId: string;
  taskId: string;
  action: GovernanceRemediationAction;
  owner?: string;
  dueDate?: string;
  note?: string;
  evidenceDocumentId?: string;
  evidenceType?: string;
  relatedTopicKeys?: string[];
  sourceRationale?: string;
  taskSnapshot?: {
    title?: string;
    relatedPillar?: string;
    requestedEvidence?: string[];
  };
}
