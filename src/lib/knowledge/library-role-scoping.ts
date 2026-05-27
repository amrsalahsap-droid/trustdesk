/**
 * Role-scoped library configuration
 * 
 * Defines the scoping behavior for each role in the Answer Library.
 * This is the single source of truth for:
 * - Default topic scope (focused vs all)
 * - Answer filter params when in focused mode
 * - Empty state messaging
 * - Whether broader context view is allowed
 * 
 * Role scoping rules:
 * - APPROVER: Focused scope (my_assigned answers only) - needs approval workflow
 * - CONTRIBUTOR: Focused scope (my_contributions only) - supporting contributor view
 * - OWNER, ADMIN, OPERATOR, EDITOR, etc.: Full library view (all topics/answers)
 */

export type TopicScope = "focused" | "all";
export type AnswerFilter = "my_approvals" | "my_assigned" | "my_contributions" | "my_owned" | null;

export interface RoleScopeConfig {
  /** Default scope when entering the library */
  defaultTopicScope: TopicScope;
  
  /** Answer filter to apply when in focused mode (null = no filtering) */
  focusedAnswerFilter: AnswerFilter;
  
  /** Whether user can toggle to "all topics" view */
  allowBroaderContext: boolean;
  
  /** Label for the focused scope toggle button */
  focusedScopeLabel: string;
  
  /** Label for the broader context toggle button */
  broaderContextLabel: string;
  
  /** Empty state title when no topics match scope */
  emptyStateTitle: string;
  
  /** Empty state description when no topics match scope */
  emptyStateDescription: string;
  
  /** Description shown in the scope toggle card when focused */
  focusedScopeDescription: string;
  
  /** Description shown in the scope toggle card when viewing all */
  allScopeDescription: string;
}

const DEFAULT_CONFIG: RoleScopeConfig = {
  defaultTopicScope: "all",
  focusedAnswerFilter: null,
  allowBroaderContext: true,
  focusedScopeLabel: "My Work",
  broaderContextLabel: "All Topics",
  emptyStateTitle: "No topics found",
  emptyStateDescription: "Try adjusting your search or filters.",
  focusedScopeDescription: "Showing only topics with your assigned work",
  allScopeDescription: "Showing all workspace topics and answers",
};

const APPROVER_CONFIG: RoleScopeConfig = {
  defaultTopicScope: "focused",
  // Use my_assigned to see all answers where user is the approver (not just IN_REVIEW)
  // This gives Approvers visibility into their full assignment portfolio
  focusedAnswerFilter: "my_assigned",
  allowBroaderContext: true,
  focusedScopeLabel: "My Approvals",
  broaderContextLabel: "All Topics",
  emptyStateTitle: "No approvals assigned",
  emptyStateDescription: "No answers are currently assigned to you for approval. Check back later or browse all topics if needed.",
  focusedScopeDescription: "Showing only topics with answers assigned to you for approval",
  allScopeDescription: "Showing all workspace topics and answers",
};

const CONTRIBUTOR_CONFIG: RoleScopeConfig = {
  defaultTopicScope: "focused",
  // my_contributions = answers where user has made version edits or uploaded evidence
  // This represents both historical contributions AND current support work
  focusedAnswerFilter: "my_contributions",
  allowBroaderContext: true,
  focusedScopeLabel: "My Contributions",
  broaderContextLabel: "All Topics (Read-Only)",
  emptyStateTitle: "No assigned contributions",
  emptyStateDescription: "No answers are currently assigned to you for contribution. When owners or operators request your support, it will appear here.",
  focusedScopeDescription: "Showing only answers assigned to you for contribution",
  allScopeDescription: "Showing all workspace topics and answers",
};

const ROLE_SCOPING_MAP: Record<string, RoleScopeConfig> = {
  APPROVER: APPROVER_CONFIG,
  CONTRIBUTOR: CONTRIBUTOR_CONFIG,
  // Owner, Admin, Operator, Editor, etc. use DEFAULT_CONFIG (full library view)
};

/**
 * Get the scoping configuration for a given workspace role.
 */
export function getRoleScopeConfig(role: string | null | undefined): RoleScopeConfig {
  if (!role) return DEFAULT_CONFIG;
  return ROLE_SCOPING_MAP[role] ?? DEFAULT_CONFIG;
}

/**
 * Check if a role should default to focused topic scope.
 */
export function shouldDefaultToFocusedScope(role: string | null | undefined): boolean {
  const config = getRoleScopeConfig(role);
  return config.defaultTopicScope === "focused";
}

/**
 * Get the answer filter to apply when in focused mode for a given role.
 */
export function getFocusedAnswerFilter(role: string | null | undefined): AnswerFilter {
  const config = getRoleScopeConfig(role);
  return config.focusedAnswerFilter;
}

/**
 * Helper type guards for role detection.
 */
export function isApprover(role: string | null | undefined): boolean {
  return role === "APPROVER";
}

export function isContributor(role: string | null | undefined): boolean {
  return role === "CONTRIBUTOR";
}

export function isOwner(role: string | null | undefined): boolean {
  return role === "OWNER";
}
