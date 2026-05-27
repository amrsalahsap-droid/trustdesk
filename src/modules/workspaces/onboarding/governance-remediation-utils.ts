import type {
  GovernanceRemediationAction,
  GovernanceRemediationMetadata,
  GovernanceRemediationStatus,
  GovernanceTaskRemediationRecord,
  GovernanceRemediationAuditEntry,
} from "./governance-remediation-types";

export const TERMINAL_GOVERNANCE_STATUSES: GovernanceRemediationStatus[] = [
  "confirmed",
  "not_applicable",
];

export function isGovernanceTaskResolved(status: GovernanceRemediationStatus): boolean {
  return TERMINAL_GOVERNANCE_STATUSES.includes(status);
}

export function countOpenGovernanceTasks(
  taskIds: string[],
  remediations: Record<string, GovernanceTaskRemediationRecord>,
): number {
  return taskIds.filter((id) => {
    const record = remediations[id];
    return !record || !isGovernanceTaskResolved(record.status);
  }).length;
}

export function collectSatisfiedEvidenceTypes(
  remediations: Record<string, GovernanceTaskRemediationRecord>,
): string[] {
  const types = new Set<string>();
  for (const record of Object.values(remediations)) {
    for (const evidenceType of record.satisfiedEvidenceTypes ?? []) {
      if (evidenceType) types.add(evidenceType);
    }
  }
  return Array.from(types);
}

export function getGovernanceRemediationStore(
  metadata: Record<string, unknown> | null | undefined,
): GovernanceRemediationMetadata {
  const store = (metadata as { governanceRemediations?: GovernanceRemediationMetadata })
    ?.governanceRemediations;
  return { tasks: store?.tasks ?? {} };
}

function statusForAction(action: GovernanceRemediationAction): GovernanceRemediationStatus {
  switch (action) {
    case "not_applicable":
      return "not_applicable";
    case "confirm":
      return "confirmed";
    case "assign_owner":
      return "assigned";
    case "evidence_uploaded":
      return "evidence_added";
    case "set_due_date":
    case "add_note":
      return "open";
    default:
      return "open";
  }
}

export function applyGovernanceRemediationUpdate(
  existing: GovernanceTaskRemediationRecord | undefined,
  params: {
    taskId: string;
    action: GovernanceRemediationAction;
    userId: string;
    owner?: string;
    dueDate?: string;
    note?: string;
    evidenceDocumentId?: string;
    evidenceType?: string;
    relatedTopicKeys?: string[];
    sourceRationale?: string;
  },
): GovernanceTaskRemediationRecord {
  const now = new Date().toISOString();
  const nextStatus = statusForAction(params.action);
  const priorStatus = existing?.status ?? "open";

  const mergedStatus: GovernanceRemediationStatus =
    params.action === "set_due_date" || params.action === "add_note"
      ? existing?.status === "confirmed" || existing?.status === "not_applicable"
        ? existing.status
        : existing?.status === "evidence_added"
          ? "evidence_added"
          : existing?.status === "assigned"
            ? "assigned"
            : priorStatus
      : nextStatus;

  const auditEntry: GovernanceRemediationAuditEntry = {
    action: params.action,
    status: mergedStatus,
    timestamp: now,
    userId: params.userId,
    note: params.note,
    metadata: {
      owner: params.owner,
      dueDate: params.dueDate,
      evidenceDocumentId: params.evidenceDocumentId,
      evidenceType: params.evidenceType,
    },
  };

  const evidenceDocumentIds = [...(existing?.evidenceDocumentIds ?? [])];
  if (params.evidenceDocumentId && !evidenceDocumentIds.includes(params.evidenceDocumentId)) {
    evidenceDocumentIds.push(params.evidenceDocumentId);
  }

  const satisfiedEvidenceTypes = [...(existing?.satisfiedEvidenceTypes ?? [])];
  if (params.evidenceType && !satisfiedEvidenceTypes.includes(params.evidenceType)) {
    satisfiedEvidenceTypes.push(params.evidenceType);
  }

  const relatedTopicKeys = [
    ...new Set([...(existing?.relatedTopicKeys ?? []), ...(params.relatedTopicKeys ?? [])]),
  ];

  return {
    taskId: params.taskId,
    status: mergedStatus,
    owner: params.owner ?? existing?.owner,
    dueDate: params.dueDate ?? existing?.dueDate,
    note: params.note ?? existing?.note,
    evidenceDocumentIds,
    satisfiedEvidenceTypes,
    relatedTopicKeys,
    sourceRationale: params.sourceRationale ?? existing?.sourceRationale,
    updatedAt: now,
    updatedBy: params.userId,
    auditHistory: [...(existing?.auditHistory ?? []), auditEntry],
  };
}
