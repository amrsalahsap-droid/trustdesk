import { EvidenceRef } from "../evidence-scoring";

export type WorkflowStep = {
  stepNumber: number;
  description: string;
  actor: string; // e.g. "User", "System", "Third-Party Subprocessor"
};

export type WorkflowDataFlow = {
  source: string;
  destination: string;
  dataType: string; // e.g. "Credentials", "PII", "Metadata", "Files", "Chat Messages"
  isEncrypted: boolean;
};

export type AccessFlow = {
  subject: string;
  resource: string;
  accessType: "read" | "write" | "admin";
};

export type PersistenceBehavior = {
  doesStoreData: boolean;
  storageType?: string; // e.g. "Database", "Log Store", "Transient Memory"
  retentionDuration?: string;
};

export type AIInteraction = {
  usesLLM: boolean;
  provider?: string;
  dataUsagePolicy?: string; // e.g. "opt-out", "no-training"
};

export type OperationalWorkflow = {
  key: string;
  label: string;
  confidence: number;
  evidenceRefs: EvidenceRef[];
  sourcePages: string[];
  steps: WorkflowStep[];
  dataFlow: WorkflowDataFlow[];
  accessFlow: AccessFlow[];
  persistenceBehavior?: PersistenceBehavior;
  aiInteraction?: AIInteraction;
  procurementRisks: string[];
  trustImplications: string[];
  evidenceRequirements: string[];
  rationale: string;
};
