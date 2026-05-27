import type { ExplorerFilterContext, ExplorerTabId } from "./onboarding-review-interactions";

export type ExplorerUrlParam =
  | { kind: "open" }
  | { kind: "risk"; key: string }
  | { kind: "pillar"; key: string }
  | { kind: "evidence"; key: string }
  | { kind: "capability"; key: string }
  | { kind: "topic"; key: string }
  | { kind: "task"; key: string }
  | { kind: "workflow"; key: string }
  | { kind: "question"; key: string };

export function parseExplorerParam(raw: string | null | undefined): ExplorerUrlParam | null {
  if (!raw) return null;
  if (raw === "open") return { kind: "open" };
  const colon = raw.indexOf(":");
  if (colon === -1) return null;
  const prefix = raw.slice(0, colon);
  const key = decodeURIComponent(raw.slice(colon + 1));
  if (!key) return null;
  switch (prefix) {
    case "risk":
      return { kind: "risk", key };
    case "pillar":
      return { kind: "pillar", key };
    case "evidence":
      return { kind: "evidence", key };
    case "capability":
      return { kind: "capability", key };
    case "topic":
      return { kind: "topic", key };
    case "task":
      return { kind: "task", key };
    case "workflow":
      return { kind: "workflow", key };
    case "question":
      return { kind: "question", key };
    default:
      return null;
  }
}

export function serializeExplorerParam(param: ExplorerUrlParam | null): string | null {
  if (!param) return null;
  if (param.kind === "open") return "open";
  return `${param.kind}:${encodeURIComponent(param.key)}`;
}

export function explorerParamToFilter(param: ExplorerUrlParam): ExplorerFilterContext {
  switch (param.kind) {
    case "open":
      return {};
    case "risk":
      return { riskKey: param.key, initialTab: "risks" };
    case "pillar":
      return { pillarKey: param.key, initialTab: "trust-topics" };
    case "evidence":
      return { evidenceNeedId: param.key, initialTab: "evidence-needs" };
    case "capability":
      return { capabilityKey: param.key, initialTab: "capabilities" };
    case "topic":
      return { topicKey: param.key, initialTab: "trust-topics" };
    case "task":
      return { taskKey: param.key, initialTab: "evidence-snippets" };
    case "workflow":
      return { workflowKey: param.key, initialTab: "workflows" };
    case "question":
      return { questionId: param.key, initialTab: "buyer-questions" };
    default:
      return {};
  }
}

export function filterToExplorerParam(filters: ExplorerFilterContext | null): ExplorerUrlParam | null {
  if (!filters) return null;
  if (filters.riskKey) return { kind: "risk", key: filters.riskKey };
  if (filters.pillarKey) return { kind: "pillar", key: filters.pillarKey };
  if (filters.evidenceNeedId) return { kind: "evidence", key: filters.evidenceNeedId };
  if (filters.capabilityKey) return { kind: "capability", key: filters.capabilityKey };
  if (filters.topicKey) return { kind: "topic", key: filters.topicKey };
  if (filters.taskKey) return { kind: "task", key: filters.taskKey };
  if (filters.workflowKey) return { kind: "workflow", key: filters.workflowKey };
  if (filters.questionId) return { kind: "question", key: filters.questionId };
  return { kind: "open" };
}

export function resolveExplorerTabFromFilter(
  filters: ExplorerFilterContext | null,
): ExplorerTabId {
  if (filters?.initialTab) return filters.initialTab;
  if (filters?.riskKey) return "risks";
  if (filters?.pillarKey) return "trust-topics";
  if (filters?.evidenceNeedId) return "evidence-needs";
  if (filters?.capabilityKey) return "capabilities";
  if (filters?.workflowKey) return "workflows";
  if (filters?.questionId) return "buyer-questions";
  if (filters?.topicKey) return "trust-topics";
  if (filters?.taskKey) return "evidence-snippets";
  return "source-pages";
}
