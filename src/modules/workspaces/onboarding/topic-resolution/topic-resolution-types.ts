export type TopicResolutionType =
  | "exact"
  | "alias"
  | "semantic"
  | "provisional"
  | "unresolved";

export interface ResolvedTopic {
  originalKey: string;
  canonicalKey?: string;
  resolutionType: TopicResolutionType;
  confidence: number;
  rationale: string;
  inferredPillarKey?: string;
}

export interface AliasDefinition {
  sourceKey: string;
  targetKey: string;
  inferredPillarKey: string;
}
