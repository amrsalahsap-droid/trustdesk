"use client";

import React, { useEffect, useMemo, useRef } from "react";
import {
  ShieldCheckIcon,
  ShieldIcon,
  LinkIcon,
  AlertCircleIcon,
  ActivityIcon,
  SearchIcon,
  CheckIcon,
  ZapIcon,
  HelpCircleIcon,
  FileTextIcon,
  GlobeIcon,
} from "@/components/icons";
import { cn } from "@/lib/utils";
import { SlideOver } from "@/components/ui/slide-over";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AppCard, AppTypography, AppIcon, AppMetaLabel, AppBadge } from "@/components/ui/app-design-system/primitives";
import type {
  VendorIntelligenceProfile,
  OnboardingReadinessViewModel,
} from "@/modules/workspaces/onboarding/vendor-intelligence-types";
import type { ExplorerFilterContext, ExplorerTabId } from "../onboarding-review-interactions";
import { resolveExplorerTabFromFilter } from "../explorer-url-state";
import {
  buildExplorerEvidenceIndex,
  getSourcePages,
  matchesExplorerFilter,
  type ExplorerEvidenceItem,
} from "../explorer-data-index";

interface IntelligenceExplorerProps {
  isOpen: boolean;
  onClose: () => void;
  profile: VendorIntelligenceProfile | null;
  readinessViewModel?: OnboardingReadinessViewModel | null;
  filters?: ExplorerFilterContext | null;
  activeTab?: ExplorerTabId;
  onTabChange?: (tab: ExplorerTabId) => void;
}

const TAB_CONFIG: { id: ExplorerTabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "source-pages", label: "Source Pages", icon: GlobeIcon },
  { id: "evidence-snippets", label: "Evidence", icon: LinkIcon },
  { id: "capabilities", label: "Capabilities", icon: ActivityIcon },
  { id: "workflows", label: "Workflows", icon: ZapIcon },
  { id: "risks", label: "Risks", icon: ShieldIcon },
  { id: "trust-topics", label: "Topics", icon: ShieldCheckIcon },
  { id: "evidence-needs", label: "Gaps", icon: AlertCircleIcon },
  { id: "buyer-questions", label: "Buyer Qs", icon: HelpCircleIcon },
  { id: "diagnostics", label: "Diagnostics", icon: SearchIcon },
];

export function IntelligenceExplorer({
  isOpen,
  onClose,
  profile,
  readinessViewModel,
  filters,
  activeTab,
  onTabChange,
}: IntelligenceExplorerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const resolvedTab = activeTab ?? resolveExplorerTabFromFilter(filters ?? null);

  const evidenceItems = useMemo(
    () => buildExplorerEvidenceIndex(profile, readinessViewModel ?? null),
    [profile, readinessViewModel],
  );

  const sourcePages = useMemo(() => getSourcePages(profile), [profile]);

  const contextBanner = useMemo(() => {
    if (!filters) return null;
    if (filters.riskKey) return `Filtered to risk: ${filters.riskKey.replace(/_/g, " ")}`;
    if (filters.pillarKey) return `Filtered to pillar: ${filters.pillarKey.replace(/_/g, " ")}`;
    if (filters.evidenceNeedId) return `Filtered to evidence need: ${filters.evidenceNeedId}`;
    if (filters.capabilityKey) return `Filtered to capability: ${filters.capabilityKey.replace(/_/g, " ")}`;
    if (filters.topicKey) return `Filtered to topic: ${filters.topicKey.replace(/_/g, " ")}`;
    if (filters.taskKey) return `Filtered to governance task: ${filters.taskKey}`;
    if (filters.workflowKey) return `Filtered to workflow: ${filters.workflowKey}`;
    if (filters.questionId) return `Filtered to buyer question`;
    return null;
  }, [filters]);

  useEffect(() => {
    if (!isOpen || !filters?.highlightId) return;
    const el = scrollRef.current?.querySelector(`[data-explorer-highlight="${filters.highlightId}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [isOpen, filters?.highlightId, resolvedTab]);

  if (!profile) return null;

  const {
    workspacePreparation,
    securityAndTrustModel,
    diagnostics,
    productsAndServices,
    businessModel,
  } = profile;

  const workflows = workspacePreparation.workspaceFoundation.operationalWorkflows ?? [];
  const buyerQuestions = readinessViewModel?.buyerQuestions ?? [];
  const capabilities = readinessViewModel?.capabilities?.length
    ? readinessViewModel.capabilities
    : productsAndServices.capabilities.map((c) => ({
        key: c.key,
        label: c.label,
        confidence: c.confidence,
        evidenceStrength: "Detected",
        evidenceRefs: c.evidenceRefs,
        evidenceAuthority: "",
        confidenceReason: "",
      }));

  const filteredRisks = securityAndTrustModel.procurementRiskAreas.filter((risk) =>
    matchesExplorerFilter(filters ?? {}, { riskKeys: [risk.key, risk.label] }),
  );

  const pillarTopicKeys =
    filters?.pillarKey != null
      ? workspacePreparation.workspaceFoundation.pillars.find((p) => p.key === filters.pillarKey)
          ?.topicKeys ?? []
      : null;

  const filteredTopics = workspacePreparation.recommendedTrustTopics.filter((topic) => {
    if (pillarTopicKeys && pillarTopicKeys.length > 0) {
      const topicKeys = [topic.key, ...(topic.topicKeys || [])];
      if (!topicKeys.some((k) => pillarTopicKeys.includes(k))) return false;
    }
    return matchesExplorerFilter(filters ?? {}, {
      topicKeys: [topic.key, topic.id, topic.title, ...(topic.topicKeys || [])],
      pillarKeys: filters?.pillarKey ? [filters.pillarKey] : undefined,
    });
  });

  const filteredEvidenceNeeds = workspacePreparation.evidenceNeeds.filter((need) =>
    matchesExplorerFilter(filters ?? {}, { evidenceNeedKeys: [need.type] }),
  );

  const filteredTasks = workspacePreparation.clarificationTasks.filter((task) =>
    matchesExplorerFilter(filters ?? {}, {
      taskKeys: [task.id, task.canonicalKey || "", task.title],
    }),
  );

  const filteredCapabilities = capabilities.filter((cap) =>
    matchesExplorerFilter(filters ?? {}, { capabilityKeys: [cap.key, cap.label] }),
  );

  const filteredWorkflows = workflows.filter((wf) =>
    matchesExplorerFilter(filters ?? {}, { workflowKeys: [wf.id, wf.type, wf.title] }),
  );

  const filteredQuestions = buyerQuestions.filter((q) =>
    matchesExplorerFilter(filters ?? {}, { questionKeys: [q.id, q.concernDomain] }),
  );

  const filteredSnippets = evidenceItems.filter((item) => {
    if (!filters || Object.keys(filters).length === 0) return true;
    return matchesExplorerFilter(filters, {
      riskKeys: item.linkedRisks,
      topicKeys: item.linkedTopics,
      taskKeys: item.linkedTasks,
      capabilityKeys: item.linkedCapabilities,
      evidenceNeedKeys: [item.title, item.sourceEntity],
    });
  });

  const highlightClass = (id: string) =>
    cn(
      filters?.highlightId === id && "ring-2 ring-intelligence-blue/50 ring-offset-2 ring-offset-surface-panel",
    );

  return (
    <SlideOver
      isOpen={isOpen}
      onClose={onClose}
      title="Trust Intelligence Explorer"
      width="lg"
    >
      <div ref={scrollRef}>
        {contextBanner && (
          <div className="mb-4 rounded-xl border border-intelligence-blue/20 bg-intelligence-blue/5 px-4 py-3 text-xs font-bold text-intelligence-blue uppercase tracking-widest">
            {contextBanner}
          </div>
        )}

        <Tabs value={resolvedTab} onValueChange={(v) => onTabChange?.(v as ExplorerTabId)}>
          <TabsList className="sticky top-0 bg-surface-panel z-10 -mx-6 px-2 overflow-x-auto flex-nowrap">
            {TAB_CONFIG.map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                label={tab.label}
                icon={tab.icon}
                className="shrink-0 text-[11px] px-2"
              />
            ))}
          </TabsList>

          <TabsContent value="source-pages">
            <div className="space-y-3">
              {sourcePages.map((page) => (
                <a
                  key={page.url}
                  href={page.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-explorer-highlight={page.url}
                  className={cn(
                    "flex items-center gap-3 p-4 rounded-xl border border-surface-border bg-surface-base hover:border-intelligence-blue/30 transition-all",
                    highlightClass(page.url),
                  )}
                >
                  <GlobeIcon className="h-4 w-4 text-intelligence-blue shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-text-primary truncate">{page.title}</p>
                    <p className="text-xs text-text-muted truncate">{page.url}</p>
                  </div>
                </a>
              ))}
              {sourcePages.length === 0 && <EmptyState message="No source pages indexed yet." />}
            </div>
          </TabsContent>

          <TabsContent value="evidence-snippets">
            <div className="space-y-4">
              {filteredSnippets.map((item) => (
                <EvidenceSnippetCard
                  key={item.id}
                  item={item}
                  className={highlightClass(item.id)}
                  highlightAttr={item.id}
                />
              ))}
              {filteredSnippets.length === 0 && (
                <EmptyState message="No evidence snippets match this filter." />
              )}
            </div>
          </TabsContent>

          <TabsContent value="capabilities">
            <div className="space-y-4">
              {filteredCapabilities.map((cap) => (
                <AppCard
                  key={cap.key}
                  variant="section"
                  className={cn("!p-5 space-y-4", highlightClass(cap.key))}
                  data-explorer-highlight={cap.key}
                >
                  <div className="flex items-center justify-between gap-4">
                    <AppTypography.SubSection className="!text-base">{cap.label}</AppTypography.SubSection>
                    <AppBadge variant={cap.confidence >= 0.8 ? "success" : "warning"}>
                      {Math.round(cap.confidence * 100)}% Conf
                    </AppBadge>
                  </div>
                  <AppTypography.BodySm className="text-text-secondary">
                    {cap.confidenceReason || "Capability inferred from product signals."}
                  </AppTypography.BodySm>
                  <AppMetaLabel label="Evidence Strength" value={cap.evidenceStrength || "Needs Review"} />
                  {(cap.evidenceRefs || []).map((ref, idx) => (
                    <EvidenceSnippetCard
                      key={`${cap.key}-${idx}`}
                      item={{
                        id: `${cap.key}-ref-${idx}`,
                        url: ref.url,
                        title: ref.title,
                        snippet: ref.snippet,
                        authorityLevel: ref.authority?.authorityLevel || "MEDIUM",
                        confidenceContribution: Math.round((ref.confidence || 0) * 100),
                        observationStatus:
                          (ref.confidence || 0) >= 0.85 ? "observed" : "inferred",
                        linkedRisks: [],
                        linkedTopics: [],
                        linkedTasks: [],
                        linkedCapabilities: [cap.key, cap.label],
                        sourceEntity: `capability:${cap.key}`,
                      }}
                      compact
                    />
                  ))}
                </AppCard>
              ))}
              {filteredCapabilities.length === 0 && <EmptyState message="No capabilities match this filter." />}
            </div>
          </TabsContent>

          <TabsContent value="workflows">
            <div className="space-y-4">
              {filteredWorkflows.map((wf) => (
                <AppCard
                  key={wf.id}
                  variant="section"
                  className={cn("!p-5 space-y-3", highlightClass(wf.id))}
                  data-explorer-highlight={wf.id}
                >
                  <AppTypography.SubSection className="!text-base">{wf.title}</AppTypography.SubSection>
                  <AppTypography.BodySm className="text-text-secondary">{wf.summary}</AppTypography.BodySm>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <AppMetaLabel label="Data Interaction" value={wf.dataInteraction} />
                    <AppMetaLabel label="Access Model" value={wf.accessModel} />
                  </div>
                  {wf.relatedRisks.length > 0 && (
                    <TagRow label="Related Risks" tags={wf.relatedRisks} />
                  )}
                  {wf.relatedEvidenceNeeds.length > 0 && (
                    <TagRow label="Evidence Needs" tags={wf.relatedEvidenceNeeds} />
                  )}
                </AppCard>
              ))}
              {filteredWorkflows.length === 0 && <EmptyState message="No workflows match this filter." />}
            </div>
          </TabsContent>

          <TabsContent value="risks">
            <div className="space-y-4">
              {filteredRisks.map((risk) => (
                <AppCard
                  key={risk.key}
                  variant="section"
                  className={cn("!p-5 space-y-4", highlightClass(risk.key))}
                  data-explorer-highlight={risk.key}
                >
                  <div className="flex items-center justify-between">
                    <AppTypography.SubSection className="!text-base">{risk.label}</AppTypography.SubSection>
                    <AppBadge variant={risk.severity === "CRITICAL" ? "error" : "warning"}>
                      {risk.severity}
                    </AppBadge>
                  </div>
                  <AppTypography.BodySm className="text-text-secondary">{risk.reason}</AppTypography.BodySm>
                  <div className="grid grid-cols-2 gap-3">
                    <AppMetaLabel label="Confidence" value={`${Math.round((risk.confidence || 0) * 100)}%`} />
                    <AppMetaLabel
                      label="Evidence Strength"
                      value={(risk.evidenceStrength || "unknown").toUpperCase()}
                    />
                  </div>
                  <TagRow label="Topics" tags={risk.recommendedTopicKeys || []} />
                  {risk.evidenceRefs.map((ref, idx) => (
                    <EvidenceSnippetCard
                      key={`${risk.key}-${idx}`}
                      item={{
                        id: `${risk.key}-ev-${idx}`,
                        url: ref.url,
                        title: ref.title,
                        snippet: ref.snippet,
                        authorityLevel: ref.authority?.authorityLevel || "MEDIUM",
                        confidenceContribution: Math.round((ref.confidence || 0) * 100),
                        observationStatus: (ref.confidence || 0) >= 0.85 ? "observed" : "inferred",
                        linkedRisks: [risk.key, risk.label],
                        linkedTopics: risk.recommendedTopicKeys || [],
                        linkedTasks: risk.clarificationTasks || [],
                        linkedCapabilities: [],
                        sourceEntity: `risk:${risk.key}`,
                      }}
                      compact
                    />
                  ))}
                </AppCard>
              ))}
              {filteredRisks.length === 0 && <EmptyState message="No risks match this filter." />}
            </div>
          </TabsContent>

          <TabsContent value="trust-topics">
            <div className="space-y-4">
              {filteredTopics.map((topic) => (
                <AppCard
                  key={topic.id}
                  variant="section"
                  className={cn("!p-5 space-y-4", highlightClass(topic.key))}
                  data-explorer-highlight={topic.key}
                >
                  <div className="flex items-center justify-between">
                    <AppTypography.SubSection className="!text-base">{topic.title}</AppTypography.SubSection>
                    <AppBadge variant={topic.status === "auto_ready" ? "success" : "warning"}>
                      {topic.status.replace(/_/g, " ")}
                    </AppBadge>
                  </div>
                  <AppTypography.BodySm className="text-text-secondary">{topic.description}</AppTypography.BodySm>
                  <AppTypography.BodySm className="text-[11px] italic text-text-muted">{topic.rationale}</AppTypography.BodySm>
                  {topic.evidenceRefs.map((ref, idx) => (
                    <EvidenceSnippetCard
                      key={`${topic.id}-${idx}`}
                      item={{
                        id: `${topic.id}-ev-${idx}`,
                        url: ref.url,
                        title: ref.title,
                        snippet: ref.snippet,
                        authorityLevel: ref.authority?.authorityLevel || "MEDIUM",
                        confidenceContribution: Math.round((ref.confidence || 0) * 100),
                        observationStatus: (ref.confidence || 0) >= 0.85 ? "observed" : "inferred",
                        linkedRisks: [],
                        linkedTopics: [topic.key, topic.title],
                        linkedTasks: [],
                        linkedCapabilities: [],
                        sourceEntity: `topic:${topic.key}`,
                      }}
                      compact
                    />
                  ))}
                </AppCard>
              ))}
              {filteredTopics.length === 0 && <EmptyState message="No trust topics match this filter." />}
            </div>
          </TabsContent>

          <TabsContent value="evidence-needs">
            <div className="space-y-4">
              {filteredEvidenceNeeds.map((need, idx) => (
                <AppCard
                  key={`${need.type}-${idx}`}
                  variant="section"
                  className={cn("!p-5 space-y-3", highlightClass(need.type))}
                  data-explorer-highlight={need.type}
                >
                  <AppTypography.SubSection className="!text-base">{need.type}</AppTypography.SubSection>
                  <AppTypography.BodySm className="text-text-secondary">{need.reason}</AppTypography.BodySm>
                  <TagRow label="Suggested Sources" tags={need.suggestedSources} />
                </AppCard>
              ))}
              {filteredEvidenceNeeds.length === 0 && (
                <EmptyState message="No evidence gaps match this filter." />
              )}
            </div>
          </TabsContent>

          <TabsContent value="buyer-questions">
            <div className="space-y-4">
              {filteredQuestions.map((q) => (
                <AppCard
                  key={q.id}
                  variant="section"
                  className={cn("!p-5 space-y-3", highlightClass(q.id))}
                  data-explorer-highlight={q.id}
                >
                  <AppTypography.SubSection className="!text-base">{q.question}</AppTypography.SubSection>
                  <AppMetaLabel label="Concern Domain" value={q.concernDomain} />
                  <AppTypography.BodySm className="text-text-secondary">{q.whyBuyersAskThis}</AppTypography.BodySm>
                  <TagRow label="Related Risks" tags={q.relatedRisks} />
                  <TagRow label="Related Evidence" tags={q.relatedEvidence} />
                </AppCard>
              ))}
              {filteredQuestions.length === 0 && (
                <EmptyState message="No buyer questions match this filter." />
              )}
            </div>
          </TabsContent>

          <TabsContent value="diagnostics">
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-3">
                <DiagnosticTile
                  label="URLs Scanned"
                  value={workspacePreparation.workspaceFoundation.sourcePagesCount}
                  icon={SearchIcon}
                />
                <DiagnosticTile
                  label="Citations"
                  value={workspacePreparation.workspaceFoundation.citationsCount}
                  icon={LinkIcon}
                />
                <DiagnosticTile
                  label="Capability Evidence"
                  value={workspacePreparation.workspaceFoundation.capabilityEvidenceCount}
                  icon={ZapIcon}
                />
                <DiagnosticTile
                  label="Governance Tasks"
                  value={filteredTasks.length}
                  icon={FileTextIcon}
                />
              </div>
              <AppCard variant="section" className="!p-5 space-y-3">
                <AppTypography.SubSection>Findings Confidence</AppTypography.SubSection>
                <AppTypography.BodySm className="text-text-secondary leading-relaxed">
                  {diagnostics.confidenceSummary}
                </AppTypography.BodySm>
              </AppCard>
              {diagnostics.warnings.length > 0 && (
                <div className="space-y-2">
                  {diagnostics.warnings.map((warn, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-lg bg-warning-amber/5 border border-warning-amber/10 text-xs text-warning-amber font-medium"
                    >
                      {warn}
                    </div>
                  ))}
                </div>
              )}
              <div className="space-y-2">
                <AppTypography.Metadata className="uppercase tracking-widest text-[9px] font-black">
                  Market Context
                </AppTypography.Metadata>
                <AppMetaLabel label="Industry" value={businessModel.primaryIndustry || "Undetected"} />
                <AppMetaLabel label="Domain" value={businessModel.businessDomain || "Undetected"} />
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </SlideOver>
  );
}

function EvidenceSnippetCard({
  item,
  className,
  highlightAttr,
  compact,
}: {
  item: ExplorerEvidenceItem;
  className?: string;
  highlightAttr?: string;
  compact?: boolean;
}) {
  return (
    <div
      data-explorer-highlight={highlightAttr ?? item.id}
      className={cn(
        "rounded-xl border border-surface-border bg-surface-base",
        compact ? "p-3 space-y-2" : "p-4 space-y-3",
        className,
      )}
    >
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 text-intelligence-blue hover:underline text-xs font-bold"
      >
        <LinkIcon className="h-3 w-3 shrink-0" />
        <span className="truncate">{item.title}</span>
      </a>
      {item.snippet && (
        <p className="text-xs text-text-secondary italic leading-relaxed border-l-2 border-intelligence-blue/20 pl-3">
          &ldquo;{item.snippet}&rdquo;
        </p>
      )}
      <div className={cn("grid gap-2 text-[10px]", compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3")}>
        <MetaChip label="Authority" value={item.authorityLevel} />
        <MetaChip label="Confidence" value={`+${item.confidenceContribution}%`} />
        <MetaChip label="Status" value={item.observationStatus} />
      </div>
      {item.linkedRisks.length > 0 && <TagRow label="Risks" tags={item.linkedRisks} />}
      {item.linkedTopics.length > 0 && <TagRow label="Topics" tags={item.linkedTopics} />}
      {item.linkedTasks.length > 0 && <TagRow label="Tasks" tags={item.linkedTasks} />}
    </div>
  );
}

function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-subtle/50 border border-surface-border/40 px-2 py-1.5">
      <div className="text-[8px] font-black uppercase tracking-widest text-text-muted">{label}</div>
      <div className="text-[10px] font-bold text-text-primary capitalize">{value}</div>
    </div>
  );
}

function TagRow({ label, tags }: { label: string; tags: string[] }) {
  if (!tags.length) return null;
  return (
    <div className="space-y-1.5">
      <div className="text-[9px] font-black uppercase tracking-widest text-text-muted">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <AppBadge key={tag} variant="muted" className="text-[9px]">
            {tag.replace(/_/g, " ")}
          </AppBadge>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="py-12 text-center">
      <AppTypography.BodySm className="text-text-muted">{message}</AppTypography.BodySm>
    </div>
  );
}

function DiagnosticTile({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="p-4 rounded-xl bg-surface-base border border-surface-border space-y-2">
      <div className="flex items-center gap-2 text-text-muted">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
      </div>
      <p className="text-2xl font-black text-text-primary">{value}</p>
    </div>
  );
}
