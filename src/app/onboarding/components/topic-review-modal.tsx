/**
 * Topic Review Modal - Onboarding
 * 
 * Modal for reviewing and selecting recommended trust topics during onboarding.
 * Supports both old and new recommendation shapes through adapter.
 */

import { useState, useMemo } from "react";
import {
  SparklesIcon as XMarkIcon,
  ShieldCheckIcon,
  CheckIcon,
  ChevronRightIcon,
  AlertCircleIcon as InformationCircleIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Recommendation } from "@/modules/workspaces/onboarding/recommendation-metadata";
import { TopicPackService, normalizeTopicKey } from "@/modules/knowledge/topics/topic-pack-service";

// Support both old and new recommendation shapes
interface LegacyRecommendation {
  id: string;
  title: string;
  description: string;
  category?: string;
  priority?: string;
  confidence?: number;
  topicKeys?: string[];
  metadata?: any;
}

interface TopicReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  recommendations: Recommendation[];
  workspaceId: string;
  userId: string;
  initialSelectedTopics?: Set<string>;
  onSave: (selectedTopics: Set<string>) => Promise<void>;
}

/**
 * Adapter to normalize different recommendation shapes
 */
function normalizeRecommendations(recs: Recommendation[]): Array<{
  id: string;
  title: string;
  description: string;
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "OPTIONAL";
  confidence: number;
  topicKeys: string[];
  category: string;
  metadata?: any;
}> {
  return recs.map(rec => {
    // Handle new recommendation shape
    if (rec.category && rec.metadata?.topicKeys) {
      return {
        id: rec.id,
        title: rec.title,
        description: rec.description,
        priority: rec.priority,
        confidence: rec.confidence,
        topicKeys: rec.metadata.topicKeys,
        category: rec.category,
        metadata: rec.metadata,
      };
    }
    
    // Handle legacy recommendation shape
    const legacy = rec as any;
    return {
      id: rec.id,
      title: rec.title,
      description: rec.description,
      priority: rec.priority || "MEDIUM",
      confidence: rec.confidence || 0.5,
      topicKeys: legacy.topicKeys || legacy.metadata?.topicKeys || [],
      category: legacy.category || rec.category || "trust_topics",
      metadata: rec.metadata,
    };
  });
}

/**
 * Normalize topic keys to TopicPackService taxonomy
 */
function normalizeTopicKeys(topicKeys: string[]): string[] {
  const normalizedKeys: string[] = [];
  
  for (const key of topicKeys) {
    // Map common variations to standard keys
    const normalizedKey = normalizeTopicKey(key);
    if (normalizedKey && !normalizedKeys.includes(normalizedKey)) {
      normalizedKeys.push(normalizedKey);
    }
  }
  
  return normalizedKeys;
}

export function TopicReviewModal({
  isOpen,
  onClose,
  recommendations,
  workspaceId,
  userId,
  initialSelectedTopics = new Set(),
  onSave,
}: TopicReviewModalProps) {
  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(initialSelectedTopics);
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Normalize and filter recommendations
  const normalizedTopics = useMemo(() => {
    // Adapter for different recommendation shapes and category names
    const topicCategories = [
      "trust_topics",
      "topic", 
      "topics",
      "recommended_topics",
      "trust_area",
      "trust_areas"
    ];

    const normalized: {
      id: string;
      title: string;
      description: string;
      priority: any;
      confidence: number;
      topicKeys: string[];
      category: string;
      metadata: any;
    }[] = [];
    
    recommendations.forEach(rec => {
      // 1. Check if the recommendation itself is a topic recommendation
      const isTopicCategory = topicCategories.includes(rec.category.toLowerCase());
      
      // 2. Extract topic keys from metadata
      const topicKeys = (rec.metadata?.topicKeys as string[]) || (rec.metadata?.topicKey ? [rec.metadata.topicKey as string] : []);
      
      if (isTopicCategory && topicKeys.length > 0) {
        topicKeys.forEach((key) => {
          const normalizedKey = normalizeTopicKey(key);
          if (!normalizedKey) return;

          // Avoid duplicates
          if (normalized.some(t => t.id === normalizedKey)) return;

          normalized.push({
            id: normalizedKey,
            title: rec.title,
            description: rec.description,
            priority: rec.priority as any,
            confidence: rec.confidence,
            topicKeys: [key],
            category: rec.category,
            metadata: {
              ...rec.metadata,
              recommendationReason: (rec as any).reason
            }
          });
        });
      }
    });

    return normalized;
  }, [recommendations]);

  // Group topics by priority for better UX
  const topicsByPriority = useMemo(() => {
    const groups: Record<string, any[]> = {
      critical: [],
      high: [],
      medium: [],
      low: [],
      optional: [],
    };
    
    normalizedTopics.forEach(topic => {
      const priority = topic.priority?.toLowerCase() || 'medium';
      if (groups[priority]) {
        groups[priority].push(topic);
      } else {
        groups.medium.push(topic);
      }
    });
    
    return groups;
  }, [normalizedTopics]);

  const toggleTopicSelection = (topicId: string) => {
    const newSelected = new Set(selectedTopics);
    if (newSelected.has(topicId)) {
      newSelected.delete(topicId);
    } else {
      newSelected.add(topicId);
    }
    setSelectedTopics(newSelected);
  };

  const toggleTopicExpanded = (topicId: string) => {
    const newExpanded = new Set(expandedTopics);
    if (newExpanded.has(topicId)) {
      newExpanded.delete(topicId);
    } else {
      newExpanded.add(topicId);
    }
    setExpandedTopics(newExpanded);
  };

  const handleSave = async () => {
    if (selectedTopics.size === 0) {
      setSaveError("Please select at least one topic to continue");
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      // Normalize selected topic keys
      const selectedTopicObjects = normalizedTopics.filter(topic => 
        selectedTopics.has(topic.id)
      );
      const normalizedKeys = normalizeTopicKeys(
        selectedTopicObjects.flatMap(topic => topic.topicKeys)
      );

      // Save to onboarding state
      await onSave(new Set(normalizedKeys));
      
      onClose();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to save topics");
    } finally {
      setIsSaving(false);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "CRITICAL": return "text-error-red";
      case "HIGH": return "text-warning-amber";
      case "MEDIUM": return "text-intelligence-blue";
      case "LOW": return "text-text-muted";
      default: return "text-text-muted";
    }
  };

  const getPriorityBg = (priority: string) => {
    switch (priority) {
      case "CRITICAL": return "bg-error-red/5 border-error-red/20";
      case "HIGH": return "bg-warning-amber/5 border-warning-amber/20";
      case "MEDIUM": return "bg-intelligence-blue/5 border-intelligence-blue/20";
      case "LOW": return "bg-surface-base border-border-soft";
      default: return "bg-surface-base border-border-soft";
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 sm:p-10">
      <div className="absolute inset-0 bg-text-primary/40 backdrop-blur-md" onClick={onClose} />
      
      <AppCard variant="hero" className="relative w-full max-w-5xl max-h-full flex flex-col !p-0 overflow-hidden shadow-premium-2xl animate-in zoom-in-95 fade-in duration-300">
        {/* Header */}
        <div className="flex items-center justify-between p-8 border-b border-border-soft bg-surface-base">
          <div className="flex items-center gap-5">
            <div className="h-12 w-12 rounded-2xl bg-intelligence-blue/10 flex items-center justify-center shadow-premium-sm">
              <AppIcon icon={ShieldCheckIcon} variant="brand" size="sm" />
            </div>
            <div className="space-y-1">
              <AppTypography.HeroTitle className="!text-2xl">Review Trust Topics</AppTypography.HeroTitle>
              <AppTypography.BodySm className="opacity-60">
                Select the areas you want to prioritize in your trust library and questionnaire response engine.
              </AppTypography.BodySm>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-10 w-10 rounded-full hover:bg-surface-base flex items-center justify-center transition-colors text-text-muted"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar">
          {/* Summary Banner */}
          <div className="p-6 bg-intelligence-blue/[0.03] rounded-2xl border border-intelligence-blue/10 flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="space-y-1 text-center sm:text-left">
              <AppTypography.SubSection className="!text-lg">
                {selectedTopics.size} of {normalizedTopics.length} topics selected
              </AppTypography.SubSection>
              <AppTypography.BodySm className="opacity-60">
                These areas will be pre-populated with mapped controls and evidence.
              </AppTypography.BodySm>
            </div>
            <div className="flex items-center gap-3">
              <AppButton
                variant="outline"
                size="sm"
                className="h-10 rounded-xl px-5 text-[10px] font-black uppercase tracking-widest"
                onClick={() => setSelectedTopics(new Set(normalizedTopics.map(t => t.id)))}
              >
                Select All
              </AppButton>
              <AppButton
                variant="outline"
                size="sm"
                className="h-10 rounded-xl px-5 text-[10px] font-black uppercase tracking-widest"
                onClick={() => setSelectedTopics(new Set())}
              >
                Clear All
              </AppButton>
            </div>
          </div>

          {/* Topics by Priority */}
          <div className="space-y-12">
            {Object.entries(topicsByPriority).map(([priority, topics]) => (
              topics.length > 0 && (
                <div key={priority} className="space-y-6">
                  <div className="flex items-center gap-4">
                    <AppTypography.Metadata className="opacity-40 uppercase tracking-[0.2em] !text-[10px]">{priority} Priority</AppTypography.Metadata>
                    <div className="h-px flex-1 bg-border-soft/50" />
                    <AppBadge variant={priority === "critical" || priority === "high" ? "error" : "brand"}>
                      {topics.length} Mapped
                    </AppBadge>
                  </div>
                  
                  <div className="grid grid-cols-1 gap-4">
                    {topics.map((topic) => {
                      const isSelected = selectedTopics.has(topic.id);
                      const isExpanded = expandedTopics.has(topic.id);
                      const allTopicKeys = normalizeTopicKeys(topic.topicKeys);
                      
                      return (
                        <AppCard
                          key={topic.id}
                          variant="section"
                          className={cn(
                            "group cursor-pointer transition-all duration-300 !p-6",
                            isSelected
                              ? "border-intelligence-blue/30 bg-intelligence-blue-soft shadow-premium-md"
                              : "hover:border-border-soft"
                          )}
                          onClick={() => toggleTopicSelection(topic.id)}
                        >
                          <div className="flex items-start gap-6">
                             <div className={cn(
                               "mt-1.5 h-6 w-6 rounded-lg border-2 flex items-center justify-center transition-all shrink-0",
                               isSelected
                                 ? "border-intelligence-blue bg-intelligence-blue"
                                 : "border-border-soft group-hover:border-intelligence-blue/50"
                             )}>
                              {isSelected && <CheckIcon className="h-4 w-4 text-white stroke-[3px]" />}
                            </div>
                            
                            <div className="flex-1 min-w-0 space-y-4">
                              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                                <div className="space-y-1">
                                  <AppTypography.SubSection className="text-xl tracking-tight">
                                    {topic.title}
                                  </AppTypography.SubSection>
                                  <AppTypography.BodySm className="opacity-70 leading-relaxed line-clamp-2">
                                    {topic.description}
                                  </AppTypography.BodySm>
                                </div>
                                 <div className="flex items-center gap-2 shrink-0">
                                  <AppBadge variant="muted" className="bg-surface-base border-border-soft shadow-premium-sm">
                                    {Math.round(topic.confidence * 100)}% Confidence
                                  </AppBadge>
                                </div>
                              </div>
                              
                              {/* Topic Keys Tags */}
                              {allTopicKeys.length > 0 && (
                                 <div className="flex flex-wrap gap-2">
                                  {allTopicKeys.map((key, index) => (
                                    <span
                                      key={index}
                                      className="px-3 py-1 bg-surface-base/50 border border-border-soft rounded-lg text-[10px] font-black uppercase tracking-widest text-text-muted/60"
                                    >
                                      {key}
                                    </span>
                                  ))}
                                </div>
                              )}

                              {/* Expandable Rationale */}
                              {(topic.metadata?.supportingSignals?.length > 0 || topic.metadata?.recommendationReason) && (
                                <div className="pt-2">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleTopicExpanded(topic.id);
                                      }}
                                      className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-intelligence-blue hover:text-intelligence-blue/80 transition-colors"
                                    >
                                      <AppIcon icon={InformationCircleIcon} size="xs" />
                                      {isExpanded ? "Hide Intelligence" : "Inference Rationale"}
                                      <ChevronRightIcon className={cn("h-3 w-3 transition-transform", isExpanded && "rotate-90")} />
                                    </button>
                                  
                                  {isExpanded && (
                                    <div className="mt-6 pt-6 border-t border-border-soft/50 animate-in fade-in slide-in-from-top-4 duration-500 space-y-6" onClick={(e) => e.stopPropagation()}>
                                      {topic.metadata?.recommendationReason && (
                                        <div className="space-y-2">
                                          <AppTypography.Metadata className="opacity-40 uppercase tracking-widest !text-[9px]">Decision Rationale</AppTypography.Metadata>
                                          <div className="bg-surface-base p-4 rounded-2xl border border-border-soft/40">
                                            <AppTypography.BodySm className="italic opacity-80 leading-relaxed">
                                              &ldquo;{topic.metadata.recommendationReason}&rdquo;
                                            </AppTypography.BodySm>
                                          </div>
                                        </div>
                                      )}
                                      
                                      {topic.metadata?.supportingSignals?.length > 0 && (
                                        <div className="space-y-4">
                                          <AppTypography.Metadata className="opacity-40 uppercase tracking-widest !text-[9px]">Evidence Signals</AppTypography.Metadata>
                                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            {topic.metadata.supportingSignals.slice(0, 4).map((signal: any, idx: number) => (
                                              <div key={idx} className="flex items-center gap-4 bg-surface-base/30 p-3 rounded-xl border border-border-soft/30">
                                                <div className={cn("h-1.5 w-1.5 rounded-full shrink-0 shadow-[0_0_8px_rgba(0,0,0,0.1)]", 
                                                  signal.category === "OBSERVED" ? "bg-trust-green shadow-trust-green/20" : 
                                                  signal.category === "DERIVED" ? "bg-intelligence-blue shadow-intelligence-blue/20" : "bg-warning-amber shadow-warning-amber/20")} 
                                                />
                                                <div className="min-w-0">
                                                  <p className="text-[10px] font-black uppercase tracking-widest text-text-primary/70 truncate">{signal.field.replace(/([A-Z])/g, ' $1')}</p>
                                                  <p className="text-[11px] text-text-muted truncate">{Array.isArray(signal.value) ? signal.value.join(", ") : String(signal.value)}</p>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </AppCard>
                      );
                    })}
                  </div>
                </div>
              )
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="p-8 border-t border-border-soft bg-surface-base/50 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <AppIcon icon={InformationCircleIcon} variant="muted" size="xs" />
            <AppTypography.Metadata className="opacity-50">
              Selected areas will activate pre-verified security controls in your workspace.
            </AppTypography.Metadata>
          </div>
          
          <div className="flex items-center gap-4 w-full sm:w-auto">
            <AppButton
              variant="outline"
              onClick={onClose}
              disabled={isSaving}
              className="flex-1 sm:flex-initial h-14 px-8 rounded-2xl"
            >
              Cancel
            </AppButton>
            <AppButton
              onClick={handleSave}
              disabled={isSaving || selectedTopics.size === 0}
              className="flex-1 sm:flex-initial h-14 px-10 rounded-2xl shadow-premium-xl min-w-[160px]"
            >
              {isSaving ? "Activating..." : "Save Selection"}
            </AppButton>
          </div>
        </div>
        
        {saveError && (
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 w-full max-w-md px-6 animate-in slide-in-from-bottom-2 duration-300">
            <div className="bg-error-red/10 border border-error-red/20 rounded-2xl p-4 flex items-center gap-4 backdrop-blur-xl">
              <AppIcon icon={InformationCircleIcon} variant="error" size="xs" />
              <AppTypography.BodySm className="!text-error-red font-black">{saveError}</AppTypography.BodySm>
            </div>
          </div>
        )}
      </AppCard>
    </div>
  );
}
