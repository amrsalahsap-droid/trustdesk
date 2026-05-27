import type {
  VendorIntelligenceProfile,
  EvidenceRef,
  OnboardingReadinessViewModel,
} from "@/modules/workspaces/onboarding/vendor-intelligence-types";

export interface ExplorerEvidenceItem {
  id: string;
  url: string;
  title: string;
  snippet: string;
  authorityLevel: string;
  confidenceContribution: number;
  observationStatus: "observed" | "inferred" | "unconfirmed";
  linkedRisks: string[];
  linkedTopics: string[];
  linkedTasks: string[];
  linkedCapabilities: string[];
  sourceEntity: string;
}

function normalizeKey(value: string | undefined | null): string {
  if (!value) return "";
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

function evidenceId(url: string | undefined | null, snippet: string | undefined | null, entity: string): string {
  const urlStr = url || "";
  const snippetStr = snippet || "";
  return `${normalizeKey(entity)}::${normalizeKey(urlStr)}::${normalizeKey(snippetStr.slice(0, 40))}`;
}

function authorityLabel(ref: EvidenceRef): string {
  return ref.authority?.authorityLevel || "MEDIUM";
}

function observationStatus(confidence: number): ExplorerEvidenceItem["observationStatus"] {
  if (confidence >= 0.85) return "observed";
  if (confidence >= 0.55) return "inferred";
  return "unconfirmed";
}

function upsertEvidence(
  map: Map<string, ExplorerEvidenceItem>,
  ref: EvidenceRef,
  entity: string,
  links: Partial<Pick<ExplorerEvidenceItem, "linkedRisks" | "linkedTopics" | "linkedTasks" | "linkedCapabilities">>,
) {
  const id = evidenceId(ref.url, ref.snippet, entity);
  const existing = map.get(id);
  if (existing) {
    map.set(id, {
      ...existing,
      linkedRisks: [...new Set([...existing.linkedRisks, ...(links.linkedRisks ?? [])])],
      linkedTopics: [...new Set([...existing.linkedTopics, ...(links.linkedTopics ?? [])])],
      linkedTasks: [...new Set([...existing.linkedTasks, ...(links.linkedTasks ?? [])])],
      linkedCapabilities: [
        ...new Set([...existing.linkedCapabilities, ...(links.linkedCapabilities ?? [])]),
      ],
    });
    return;
  }
  map.set(id, {
    id,
    url: ref.url,
    title: ref.title || ref.url,
    snippet: ref.snippet || "",
    authorityLevel: authorityLabel(ref),
    confidenceContribution: Math.round((ref.confidence || 0) * 100),
    observationStatus: observationStatus(ref.confidence || 0),
    linkedRisks: links.linkedRisks ?? [],
    linkedTopics: links.linkedTopics ?? [],
    linkedTasks: links.linkedTasks ?? [],
    linkedCapabilities: links.linkedCapabilities ?? [],
    sourceEntity: entity,
  });
}

export function buildExplorerEvidenceIndex(
  profile: VendorIntelligenceProfile | null,
  readiness: OnboardingReadinessViewModel | null,
): ExplorerEvidenceItem[] {
  if (!profile) return [];
  const map = new Map<string, ExplorerEvidenceItem>();

  for (const risk of profile.securityAndTrustModel.procurementRiskAreas) {
    for (const ref of risk.evidenceRefs || []) {
      upsertEvidence(map, ref, `risk:${risk.key}`, {
        linkedRisks: [risk.key, risk.label],
      });
    }
  }

  for (const topic of profile.workspacePreparation.recommendedTrustTopics) {
    for (const ref of topic.evidenceRefs || []) {
      upsertEvidence(map, ref, `topic:${topic.key}`, {
        linkedTopics: [topic.key, topic.title],
      });
    }
  }

  for (const cap of profile.productsAndServices.capabilities) {
    for (const ref of cap.evidenceRefs || []) {
      upsertEvidence(map, ref, `capability:${cap.key}`, {
        linkedCapabilities: [cap.key, cap.label],
      });
    }
  }

  for (const task of profile.workspacePreparation.clarificationTasks) {
    const taskKeys = [task.id, task.canonicalKey || "", task.title].filter(Boolean);
    for (const signal of task.triggeringSignals || []) {
      // Tasks may not have direct refs; link via title match in readiness capabilities
      void signal;
    }
    for (const cap of readiness?.capabilities || []) {
      const capLabel = cap.label || "";
      if (taskKeys.some((k) => capLabel.toLowerCase().includes((k || "").toLowerCase().slice(0, 8)))) {
        for (const ref of cap.evidenceRefs || []) {
          upsertEvidence(map, ref, `task:${task.id}`, { linkedTasks: [task.id, task.title] });
        }
      }
    }
  }

  for (const capView of readiness?.capabilities || []) {
    for (const ref of capView.evidenceRefs || []) {
      upsertEvidence(map, ref, `capability:${capView.key}`, {
        linkedCapabilities: [capView.key, capView.label],
      });
    }
  }

  for (const riskView of readiness?.riskAreas || []) {
    for (const ref of riskView.evidenceRefs || []) {
      upsertEvidence(map, ref, `risk:${riskView.key}`, {
        linkedRisks: [riskView.key, riskView.label],
      });
    }
  }

  return Array.from(map.values()).sort(
    (a, b) => b.confidenceContribution - a.confidenceContribution,
  );
}

export function getSourcePages(
  profile: VendorIntelligenceProfile | null,
): { url: string; title: string }[] {
  if (!profile) return [];
  const foundation = profile.workspacePreparation.workspaceFoundation;
  const urls = new Set<string>([
    ...(foundation.sourceEvidenceRefs || []),
    ...(profile.pagesScanned || []),
  ]);
  return Array.from(urls).map((url) => ({
    url,
    title: tryPageTitle(url),
  }));
}

function tryPageTitle(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/$/, "") || "/";
    return path === "/" ? parsed.hostname : `${parsed.hostname}${path}`;
  } catch {
    return url;
  }
}

export function matchesExplorerFilter(
  filters: {
    riskKey?: string;
    pillarKey?: string;
    topicKey?: string;
    taskKey?: string;
    evidenceNeedId?: string;
    capabilityKey?: string;
    workflowKey?: string;
    questionId?: string;
  },
  matchers: {
    riskKeys?: string[];
    topicKeys?: string[];
    taskKeys?: string[];
    capabilityKeys?: string[];
    pillarKeys?: string[];
    evidenceNeedKeys?: string[];
    workflowKeys?: string[];
    questionKeys?: string[];
  },
): boolean {
  const norm = (v: string) => normalizeKey(v);
  if (filters.riskKey) {
    const target = norm(filters.riskKey);
    if (!matchers.riskKeys?.some((k) => norm(k).includes(target) || target.includes(norm(k)))) {
      return false;
    }
  }
  if (filters.pillarKey) {
    const target = norm(filters.pillarKey);
    if (!matchers.pillarKeys?.some((k) => norm(k).includes(target) || target.includes(norm(k)))) {
      return false;
    }
  }
  if (filters.topicKey) {
    const target = norm(filters.topicKey);
    if (!matchers.topicKeys?.some((k) => norm(k).includes(target) || target.includes(norm(k)))) {
      return false;
    }
  }
  if (filters.taskKey) {
    const target = norm(filters.taskKey);
    if (!matchers.taskKeys?.some((k) => norm(k).includes(target) || target.includes(norm(k)))) {
      return false;
    }
  }
  if (filters.capabilityKey) {
    const target = norm(filters.capabilityKey);
    if (!matchers.capabilityKeys?.some((k) => norm(k).includes(target) || target.includes(norm(k)))) {
      return false;
    }
  }
  if (filters.evidenceNeedId) {
    const target = norm(filters.evidenceNeedId);
    if (
      !matchers.evidenceNeedKeys?.some((k) => norm(k).includes(target) || target.includes(norm(k)))
    ) {
      return false;
    }
  }
  if (filters.workflowKey) {
    const target = norm(filters.workflowKey);
    if (!matchers.workflowKeys?.some((k) => norm(k).includes(target) || target.includes(norm(k)))) {
      return false;
    }
  }
  if (filters.questionId) {
    const target = norm(filters.questionId);
    if (!matchers.questionKeys?.some((k) => norm(k).includes(target) || target.includes(norm(k)))) {
      return false;
    }
  }
  return true;
}
