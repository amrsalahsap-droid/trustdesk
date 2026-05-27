export type WorkflowFilter = "DRAFT" | "IN_REVIEW" | "NEEDS_REVISION" | "APPROVED";
export type AssignmentFilter = "MINE" | "UNASSIGNED" | "NO_APPROVER";
export type UrgencyFilter = "OVERDUE" | "DUE_SOON";
export type UsageFilter = "EXPORT_SAFE" | "INTERNAL_ONLY" | "RESTRICTED" | "NOT_APPROVED";

export interface AnswerLibraryFilters {
  workflow: WorkflowFilter[];
  assignment: AssignmentFilter[];
  urgency: UrgencyFilter[];
  usage: UsageFilter[];
  search: string;
}

export const DEFAULT_FILTERS: AnswerLibraryFilters = {
  workflow: [],
  assignment: [],
  urgency: [],
  usage: [],
  search: "",
};

export interface FilterOption {
  id: string;
  label: string;
}

export interface FilterGroup {
  id: keyof Omit<AnswerLibraryFilters, "search">;
  label: string;
  options: FilterOption[];
}

export const FILTER_GROUPS: FilterGroup[] = [
  {
    id: "workflow",
    label: "Workflow",
    options: [
      { id: "DRAFT", label: "Draft" },
      { id: "IN_REVIEW", label: "In Review" },
      { id: "NEEDS_REVISION", label: "Needs Revision" },
      { id: "APPROVED", label: "Approved" },
    ],
  },
  {
    id: "assignment",
    label: "Assignment",
    options: [
      { id: "MINE", label: "Mine" },
      { id: "UNASSIGNED", label: "Unassigned" },
      { id: "NO_APPROVER", label: "No Approver" },
    ],
  },
  {
    id: "urgency",
    label: "Urgency",
    options: [
      { id: "OVERDUE", label: "Overdue" },
      { id: "DUE_SOON", label: "Due soon" },
    ],
  },
  {
    id: "usage",
    label: "Usage / Export",
    options: [
      { id: "EXPORT_SAFE", label: "Export-safe" },
      { id: "INTERNAL_ONLY", label: "Internal only" },
      { id: "RESTRICTED", label: "Restricted" },
      { id: "NOT_APPROVED", label: "Not approved" },
    ],
  },
];

/**
 * Parses URL search params into AnswerLibraryFilters object.
 */
export function parseFiltersFromParams(params: URLSearchParams): AnswerLibraryFilters {
  const filters: AnswerLibraryFilters = { ...DEFAULT_FILTERS };

  const workflow = params.get("workflow");
  if (workflow) filters.workflow = workflow.split(",") as WorkflowFilter[];

  const assignment = params.get("assignment");
  if (assignment) filters.assignment = assignment.split(",") as AssignmentFilter[];

  const urgency = params.get("urgency");
  if (urgency) filters.urgency = urgency.split(",") as UrgencyFilter[];

  const usage = params.get("usage");
  if (usage) filters.usage = usage.split(",") as UsageFilter[];

  const search = params.get("search");
  if (search) filters.search = search;

  return filters;
}

/**
 * Serializes AnswerLibraryFilters object into URLSearchParams.
 */
export function serializeFiltersToParams(filters: AnswerLibraryFilters): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.workflow.length > 0) params.set("workflow", filters.workflow.join(","));
  if (filters.assignment.length > 0) params.set("assignment", filters.assignment.join(","));
  if (filters.urgency.length > 0) params.set("urgency", filters.urgency.join(","));
  if (filters.usage.length > 0) params.set("usage", filters.usage.join(","));
  if (filters.search) params.set("search", filters.search);

  return params;
}

/**
 * Counts active filters (excluding search).
 */
export function getActiveFilterCount(filters: AnswerLibraryFilters): number {
  return (
    filters.workflow.length +
    filters.assignment.length +
    filters.urgency.length +
    filters.usage.length
  );
}
