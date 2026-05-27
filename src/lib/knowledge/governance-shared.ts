
/** Stable queue ids for counts, list (?queue=), and library deep links. */
export const GOVERNANCE_QUEUE_IDS = [
  "my_owned",
  "my_approvals",
  "my_stale_owned",
  "my_revision_required",
  "my_contributions",
  "overdue_approvals",
  "unowned",
  "no_approver",
  "stale_legacy_lastVerified",
  "freshness_expired",
  "freshness_due_soon",
  "freshness_needs_review",
  "drafts_awaiting_approval",
  "export_blocked",
  "override_canonical_review",
  "operator_library_blockers",
] as const;

export type GovernanceQueueId = (typeof GOVERNANCE_QUEUE_IDS)[number];

export function isGovernanceQueueId(s: string): s is GovernanceQueueId {
  return (GOVERNANCE_QUEUE_IDS as readonly string[]).includes(s);
}

/** True when the library list can run cross-topic with the given chip id. */
export function isLibraryCrossTopicGovernanceFilter(governanceFilter: string): boolean {
  return (
    governanceFilter !== "ALL" &&
    (governanceFilter.startsWith("freshness_") ||
      governanceFilter.startsWith("exportSafety_") ||
      (GOVERNANCE_QUEUE_IDS as readonly string[]).includes(governanceFilter))
  );
}
